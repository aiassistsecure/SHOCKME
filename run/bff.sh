#!/usr/bin/env bash
# SHOCKME · the site (REQUIRED)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$HERE/run/_node.sh"

# Load .env if present. Without this the file is decorative — the BFF reads
# process.env directly, so an unsourced .env silently does nothing.
if [ -f "$HERE/.env" ]; then
  set -a; . "$HERE/.env"; set +a
fi

export NEDB_URL="${NEDB_URL:-http://127.0.0.1:7070}"
export IMAGINE_URL="${IMAGINE_URL:-http://127.0.0.1:8081}"
cd "$HERE"
node_run packages/bff/src/index.ts
