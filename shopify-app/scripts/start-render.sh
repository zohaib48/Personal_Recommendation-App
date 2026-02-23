#!/usr/bin/env bash
set -euo pipefail

# Render provides PORT for the primary web process.
APP_PORT="${PORT:-3000}"
ADMIN_PORT="${ADMIN_PORT:-3001}"

echo "Starting Remix admin UI on ${ADMIN_PORT}..."
PORT="${ADMIN_PORT}" npm run start:admin &
ADMIN_PID=$!

cleanup() {
  if kill -0 "${ADMIN_PID}" >/dev/null 2>&1; then
    kill "${ADMIN_PID}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

echo "Starting Express API/server on ${APP_PORT}..."
PORT="${APP_PORT}" ADMIN_PORT="${ADMIN_PORT}" node server/index.js
