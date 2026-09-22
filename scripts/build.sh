#!/usr/bin/env bash
# Build the Callspire Web Softphone SPA and verify the output.
# Usage (from repo root):  bash callspire-web-softphone/scripts/build.sh
# In CI: run this step, then copy dist/ into the gateway static directory.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SPA_DIR="$SCRIPT_DIR/../softphone-web"

echo "==> Installing dependencies …"
npm ci --prefix "$SPA_DIR"

echo "==> Building SPA …"
npm run build --prefix "$SPA_DIR"

DIST_DIR="$SPA_DIR/dist"

echo "==> Verifying output …"
if [[ ! -f "$DIST_DIR/index.html" ]]; then
  echo "ERROR: dist/index.html not found!" >&2
  exit 1
fi

if ! grep -q 'src="/softphone/assets/' "$DIST_DIR/index.html"; then
  echo "ERROR: index.html does not contain /softphone/ asset paths." >&2
  echo "       Check that vite.config.ts has base: '/softphone/'." >&2
  exit 1
fi

echo "==> Build succeeded. Artifact: $DIST_DIR"
du -sh "$DIST_DIR"
