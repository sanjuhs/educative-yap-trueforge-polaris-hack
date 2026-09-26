CREATE TABLE IF NOT EXISTS yap_users (
 id uuid PRIMARY KEY, email text NOT NULL UNIQUE, password_hash text NOT NULL,
 role text NOT NULL DEFAULT 'user' CHECK (role IN ('owner','user')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS yap_sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES yap_users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS yap_sessions_expiry ON yap_sessions(expires_at);
CREATE TABLE IF NOT EXISTS yap_login_limits (
 bucket text PRIMARY KEY, attempts integer NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS yap_resources (
 kind text NOT NULL, id text NOT NULL, user_id uuid NOT NULL REFERENCES yap_users(id),
 metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,kind,id)
);
CREATE INDEX IF NOT EXISTS yap_resources_owner ON yap_resources(user_id,kind);
CREATE TABLE IF NOT EXISTS yap_assets (
 id text NOT NULL, user_id uuid NOT NULL REFERENCES yap_users(id), kind text NOT NULL,
 object_key text, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,id)
);
CREATE INDEX IF NOT EXISTS yap_assets_owner ON yap_assets(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS yap_projects (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES yap_users(id),
 payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS yap_projects_owner ON yap_projects(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS yap_versions (
 id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES yap_projects(id),
 user_id uuid NOT NULL REFERENCES yap_users(id), revision integer NOT NULL,
 payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(project_id,revision)
);
CREATE TABLE IF NOT EXISTS yap_jobs (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES yap_users(id), kind text NOT NULL,
 idempotency_key text NOT NULL, payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0, max_attempts integer NOT NULL DEFAULT 3,
 available_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, worker_id text,
 result jsonb, error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS yap_jobs_claim ON yap_jobs(status,available_at,created_at);
CREATE INDEX IF NOT EXISTS yap_jobs_owner ON yap_jobs(user_id,created_at DESC);
