#!/bin/sh
# Starts Card Wars on this computer so phones and PCs on the same Wi-Fi can
# play each other, even without internet. Needs Node.js 18 or newer.
cd "$(dirname "$0")/server" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Card Wars needs Node.js 18 or newer: https://nodejs.org"
  exit 1
fi
[ -d node_modules ] || npm install --no-audit --no-fund || exit 1
exec node server.mjs
