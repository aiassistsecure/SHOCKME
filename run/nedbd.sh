#!/usr/bin/env bash
# SHOCKME · terminal 1 — the engine (REQUIRED)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
command -v nedbd >/dev/null 2>&1 || { echo "  pip install nedb-engine"; exit 1; }
mkdir -p "$HERE/data"
echo "  nedbd -> http://127.0.0.1:${NEDB_PORT:-7070}"
exec nedbd --dag --data "$HERE/data" --port "${NEDB_PORT:-7070}"
