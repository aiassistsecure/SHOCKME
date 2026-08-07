#!/usr/bin/env bash
# SHOCKME · node invocation resolver
#
# TypeScript type-stripping moved twice across Node releases, so a hardcoded
# flag is wrong on at least one side of every boundary:
#
#   < 22.6    no stripping at all              -> unsupported, say so clearly
#   22.6-23.5 needs --experimental-strip-types -> flag REQUIRED
#   >= 23.6   stripping on by default          -> flag REMOVED (passing it errors)
#
# Shipped hardcoding `--experimental-strip-types` and it died instantly on a
# machine with older Node. "Works on my machine" is not a run script.

node_run() {
  command -v node >/dev/null 2>&1 || { echo "  node not found. install Node 22.6 or newer."; exit 1; }

  local raw major minor
  raw="$(node -v)"                 # e.g. v24.14.1
  major="${raw#v}"; major="${major%%.*}"
  minor="${raw#v*.}"; minor="${minor%%.*}"

  if [ "$major" -lt 22 ] || { [ "$major" -eq 22 ] && [ "$minor" -lt 6 ]; }; then
    cat <<EOF

  Node $raw cannot run TypeScript directly.
  SHOCKME needs Node 22.6+ (24 LTS recommended).

    brew upgrade node          # macOS
    nvm install 24 && nvm use 24

EOF
    exit 1
  fi

  # 23.6+ strips types natively and REJECTS the experimental flag.
  if [ "$major" -ge 24 ] || { [ "$major" -eq 23 ] && [ "$minor" -ge 6 ]; }; then
    exec node "$@"
  fi
  exec node --experimental-strip-types "$@"
}
