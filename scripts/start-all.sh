#!/usr/bin/env bash
# Start Cloud Function emulator + FastAPI on a Linux VM (e.g. GCP).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"

stop_pid_file() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file")"
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      sleep 1
    fi
    rm -f "$pid_file"
  fi
}

stop_pid_file "$LOG_DIR/functions.pid"
stop_pid_file "$LOG_DIR/backend.pid"

echo "==> Cloud Function (port 8081)"
cd "$ROOT/cloud-function"
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
# shellcheck source=/dev/null
source .venv/bin/activate
pip install -q -r requirements.txt
nohup functions-framework --target=run_evolution --port=8081 \
  >"$LOG_DIR/functions.log" 2>&1 &
echo $! >"$LOG_DIR/functions.pid"
deactivate 2>/dev/null || true

echo "==> Backend API (port 8000)"
cd "$ROOT/backend"
if [[ ! -f .env ]]; then
  cp .env.example .env
fi
if ! grep -q '^CLOUD_FUNCTION_URL=' .env 2>/dev/null; then
  echo "CLOUD_FUNCTION_URL=http://127.0.0.1:8081" >>.env
else
  sed -i 's|^CLOUD_FUNCTION_URL=.*|CLOUD_FUNCTION_URL=http://127.0.0.1:8081|' .env
fi
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
# shellcheck source=/dev/null
source .venv/bin/activate
pip install -q -r requirements.txt
nohup uvicorn app.main:app --host 127.0.0.1 --port 8000 \
  >"$LOG_DIR/backend.log" 2>&1 &
echo $! >"$LOG_DIR/backend.pid"
deactivate 2>/dev/null || true

sleep 2
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo ""
echo "Services started."
echo "  App:      http://${IP:-localhost}:8000"
echo "  Function: http://127.0.0.1:8081 (internal)"
echo "  Logs:     $LOG_DIR/functions.log  $LOG_DIR/backend.log"
echo "  Stop:     ./scripts/stop-all.sh"
