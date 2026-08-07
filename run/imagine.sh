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
PORT="${IMAGINE_PORT:-8081}"

mkdir -p "$MODELS" "$LLAMA"

if [ ! -f "$GGUF" ]; then
  echo "  fetching imagine-0.8b v0.1.0 weights (~532MB, once)..."
  # v0.1.0 deliberately: its SPEC measures 0/12 self-reference hijack vs 8/12
  # for v0.2.0. We never ask this model who it is.
  curl -fL --progress-bar \
    "https://github.com/aiassistsecure/imagine/releases/download/v0.1.0/imagine-0.8b-Q4_K_M.gguf" \
    -o "$GGUF"
fi

if [ ! -x "$LLAMA/llama-server" ]; then
  echo "  fetching llama.cpp $LLAMA_TAG..."
  curl -fL --progress-bar \
    "https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_TAG}/llama-${LLAMA_TAG}-bin-ubuntu-x64.tar.gz" \
    -o /tmp/llama.tgz
  tar xzf /tmp/llama.tgz -C "$LLAMA" --strip-components=1
  chmod +x "$LLAMA"/llama-server "$LLAMA"/llama-cli 2>/dev/null || true
fi

echo "  imagine -> http://127.0.0.1:$PORT"
export LD_LIBRARY_PATH="$LLAMA:${LD_LIBRARY_PATH:-}"
cd "$LLAMA"
exec ./llama-server -m "$GGUF" --host 127.0.0.1 --port "$PORT" -t "$(nproc)" -c 2048 --no-warmup
