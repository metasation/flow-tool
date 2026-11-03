# flow-direct — Bào credit Google Flow, không qua useapi

Tool CLI lái thẳng trình duyệt thật trên máy bạn để gen video Flow. **Không tốn $15/tháng useapi, không cần Gemini API key, không trừ tiền API.** Chỉ tốn credit Flow của tài khoản bạn đã join family Ultra.

## v1.1 — Thêm chế độ CDP (risk thấp hơn)

Mặc định CLI mở Chromium riêng của Playwright. Từ v1.1 có thêm `--cdp`: nối vào **Chrome thật đang mở sẵn** qua CDP, kiểu `google-flow-mcp` — không banner "controlled by automated test software", không login lại, fingerprint là Chrome thật.

```bash
./start-chrome.sh            # Linux/macOS (Windows: start-chrome.bat)
node flow-direct.mjs cdp-status
node flow-direct.mjs generate --file examples/prompts-xuan.json --cdp
node flow-direct.mjs status --cdp
```

Delay giữa các clip cũng chỉnh được: `--delay-min 10 --delay-max 15` (mặc định 25–70s). Đặt quá thấp dễ bị captcha.

Bản extension Chrome (risk thấp nhất, không cần CLI) ở thư mục anh em: `../flow-extension/`.

Học theo 2 tool mã nguồn mở đã chạy được end-to-end:
- [google-flow-mcp](https://github.com/gabrielgargiulodev/google-flow-mcp/blob/HEAD/README.md) — Playwright nối qua CDP vào Chrome thật đã đăng nhập Google, lái Flow agent để gen và tải về. Không API key, không cầm mật khẩu, xài session trình duyệt sẵn có.
- [flow-mcp](https://github.com/GTAI-1/flow-mcp/blob/main/README.md) — Mở cửa sổ Chrome riêng, bạn đăng nhập tay, chương trình không bao giờ gõ mật khẩu, chỉ xài session bạn tạo. Profile Chrome riêng nằm ở `~/.flow-mcp/chrome-profile`.

## Captcha — nói thẳng

Flow gắn **invisible reCAPTCHA v3**. Không có cách miễn phí nào giải tự động 100% đáng tin.

Tool này làm đúng như các tool open-source trên:
1. **Trình duyệt thật + profile cố định + tốc độ người** — 1 clip 1 lần, delay ngẫu nhiên, nghỉ 25–70s giữa các clip. Flow-mcp ghi rõ: trang có invisible reCAPTCHA, tool lái giao diện thật ở tốc độ người và không làm gì để né nó.
2. **Nếu captcha hiện ra** (checkbox "I'm not a robot" / "Verify you are human"): tool **dừng, chờ tối đa 10 phút để bạn giải tay trong chính cửa sổ trình duyệt đó**, rồi tự chạy tiếp. Miễn phí, mặc định.
3. **Tùy chọn trả phí** (không bắt buộc): đặt `2CAPTCHA_API_KEY` / `CAPSOLVER_API_KEY` trong `.env`. Tool thử xin token rồi chèn vào trang — chỉ hiệu quả với reCAPTCHA v2, với Flow v3 thường không có tác dụng.

Ngoài ra còn hook thử nghiệm `flow-captcha-solver` (PyPI, thư viện giải reCAPTCHA v3 cho Flow): nếu máy bạn đã `pip install flow-captcha-solver`, tool sẽ thử gọi, thất bại thì quay về chờ bạn giải.

## Lưu ý khi test trên máy ảo của Muse

`node flow-direct.mjs status` / `login` **không chạy được trong VM này**: egress proxy của VM cho curl qua nhưng chặn CONNECT của Chromium (test cả `example.com`, `google.com`, `flow.google.com` đều `ERR_TUNNEL_CONNECTION_FAILED`). Đây là giới hạn của sandbox, không phải lỗi tool. Trên máy bạn (Windows/Mac, mạng thường) thì chạy bình thường — tool đã tự lấy `HTTPS_PROXY` nếu có, và có `FLOW_NO_PROXY=1` để bỏ qua proxy.

Đã test được trong VM: syntax, `--help`, `estimate` (60 credit Xuân / 200 credit hero), `generate --dry-run`, `doctor` (Node v24, Playwright OK, Chromium OK).

## Cài đặt — 5 phút

```bash
cd flow-direct-tool
npm install
npx playwright install chromium
node flow-direct.mjs doctor
```

## Đăng nhập — 1 lần duy nhất

```bash
node flow-direct.mjs login
```

Chrome thật mở lên, bạn đăng nhập Google **bằng tay** trong cửa sổ đó (mật khẩu, 2FA, captcha lúc login nếu có — tự bạn giải). Tool không gõ mật khẩu, không lưu mật khẩu. Session lưu trong `./profile/` — lần sau không cần đăng nhập lại, trừ khi Google bắt đăng nhập lại.

Kiểm tra:

```bash
node flow-direct.mjs status
```

## Chạy thử — ước tính trước

```bash
node flow-direct.mjs estimate --file examples/prompts-xuan.json --ultra
# 4 clip Omni 720p 10s = 4 x 15 = 60 credit
```

## Generate — 1 file prompts = 1 đợt

```bash
node flow-direct.mjs generate --file examples/prompts-xuan.json --out output/2026-11-03-xuan
```

Tool sẽ, từng clip một:
1. Mở `flow.google.com`, kiểm tra captcha, kiểm tra đăng nhập
2. Gõ prompt chậm như người, chọn model, tỉ lệ 9:16 (nếu UI có)
3. Bấm Generate, bấm xác nhận dialog credit
4. Chờ video xong (tối đa 10 phút/clip), tải MP4 về `output/.../<slug>.mp4`
5. Ghi `output/.../manifest.json` — resume được: chạy lại cùng lệnh, clip đã `completed` sẽ bỏ qua

Chỉ kiểm tra, không gen:

```bash
node flow-direct.mjs generate --file examples/prompts-xuan.json --dry-run
```

Xem tận mắt từng bước (headed):

```bash
node flow-direct.mjs generate --file examples/prompts-xuan.json --headed
```

## Chạy xuyên đêm

```bash
chmod +x run-overnight.sh
./run-overnight.sh
```

Máy phải mở màn hình / không sleep, vì Chrome thật đang chạy. Không chạy song song 2 máy cùng 1 tài khoản.

## Bảng credit (Flow Help, Oct 2026)

| Model | Credit / clip |
|---|---|
| Omni Flash 360p 4/6/8/10s | 4 / 5 / 6 / 7 |
| Omni Flash 720p 4/6/8/10s | 7 / 10 / 12 / 15 |
| Veo 3.1 Lite (Ultra) 4/6/8s | 5 (giá như nhau, luôn chọn 8s) |
| Veo 3.1 Fast (Ultra) | 10 |
| Veo 3.1 Quality | 100 |
| Upscale 1080p | 0 (free, làm tay trên web sau) |
| Upscale 4K | 50 (chỉ Ultra) |

Pool Ultra 20x: 25.000 credit/tháng, **dùng chung cả family**. Chạy sớm đầu chu kỳ.

## Nếu UI Flow đổi, tool không tìm thấy nút

Tool lưu screenshot + HTML vào thư mục output (`<slug>-no-prompt-box.png`, `<slug>-page.html`). Gửi 2 file đó cho mình (hoặc mở issue) để cập nhật selector — đây là điểm yếu cố hữu của mọi tool lái web, kể cả google-flow-mcp / flow-mcp.

## Rủi ro cần biết

- Đây là browser automation không chính thức, Google không có API Flow. Google có thể đổi giao diện, khóa tạm tài khoản nếu gen quá nhanh / quá nhiều.
- Chạy chậm, 1 clip 1 lần, nghỉ ngẫu nhiên giữa các clip — đừng sửa code để chạy song song.
- Video gen xong vẫn lưu trong Flow của bạn, mở `flow.google.com` là thấy. Đừng xóa trên Flow trước khi tải về máy.
- Đừng chạy tool này và tool useapi cùng lúc trên cùng tài khoản.

## So sánh nhanh với bản useapi

| | flow-direct (tool này) | flow-tool (useapi) |
|---|---|---|
| Phí ngoài | $0 | $15/tháng |
| Login | Bạn đăng nhập tay 1 lần, profile lưu local | useapi login hộ qua browser remote |
| Captcha | Bạn giải tay khi hiện ra | useapi giải hộ (300 lần free đầu) |
| Tốc độ | Chậm, 1 clip 1 lần, nghỉ 25–70s | Nhanh, submit song song, poll |
| Độ ổn định | Thấp hơn, UI đổi là gãy | Cao hơn, API ổn định hơn |
| Chạy xuyên đêm | Được, nhưng máy phải mở màn hình | Được, chạy ngầm |

Nếu cần bào nhanh hàng nghìn clip trong 1 tháng, bản useapi vẫn nhanh hơn. Nếu chỉ cần vài trăm clip và không muốn trả $15, bản này là đủ.

## File trong tool

```
flow-direct.mjs           # CLI chính
package.json              # chỉ cần playwright
.env.example              # config tùy chọn (không có token bắt buộc)
run-overnight.sh          # chạy nhiều file prompts nối tiếp
examples/prompts-xuan.json        # 4 prompt Omni Xuân (dùng chung với bản useapi)
examples/prompts-veo-hero.json    # 2 prompt Veo Quality hero
profile/                  # session Chrome (tool tự tạo, không commit)
output/                   # MP4 + manifest.json từng đợt
```
