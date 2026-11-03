# flow-tool — Bào credit Google Flow cho Diễu Phố

Tool CLI hoàn thiện, không cần cài thêm gì ngoài Node.js 21+. Dùng **useapi.net Google Flow API** — wrapper xài credit Flow của tài khoản đã join family Ultra, **không** dùng Gemini API key, **không** trừ tiền API.

Video gen bằng tool vẫn lưu trong Flow của tài khoản đó, mở `flow.google.com` là thấy.

## 1. Cài đặt — 2 phút

```bash
cd flow-batch-tool
cp .env.example .env
# mở .env điền:
# USEAPI_TOKEN=...  (mua tại useapi.net, $15/tháng, bao 3 tài khoản)
# FLOW_EMAIL=you@gmail.com  (email đã join family Ultra)
node --version  # cần >= 21
```

Connect tài khoản Flow lần đầu theo hướng dẫn của useapi (login Gmail trong browser tự động, <30s). Dùng đúng email trong `.env`.

## 2. Chạy thử — ước tính trước, khỏi cháy credit

```bash
# Xem 4 prompt mẫu Xuân tốn bao nhiêu credit
node flow-tool.mjs estimate --file examples/prompts-xuan.json --ultra
# 4 clip Omni 720p 10s = 4 x 15 = 60 credit

# Xem 2 clip hero Veo Quality
node flow-tool.mjs estimate --file examples/prompts-veo-hero.json --ultra
# 2 x 100 = 200 credit
```

Bảng credit (Flow Help, Oct 2026):

| Model | Credit / clip |
|---|---|
| Omni Flash 360p 4/6/8/10s | 4 / 5 / 6 / 7 |
| Omni Flash 720p 4/6/8/10s | 7 / 10 / 12 / 15 |
| Veo 3.1 Lite (Ultra) 4/6/8s | 5 (giá như nhau, luôn chọn 8s) |
| Veo 3.1 Fast (Ultra) | 10 |
| Veo 3.1 Quality | 100 |
| Upscale 1080p | 0 (free) |
| Upscale 4K | 50 (chỉ Ultra) |
| Veo Lite Lower Priority 0 credit | Chỉ manager Ultra $199, family member KHÔNG có |

Pool Ultra 20x: 25.000 credit/tháng, **dùng chung cả family**. Chạy sớm đầu chu kỳ.

## 3. Generate — 1 file prompts = 1 đợt

```bash
node flow-tool.mjs generate --file examples/prompts-xuan.json --out output/2026-11-03-xuan
```

Tool sẽ:
1. Đọc `prompts.json` (array hoặc `{defaults, prompts}`)
2. Upload ảnh reference local nếu có (`referenceImage_1`, `startImage`...) — upload 1 lần, cache lại
3. Submit từng job `POST /videos` ở async mode, poll `GET /jobs/{jobId}` tới khi xong (60-180s/clip)
4. Tải MP4 về `output/2026-11-03-xuan/001-xuan-eiffel-tu-nhan-omni-flash-10s-720p.mp4`
5. Ghi `output/2026-11-03-xuan/manifest.json` — lưu `mediaGenerationId`, `jobId`, prompt, model, credit, file

**Chỉ gen, chưa tải (bào nhanh nhất):**
```bash
node flow-tool.mjs generate --file examples/prompts-xuan.json --no-download
# Sau đó tải sau:
node flow-tool.mjs download --manifest output/2026-11-03-xuan/manifest.json
```
Link `videoUrl` chỉ sống ~6h, tool lưu `mediaGenerationId` để lấy link mới sau. Đây là cách bào nhanh nhất vì không kẹt ở bước tải.

**Resume:** chạy lại cùng lệnh, tool tự skip clip đã `completed` trong manifest. Thêm `--force` để chạy lại hết.

## 4. Chạy xuyên đêm — nhiều file

```bash
chmod +x run-overnight.sh
./run-overnight.sh
# hoặc tự chạy:
# for f in examples/prompts-xuan.json examples/prompts-ha.json; do
#   node flow-tool.mjs generate --file "$f" --out "output/$(basename $f .json)"
# done
```

Mỗi file nên là 1 mùa / 1 landmark. **Lưu ý quan trọng:** Flow không tự tạo project theo file. Tất cả video dồn vào project hiện tại của tài khoản. Muốn mỗi mùa thành 1 project riêng trong Flow thì tạo project trước trên web, mở nó lên, rồi mới chạy batch đó. Còn ở máy bạn thì mỗi file đã có folder output riêng rồi.

## 5. Upscale sau — chỉ upscale clip thắng

```bash
# Upscale tất cả trong manifest lên 1080p (free)
node flow-tool.mjs upscale --manifest output/2026-11-03-xuan/manifest.json --resolution 1080p

# Chỉ upscale clip thắng: tạo winners.json = ["xuan-eiffel-tu-nhan", "xuan-pisa-quan"]
node flow-tool.mjs upscale --manifest output/2026-11-03-xuan/manifest.json --resolution 4K --winners winners.json
# 4K = 50 credit/clip, chỉ Ultra. Upscale 1 video 2 lần trả về cache, không tốn thêm.
```

Hoặc upscale ngay lúc generate:
```bash
node flow-tool.mjs generate --file examples/prompts-veo-hero.json --upscale-to 1080p
```

## 6. Nhân vật đồng nhất — Character

Cách chuẩn, làm 1 lần, xài cho mọi batch:

```bash
# B1: Chuẩn bị 2 ảnh: front + 3/4, nền trơn, đủ outfit
# B2: Tạo character (ảnh sẽ tự upload lên Flow)
node flow-tool.mjs create-character --name "Tu Nhan Chibi" \
  --image ./tu-nhan-front.png --image2 ./tu-nhan-34.png \
  --voice Charon --personality "Chibi prisoner, white torn shirt, wooden cangue"

# B3: Copy id trả về vào prompts.json, vd:
# "character_1": "user:1234-email:...-character:abc..."
```

Xem mẫu trong `examples/characters.example.json`.

Quy tắc budget:
- Omni Flash: tối đa 7 reference (ảnh character + ảnh raw), 5 voice. Vd: character_1 (2 ảnh) + character_2 (2 ảnh) + 3 referenceImage = 7, OK.
- Veo Fast/Lite: tối đa 3 reference, 1 voice, chỉ 8s.
- Veo Quality: không hỗ trợ character.
- Không dùng chung `startImage`/`endImage` với `character_*` — 2 mode này loại trừ nhau.

Cách nhẹ hơn (không cần tạo character): gắn cùng file ảnh vào mọi prompt:
```json
{ "prompt": "...", "referenceImage_1": "./tu-nhan-front.png", "model": "omni-flash" }
```

## 7. Các lệnh khác

```bash
node flow-tool.mjs health --email you@gmail.com
node flow-tool.mjs list-projects --email you@gmail.com
node flow-tool.mjs list-media --email you@gmail.com
node flow-tool.mjs list-media --email you@gmail.com --project-id <id> --json
node flow-tool.mjs download --manifest output/2026-11-03-xuan/manifest.json --job <jobId>  # xem 1 job lẻ
node flow-tool.mjs --help
```

## 8. Cấu trúc prompts.json

```json
{
  "defaults": { "model": "omni-flash", "duration": 10, "resolution": "720p", "aspectRatio": "9:16", "count": 1 },
  "prompts": [
    {
      "slug": "xuan-eiffel-tu-nhan",
      "season": "spring",
      "landmark": "Eiffel Tower",
      "prompt": "chibi 2D flat, ... 9:16 vertical",
      "model": "omni-flash",
      "duration": 10,
      "resolution": "720p",
      "character_1": "user:...-character:...",
      "referenceAudio_1": "Charon"
    }
  ]
}
```

Field agent được phép chọn: `model` (`omni-flash` | `veo-3.1-lite` | `veo-3.1-fast` | `veo-3.1-quality`), `duration` (Omni 4/6/8/10, Veo 4/6/8), `resolution` (Omni chỉ 360p/720p lúc gen, 1080p/4K là bước upscale sau), `aspectRatio` (9:16 cho TikTok, 16:9 cho ngang), `count` (luôn để 1, 2 output tốn gấp đôi credit).

## 9. Rủi ro cần biết

- useapi là bên thứ ba, không phải Google. Google đổi backend là tool có thể gãy tạm thời.
- Mỗi video/image cần 1 captcha, useapi giải hộ (300 lần free đầu, sau đó ~$0.80-3/1.000).
- Pool credit family dùng chung, manager thấy được ai xài bao nhiêu. Đừng để lộ là bạn đang bào hết pool nếu không muốn bị kick.
- Đừng xóa video trên Flow trước khi tải về máy — xóa là xóa khỏi tài khoản Google luôn.

## File trong tool

```
flow-tool.mjs            # CLI chính, không cần npm install
.env.example             # mẫu config
run-overnight.sh         # chạy nhiều file prompts nối tiếp
examples/prompts-xuan.json        # 4 prompt Omni Xuân
examples/prompts-veo-hero.json    # 2 prompt Veo Quality hero
examples/characters.example.json  # mẫu 3 character Diễu Phố
output/                  # MP4 + manifest.json từng đợt (tool tự tạo)
```
