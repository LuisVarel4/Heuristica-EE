#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT/logs"

for name in functions backend; do
  pid_file="$LOG_DIR/${name}.pid"
  if [[ -f "$pid_file" ]]; then
    pid="$(cat "$pid_file")"
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" && echo "Stopped $name (pid $pid)"
    fi
    rm -f "$pid_file"
  fi
done

echo "Done."
