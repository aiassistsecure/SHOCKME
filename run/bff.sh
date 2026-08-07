#!/usr/bin/env bash
# SHOCKME · terminal 3 — the site (REQUIRED)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=/dev/null
. "$HERE/run/_node.sh"
export NEDB_URL="${NEDB_URL:-http://127.0.0.1:7070}"
export IMAGINE_URL="${IMAGINE_URL:-http://127.0.0.1:8081}"
cd "$HERE"
node_run packages/bff/src/index.ts
