#!/bin/bash
# Chạy xuyên đêm: mỗi file prompts.json = 1 đợt, output riêng từng đợt.
# Đặt file prompts của bạn vào examples/ hoặc prompts/ rồi sửa danh sách FILES bên dưới.
# Lưu ý: Flow không tự tạo project theo file — muốn mỗi đợt thành 1 project riêng
# thì tạo project trước trên web, mở nó lên, rồi mới chạy đợt đó.
set -u
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Thiếu .env — copy từ .env.example và điền USEAPI_TOKEN + FLOW_EMAIL"
  exit 1
fi

FILES=(
  "examples/prompts-xuan.json"
  "examples/prompts-veo-hero.json"
)

for f in "${FILES[@]}"; do
  [ -f "$f" ] || { echo "SKIP không thấy $f"; continue; }
  base=$(basename "$f" .json)
  out="output/$(date +%F)-${base}"
  echo ""
  echo "=== $(date '+%H:%M:%S') — Chạy $f -> $out ==="
  node flow-tool.mjs generate --file "$f" --out "$out"
  echo "=== Xong $f, nghỉ 30s rồi chạy file tiếp ==="
  sleep 30
done

echo ""
echo "Xong tất cả. Xem manifest từng đợt trong output/*/manifest.json"
echo "Upscale clip thắng: node flow-tool.mjs upscale --manifest output/<ngày>-<tên>/manifest.json --resolution 1080p"
