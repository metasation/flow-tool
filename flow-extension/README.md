# Flow Direct — Extension Chrome

Gen video Flow theo lô, **ngay trên giao diện flow.google.com**, không qua useapi, không tốn $15/tháng, không token, không mật khẩu.

## Vì sao extension an toàn hơn CLI?

- Chạy trong **Chrome thật bạn đang dùng hàng ngày** — fingerprint, lịch sử, cookie đều như người thật.
- **Không cần login lại** — xài luôn session Flow bạn đã đăng nhập sẵn. Không có sự kiện đăng nhập từ trình duyệt lạ, không banner "Chrome is being controlled by automated test software".
- Không có server ngoài nào — extension chỉ chạy trên `flow.google.com`, không gửi prompt/token đi đâu.

## Cài đặt — 2 phút (load unpacked, không cần Chrome Web Store)

1. Mở Chrome → `chrome://extensions/` → bật **Developer mode** (góc phải trên).
2. Bấm **Load unpacked** → chọn thư mục `flow-extension/` này.
3. Mở `flow.google.com`, đăng nhập sẵn (nếu chưa).
4. Panel **🎬 Flow Direct — Batch** hiện ở góc phải dưới. Nếu không thấy, bấm icon extension trên thanh công cụ → bấm "Mở flow.google.com".

Gỡ: vào `chrome://extensions/` → Remove. Không để lại gì ngoài queue đã lưu trong `chrome.storage.local`.

## Dùng

1. Bấm **Choose File** → chọn file `prompts.json` (cùng format với `flow-tool` / `flow-direct`, xem `examples/prompts-xuan.json`).
   - Hoặc bấm **Nạp mẫu Xuân** để thử 2 clip.
2. Bấm **Ước tính credit** để xem tổng (Xuân 4 clip Omni 720p 10s = 60 credit).
3. Chỉnh **nghỉ giữa các clip** — mặc định 10–15s. Đặt 0s là dễ bị captcha.
4. **1 file = 1 project mới (mặc định bật):** tick "Tạo project mới cho mỗi file prompts", sửa tiền tố tên project nếu muốn (mặc định "Dieu Pho"). Tên đầy đủ tự tạo theo tên file + ngày, VD: `Dieu Pho - xuan - 2026-11-03`. Khi bấm Start, extension sẽ thoát project hiện tại về danh sách project, bấm "New project", nhập tên, bấm Create, rồi mới gen. Muốn gen vào project hiện tại thì bỏ tick. Có nút riêng "⇦ Thoát về danh sách project" và "＋ Tạo project mới ngay" để làm tay.
   - Lưu ý: Google không công bố giới hạn số project, nhưng tạo quá nhiều project liên tục có thể bị Flow hỏi xác nhận thêm — nếu extension không tìm thấy nút "New project" (UI đổi), nó sẽ dừng và hướng dẫn bạn tạo tay, rồi bấm Tiếp tục.
5. Bấm **Start**. Extension sẽ, từng clip một:
   - Gõ prompt chậm như người, chọn model, tỉ lệ 9:16 (nếu UI có)
   - Bấm Generate, bấm xác nhận dialog credit
   - Chờ video xong (tối đa 10 phút/clip), tải MP4 về thư mục Downloads của Chrome, tên `<slug>.mp4`
   - Nghỉ ngẫu nhiên rồi chạy clip sau
5. **Pause / Stop** bất cứ lúc nào. Reload trang thì queue được khôi phục từ `chrome.storage.local`, clip đã xong sẽ bỏ qua khi Start lại.

## Captcha

Flow dùng invisible reCAPTCHA v3 — **không có cách miễn phí nào giải tự động 100%**.

- Extension lái UI thật ở tốc độ người, 1 clip 1 lần, có nghỉ giữa các clip, để giữ điểm reCAPTCHA cao.
- Nếu captcha hiện ra: extension **dừng**, panel báo "PHÁT HIỆN CAPTCHA", bạn giải tay trong trang rồi bấm **Tiếp tục**.

## Quyền extension xin (tối thiểu)

- `host_permissions: https://flow.google.com/*` — chỉ chạy trên Flow, không chạy trên web khác.
- `storage` — lưu queue/progress để reload không mất.
- `downloads` — tải MP4 về.
- `alarms` — giữ service worker tỉnh để nhận message.

Không xin quyền `cookies`, `tabs` toàn bộ, không đọc mật khẩu, không gửi dữ liệu ra ngoài. Mã nguồn mở, đọc hết được trong `content.js` / `background.js`.

## Bảng credit (Flow Help, Oct 2026)

| Model | Credit / clip |
|---|---|
| Omni Flash 360p 4/6/8/10s | 4 / 5 / 6 / 7 |
| Omni Flash 720p 4/6/8/10s | 7 / 10 / 12 / 15 |
| Veo 3.1 Lite (Ultra) | 5 |
| Veo 3.1 Fast (Ultra) | 10 |
| Veo 3.1 Quality | 100 |

Pool Ultra 20x: 25.000 credit/tháng, dùng chung cả family.

## Giới hạn

- Phải giữ tab Flow mở, máy không sleep — extension không chạy ngầm headless như CLI.
- Chrome MV3 hay cho service worker ngủ — việc gen chạy trong content script trên trang nên không ảnh hưởng, nhưng đừng đóng tab giữa chừng.
- UI Flow đổi là selector có thể gãy — panel sẽ báo lỗi cụ thể, gửi screenshot + lỗi cho mình để cập nhật.
- Vẫn là automation không chính thức — chạy chậm, đừng đặt delay 0, đừng chạy 2 máy cùng 1 tài khoản.

## So sánh 3 bản

| | Extension (bản này) | CLI CDP (`flow-direct --cdp`) | CLI Chromium riêng (`flow-direct`) | useapi (`flow-tool`) |
|---|---|---|---|---|
| Phí ngoài | $0 | $0 | $0 | $15/tháng |
| Login | Không cần, xài session sẵn | Không cần, xài Chrome thật | Đăng nhập tay 1 lần | useapi login hộ |
| Banner automation | Không | Không | Có (đã tắt cờ) | Không |
| Chạy xuyên đêm | Cần giữ tab mở | Được, Chrome mở sẵn | Được, headless | Được, chạy ngầm |
| Tốc độ | Nhanh, delay 10–15s | Nhanh, delay chỉnh được | Chậm, delay 25–70s | Nhanh nhất, song song |
| Risk | Thấp nhất | Thấp | Cao hơn | Cao nhất (session trên server khác) |

## File

```
manifest.json   # MV3, quyền tối thiểu, chỉ flow.google.com
content.js      # Panel + lái UI Flow + queue + captcha chờ tay
panel.css       # Giao diện panel
popup.html/js   # Popup nhỏ: mở Flow
background.js   # Service worker: keepalive + downloads
examples/       # prompts-xuan.json, prompts-veo-hero.json (dùng chung)
README.md
```
