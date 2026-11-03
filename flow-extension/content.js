/* Flow Direct — content script, chạy ngay trong trang flow.google.com.
 * Không token, không mật khẩu, không server ngoài. Xài luôn session Chrome thật.
 * Lái UI Flow thật như người: gõ prompt chậm, bấm Generate, xác nhận credit,
 * chờ video xong, tải MP4 về. 1 clip 1 lần, nghỉ ngẫu nhiên giữa các clip.
 * Captcha: nếu hiện ra thì DỪNG, chờ bạn giải tay trong trang rồi bấm Tiếp tục.
 * Lưu ý: UI Flow đổi thường xuyên — selector có nhiều dự phòng, lỗi sẽ hiện
 * trong panel + chụp trạng thái để báo.
 */
(() => {
  if (window.__flowDirectLoaded) return;
  window.__flowDirectLoaded = true;

  const CREDIT = {
    'omni-flash': { '360p': { 4: 4, 6: 5, 8: 6, 10: 7 }, '720p': { 4: 7, 6: 10, 8: 12, 10: 15 } },
    'veo-3.1-lite': 5, 'veo-3.1-fast': 10, 'veo-3.1-quality': 100,
  };
  const creditOf = (it) => {
    const m = (it.model || 'omni-flash').toLowerCase();
    const d = Number(it.duration || 8), c = Number(it.count || 1);
    if (m.startsWith('omni')) return ((CREDIT['omni-flash'][it.resolution || '720p'] || CREDIT['omni-flash']['720p'])[d] || 12) * c;
    return (CREDIT[m] || 10) * c;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (a, b) => a + Math.random() * (b - a);
  const slugify = (s = '') => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'clip';

  let queue = []; let running = false; let paused = false; let stopped = false;
  let delayMin = 10, delayMax = 15; // giây — mặc định 10-15s cho extension (nhanh hơn CLI 25-70s, vẫn có nghỉ)
  let lastFileName = ''; let projectPrefix = 'Dieu Pho'; let newProjectPerFile = true;

  // ---------- Panel ----------
  const panel = document.createElement('div');
  panel.id = 'flow-direct-panel';
  panel.innerHTML = `
    <div id="fd-head"><b>🎬 Flow Direct — Batch</b><span id="fd-toggle">—</span></div>
    <div id="fd-body">
      <label>File prompts.json (cùng format với flow-tool / flow-direct)</label>
      <input type="file" id="fd-file" accept=".json,application/json">
      <div style="margin-top:6px">
        <button id="fd-sample" class="secondary">Nạp mẫu Xuân (4 clip)</button>
        <button id="fd-estimate" class="secondary">Ước tính credit</button>
      </div>
      <label><input type="checkbox" id="fd-newproj" checked> Tạo project mới cho mỗi file prompts</label>
      <label>Tên project (tiền tố — tên đầy đủ = tiền tố + tên file + ngày)</label>
      <input type="text" id="fd-projname" value="Dieu Pho" style="width:100%;padding:6px;border:1px solid #dadce0;border-radius:6px">
      <div style="margin-top:6px">
        <button id="fd-exitproj" class="secondary">⇦ Thoát về danh sách project</button>
        <button id="fd-mkproj" class="secondary">＋ Tạo project mới ngay</button>
      </div>
      <label>Nghỉ giữa các clip (giây) — đặt 0 là dễ bị captcha</label>
      <input type="number" id="fd-dmin" value="10" min="0" max="300"> –
      <input type="number" id="fd-dmax" value="15" min="0" max="300">
      <div style="margin-top:10px">
        <button id="fd-start">▶ Start</button>
        <button id="fd-pause" class="secondary">⏸ Pause</button>
        <button id="fd-resume" class="secondary">▶ Tiếp tục (sau captcha)</button>
        <button id="fd-stop" class="secondary">■ Stop</button>
      </div>
      <div id="fd-status">Chưa có queue. Import prompts.json để bắt đầu.\nKhông token, không mật khẩu — xài session Flow của bạn.</div>
      <div id="fd-queue"></div>
      <div id="fd-note">1 clip 1 lần, gen ~60–180s/clip. Nếu captcha hiện ra, extension sẽ dừng và chờ bạn giải tay rồi bấm Tiếp tục. Video cũng lưu trong Flow của bạn.</div>
    </div>`;
  document.body.appendChild(panel);
  const $ = (id) => panel.querySelector(id);
  const setStatus = (t, warn = false) => { const el = $('#fd-status'); el.textContent = t; el.className = warn ? 'warn' : ''; };
  const renderQueue = () => {
    $('#fd-queue').innerHTML = queue.map((q) => `<div>${q.status === 'done' ? '✓' : q.status === 'failed' ? '✗' : q.status === 'doing' ? '▶' : '•'} ${q.slug} — ${q.model || 'omni-flash'} ${q.duration || 8}s (${creditOf(q)} credit)${q.error ? ' — ' + q.error : ''}</div>`).join('');
  };
  $('#fd-head').onclick = () => { const b = $('#fd-body'); b.style.display = b.style.display === 'none' ? '' : 'none'; };
  $('#fd-dmin').onchange = (e) => { delayMin = Number(e.target.value) || 0; };
  $('#fd-dmax').onchange = (e) => { delayMax = Number(e.target.value) || 0; };

  const projectNameForFile = () => {
    const base = (lastFileName || 'prompts').replace(/\.json$/i, '').replace(/^(prompts-?)/i, '') || 'batch';
    const today = new Date().toISOString().slice(0, 10);
    return `${projectPrefix} - ${base} - ${today}`.slice(0, 80);
  };
  const loadPromptsData = (data, fileName = '') => {
    const arr = Array.isArray(data) ? data : data.prompts;
    const def = Array.isArray(data) ? {} : (data.defaults || {});
    if (!Array.isArray(arr) || !arr.length) throw new Error('File không có prompt nào.');
    if (fileName) lastFileName = fileName;
    queue = arr.map((p, i) => ({ slug: p.slug || slugify(p.prompt) || `clip-${i + 1}`, status: 'todo', ...def, ...p }));
    chrome.storage.local.set({ flowDirectQueue: queue, flowDirectLastFile: lastFileName });
    renderQueue();
    const total = queue.reduce((s, q) => s + creditOf(q), 0);
    const proj = newProjectPerFile ? `\nProject mới sẽ tạo khi Start: "${projectNameForFile()}"` : '\nSẽ gen vào project hiện tại.';
    setStatus(`Đã nạp ${queue.length} prompt — tổng ~${total} credit.${proj}\nBấm Start để chạy.`);
  };
  $('#fd-file').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { loadPromptsData(JSON.parse(await f.text()), f.name); } catch (err) { setStatus('Lỗi đọc file: ' + err.message, true); }
  };
  $('#fd-newproj').onchange = (e) => { newProjectPerFile = e.target.checked; };
  $('#fd-projname').onchange = (e) => { projectPrefix = e.target.value.trim() || 'Dieu Pho'; };
  $('#fd-sample').onclick = () => {
    loadPromptsData({ defaults: { model: 'omni-flash', duration: 10, resolution: '720p', aspectRatio: '9:16', count: 1 }, prompts: [
      { slug: 'xuan-eiffel-tu-nhan', prompt: 'chibi 2D flat animation, Chinese ancient prisoner in white torn shirt with wooden cangue, walking in a procession toward camera, front-oblique 45 degrees, Eiffel Tower in Paris background, spring cherry blossoms, soft morning light, 9:16 vertical' },
      { slug: 'xuan-colosseum-linh', prompt: 'chibi 2D flat animation, Chinese ancient soldiers in dark red uniform guarding a prisoner procession, Roman Colosseum background, spring, 9:16 vertical, front-oblique 45 degrees' },
    ]});
  };
  $('#fd-estimate').onclick = () => {
    if (!queue.length) return setStatus('Chưa có queue để ước tính.', true);
    const total = queue.reduce((s, q) => s + creditOf(q), 0);
    setStatus(`${queue.length} prompt — tổng ~${total} credit (${(total / 25000 * 100).toFixed(1)}% pool Ultra 20x).`);
  };

  // ---------- Captcha ----------
  const captchaVisible = () => {
    const iframes = [...document.querySelectorAll('iframe')].map((f) => f.src || '');
    const hasAnchor = [...document.querySelectorAll('iframe[title*="reCAPTCHA"]')].some((f) => f.offsetParent !== null);
    const body = document.body.innerText.toLowerCase();
    return hasAnchor || /i'm not a robot|verify you are human|select all images|unusual traffic/.test(body) || iframes.some((u) => /hcaptcha|challenges\.cloudflare/.test(u));
  };
  const waitCaptcha = async () => {
    if (!captchaVisible()) return;
    paused = true;
    setStatus('⚠️ PHÁT HIỆN CAPTCHA.\nExtension đã DỪNG. Bạn giải tay trong trang này, rồi bấm "Tiếp tục".', true);
    while (paused && !stopped) {
      await sleep(3000);
      if (!captchaVisible()) { paused = false; setStatus('Captcha đã qua, chạy tiếp.'); return; }
    }
  };

  // ---------- Lái UI Flow ----------
  // Lưu ý: :has-text() là cú pháp Playwright, KHÔNG dùng được trong
  // document.querySelector. Nên tìm nút theo text bằng cách duyệt DOM.
  const findButtonByText = (text) => [...document.querySelectorAll('button, [role="button"], a')].find((b) => (b.textContent || '').trim().toLowerCase().includes(text.toLowerCase()) && b.offsetParent !== null);
  const tryClick = async (selectors, label) => {
    for (const sel of selectors) {
      let el = null;
      if (sel.startsWith('text:')) el = findButtonByText(sel.slice(5));
      else { try { el = document.querySelector(sel); } catch { el = null; } }
      if (el && el.offsetParent !== null) { el.click(); await sleep(rand(800, 2000)); return true; }
    }
    return false;
  };
  const findPromptBox = () => {
    const sels = ['textarea[placeholder*="Describe"]', 'textarea[placeholder*="Ask"]', 'textarea[placeholder*="Create"]', 'textarea', '[contenteditable="true"]'];
    for (const s of sels) { const el = document.querySelector(s); if (el && el.offsetParent !== null) return el; }
    return null;
  };
  const typeSlow = async (el, text) => {
    el.focus();
    // Dùng native setter để React/Angular nhận thay đổi, rồi gõ từng đoạn.
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    for (let i = 0; i < text.length; i += 40) {
      const chunk = text.slice(0, i + 40);
      if (setter) setter.call(el, chunk); else el.value = chunk;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(rand(100, 300));
    }
  };
  const waitVideo = async (timeoutMs = 10 * 60 * 1000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      await sleep(10000);
      if (stopped) return false;
      await waitCaptcha();
      if (document.querySelector('video[src]')) return true;
      const dl = [...document.querySelectorAll('button, a')].some((b) => /download/i.test(b.textContent || '') && b.offsetParent !== null);
      if (dl) return true;
    }
    return false;
  };
  const downloadVideo = async (slug) => {
    const vids = [...document.querySelectorAll('video')].map((v) => v.currentSrc || v.src).filter(Boolean);
    const src = vids[vids.length - 1];
    if (src) {
      // Tải qua background (chrome.downloads) để không bị CORS / blob.
      const res = await chrome.runtime.sendMessage({ type: 'flow-direct-download', url: src, filename: `${slug}.mp4` }).catch(() => null);
      if (res?.ok) return true;
      // Fallback: mở link trong tab mới để bạn tải tay.
      window.open(src, '_blank');
      return true;
    }
    const btn = [...document.querySelectorAll('button, a')].find((b) => /download/i.test(b.textContent || ''));
    if (btn) { btn.click(); return true; }
    return false;
  };

  const generateOne = async (item) => {
    item.status = 'doing'; renderQueue();
    setStatus(`▶ ${item.slug} — đang gen...`);
    await waitCaptcha();
    const box = findPromptBox();
    if (!box) throw new Error('Không tìm thấy ô nhập prompt (UI Flow có thể đã đổi).');
    box.scrollIntoView({ block: 'center' });
    box.click();
    await sleep(rand(500, 1200));
    await typeSlow(box, item.prompt);
    // Chọn model nếu có menu (không thấy thì để mặc định).
    const opened = await tryClick(['text:Veo', 'text:Omni'], 'mở menu model');
    if (opened) {
      const label = (item.model || '').includes('quality') ? 'Quality' : (item.model || '').includes('lite') ? 'Lite' : (item.model || '').includes('fast') ? 'Fast' : 'Omni';
      await tryClick([`text:${label}`], 'chọn model');
    }
    await tryClick(['text:9:16'], 'tỉ lệ 9:16');
    const submitted = await tryClick(['button[aria-label*="Send"]', 'button[aria-label*="Generate"]', 'text:Generate', 'text:Create', 'button[type="submit"]'], 'submit');
    if (!submitted) throw new Error('Không tìm thấy nút Generate/Submit (UI Flow có thể đã đổi).');
    await sleep(2000);
    await tryClick(['text:Generate', 'text:Create', 'text:Confirm'], 'xác nhận credit');
    await waitCaptcha();
    const done = await waitVideo();
    if (!done) throw new Error('Chờ video quá 10 phút, chưa thấy xong — có thể Flow đang queue, bấm Start lại để resume.');
    const ok = await downloadVideo(item.slug);
    if (!ok) throw new Error('Video đã gen xong trên Flow nhưng không tải được — mở Flow tải tay.');
    item.status = 'done';
  };

  // ---------- Project: thoát ra + tạo mới cho mỗi file ----------
  // Cách làm: về trang danh sách project (flow.google.com/), bấm "New project",
  // nhập tên, bấm Create, chờ vào được project mới (có ô prompt).
  // Vì bước "về danh sách" phải load lại trang, extension lưu ý định vào
  // chrome.storage.local rồi tự tiếp tục sau khi trang load lại.
  const isProjectsList = () => {
    const url = location.href.replace(/\/$/, '');
    if (url === 'https://flow.google.com' || /flow\.google\.com\/?$/.test(url)) return true;
    return !!findButtonByText('New project') && !findPromptBox();
  };
  const exitToProjects = async (pendingProjectName) => {
    // Thử bấm nút quay lại / logo / Projects trước (không load lại trang).
    const clicked = await tryClick(['text:Projects', 'text:All projects'], 'về danh sách project');
    if (clicked) { await sleep(2000); if (isProjectsList()) return true; }
    // Không được thì về thẳng trang chủ Flow — content script sẽ load lại.
    // Lưu ý định tạo project vào storage TRƯỚC khi navigate, để sau khi
    // load lại extension tự tiếp tục tạo + chạy queue.
    setStatus('Đang thoát về danh sách project...');
    const save = { flowDirectQueue: queue };
    if (pendingProjectName) save.flowDirectPendingProject = pendingProjectName;
    chrome.storage.local.set(save);
    location.href = 'https://flow.google.com/';
    await sleep(5000); // nếu navigation chưa kịp xảy ra
    return isProjectsList();
  };
  const createNewProject = async (name) => {
    setStatus(`Đang tạo project mới: "${name}"...`);
    if (!isProjectsList()) await exitToProjects(name);
    // Sau khi load lại trang, hàm này được gọi lại từ khối khôi phục bên dưới.
    await sleep(2000);
    const opened = await tryClick(['text:New project', 'text:Create new project', 'text:New Project'], 'mở tạo project');
    if (!opened) {
      setStatus(`Không tìm thấy nút "New project" trên Flow (UI có thể đã đổi).\nBạn tạo tay 1 project tên "${name}", mở nó lên, rồi bấm Tiếp tục.`, true);
      paused = true;
      chrome.storage.local.set({ flowDirectPendingProject: name });
      return false;
    }
    await sleep(1500);
    // Dialog tạo project thường có ô nhập tên.
    const input = document.querySelector('input[placeholder*="project" i], input[placeholder*="Name" i], [role="dialog"] input[type="text"]');
    if (input) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(input, name); else input.value = name;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(800);
    }
    await tryClick(['text:Create', 'text:Create project'], 'xác nhận tạo project');
    // Chờ vào được project mới (có ô prompt) — tối đa 30s.
    for (let i = 0; i < 15; i++) {
      await sleep(2000);
      if (findPromptBox()) { setStatus(`✓ Đã tạo project mới: "${name}"`); chrome.storage.local.remove('flowDirectPendingProject'); return true; }
    }
    setStatus(`Đã bấm tạo project "${name}" nhưng chưa thấy vào được project mới.\nKiểm tra tay trên trang, rồi bấm Tiếp tục.`, true);
    paused = true;
    chrome.storage.local.set({ flowDirectPendingProject: name });
    return false;
  };

  // ---------- Queue ----------
  const runQueue = async () => {
    if (running) return;
    if (!queue.length) return setStatus('Chưa có queue — import prompts.json trước.', true);
    running = true; stopped = false; paused = false;
    chrome.storage.local.set({ flowDirectQueue: queue });
    // 1 file = 1 project mới (nếu tick). Tạo xong mới gen clip đầu.
    // Nếu bạn vừa tạo tay rồi bấm Tiếp tục, extension sẽ không tạo thêm 1 cái nữa.
    if (newProjectPerFile && !window.__flowDirectSkipProjectOnce) {
      const name = projectNameForFile();
      const ok = await createNewProject(name);
      if (!ok) { running = false; return; }
    }
    window.__flowDirectSkipProjectOnce = false;
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      if (stopped) break;
      if (item.status === 'done') continue;
      if (i > 0 && !stopped) {
        const d = Math.round(rand(delayMin, delayMax));
        setStatus(`Nghỉ ${d}s giữa các clip (tránh captcha)...\nTiếp theo: ${item.slug}`);
        await sleep(d * 1000);
      }
      try { await generateOne(item); } catch (e) { item.status = 'failed'; item.error = e.message; setStatus(`✗ ${item.slug}: ${e.message}`, true); }
      renderQueue();
      chrome.storage.local.set({ flowDirectQueue: queue });
      if (paused) { setStatus('Đã pause — bấm Tiếp tục để chạy tiếp.', true); break; }
    }
    running = false;
    const ok = queue.filter((q) => q.status === 'done').length;
    if (!stopped) setStatus(`Xong: ${ok}/${queue.length} clip.\nVideo cũng lưu trong Flow của bạn.`);
  };
  $('#fd-start').onclick = runQueue;
  $('#fd-pause').onclick = () => { paused = true; setStatus('Đã pause.', true); };
  $('#fd-resume').onclick = () => { paused = false; window.__flowDirectSkipProjectOnce = true; chrome.storage.local.remove('flowDirectPendingProject'); if (!running) runQueue(); };
  $('#fd-stop').onclick = () => { stopped = true; paused = false; setStatus('Đã stop.'); };
  $('#fd-exitproj').onclick = async () => { await exitToProjects(); setStatus('Đã về danh sách project.'); };
  $('#fd-mkproj').onclick = async () => { const ok = await createNewProject(projectNameForFile()); if (ok) setStatus(`✓ Đã tạo project: "${projectNameForFile()}" — import file rồi Start để gen vào đó.`); };

  // Khôi phục queue nếu reload trang (VD: vừa thoát về danh sách project để tạo mới).
  chrome.storage.local.get(['flowDirectQueue', 'flowDirectLastFile', 'flowDirectPendingProject', 'flowDirectAutoStart'], (r) => {
    if (r.flowDirectLastFile) lastFileName = r.flowDirectLastFile;
    if (r.flowDirectQueue?.length) {
      queue = r.flowDirectQueue; renderQueue();
      // Đang giữa chừng tạo project mới thì tiếp tục tạo, rồi tự chạy queue.
      if (r.flowDirectPendingProject) {
        setStatus(`Đang tiếp tục tạo project: "${r.flowDirectPendingProject}"...`);
        createNewProject(r.flowDirectPendingProject).then((ok) => { if (ok) runQueue(); });
        return;
      }
      setStatus(`Đã khôi phục ${queue.length} prompt từ lần trước — bấm Start để chạy tiếp (clip done sẽ bỏ qua).`);
    }
  });
})();
