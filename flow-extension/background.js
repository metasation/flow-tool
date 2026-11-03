// Service worker MV3: chỉ giữ nhịp + nhận download, mọi việc gen chạy trong content script
// trên trang Flow (vì nó cần DOM + session của trang). Không gọi server ngoài nào.
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('keepalive', { periodInMinutes: 0.5 });
});
chrome.alarms.onAlarm.addListener(() => {
  // MV3 hay cho service worker ngủ — alarm giữ nó tỉnh để nhận message từ panel.
});
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'flow-direct-download' && msg.url) {
    chrome.downloads.download({ url: msg.url, filename: msg.filename || 'flow-video.mp4', saveAs: false })
      .then((id) => sendResponse({ ok: true, id }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true; // trả lời bất đồng bộ
  }
});
