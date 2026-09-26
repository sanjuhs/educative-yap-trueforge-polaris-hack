import path from "node:path";
import { run } from "../src/process.js";
const folder = path.resolve(".data/clip-tools");
let uv = false;
try {
  await run("uv", ["--version"], { timeout: 5000 });
  uv = true;
} catch {}
if (uv) {
  await run("uv", ["venv", "--allow-existing", folder]);
  await run("uv", [
    "pip",
    "install",
    "--python",
    path.join(
      folder,
      process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
    ),
    "-r",
    "requirements-clips.txt",
  ]);
} else {
  await run(process.platform === "win32" ? "python" : "python3", [
    "-m",
    "venv",
    folder,
  ]);
  await run(
    path.join(
      folder,
      process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
    ),
    ["-m", "pip", "install", "-r", "requirements-clips.txt"],
  );
}
console.log(
  "YouTube clip tools installed. FFmpeg and Node are also required. Restart the studio to expose the tools.",
);
