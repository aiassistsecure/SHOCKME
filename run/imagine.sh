#!/usr/bin/env bash
# SHOCKME · terminal 2 — the voice of the room (OPTIONAL)
#
# SHOCKME does NOT hard-depend on this. If this server is not running, every
# line falls back to the curated corpus and the room still works. Running it
# makes the room stop repeating itself.
#
# First run downloads ~532MB of weights from the imagine release.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODELS="$HERE/vendor/models"
LLAMA="$HERE/vendor/llama"
GGUF="$MODELS/imagine-0.8b-Q4_K_M.gguf"
LLAMA_TAG="${LLAMA_TAG:-b10322}"

# macOS ships arm64 (Apple Silicon) or x64 (Intel iMac). Pick correctly.
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64)  LLAMA_ASSET="llama-${LLAMA_TAG}-bin-macos-arm64.tar.gz" ;;
  Darwin-x86_64) LLAMA_ASSET="llama-${LLAMA_TAG}-bin-macos-x64.tar.gz" ;;
  *)             LLAMA_ASSET="llama-${LLAMA_TAG}-bin-ubuntu-x64.tar.gz" ;;
esac
PORT="${IMAGINE_PORT:-8081}"

mkdir -p "$MODELS" "$LLAMA"

if [ ! -f "$GGUF" ]; then
  echo "  fetching imagine-0.8b v0.1.0 weights (~532MB, once)..."
  # v0.1.0 deliberately: its SPEC measures 0/12 self-reference hijack vs 8/12
  # for v0.2.0. We never ask this model who it is.
  curl -fL -C - --progress-bar \
    "https://github.com/aiassistsecure/imagine/releases/download/v0.1.0/imagine-0.8b-Q4_K_M.gguf" \
    -o "$GGUF"
fi

# A previous run may have left binaries for the WRONG platform here (this
# happened: Linux binaries on a Mac, and the -x test happily skipped the
# refetch). Verify the binary actually runs before trusting it.
if [ -x "$LLAMA/llama-server" ] && ! "$LLAMA/llama-server" --version >/dev/null 2>&1; then
  echo "  existing llama-server will not execute on this platform — refetching"
  rm -rf "${LLAMA:?}"/* 
fi

if [ ! -x "$LLAMA/llama-server" ]; then
  echo "  fetching llama.cpp $LLAMA_TAG..."
  curl -fL --progress-bar \
    "https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_TAG}/${LLAMA_ASSET}" \
    -o "/tmp/$LLAMA_ASSET"
  # VERIFIED against the b10322 release manifest: every platform ships
  # .tar.gz. An earlier version guessed .zip for macOS and 404'd on a real
  # Mac. Check the manifest, do not guess asset names.
  tar xzf "/tmp/$LLAMA_ASSET" -C "$LLAMA" --strip-components=1
  if [ -d "$LLAMA/build/bin" ]; then mv "$LLAMA"/build/bin/* "$LLAMA"/ 2>/dev/null || true; fi
  # macOS quarantines unsigned downloads; without this the binary silently
  # refuses to launch.
  [ "$(uname -s)" = "Darwin" ] && xattr -dr com.apple.quarantine "$LLAMA" 2>/dev/null || true
  chmod +x "$LLAMA"/llama-server "$LLAMA"/llama-cli 2>/dev/null || true
fi

echo "  imagine -> http://127.0.0.1:$PORT"
# macOS uses DYLD_LIBRARY_PATH; LD_LIBRARY_PATH is Linux-only and silently
# does nothing there, producing a confusing dyld failure at launch.
export LD_LIBRARY_PATH="$LLAMA:${LD_LIBRARY_PATH:-}"
export DYLD_LIBRARY_PATH="$LLAMA:${DYLD_LIBRARY_PATH:-}"
cd "$LLAMA"
exec ./llama-server -m "$GGUF" --host 127.0.0.1 --port "$PORT" -t "$(getconf _NPROCESSORS_ONLN 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)" -c 2048 --parallel 1 --no-warmup
