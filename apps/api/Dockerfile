FROM python:3.12-slim

WORKDIR /app

# Install curl
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Copy dependency definition files
COPY pyproject.toml uv.lock* ./

# Install dependencies
RUN uv sync --frozen --no-dev --no-install-project

# Copy application files
COPY alembic.ini ./
COPY migrations ./migrations
COPY app ./app

ENV PATH="/app/.venv/bin:$PATH"
ENV PF_DATABASE_PATH="/app/data/finance.db"
ENV PF_ENVIRONMENT="production"

EXPOSE 8000

CMD ["sh", "-c", "uv run alembic upgrade head && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000"]
