# Hosted studio frontend

The canonical UI is `../public`. This folder builds a static Vercel deployment using the Build Output API; the render worker and TrueForge stay on the persistent backend. No application secrets are needed in Vercel.

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

The prebuilt CLI flow uploads only `.vercel/output`, avoiding installation of backend rendering dependencies. A Git-based Vercel build must include files outside the `web` root; use this documented prebuilt flow unless that monorepo setting has been configured.
