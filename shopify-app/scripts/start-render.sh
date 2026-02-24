#!/usr/bin/env bash
set -euo pipefail

# Render provides PORT for the primary web process.
APP_PORT="${PORT:-3000}"
ADMIN_PORT="${ADMIN_PORT:-3001}"
ADMIN_HOST="${ADMIN_HOST:-127.0.0.1}"

echo "Starting Remix admin UI on ${ADMIN_HOST}:${ADMIN_PORT}..."
HOST="${ADMIN_HOST}" PORT="${ADMIN_PORT}" npm run start:admin &
ADMIN_PID=$!

cleanup() {
  if kill -0 "${ADMIN_PID}" >/dev/null 2>&1; then
    kill "${ADMIN_PID}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

# Wait for admin process to accept connections so /app proxy doesn't
# return immediate 502s while the secondary process is booting.
ADMIN_READY=0
for _ in {1..30}; do
  if ! kill -0 "${ADMIN_PID}" >/dev/null 2>&1; then
    echo "Admin UI process exited during startup."
    wait "${ADMIN_PID}" || true
    exit 1
  fi

  if (echo >"/dev/tcp/${ADMIN_HOST}/${ADMIN_PORT}") >/dev/null 2>&1; then
    echo "Admin UI is reachable."
    ADMIN_READY=1
    break
  fi
  sleep 1
done

if [ "${ADMIN_READY}" -ne 1 ]; then
  echo "Admin UI did not become reachable on ${ADMIN_HOST}:${ADMIN_PORT} within 30s."
  exit 1
fi

echo "Starting Express API/server on ${APP_PORT}..."
PORT="${APP_PORT}" ADMIN_PORT="${ADMIN_PORT}" ADMIN_HOST="${ADMIN_HOST}" node server/index.js
