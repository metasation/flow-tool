#!/bin/bash
# Chạy nhiều file prompts nối tiếp, xuyên đêm — bản direct, không qua useapi.
# Lưu ý: máy PHẢI mở màn hình / không sleep, vì Chrome thật đang chạy.
# Login trước 1 lần:  node flow-direct.mjs login
set -e
cd "$(dirname "$0")"
for f in examples/prompts-xuan.json examples/prompts-veo-hero.json; do
  [ -f "$f" ] || continue
  name=$(basename "$f" .json)
  echo "=== $f -> output/$(date +%F)-$name ==="
  node flow-direct.mjs generate --file "$f" --out "output/$(date +%F)-$name" || echo "⚠️  $f lỗi, qua file sau (xem manifest để resume)"
  sleep 30
done
echo "Xong hết. Xem output/*/manifest.json"
