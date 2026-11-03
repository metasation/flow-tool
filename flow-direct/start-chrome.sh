#!/bin/bash
# Mở Chrome THẬT với remote debugging, để flow-direct nối vào qua CDP (--cdp).
# Không banner automation, không login lại — xài luôn session Chrome thật của bạn.
# Profile riêng để không đụng profile Chrome hàng ngày của bạn.
set -e
PROFILE="$HOME/.flow-direct-chrome-profile"
PORT="${CDP_PORT:-9222}"
URL="${1:-https://flow.google.com}"
mkdir -p "$PROFILE"
if command -v google-chrome >/dev/null 2>&1; then CHROME=google-chrome;
elif command -v google-chrome-stable >/dev/null 2>&1; then CHROME=google-chrome-stable;
elif command -v chromium >/dev/null 2>&1; then CHROME=chromium;
elif command -v chromium-browser >/dev/null 2>&1; then CHROME=chromium-browser;
elif [ "$(uname)" = "Darwin" ]; then
  echo "Mở Chrome trên macOS..."
  open -a "Google Chrome" --args --remote-debugging-port="$PORT" --user-data-dir="$PROFILE" "$URL"
  echo "Chrome đã mở. Kiểm tra: node flow-direct.mjs cdp-status"
  exit 0
else echo "Không tìm thấy Chrome. Cài Google Chrome rồi chạy lại."; exit 1; fi
echo "Mở $CHROME --remote-debugging-port=$PORT ..."
"$CHROME" --remote-debugging-port="$PORT" --user-data-dir="$PROFILE" "$URL" &
echo "Chrome đã mở. Kiểm tra: node flow-direct.mjs cdp-status"
