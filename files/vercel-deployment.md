# AgriCast production deployment

## Architecture

Deploy the React/Vite dashboard to Vercel with `frontend/` as the project root. Deploy `backend/` as a long-running Node.js service (the included Dockerfile is suitable for a container host) and use a managed MySQL 8-compatible database. The API owns database access; never expose the MySQL port publicly.

The Express API maintains a Server-Sent Events stream and a MySQL-backed change feed. Run it on a persistent Node/container service, not as ordinary Vercel Functions. The frontend also refreshes dashboard data every minute and after an SSE reconnect so temporary stream failures do not leave it stale.

## Vercel frontend

1. Import the repository into Vercel and set **Root Directory** to `frontend`.
2. Use the Vite preset. The checked-in `frontend/vercel.json` sets `npm ci`, `npm run build`, `dist`, SPA fallback routing, and basic security headers.
3. Set the Vercel environment variable `VITE_API_URL` for Production and Preview. Its value must be the HTTPS API base URL ending in `/api`, for example `https://api.example.gov.ph/api`. This value is public and must not contain secrets.
4. Add every Vercel custom/preview origin that should access the API to the API service's `WEB_ORIGIN` allowlist. Origins are exact, comma-separated scheme + host values; do not include paths or wildcards.
5. Redeploy after changing environment variables. Vite embeds `VITE_API_URL` during the build.

Local frontend development uses `frontend/.env.local` (ignored by Git) or can copy `frontend/.env.example` to that filename. Production builds intentionally have no localhost API fallback.

## Persistent API and managed MySQL

Build the API image with `backend/` as the Docker build context:

```sh
docker build -t agricast-api ./backend
```

Configure these environment variables on the API service:

| Variable | Required | Notes |
|---|---:|---|
| `NODE_ENV` | Yes | Set to `production`. |
| `PORT` | Platform-dependent | Use the port assigned by the host; defaults to `4000`. |
| `JWT_SECRET` | Yes | Unique random secret, at least 32 characters. Rotate deliberately because rotation invalidates active sessions. |
| `MYSQL_HOST` | Yes | Managed database host; do not use localhost. |
| `MYSQL_PORT` | Yes | Managed database TLS endpoint port. |
| `MYSQL_DATABASE` | Yes | Existing database/schema name. |
| `MYSQL_USER` | Yes | API runtime user, limited to required DML privileges. |
| `MYSQL_PASSWORD` | Yes | Store as a secret in the hosting platform. |
| `MYSQL_SSL_CA` | Provider-dependent | PEM CA certificate if required by the database provider. TLS certificate verification remains enabled in production. |
| `WEB_ORIGIN` | Yes | Comma-separated exact HTTPS Vercel/custom-domain origins. |
| `DB_AUTO_MIGRATE` | Yes | Set `false`; apply schema changes as a release step instead of on each service startup. |
| `INITIAL_ADMIN_EMAIL` | First install only | Optional one-time first administrator bootstrap. Set together with the password only when no admin exists. |
| `INITIAL_ADMIN_PASSWORD` | First install only | At least 16 characters. Remove both bootstrap variables after the admin is created. |

Provision the managed database and credentials first. Run the initial schema/trigger migration once with a migration credential that has the required `CREATE`, `ALTER`, and `TRIGGER` privileges. For the migration job, supply that credential as `MYSQL_USER`/`MYSQL_PASSWORD`; configure the running API service with a separate least-privilege runtime credential:

```sh
cd backend
npm ci
npm run db:migrate
npm start
```

The migration command reads the same database environment variables and does not seed sample records. Production API startup never creates demo users or sample data. Local development retains schema setup and demo seeding.

Use the host's built-in TLS termination and health-check support. The API requires forwarded HTTPS in production, trusts one reverse proxy hop, and exposes `/api/health` as a database readiness check (plain HTTP is permitted only for loopback health probes inside the container). The MySQL pool uses bounded, keep-alive connections and TLS certificate verification; mysql2 discards failed connections and obtains replacements for later requests. Failed operations are returned rather than blindly retried, to avoid duplicate writes. Keep the database private/network-restricted to the API and migration runner. Configure automated encrypted backups and test restore procedures before using real operational data.

Login requests have per-instance rate limits. If the API is scaled across multiple instances, configure a shared rate limit at the hosting provider or gateway as well.

## Mobile field app

Release builds must be given the same HTTPS API URL:

```sh
cd mobile
flutter build web --release --dart-define=API_BASE_URL=https://api.example.gov.ph/api
flutter build apk --release --dart-define=API_BASE_URL=https://api.example.gov.ph/api
```

Native release builds and Flutter web releases reject an unset or non-HTTPS API override. Debug builds retain local development defaults.

## Post-deployment verification

- Confirm `https://<api-host>/api/health` returns HTTP 200 and `{"status":"ok","database":"ok"}`.
- Open the Vercel site and verify login with the provisioned admin, then sign out and confirm protected API requests require authentication.
- Verify dashboard reports, crops, barangays, forecasts, summary, and allocation endpoints return JSON from the managed database.
- Create a test report in the field app and confirm it synchronizes and appears in the web dashboard; review/approve it and confirm forecasts refresh.
- Confirm browser network requests use only the configured HTTPS `VITE_API_URL`; verify CORS preflights succeed for approved origins and browsers cannot read API responses from unapproved origins.
- Confirm `/api/events` opens an authenticated event stream and changes refresh the dashboard. Temporarily interrupt the stream and confirm the one-minute refresh fallback works.
- Check API logs for startup/configuration, MySQL, rejected-origin, and request-ID errors. Confirm TLS/database certificate verification, rate limiting, backup, restore, and rollback procedures.

## Deployment boundaries

Production deployment has not been exercised against a Vercel account, external container host, or managed MySQL instance in this repository. Supply provider credentials and domains, then complete the checklist above before declaring the system production-operational. Vercel previews use different origins; add only the exact preview domains needed, or disable API access from previews.
