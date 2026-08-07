#!/usr/bin/env bash
# SHOCKME · terminal 3 — the site (REQUIRED)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export NEDB_URL="${NEDB_URL:-http://127.0.0.1:7070}"
export IMAGINE_URL="${IMAGINE_URL:-http://127.0.0.1:8081}"
cd "$HERE"
exec node --experimental-strip-types packages/bff/src/index.ts
