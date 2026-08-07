#!/usr/bin/env bash
# SHOCKME · determinism + divergence, no servers needed
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$HERE/run/_node.sh"
cd "$HERE"
node_run packages/engine/test/t1.ts
