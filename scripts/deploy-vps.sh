#!/usr/bin/env bash
set -e

VPS_HOST="${1:-169.58.57.223}"
VPS_USER="${2:-root}"
REMOTE_DIR="/opt/personal-finance"

echo "==> Deploying Personal Finance to ${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}"

# Ensure remote directory exists
ssh -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_HOST}" "mkdir -p ${REMOTE_DIR}"

# Sync project files (exclude local env, data, build artifacts, backups)
rsync -avz --delete \
  --exclude '.git' \
  --exclude '.venv' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'data/' \
  --exclude 'backup/' \
  --exclude '*.zip' \
  --exclude '*.tar.gz' \
  --exclude '*.patch' \
  --exclude '.env*' \
  --exclude 'description_*' \
  --exclude '_to_delete' \
  --exclude 'test-results/' \
  --exclude '*.tsbuildinfo' \
  --exclude '*.log' \
  --exclude '.mypy_cache' \
  --exclude '.pytest_cache' \
  --exclude '.ruff_cache' \
  --exclude '__pycache__' \
  --exclude 'tests/' \
  ./ "${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}/"

# Build and start on VPS
ssh -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_HOST}" "
  cd ${REMOTE_DIR}
  mkdir -p data
  if ! command -v docker &> /dev/null; then
    echo '==> Installing Docker...'
    curl -fsSL https://get.docker.com | sh
  fi
  echo '==> Building and starting containers...'
  docker compose up -d --build
  echo '==> Checking container status...'
  docker compose ps
"

echo "==> Deployment finished successfully!"
echo "    Web: http://${VPS_HOST}:3000"
echo "    API: http://${VPS_HOST}:8000"
