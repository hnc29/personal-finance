# Operations

## Runtime and LAN access

Apply migrations and start the API with an explicit database path:

```sh
cd apps/api
PF_DATABASE_PATH=/absolute/path/finance.db uv run alembic upgrade head
PF_DATABASE_PATH=/absolute/path/finance.db uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

For LAN use, bind only to the intended private interface (or `0.0.0.0` when the host firewall restricts access) and set `PF_CORS_ORIGINS` to a JSON array of exact web origins, for example `PF_CORS_ORIGINS='["http://localhost:3000","http://192.168.1.10:3000"]'`. Build the web app with a browser-reachable API address, for example `NEXT_PUBLIC_API_URL=http://192.168.1.20:8000 npm run build`, then start it with `npm run start -- --hostname 0.0.0.0 --port 3000`. Plain HTTP service workers work on `localhost` but normally require HTTPS on other devices; use trusted local TLS when PWA installation is required over LAN. Do not expose either service directly to the public internet.

Use `/api/v1/health` for process liveness and `/api/v1/ready` for traffic readiness. Readiness checks the database connection. `/api/v1/health/database` remains the focused database diagnostic.

## Backup and restore

Create a consistent online SQLite backup (the destination must not exist):

`cd apps/api && uv run python -m app.backup_cli create /safe/location/finance-YYYYMMDD.db`

Validate it after creation and periodically with `uv run python -m app.backup_cli validate PATH`. Test restoration on a non-production host or temporary path. To restore, stop the API, run `uv run python -m app.backup_cli prepare-restore BACKUP NEW_FILE`, preserve the current database for diagnosis, then manually replace the configured database with `NEW_FILE`. The command deliberately never overwrites the live database. Start the API and verify `/api/v1/ready` and `/api/v1/health/database`. Keep backup files outside the repository, restrict their permissions, and protect them like the source financial database. Retention and off-device copies are operator policy; periodically confirm that at least one retained backup can be restored.

## Optional local AI

Ollama is disabled by default and no cloud provider is required. Set `PF_OLLAMA_ENABLED=true` and `PF_OLLAMA_MODEL` to an installed local model; `PF_OLLAMA_BASE_URL` defaults to loopback. The `/api/v1/ai/suggest` endpoint supports categorization, query, and insight suggestions only. It does not receive database access, execute SQL, persist output, or calculate financial facts. Every result is explicitly non-authoritative; SQL, deterministic rules, and user-approved records remain the source of truth.

Keep Ollama bound to loopback unless the local network and model endpoint are separately secured. Prompts must be limited to the text the user intentionally submits; do not attach database contents, exports, statements, credentials, or backups. If Ollama is unavailable, the API returns `503` and all authoritative application functions remain available.

## PWA behavior

The service worker caches only the public web shell (`/`, the manifest, and the icon). API responses are never cached. After a release, reload once while online so the current shell replaces the previous cache. Offline mode may display the last cached shell, but ledger reads and writes still require the API and must surface their normal network errors.
