#!/usr/bin/env bash
# Pruebas E2E de la aplicación Tauri real (tauri-driver + WebKitGTK) bajo xvfb.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "${OPENRVT_E2E_SIN_COMPILAR:-0}" != "1" ]; then
  npm run tauri build -- --debug --no-bundle
fi

cd e2e
npm install --no-audit --no-fund
xvfb-run -a --server-args="-screen 0 2560x1600x24" npm test
