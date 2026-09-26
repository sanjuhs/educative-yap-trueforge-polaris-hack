# Hosting Educative Yap

Educative Yap runs as its own application. It reuses infrastructure providers, not Make My Reels’ database tables, user accounts or application processes.

## Deployed topology

| Component             | Deployment                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| Frontend              | `https://educative-yap.vercel.app` — static Vercel Build Output API deployment                              |
| Backend               | `https://educative-yap-api.coolify.sanjayprasadhs.com` — dedicated Coolify application                      |
| Database              | Dedicated PostgreSQL 16 database and user on Coolify’s internal network; no public database port            |
| Persistent work files | Docker volume `xswsgo0c8kck8cowkgg48cw8_yap-data`, mounted at `/app/.data`                                  |
| AI orchestration      | TrueForge in the backend container, bound to loopback port 8790                                             |
| Animation rendering   | Isolated Modal renderer; backend submits only selected job assets                                           |
| Durable objects       | R2 under a Yap-specific prefix, encrypted before storage and retrieved through authenticated backend routes |

The Vercel deployment proxies only `/api/*` and `/media/*`. It does not publish MCP or the TrueForge dashboard. The backend listens on 8789; Coolify terminates TLS. Application cookies remain on the Vercel origin because browser requests use the same-origin proxy.

## Backend image and volume

The root `Dockerfile` installs Node 22, FFmpeg, Chromium/Playwright, a separate Python environment for pinned yt-dlp, and the checksum-verified MediaPipe model. Runtime dependencies are built into the image. `.dockerignore` excludes environment files, local generations, dependencies and Git history.

`compose.yaml` is the source of truth for the persistent volume. The current Coolify installation is `4.0.0-beta.380`; its application API does not expose the newer storage endpoints, and its custom Docker option converter ignores `--mount` and `--volume`. The older platform also has a Git Compose application bug: its source check tries to change into a newly generated, nonexistent artifacts directory. The live deployment therefore uses a dedicated Compose **service**, with the same root `compose.yaml` and a remote Git build context pinned to a full 40-character commit SHA. This avoids changing or upgrading the shared Coolify installation. Do not replace the named volume with an anonymous container filesystem.

The startup script initializes the model cache and runs Node as the unprivileged `node` user. TrueForge’s SQLite state, cached footage, downloaded images and working renders remain in `/app/.data` between container replacements. PostgreSQL stores hosted accounts, ownership, project history and jobs. Both stores must be included in recovery planning.

For a current Coolify Git-based application, use this repository, branch `main`, base directory `/`, and Docker Compose location `/compose.yaml`. On the installed older platform, the live service uses the equivalent raw Compose configuration:

- Service name: `educative-yap-runtime`; Compose service key `studio`.
- Build context: `https://github.com/sanjuhs/educative-yap-trueforge-polaris-hack.git#<full-commit-sha>`; Dockerfile `Dockerfile`. Short commit hashes are not sufficient for this Git build context.
- Routing: Traefik HTTPS host rule for `https://educative-yap-api.coolify.sanjayprasadhs.com:8789`. The port suffix selects the internal service port; the public URL remains HTTPS on port 443.
- External network: `coolify`, shared with the dedicated Yap PostgreSQL container.
- A later release must update the pinned build context in this service’s Compose configuration and redeploy. A Git push alone does not update a pinned Compose service.
- Health check: `GET /api/health` on port 8789. The image/compose health check requires JSON `ready: true`.
- Persistent named volume: Compose key `yap-data` mounted at `/app/.data`. The older Coolify parser namespaces the live volume as `xswsgo0c8kck8cowkgg48cw8_yap-data`; inspect the container’s mounts rather than assuming it retains the YAML `name` value.

Apply runtime variables through Coolify’s secret environment configuration. Do not place secrets in the Dockerfile, compose source, browser JavaScript or Vercel build output.

## Runtime configuration

| Variable                                                               | Purpose                                                                                         |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `YAP_HOSTED=true`                                                      | Enable authentication and hosted ownership checks                                               |
| `APP_ORIGIN`                                                           | Exact browser origin, currently `https://educative-yap.vercel.app`; used for Origin/CSRF checks |
| `PUBLIC_STUDIO_URL`                                                    | Public studio URL                                                                               |
| `DATABASE_URL`                                                         | Dedicated private Yap PostgreSQL connection                                                     |
| `OPENAI_API_KEY`                                                       | Backend model/audio API credential                                                              |
| `OPENAI_MODEL`, `OPENAI_REASONING_EFFORT`                              | Default director settings; users can choose supported models in the studio                      |
| `YAP_MCP_SECRET`                                                       | Backend-to-orchestrator authentication secret                                                   |
| `YAP_MODAL_RENDER_URL`, `YAP_MODAL_RENDER_TOKEN`                       | Isolated render service endpoint and credential                                                 |
| `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Object storage configuration                                                                    |
| `R2_PREFIX`                                                            | Yap-only object namespace, separate from other applications                                     |
| `R2_ENCRYPTION_KEY`                                                    | Exactly 32 random bytes, encoded as 64 hexadecimal characters                                   |
| `OWNER_EMAIL`, `OWNER_PASSWORD`                                        | First owner bootstrap; existing accounts are not reset by changing these variables              |
| `GENERATION_CONCURRENCY`                                               | Concurrency per generation/render stage; demo starts at 1                                       |
| `GENERATION_USER_CONCURRENCY`                                          | Per-user concurrency per stage; demo starts at 1                                                |
| `GENERATION_MAX_QUEUED`                                                | Queue limit; demo deployment starts at 5                                                        |

Login creates an opaque, HttpOnly, Secure cookie. Mutating requests also require the session’s CSRF token and the configured Origin. Owner accounts can create creator accounts in the studio. Passwords are hashed with Argon2; no password or provider API key is stored in browser code.

## R2 privacy and a dedicated bucket

The credentials available during initial deployment could access objects in the existing storage bucket but could not create a new bucket or inspect its public-domain settings through the Cloudflare control API. The implementation therefore encrypts Yap object bytes with AES-256-GCM before writing them, uses a separate prefix, and serves decrypted media only through backend ownership checks. It does not assume the shared bucket is private, and it does not change another application’s domains or access settings.

A dedicated private bucket is the preferred operational setup:

1. In the intended Cloudflare account, create `educative-yap-private` (or another unique Yap bucket).
2. Keep the public `r2.dev` URL disabled. Do not attach a public custom domain.
3. Create an R2 Object Read & Write credential scoped only to that bucket. Bucket administration is a separate permission from object access.
4. Copy the entire Yap object prefix to the new bucket without modifying object bytes, keys, or custom metadata (the encryption nonce and authentication tag). Preserve the original source until restored playback and asset reuse are verified. Pause new generations/uploads during the final copy so no new objects are missed.
5. Set the four R2 connection variables in the Yap backend’s runtime secrets. Keep the existing `R2_ENCRYPTION_KEY` and `R2_PREFIX` when migrating existing encrypted objects.
6. Deploy, sign in, open an existing video, and verify playback and download. Test that signed-out and other-user requests cannot retrieve the project or media.

Changing `R2_BUCKET` alone does not move existing objects. Retain the same prefix and encryption key during migration. New installations can start directly with a dedicated bucket.

Cloudflare documents the [S3 endpoint configuration](https://developers.cloudflare.com/r2/get-started/s3/) and [bucket-scoped R2 API credentials](https://developers.cloudflare.com/r2/api/tokens/). These credentials belong only in the backend secret configuration, never in the browser or a source commit.

## Frontend deployment

The existing Vercel project `educative-yap` is connected directly to the GitHub repository `sanjuhs/educative-yap-trueforge-polaris-hack`. Pushes to `main` automatically build and publish the frontend; other branches receive preview deployments. The project root is `web`, with files outside that root included so `build.mjs` can copy the canonical `public/` directory. The install command is `true` (no frontend dependencies), the build command is `node build.mjs`, and Node 22 runs the build. Generated Build Output API files contain only the studio assets and API/media proxy routes.

This Git integration deploys only Vercel. Backend releases still require updating the pinned Coolify service revision and redeploying it. Preview builds keep production authentication settings; a separate backend/allowed origin is required for authenticated preview testing.

For a manual recovery deployment, use the prebuilt flow below.

Use the prebuilt flow to keep rendering dependencies and secrets out of Vercel:

```sh
node web/build.mjs
cd web
vercel link --yes --project educative-yap --scope sanjuhs-projects
vercel deploy --prebuilt
```

Builds copy the canonical `public/` directory into `web/.vercel/output/static`. Override `YAP_BACKEND_ORIGIN` while running the build script for another backend. Verify a preview against a matching allowed Origin, then promote a verified deployment, or deploy production with `vercel deploy --prebuilt --prod`.

Vercel external proxy requests have a 120-second timeout. Generation must remain asynchronous: enqueue a job, return its ID, and poll status. Do not move FFmpeg rendering or long model turns into a Vercel request handler. Large or slow recording uploads should use the dedicated upload flow rather than a request that includes synchronous transcription.

## Backup and restore

Before upgrades, retain three coordinated backups:

1. A PostgreSQL dump of the dedicated Yap database, including users, jobs, ownership and project history.
2. A snapshot/archive of the actual Yap data volume (currently `xswsgo0c8kck8cowkgg48cw8_yap-data`). Stop this application briefly, or use a SQLite-consistent backup method for its TrueForge database; copying a changing SQLite file without its journal is not a reliable backup.
3. The Yap R2 object prefix plus the associated `R2_ENCRYPTION_KEY`, stored separately in a secure secret manager. Losing the key makes encrypted objects unreadable.

Also record the Git commit, backend image revision and Vercel deployment URL. Git backups do not contain generated media, databases, uploads or credentials.

To restore, bring up the same code/image version, restore the dedicated database and volume, restore the matching R2 namespace, and inject the original required secrets. Start one worker initially. Check health, owner login, project ownership, an existing video’s playback/download, and one small new generation before reopening access. Do not point a rollback at another application’s database or object prefix.

The initial demo does not configure automated off-host PostgreSQL or volume backups. Schedule and verify these before treating the installation as durable production hosting.

## Release checks

A successful image build is only a deployment milestone. Verify:

- Backend health and signed-out API denial.
- Login, owner account creation and logout through the Vercel origin.
- A queued generation survives browser refresh.
- A small generation reaches a playable MP4 with readable subtitles and an AI usage estimate.
- Cross-user project/media access is denied.
- The named volume and PostgreSQL ownership records survive a backend restart.
- Render sandbox outputs and job traces are available for investigating failures.

Model quality, retrieval availability and long-video rendering still need workload testing. An editable browser slider is not evidence that a 20-minute generation has been benchmarked.
