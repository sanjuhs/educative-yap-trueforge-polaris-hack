# Hosted studio frontend

The canonical UI is `../public`. This folder builds a static Vercel deployment using the Build Output API; the render worker and TrueForge stay on the persistent backend. No application secrets are needed in Vercel.

## GitHub production deployment

The `educative-yap` Vercel project is connected to `sanjuhs/educative-yap-trueforge-polaris-hack`, with `main` as the production branch, `web` as the root directory, and **Include source files outside of the Root Directory** enabled. A push to `main` builds the shared `public/` directory and updates https://educative-yap.vercel.app. Verified September 26, 2026 through Vercel project settings and a ready Git-triggered production deployment.

The GitHub Actions image workflow builds the backend separately for matching paths. A successful frontend deployment does not imply a new backend image has been installed on the VPS.

## Manual preview or recovery deployment

From the repository root:

```sh
node web/build.mjs
cd web
vercel link --project educative-yap
vercel deploy --prebuilt
# After verifying the frontend and backend together:
vercel promote <verified-deployment-url>
```

The default backend is `https://educative-yap-api.coolify.sanjayprasadhs.com`. Override `YAP_BACKEND_ORIGIN` during the local build to deploy another installation. Set backend `PUBLIC_APP_URL` to the production Vercel origin so cookie authentication and Origin/CSRF checks agree.

Only `/api/*` and `/media/*` are reverse-proxied. MCP and the TrueForge dashboard are intentionally excluded. Files in `public` are public; never put uploads or credentials there. All project data and media routes require backend ownership checks. API and private-media responses must send `Cache-Control: private, no-store`.

The prebuilt CLI flow uploads only `.vercel/output`, avoiding installation of backend rendering dependencies. The connected Git build also skips dependency installation and uses the same build script. Keep the outside-root source setting enabled so it can access `../public`.
