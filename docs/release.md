# V1 release checklist

## Validation

Run all checks from a clean terminal without loading production financial data:

```sh
cd apps/api
UV_CACHE_DIR=/tmp/personal-finance-uv-cache uv run pytest -v
UV_CACHE_DIR=/tmp/personal-finance-uv-cache uv run ruff check .
UV_CACHE_DIR=/tmp/personal-finance-uv-cache uv run mypy app

cd ../web
npm run lint
npm run typecheck
npm run build

cd ../..
./scripts/smoke-v1.sh
```

The smoke check creates a temporary synthetic SQLite database, upgrades it with Alembic, starts both applications on loopback, exercises an exact-decimal ledger flow, and verifies the CORS, local-AI, manifest, service-worker, and icon boundaries. It removes its temporary database on exit and never reads the configured finance database.

## Release preparation

1. Record the current Alembic head with `cd apps/api && uv run alembic heads`; there must be exactly one head.
2. Create and validate an online backup using the procedure in [operations.md](operations.md). Store it outside the repository.
3. Set `PF_DATABASE_PATH` explicitly and run `uv run alembic upgrade head` before starting the API. Never create the schema from ORM metadata.
4. Set `NEXT_PUBLIC_API_URL` to the browser-reachable API URL before `npm run build`.
5. For LAN clients, bind the API and web servers to the intended private interface and list the exact web origins in `PF_CORS_ORIGINS`. Do not use `*`.
6. Keep Ollama disabled unless a local model has been installed and reviewed. Cloud AI is not required or configured by V1.
7. Start the release, then verify `/api/v1/health`, `/api/v1/ready`, `/api/v1/health/database`, the web root, and PWA installation from the intended client device.

## Rollback

Stop both services. Preserve the failed database for diagnosis, prepare a replacement from the last validated backup as documented in [operations.md](operations.md), install it only while the API is stopped, and restart the previous application build. Verify readiness and database health before allowing writes.
