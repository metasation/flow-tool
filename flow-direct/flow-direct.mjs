#!/usr/bin/env node
/**
 * flow-direct.mjs — Bào credit Google Flow KHÔNG qua useapi, KHÔNG tốn $15/tháng
 * Lái thẳng trình duyệt thật (Playwright + Chromium) trên máy bạn, xài credit
 * Flow của chính tài khoản Google đã join family Ultra.
 *
 * Cách hoạt động (học theo google-flow-mcp / flow-mcp, mã nguồn mở):
 *  - Playwright mở Chromium thật với profile riêng (./profile), KHÔNG phải
 *    headless bot ẩn danh. Bạn đăng nhập Google 1 lần bằng tay trong cửa sổ
 *    đó (mật khẩu, 2FA, captcha lúc login — nếu có — cũng tự bạn giải).
 *    Tool KHÔNG bao giờ gõ mật khẩu, KHÔNG lưu mật khẩu, chỉ xài session
 *    trình duyệt đã đăng nhập sẵn.
 *  - Sau đó tool lái giao diện Flow thật: gõ prompt, chọn model, bấm
 *    Generate, bấm xác nhận credit, chờ video xong, tải MP4 về output/.
 *  - 1 clip 1 lần, tốc độ như người (delay ngẫu nhiên, nghỉ 25-70s giữa
 *    các clip). Flow gắn invisible reCAPTCHA v3 — lái như người là cách
 *    duy nhất miễn phí mà các tool open-source dùng, và họ ghi rõ:
 *    "drives the real interface at human pace and does nothing to evade it".
 *
 * CAPTCHA — nói thẳng, không hứa hão:
 *  - KHÔNG có cách miễn phí nào giải captcha tự động 100% đáng tin.
 *    reCAPTCHA v3 là vô hình, chấm điểm hành vi; tool chỉ giảm khả năng
 *    bị chấm thấp bằng: trình duyệt thật, profile cố định, tốc độ người,
 *    nghỉ ngẫu nhiên, không chạy song song.
 *  - Nếu captcha HIỆN (checkbox "I'm not a robot" / "Verify you are human"):
 *    tool DỪNG, in hướng dẫn, chờ tối đa 10 phút để BẠN giải trong chính
 *    cửa sổ trình duyệt đó, rồi tự chạy tiếp. Đây là cách "human takeover",
 *    miễn phí, và là mặc định.
 *  - Tùy chọn (không bắt buộc, tốn tiền): đặt 2CAPTCHA_API_KEY hoặc
 *    CAPSOLVER_API_KEY trong .env — tool sẽ thử xin token rồi chèn vào
 *    trang (token-flow cho reCAPTCHA v2). Với Flow v3 vô hình thì cách này
 *    thường KHÔNG có tác dụng, nên đừng kỳ vọng. Chỉ bật khi bạn hiểu rõ.
 *  - Thư viện flow-captcha-solver (PyPI, cho Flow v3) cũng được hỗ trợ
 *    dạng thử nghiệm: nếu đã `pip install flow-captcha-solver`, tool sẽ
 *    thử gọi nó, thất bại thì quay về chờ người giải.
 *
 * Lệnh:
 *   node flow-direct.mjs doctor                              # kiểm tra máy + trình duyệt
 *   node flow-direct.mjs login                               # mở Chrome, bạn đăng nhập tay 1 lần
 *   node flow-direct.mjs status                              # kiểm tra còn đăng nhập không
 *   node flow-direct.mjs estimate --file examples/prompts-xuan.json --ultra
 *   node flow-direct.mjs generate --file examples/prompts-xuan.json --out output/2026-11-03-xuan
 *   node flow-direct.mjs generate --file examples/prompts-xuan.json --dry-run   # chỉ kiểm tra, không gen
 *   node flow-direct.mjs generate --file prompts.json --headed        # xem tận mắt từng bước
 *
 * Chế độ CDP (v1.1, risk thấp hơn — nối vào Chrome THẬT đang mở sẵn):
 *   ./start-chrome.sh            # Linux/macOS: mở Chrome thật + --remote-debugging-port=9222
 *   start-chrome.bat             # Windows: tương tự
 *   node flow-direct.mjs cdp-status                        # kiểm tra cổng 9222 có Chrome không
 *   node flow-direct.mjs generate --file examples/prompts-xuan.json --cdp
 *   node flow-direct.mjs status --cdp
 * Ở chế độ --cdp: KHÔNG mở Chromium riêng, KHÔNG banner "controlled by
 * automated test software", KHÔNG login lại — xài luôn Chrome thật + session
 * bạn đã đăng nhập sẵn. Chỉ khác extension ở chỗ điều khiển từ ngoài vào
 * qua CDP. Nếu chưa mở Chrome với cổng 9222, tool báo lỗi + hướng dẫn mở.
 *
 * Config: .env (xem .env.example) — CHỈ có tùy chọn, không bắt buộc:
 *   FLOW_EMAIL=you@gmail.com            (để kiểm tra đúng tài khoản)
 *   FLOW_PROJECT="Dieu Pho"             (tên project muốn gen vào, bỏ trống = project hiện tại)
 *   TWO_CAPTCHA_API_KEY=...             (tùy chọn, trả phí)
 *   CAPSOLVER_API_KEY=...               (tùy chọn, trả phí)
 *   CAPTCHA_WAIT_MIN=10                 (số phút chờ bạn giải captcha, mặc định 10)
 *
 * Rủi ro: đây là browser automation không chính thức, Google không có API
 * Flow. Google có thể đổi giao diện (tool sẽ chụp màn hình + lưu DOM để bạn
 * báo lỗi), khóa tạm tài khoản nếu gen quá nhanh / quá nhiều. Chạy chậm,
 * chạy sớm đầu chu kỳ credit, đừng chạy 2 máy cùng 1 tài khoản.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VERSION = '1.1.0';
const FLOW_URL = 'https://flow.google.com';
const PROFILE_DIR = path.join(__dirname, 'profile');
const CAPTCHA_WAIT_MS = Number(process.env.CAPTCHA_WAIT_MIN || 10) * 60 * 1000;

// --- Credit table (giống flow-tool useapi, Flow Help Oct 2026) --------------
export const CREDIT_TABLE = {
  'omni-flash': { '360p': { 4: 4, 6: 5, 8: 6, 10: 7 }, '720p': { 4: 7, 6: 10, 8: 12, 10: 15 } },
  'veo-3.1-lite': { ultra: 5, normal: 10 },
  'veo-3.1-fast': { ultra: 10, normal: 20 },
  'veo-3.1-quality': { ultra: 100, normal: 100 },
};
export function estimateCredits(item, ultra = true) {
  const model = (item.model || 'omni-flash').toLowerCase();
  const duration = Number(item.duration || 8);
  const count = Number(item.count || 1);
  if (model === 'omni-flash' || model.startsWith('omni')) {
    const res = item.resolution || '720p';
    const t = CREDIT_TABLE['omni-flash'][res] || CREDIT_TABLE['omni-flash']['720p'];
    return (t[duration] ?? t[8] ?? 12) * count;
  }
  const row = CREDIT_TABLE[model] || CREDIT_TABLE['veo-3.1-fast'];
  return (ultra ? row.ultra : row.normal) * count;
}

// --- Helpers -----------------------------------------------------------------
function loadEnvFile() {
  const p = path.join(__dirname, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.trim().match(/^([A-Z0-9_]+)\s*=\s*(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnvFile();
export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2); const eq = key.indexOf('=');
      if (eq !== -1) args[key.slice(0, eq)] = key.slice(eq + 1);
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) args[key] = argv[++i];
      else args[key] = true;
    } else args._.push(a);
  }
  return args;
}
export function slugify(s = '') {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'clip';
}
export function today() { return new Date().toISOString().slice(0, 10); }
export function log(...a) { console.log(`[${new Date().toLocaleTimeString('vi-VN')}]`, ...a); }
export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
export function humanDelay(min = 800, max = 2500) { return sleep(min + Math.random() * (max - min)); }
// Delay giữa các clip: mặc định 25-70s như flow-mcp. Chỉnh được:
//   --delay-min 10 --delay-max 15  hoặc env FLOW_DELAY_MIN / FLOW_DELAY_MAX (giây)
// Đặt quá thấp (0-5s) sẽ dễ bị captcha / khóa tạm — extension cũng vậy.
export function betweenClipsDelay(minSec, maxSec) {
  const lo = Number(minSec ?? process.env.FLOW_DELAY_MIN ?? 25);
  const hi = Number(maxSec ?? process.env.FLOW_DELAY_MAX ?? 70);
  return sleep(lo * 1000 + Math.random() * Math.max(0, (hi - lo) * 1000));
}
export function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
export function writeJson(p, obj) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n'); }
export function loadPrompts(file) {
  const data = readJson(file);
  const arr = Array.isArray(data) ? data : data.prompts;
  const defaults = Array.isArray(data) ? {} : (data.defaults || {});
  if (!Array.isArray(arr) || !arr.length) throw new Error(`Không có prompt nào trong ${file}`);
  return arr.map((p, i) => ({ slug: p.slug || slugify(p.prompt).slice(0, 40) || `clip-${i + 1}`, ...defaults, ...p }));
}

// --- Playwright (lazy import để estimate/doctor không cần browser) -----------
async function getPlaywright() {
  try { return await import('playwright'); }
  catch { throw new Error('Chưa cài playwright. Chạy: npm install  &&  npx playwright install chromium'); }
}

function launchArgs(headed) {
  return {
    headless: !headed,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--no-first-run',
      '--disable-dev-shm-usage',
      '--window-size=1440,900',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  };
}

function proxyFromEnv() {
  // Chromium của Playwright không tự đọc http_proxy như curl/Node.
  // Nếu máy đang sau proxy (VD: máy công ty), truyền vào đây.
  // Đặt FLOW_NO_PROXY=1 để bỏ qua proxy hoàn toàn.
  if (process.env.FLOW_NO_PROXY === '1') return undefined;
  const raw = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (!raw) return undefined;
  const bypass = process.env.NO_PROXY || process.env.no_proxy || 'localhost,127.0.0.1';
  try {
    // Playwright cần username/password tách riêng, không để trong URL.
    const u = new URL(raw);
    const server = `${u.protocol}//${u.host}`;
    const out = { server, bypass };
    if (u.username) out.username = decodeURIComponent(u.username);
    if (u.password) out.password = decodeURIComponent(u.password);
    return out;
  } catch { return { server: raw, bypass }; }
}

export function cdpInstructions(port = 9222) {
  return [
    `Chưa thấy Chrome thật ở cổng ${port}. Mở Chrome thật trước:`,
    `  Linux/macOS:  ./start-chrome.sh`,
    `  Windows:      start-chrome.bat`,
    `  (hoặc tự mở: chrome --remote-debugging-port=${port} --user-data-dir="$HOME/.flow-direct-chrome-profile" https://flow.google.com)`,
    '  Đăng nhập Google tay trong cửa sổ đó, mở sẵn tab flow.google.com, rồi chạy lại lệnh với --cdp.',
  ].join('\n');
}

async function checkCdp(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch { return false; }
}

async function launchBrowser({ headed = true, cdp = false, cdpPort = 9222 } = {}) {
  const { chromium } = await getPlaywright();
  // --- Chế độ CDP: nối vào Chrome THẬT đang mở sẵn, kiểu google-flow-mcp ---
  if (cdp) {
    if (!(await checkCdp(cdpPort))) throw new Error(cdpInstructions(cdpPort));
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
    const context = browser.contexts()[0];
    if (!context) throw new Error('Chrome thật đã nối được nhưng không có context nào — mở 1 tab flow.google.com rồi chạy lại.');
    log(`Đã nối CDP vào Chrome thật (cổng ${cdpPort}) — không banner automation, không login lại.`);
    // Ghi đè close(): chỉ ngắt kết nối CDP, KHÔNG đóng Chrome thật của bạn.
    const realClose = context.close.bind(context);
    context.close = async () => { try { await browser.close(); } catch { await realClose().catch(() => {}); } };
    return context;
  }
  // --- Chế độ mặc định: Chromium riêng của Playwright + profile ./profile ---
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  const proxy = proxyFromEnv();
  if (proxy) log('Dùng proxy từ biến môi trường (không in ra để tránh lộ credential).');
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    ...launchArgs(headed),
    viewport: { width: 1440, height: 900 },
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    ...(proxy ? { proxy } : {}),
    // Không bật stealth plugin ngoài — Chromium thật + profile cố định đã đủ.
  });
  // Ẩn dấu vết automation cơ bản (navigator.webdriver). Không giả fingerprint.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  return context;
}

// --- Captcha: phát hiện + chờ người giải (mặc định, miễn phí) --------------
const CAPTCHA_TEXTS = ['i\'m not a robot', 'verify you are human', 'xác minh bạn là con người', 'verify you\'re not a robot', 'select all images', 'unusual traffic'];
async function captchaVisible(page) {
  try {
    const frames = page.frames().map(f => f.url());
    if (frames.some(u => /recaptcha|hcaptcha|challenges\.cloudflare|turnstile/i.test(u))) {
      // reCAPTCHA v3 vô hình cũng load iframe api2 — chỉ tính là captcha khi có checkbox/challenge hiện ra
      const box = await page.locator('iframe[title*="reCAPTCHA"], iframe[src*="recaptcha/api2/anchor"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare"]').count();
      if (box > 0) {
        const visible = await page.locator('iframe[title*="reCAPTCHA"]').first().isVisible().catch(() => false);
        if (visible) return true;
      }
    }
    const body = (await page.content()).toLowerCase();
    if (CAPTCHA_TEXTS.some(t => body.includes(t))) return true;
    const title = (await page.title()).toLowerCase();
    if (/not a robot|verify|are you human|unusual traffic/.test(title)) return true;
  } catch { /* page đóng / nav giữa chừng — không tính */ }
  return false;
}

// Thử giải tự động bằng solver trả phí (tùy chọn). Thất bại = trả về false, không crash.
async function tryPaidSolver(page) {
  const key2 = process.env.TWO_CAPTCHA_API_KEY || process.env.TWOCAPTCHA_API_KEY;
  const keyCap = process.env.CAPSOLVER_API_KEY;
  if (!key2 && !keyCap) return false;
  log('Có key solver trả phí, thử xin token (chỉ hiệu quả với reCAPTCHA v2, Flow v3 thường không dùng được)...');
  try {
    const sitekey = await page.evaluate(() => {
      const el = document.querySelector('[data-sitekey]');
      return el ? el.getAttribute('data-sitekey') : null;
    }).catch(() => null);
    if (!sitekey) { log('Không tìm thấy sitekey trên trang, bỏ qua solver.'); return false; }
    // 2Captcha: tạo task, poll, chèn token. Đây là flow chuẩn của họ.
    if (key2) {
      const create = await fetch('https://api.2captcha.com/createTask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientKey: key2, task: { type: 'RecaptchaV2TaskProxyless', websiteURL: page.url(), websiteKey: sitekey } }) }).then(r => r.json()).catch(() => null);
      const taskId = create?.taskId;
      if (!taskId) return false;
      for (let i = 0; i < 24; i++) {
        await sleep(5000);
        const res = await fetch('https://api.2captcha.com/getTaskResult', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientKey: key2, taskId }) }).then(r => r.json()).catch(() => null);
        if (res?.status === 'ready' && res.solution?.gRecaptchaResponse) {
          await page.evaluate((t) => {
            const ta = document.querySelector('#g-recaptcha-response');
            if (ta) { ta.innerHTML = t; ta.value = t; }
            if (window.grecaptcha) { try { window.grecaptcha.enterprise?.execute?.(); } catch {} }
          }, res.solution.gRecaptchaResponse).catch(() => {});
          log('Solver trả về token, đã chèn. Chờ trang xác nhận...');
          await sleep(3000);
          return !(await captchaVisible(page));
        }
      }
    }
  } catch (e) { log('Solver trả phí thất bại:', e.message); }
  return false;
}

// Thử flow-captcha-solver (Python, cho Flow v3) nếu máy đã cài. Thất bại = bỏ qua.
async function tryFlowCaptchaSolver(pageUrl) {
  return new Promise((resolve) => {
    execFile('python3', ['-c', `from flow_captcha_solver import get_token_sync; print(get_token_sync(${JSON.stringify(pageUrl)}))`], { timeout: 120000 }, (err, stdout) => {
      if (err || !stdout?.trim()) return resolve(null);
      resolve(stdout.trim());
    });
  });
}

async function waitForCaptcha(page, label = 'captcha') {
  if (!(await captchaVisible(page))) return true;
  log(`\n⚠️  PHÁT HIỆN CAPTCHA (${label}).`);
  log('   Tool đã DỪNG. Bạn giải tay trong cửa sổ trình duyệt vừa mở,');
  log(`   rồi tool tự chạy tiếp. Chờ tối đa ${Math.round(CAPTCHA_WAIT_MS / 60000)} phút.`);
  // Thử solver trả phí / flow-captcha-solver trước, nếu có.
  if (await tryPaidSolver(page)) { log('Captcha đã qua (solver).'); return true; }
  const token = await tryFlowCaptchaSolver(page.url());
  if (token) log('flow-captcha-solver trả về token (thử nghiệm), tiếp tục theo dõi...');
  const started = Date.now();
  while (Date.now() - started < CAPTCHA_WAIT_MS) {
    await sleep(5000);
    if (!(await captchaVisible(page))) { log('Captcha đã qua, chạy tiếp.'); return true; }
  }
  await page.screenshot({ path: path.join(__dirname, 'output', 'captcha-timeout.png') }).catch(() => {});
  throw new Error('Hết thời gian chờ giải captcha. Mở lại trình duyệt, giải tay, rồi chạy lại lệnh (tool tự resume theo manifest).');
}

// --- Login --------------------------------------------------------------------
async function isLoggedIn(page) {
  const url = page.url();
  if (/accounts\.google\.com/.test(url)) return false;
  const body = (await page.content().catch(() => '')).toLowerCase();
  // Flow đã login thường có nút Create / New project / avatar, không còn nút Sign in
  if (/sign in/.test(body) && /flow\.google\.com/.test(url) && !/create/.test(body)) return false;
  const hasCreate = await page.locator('button:has-text("Create"), button:has-text("New project"), [aria-label*="Create"]').count().catch(() => 0);
  const hasAvatar = await page.locator('img[alt*="profile"], [aria-label*="Google Account"], header img').count().catch(() => 0);
  return hasCreate > 0 || hasAvatar > 0 || /\/projects|flow\.google\.com/.test(url);
}

async function ensureLoggedIn(page, { headed }) {
  await page.goto(FLOW_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  await waitForCaptcha(page, 'login');
  if (await isLoggedIn(page)) { log('Đã đăng nhập Flow.'); return true; }
  if (!headed) throw new Error('Chưa đăng nhập và đang chạy headless — chạy `node flow-direct.mjs login` (headed) để đăng nhập tay 1 lần trước.');
  log('\n👉 CHƯA ĐĂNG NHẬP. Cửa sổ Chrome đã mở sẵn trang Flow.');
  log('   Bạn đăng nhập Google bằng tay trong cửa sổ đó (mật khẩu + 2FA nếu có).');
  log('   Tool KHÔNG gõ mật khẩu hộ. Đăng nhập xong, tool tự nhận và tiếp tục.');
  log('   Nhấn Ctrl+C nếu muốn dừng.\n');
  const started = Date.now();
  while (Date.now() - started < 10 * 60 * 1000) {
    await sleep(5000);
    await waitForCaptcha(page, 'login').catch(() => {});
    if (await isLoggedIn(page)) { log('Đã đăng nhập Flow.'); return true; }
  }
  throw new Error('Hết 10 phút vẫn chưa đăng nhập. Kiểm tra lại cửa sổ Chrome rồi chạy lại.');
}

// --- Lái UI Flow (nhiều selector dự phòng — UI Google đổi thường xuyên) ------
async function tryClick(page, candidates, label) {
  for (const c of candidates) {
    try {
      const loc = typeof c === 'string' ? page.locator(c).first() : c;
      if (await loc.count() > 0 && await loc.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await loc.first().click({ timeout: 5000 });
        log(`  bấm: ${label} (${c})`);
        await humanDelay();
        return true;
      }
    } catch { /* thử selector sau */ }
  }
  return false;
}

async function findPromptBox(page) {
  const candidates = [
    'textarea[placeholder*="Describe"]', 'textarea[placeholder*="Ask"]',
    'textarea[placeholder*="Create"]', 'textarea[placeholder*="Mô tả"]',
    'textarea', '[contenteditable="true"]', 'input[placeholder*="Describe"]',
  ];
  for (const sel of candidates) {
    const loc = page.locator(sel);
    if (await loc.count() > 0) {
      const first = loc.first();
      if (await first.isVisible({ timeout: 2000 }).catch(() => false)) return first;
    }
  }
  return null;
}

async function openProject(page, projectName) {
  if (!projectName) return;
  const ok = await tryClick(page, [
    `text=${projectName}`, `[aria-label*="${projectName}"]`, `button:has-text("${projectName}")`,
  ], `mở project ${projectName}`);
  if (!ok) log(`  (không thấy project "${projectName}" trên trang, sẽ gen vào project hiện tại)`);
}

async function selectModel(page, model) {
  const m = (model || 'omni-flash').toLowerCase();
  const label = m.includes('quality') ? 'Veo 3.1 Quality' : m.includes('lite') ? 'Veo 3.1 Lite' : m.includes('fast') ? 'Veo 3.1 Fast' : 'Omni';
  // Flow hiện tại chọn model trong menu cạnh ô prompt; nếu không thấy thì để mặc định.
  const opened = await tryClick(page, ['button:has-text("Veo")', 'button:has-text("Omni")', '[aria-label*="model" i]', '[aria-label*="Model"]'], 'mở menu model');
  if (opened) {
    await tryClick(page, [`text=${label}`, `button:has-text("${label}")`, `[role="menuitem"]:has-text("${label}")`], `chọn model ${label}`);
  }
}

async function approveCreditDialog(page) {
  // Sau khi bấm Generate, Flow hay hiện dialog xác nhận tốn X credit.
  await page.waitForTimeout(2000);
  const ok = await tryClick(page, [
    'button:has-text("Generate")', 'button:has-text("Create")', 'button:has-text("Confirm")',
    '[role="dialog"] button:has-text("Generate")', '[role="dialog"] button:has-text("Create")',
  ], 'xác nhận credit');
  return ok;
}

async function waitForVideo(page, slug, timeoutMs = 10 * 60 * 1000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await sleep(10000);
    await waitForCaptcha(page, 'đang gen').catch(() => {});
    // Video xong thường có <video src> hoặc nút Download trong card mới nhất.
    const videoCount = await page.locator('video[src]').count().catch(() => 0);
    const dlCount = await page.locator('button:has-text("Download"), a:has-text("Download"), [aria-label*="Download" i]').count().catch(() => 0);
    if (videoCount > 0 || dlCount > 0) return true;
    const body = (await page.content().catch(() => '')).toLowerCase();
    if (/failed|error|something went wrong/.test(body) && /generation/.test(body)) {
      throw new Error('Flow báo lỗi khi gen clip này (xem screenshot).');
    }
  }
  return false;
}

async function downloadLatestVideo(page, outFile) {
  // Ưu tiên 1: lấy src của <video> mới nhất, tải bằng session của trình duyệt.
  const src = await page.evaluate(() => {
    const vids = [...document.querySelectorAll('video')].map(v => v.currentSrc || v.src).filter(Boolean);
    return vids[vids.length - 1] || null;
  }).catch(() => null);
  if (src) {
    const res = await page.request.get(src).catch(() => null);
    if (res?.ok()) {
      fs.writeFileSync(outFile, await res.body());
      return true;
    }
  }
  // Ưu tiên 2: bấm nút Download, hứng sự kiện download của Playwright.
  try {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 120000 }),
      page.locator('button:has-text("Download"), a:has-text("Download")').first().click({ timeout: 10000 }),
    ]);
    await download.saveAs(outFile);
    return true;
  } catch { return false; }
}

async function generateOne(page, item, outDir) {
  const slug = item.slug;
  log(`\n▶ ${slug} — ${item.model || 'omni-flash'} ${item.duration || 8}s ${item.resolution || '720p'} (${estimateCredits(item, true)} credit)`);
  await page.goto(FLOW_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  await waitForCaptcha(page, 'trước khi gen');
  const box = await findPromptBox(page);
  if (!box) {
    await page.screenshot({ path: path.join(outDir, `${slug}-no-prompt-box.png`) });
    fs.writeFileSync(path.join(outDir, `${slug}-page.html`), await page.content());
    throw new Error(`Không tìm thấy ô nhập prompt trên Flow (UI có thể đã đổi). Đã lưu screenshot + HTML vào ${outDir} — gửi 2 file đó cho mình để cập nhật selector.`);
  }
  await box.click();
  await humanDelay(500, 1200);
  // Gõ chậm như người, từng đoạn ngắn.
  const prompt = item.prompt;
  for (let i = 0; i < prompt.length; i += 40) {
    await box.type(prompt.slice(i, i + 40), { delay: 15 + Math.random() * 25 });
    await sleep(150);
  }
  // Ảnh reference (nếu có): bấm nút đính kèm / Ingredients nếu UI có, nếu không thì bỏ qua và ghi chú.
  if (item.referenceImage_1) log(`  (referenceImage ${item.referenceImage_1} — bản direct chưa tự upload được như useapi, bạn gắn tay trong Flow lần đầu hoặc để prompt tự mô tả nhân vật)`);
  await selectModel(page, item.model);
  // Tỉ lệ 9:16: thử chọn trong menu, không thấy thì bỏ qua (prompt đã ghi 9:16).
  await tryClick(page, ['button:has-text("9:16")', '[aria-label*="9:16"]'], 'tỉ lệ 9:16');
  await humanDelay();
  const submitted = await tryClick(page, [
    'button[aria-label*="Send" i]', 'button[aria-label*="Generate" i]', 'button:has-text("Generate")',
    'button:has-text("Create")', 'button[type="submit"]',
  ], 'submit Generate');
  if (!submitted) throw new Error('Không tìm thấy nút Generate/Submit trên Flow (UI có thể đã đổi).');
  await approveCreditDialog(page);
  await waitForCaptcha(page, 'sau khi submit');
  const done = await waitForVideo(page, slug);
  if (!done) {
    await page.screenshot({ path: path.join(outDir, `${slug}-timeout.png`) });
    throw new Error(`Chờ video ${slug} quá 10 phút, chưa thấy video xong. Đã lưu screenshot — có thể Flow đang queue, chạy lại lệnh để resume.`);
  }
  const outFile = path.join(outDir, `${slug}.mp4`);
  const ok = await downloadLatestVideo(page, outFile);
  if (!ok) throw new Error(`Video ${slug} đã gen xong trên Flow nhưng tool không tải được file về. Mở Flow web tải tay, hoặc chạy lại (video vẫn lưu trong Flow).`);
  log(`  ✓ đã tải: ${outFile}`);
  return outFile;
}

// --- Commands -----------------------------------------------------------------
function printHelp() {
  console.log(`flow-direct v${VERSION} — bào credit Flow trực tiếp, không qua useapi
Dùng: node flow-direct.mjs <lệnh> [tùy chọn]

  doctor     Kiểm tra Node, Playwright, Chromium, profile, login, CDP
  login      Mở Chrome, bạn đăng nhập Google tay 1 lần (headed)
  status     Kiểm tra còn đăng nhập Flow không [--cdp]
  cdp-status Kiểm tra Chrome thật có đang mở ở cổng 9222 không
  estimate   Ước tính credit: --file prompts.json [--ultra|--normal]
  generate   Gen batch: --file prompts.json --out output/<đợt> [--headed] [--force] [--dry-run] [--project "Tên project"] [--cdp] [--cdp-port 9222] [--delay-min 10 --delay-max 15]

Chế độ CDP (risk thấp, kiểu MCP): mở Chrome thật trước bằng ./start-chrome.sh (hoặc start-chrome.bat),
rồi chạy generate/status với --cdp. Không banner automation, không login lại.

Ví dụ:
  node flow-direct.mjs login
  node flow-direct.mjs estimate --file examples/prompts-xuan.json --ultra
  node flow-direct.mjs generate --file examples/prompts-xuan.json --out output/2026-11-03-xuan
  node flow-direct.mjs generate --file examples/prompts-xuan.json --cdp --delay-min 10 --delay-max 15
  node flow-direct.mjs generate --file examples/prompts-xuan.json --dry-run
`);
}

async function cmdCdpStatus(args) {
  const port = Number(args['cdp-port'] || 9222);
  const ok = await checkCdp(port);
  console.log(ok ? `✓ Chrome thật đang mở ở cổng ${port} — chạy được với --cdp.` : `✗ Không thấy Chrome ở cổng ${port}.\n${cdpInstructions(port)}`);
}

async function cmdDoctor() {
  console.log(`flow-direct v${VERSION}`);
  console.log(`Node: ${process.version}`);
  try { const pw = await import('playwright'); console.log('Playwright: OK'); } catch { console.log('Playwright: CHƯA CÀI — chạy: npm install'); return; }
  try {
    const { chromium } = await import('playwright');
    const exe = chromium.executablePath();
    console.log(`Chromium: ${fs.existsSync(exe) ? 'OK — ' + exe : 'CHƯA TẢI — chạy: npx playwright install chromium'}`);
  } catch (e) { console.log('Chromium: LỖI —', e.message); }
  console.log(`Profile: ${PROFILE_DIR} — ${fs.existsSync(PROFILE_DIR) ? 'đã có (đăng nhập rồi?)' : 'chưa có — chạy: node flow-direct.mjs login'}`);
  console.log(`CDP (Chrome thật, cổng 9222): ${await checkCdp(9222) ? 'OK — đang mở, dùng được --cdp' : 'chưa mở — chạy ./start-chrome.sh rồi dùng --cdp'}`);
  console.log(`Delay giữa các clip: ${process.env.FLOW_DELAY_MIN || 25}-${process.env.FLOW_DELAY_MAX || 70}s (chỉnh bằng --delay-min/--delay-max)`);
  console.log(`.env: ${fs.existsSync(path.join(__dirname, '.env')) ? 'đã có' : 'chưa có (không bắt buộc)'}`);
  console.log('Captcha: mặc định chờ bạn giải tay trong trình duyệt (miễn phí).');
  if (process.env.TWO_CAPTCHA_API_KEY || process.env.CAPSOLVER_API_KEY) console.log('Solver trả phí: đã đặt key trong .env (tùy chọn).');
}

async function cmdLogin(args = {}) {
  if (args.cdp) { console.log('Chế độ --cdp không cần login riêng — đăng nhập tay trong Chrome thật đã mở sẵn là xong. Chạy: node flow-direct.mjs cdp-status'); return; }
  const context = await launchBrowser({ headed: true });
  const page = context.pages()[0] || await context.newPage();
  try {
    await ensureLoggedIn(page, { headed: true });
    log('✓ Login OK. Session đã lưu trong ./profile — lần sau không cần đăng nhập lại (trừ khi Google bắt đăng nhập lại).');
  } finally { await context.close(); }
}

async function cmdStatus(args = {}) {
  const context = await launchBrowser({ headed: false, cdp: !!args.cdp, cdpPort: Number(args['cdp-port'] || 9222) });
  const page = context.pages()[0] || await context.newPage();
  try {
    try {
      await page.goto(FLOW_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch (e) {
      console.log('✗ Không mở được flow.google.com từ máy này:', e.message.split('\n')[0]);
      console.log('  Kiểm tra mạng / proxy (tool đã tự lấy HTTPS_PROXY nếu có). Trên máy bạn (Windows/Mac) thường không gặp lỗi này.');
      return;
    }
    await page.waitForTimeout(3000);
    if (await captchaVisible(page)) { console.log('⚠️  Đang bị captcha — chạy `node flow-direct.mjs login` để giải tay.'); return; }
    console.log(await isLoggedIn(page) ? '✓ Đang đăng nhập Flow.' : '✗ Chưa đăng nhập — chạy: node flow-direct.mjs login');
  } finally { await context.close(); }
}

async function cmdEstimate(args) {
  const file = args.file || 'examples/prompts-xuan.json';
  const ultra = args.normal ? false : true;
  const items = loadPrompts(file);
  let total = 0;
  console.log(`\nƯớc tính — ${items.length} prompt, gói ${ultra ? 'Ultra' : 'thường'}:`);
  for (const it of items) {
    const c = estimateCredits(it, ultra); total += c;
    console.log(`  ${it.slug} — ${it.model || 'omni-flash'} ${it.duration || 8}s ${it.resolution || '720p'}: ${c} credit`);
  }
  console.log(`\nTổng: ${total} credit (${(total / 25000 * 100).toFixed(1)}% pool Ultra 20x 25.000/tháng)`);
  console.log('Không tốn $15 useapi, không tốn tiền API. Chỉ tốn credit Flow.');
}

async function cmdGenerate(args) {
  const file = args.file || 'examples/prompts-xuan.json';
  const outDir = args.out || path.join('output', `${today()}-direct`);
  const items = loadPrompts(file);
  const ultra = args.normal ? false : true;
  const total = items.reduce((s, it) => s + estimateCredits(it, ultra), 0);
  console.log(`\n${items.length} prompt, tổng ~${total} credit. Output: ${outDir}`);
  if (args['dry-run']) {
    console.log('(dry-run: chỉ kiểm tra prompts + credit, KHÔNG mở trình duyệt, KHÔNG gen)');
    for (const it of items) console.log(`  ${it.slug}: ${it.prompt.slice(0, 80)}...`);
    return;
  }
  const manifestPath = path.join(outDir, 'manifest.json');
  const isCdp = !!args.cdp;
  const delayMin = args['delay-min'] ?? process.env.FLOW_DELAY_MIN ?? 25;
  const delayMax = args['delay-max'] ?? process.env.FLOW_DELAY_MAX ?? 70;
  let manifest = { driver: isCdp ? 'direct-browser-cdp' : 'direct-browser', file, created: new Date().toISOString(), items: [] };
  if (fs.existsSync(manifestPath)) {
    try { manifest = readJson(manifestPath); } catch {}
  }
  const done = new Set(manifest.items.filter(i => i.status === 'completed').map(i => i.slug));
  const context = await launchBrowser({ headed: !!args.headed || isCdp, cdp: isCdp, cdpPort: Number(args['cdp-port'] || 9222) });
  // Ở chế độ CDP, ưu tiên tab Flow đã mở sẵn trong Chrome thật.
  let page = context.pages().find(p => /flow\.google\.com/.test(p.url())) || context.pages()[0] || await context.newPage();
  try {
    await ensureLoggedIn(page, { headed: !!args.headed || isCdp });
    await openProject(page, args.project || process.env.FLOW_PROJECT);
    for (const [idx, item] of items.entries()) {
      if (done.has(item.slug) && !args.force) { log(`⏭  ${item.slug} đã xong trong manifest, bỏ qua (--force để gen lại)`); continue; }
      if (idx > 0) { log(`Nghỉ ${delayMin}-${delayMax}s giữa các clip (như người, tránh reCAPTCHA)...`); await betweenClipsDelay(delayMin, delayMax); }
      const entry = { slug: item.slug, prompt: item.prompt, model: item.model || 'omni-flash', duration: item.duration || 8, resolution: item.resolution || '720p', credits: estimateCredits(item, ultra), status: 'pending', file: null };
      manifest.items = manifest.items.filter(i => i.slug !== item.slug);
      manifest.items.push(entry);
      writeJson(manifestPath, manifest);
      try {
        const outFile = await generateOne(page, item, outDir);
        entry.status = 'completed'; entry.file = outFile;
      } catch (e) {
        entry.status = 'failed'; entry.error = e.message;
        log(`✗ ${item.slug} lỗi: ${e.message}`);
        log('  (video có thể vẫn đang gen trong Flow — kiểm tra web, chạy lại lệnh để resume)');
      }
      writeJson(manifestPath, manifest);
    }
  } finally { await context.close(); }
  const okCount = manifest.items.filter(i => i.status === 'completed').length;
  console.log(`\nXong: ${okCount}/${items.length} clip. Manifest: ${manifestPath}`);
  console.log('Video cũng lưu trong Flow của bạn — mở flow.google.com để xem lại.');
}

// --- Main ---------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  try {
    if (!cmd || cmd === '--help' || cmd === '-h') return printHelp();
    if (cmd === 'doctor') return await cmdDoctor();
    if (cmd === 'login') return await cmdLogin(args);
    if (cmd === 'status') return await cmdStatus(args);
    if (cmd === 'cdp-status') return await cmdCdpStatus(args);
    if (cmd === 'estimate') return await cmdEstimate(args);
    if (cmd === 'generate') return await cmdGenerate(args);
    console.error(`Lệnh không biết: ${cmd}`); printHelp(); process.exitCode = 1;
  } catch (e) {
    console.error(`\n✗ Lỗi: ${e.message}`);
    if (process.env.DEBUG) console.error(e);
    process.exitCode = 1;
  }
}
main();
