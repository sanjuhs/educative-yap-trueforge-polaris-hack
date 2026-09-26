"""Dedicated Educative Yap render service. Deploy: modal deploy modal/renderer.py.

The authenticated control plane never evaluates generated JavaScript. Each job
gets a disposable Sandbox containing only a trusted renderer and selected assets.
"""
import hashlib
import hmac
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile

import modal

APP_NAME = "educative-yap-renderer"
MAX_BUNDLE = 100 * 1024 * 1024
MAX_OUTPUT = 250 * 1024 * 1024
app = modal.App(APP_NAME)
root = Path(__file__).resolve().parent.parent
render_image = (
    modal.Image.from_registry("node:22-bookworm-slim", add_python="3.13")
    .apt_install("ffmpeg", "python3")
    .workdir("/opt/yap")
    .add_local_file(root / "modal/render-package.json", "/opt/yap/package.json", copy=True)
    .run_commands("npm install --omit=dev", "npx playwright install --with-deps chromium")
    .env({"YAP_RENDER_WORKER": "1"})
)
# An explicit allowlist prevents accidental inclusion of .env, uploads or keys.
for name in ["authored-worker.ts", "render-browser.ts", "video-clips.ts",
             "visual-assets.ts", "process.ts", "config.ts"]:
    render_image = render_image.add_local_file(root / "src" / name, f"/opt/yap/src/{name}", copy=True)
render_image = render_image.add_local_file(root / "assets/cafe.png", "/opt/yap/assets/cafe.png", copy=True)
control_image = modal.Image.debian_slim(python_version="3.13").pip_install("fastapi")


def check_bundle(bundle: bytes):
    """Reject traversal, links, undeclared assets, bombs and arbitrary files."""
    if len(bundle) > MAX_BUNDLE:
        raise ValueError("Render bundle exceeds 100 MiB")
    with tarfile.open(fileobj=io.BytesIO(bundle), mode="r:gz") as archive:
        members = archive.getmembers()
        files = [m for m in members if m.isfile()]
        if len(members) > 1100 or sum(m.size for m in files) > MAX_OUTPUT:
            raise ValueError("Render bundle expanded size/file count exceeds limit")
        for member in members:
            if not member.isfile() or member.name.startswith("/") or ".." in Path(member.name).parts:
                raise ValueError("Render bundle contains unsafe archive entries")
        names = [m.name for m in files]
        if len(set(names)) != len(names) or "job/render-input.json" not in names:
            raise ValueError("Invalid render bundle manifest")
        stream = archive.extractfile("job/render-input.json")
        if stream is None:
            raise ValueError("Missing render input")
        data = json.load(stream)
        duration = data.get("duration", 0)
        if not isinstance(duration, (int, float)) or not 0 < duration <= 1206:
            raise ValueError("Render duration must be within 1,206 seconds")
        allowed = {"job/render-input.json"}
        import re
        for asset_id in data.get("plan", {}).get("visualAssetIds", []):
            if not isinstance(asset_id, str) or not re.fullmatch(r"[a-f0-9]{64}", asset_id):
                raise ValueError("Invalid image ID")
            allowed.update({f".data/visual-assets/{asset_id}", f".data/visual-assets/{asset_id}.json"})
        for asset_id in data.get("plan", {}).get("clipAssetIds", []):
            if not isinstance(asset_id, str) or not re.fullmatch(r"[a-f0-9-]{36}", asset_id):
                raise ValueError("Invalid clip ID")
            meta_name = f".data/video-clips/{asset_id}/clip.json"
            meta_stream = archive.extractfile(meta_name)
            if meta_stream is None:
                raise ValueError("Missing clip manifest")
            clip = json.load(meta_stream)
            count = clip.get("frameCount", 0)
            if not isinstance(count, int) or not 1 <= count <= 153:
                raise ValueError("Invalid clip frame count")
            allowed.add(meta_name)
            allowed.update(f".data/video-clips/{asset_id}/frame-{i:03d}.jpg" for i in range(count))
        if set(names) != allowed:
            raise ValueError("Bundle must contain exactly the assets declared by this job")
        return data


@app.function(image=render_image, timeout=7800, max_containers=4)
def render_isolated_v2(bundle: bytes):
    data = check_bundle(bundle)
    preview = bool(data.get("preview"))
    timeout = 300 if preview else max(900, min(7500, int(data["duration"] * 6 + 120)))
    sandbox = modal.Sandbox.create(
        "sleep", "infinity", app=app, image=render_image,
        workdir="/opt/yap", env={"YAP_RENDER_WORKER": "1"},
        secrets=[], volumes={}, block_network=True,
        include_oidc_identity_token=False, cpu=(2, 4), memory=(4096, 8192),
        timeout=timeout + 30,
    )
    try:
        # Modal filesystem transport does not require credentials inside the Sandbox.
        sandbox.filesystem.write_bytes(bundle, "/tmp/job.tar.gz")
        unpack = sandbox.exec("tar", "-xzf", "/tmp/job.tar.gz", "-C", "/opt/yap", timeout=30)
        unpack.wait()
        if unpack.returncode != 0:
            raise RuntimeError("Could not unpack render job")
        process = sandbox.exec(
            "node", "--import", "tsx", "/opt/yap/src/authored-worker.ts", "/opt/yap/job",
            timeout=timeout,
        )
        # Consume output to avoid pipe backpressure, retaining a bounded diagnostic tail.
        stdout = process.stdout.read()
        stderr = process.stderr.read()
        process.wait()
        if process.returncode != 0:
            raise RuntimeError("Isolated renderer failed: " + (stderr or stdout)[-4000:])
        names = ["preview.json", "preview-0.png", "preview-1.png", "preview-2.png"] if preview else ["render.mp4"]
        result = io.BytesIO()
        total = 0
        # Construct the output archive outside the Sandbox, with fixed filenames.
        with tarfile.open(fileobj=result, mode="w:gz") as archive:
            for name in names:
                remote_path = "/opt/yap/job/" + name
                if sandbox.filesystem.stat(remote_path).size > MAX_OUTPUT - total:
                    raise RuntimeError("Render output exceeds 250 MiB")
                content = sandbox.filesystem.read_bytes(remote_path)
                total += len(content)
                if total > MAX_OUTPUT:
                    raise RuntimeError("Render output exceeds 250 MiB")
                member = tarfile.TarInfo(name)
                member.size = len(content)
                member.mode = 0o600
                archive.addfile(member, io.BytesIO(content))
        return result.getvalue()
    finally:
        sandbox.terminate()


@app.function(image=control_image, secrets=[modal.Secret.from_name("educative-yap-render-auth")], timeout=180)
@modal.asgi_app()
def api_v2():
    from fastapi import FastAPI, HTTPException, Request
    from fastapi.responses import Response
    service = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    def authorize(request):
        expected = os.environ["YAP_MODAL_RENDER_TOKEN"]
        if not hmac.compare_digest(request.headers.get("authorization", ""), "Bearer " + expected):
            raise HTTPException(401, "Unauthorized")
        return expected

    def signature(call_id, token):
        return hmac.new(token.encode(), call_id.encode(), hashlib.sha256).hexdigest()

    @service.post("/jobs")
    async def submit(request: Request):
        token = authorize(request)
        chunks, size = [], 0
        async for chunk in request.stream():
            size += len(chunk)
            if size > MAX_BUNDLE:
                raise HTTPException(413, "Job assets exceed 100 MiB")
            chunks.append(chunk)
        bundle = b"".join(chunks)
        try:
            check_bundle(bundle)
        except (ValueError, KeyError, tarfile.TarError, json.JSONDecodeError) as error:
            raise HTTPException(400, str(error)) from error
        call = await modal.Function.from_name(APP_NAME, "render_isolated_v2").spawn.aio(bundle)
        return {"jobId": call.object_id + "." + signature(call.object_id, token)}

    @service.get("/jobs/{job_id}")
    async def status(job_id: str, request: Request):
        token = authorize(request)
        call_id, _, signed = job_id.rpartition(".")
        if not call_id or not hmac.compare_digest(signed, signature(call_id, token)):
            raise HTTPException(404, "Unknown render job")
        try:
            result = await modal.FunctionCall.from_id(call_id).get.aio(timeout=0)
            return Response(result, media_type="application/gzip")
        except TimeoutError:
            return Response(status_code=202)
        except Exception as error:
            return Response(json.dumps({"error": str(error)[-4000:]}), status_code=422, media_type="application/json")

    return service


@app.function(image=render_image, timeout=180)
def isolation_probe():
    """Trusted adversarial probe of the same Sandbox boundary used by render jobs."""
    sandbox = modal.Sandbox.create(
        "sleep", "infinity", app=app, image=render_image, secrets=[], volumes={},
        block_network=True, include_oidc_identity_token=False, timeout=90,
    )
    try:
        probe = sandbox.exec("python3", "-c", '''
import os, socket, json
bad = [k for k in os.environ if any(x in k.upper() for x in ["API_KEY", "TOKEN_SECRET", "DATABASE_URL", "R2_ACCESS", "PASSWORD", "YAP_MODAL_RENDER_TOKEN", "MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET"]) ]
s = socket.socket(); s.settimeout(3)
try:
 s.connect(("1.1.1.1", 443)); network = "OPEN"
except OSError:
 network = "blocked"
print(json.dumps({"credentialVariableNames": bad, "network": network, "envFilePresent": os.path.exists("/opt/yap/.env")}))
assert not bad and network == "blocked" and not os.path.exists("/opt/yap/.env")
''', timeout=15)
        output = probe.stdout.read()
        probe.wait()
        if probe.returncode:
            raise RuntimeError("Isolation probe failed")
        return json.loads(output)
    finally:
        sandbox.terminate()
