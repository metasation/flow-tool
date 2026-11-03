#!/usr/bin/env node
/**
 * flow-tool.mjs — Tool bào credit Google Flow hoàn thiện cho Diễu Phố
 * Dùng useapi.net Google Flow API (wrapper, xài credit Flow, KHÔNG xài Gemini API key)
 *
 * Cách dùng:
 *   node flow-tool.mjs estimate --file examples/prompts-xuan.json --ultra
 *   node flow-tool.mjs generate --file examples/prompts-xuan.json --out output/2026-11-03-xuan
 *   node flow-tool.mjs generate --file prompts.json --no-download            # chỉ gen, lưu manifest, tải sau
 *   node flow-tool.mjs upscale --manifest output/2026-11-03-xuan/manifest.json --resolution 1080p
 *   node flow-tool.mjs download --manifest output/2026-11-03-xuan/manifest.json
 *   node flow-tool.mjs list-projects --email you@gmail.com
 *   node flow-tool.mjs list-media --email you@gmail.com
 *   node flow-tool.mjs create-character --name "Tu Nhan Chibi" --image ./tu-nhan-front.png --image2 ./tu-nhan-34.png --voice Charon
 *   node flow-tool.mjs health --email you@gmail.com
 *
 * Config: tạo file .env (xem .env.example) hoặc export env:
 *   USEAPI_TOKEN=...   FLOW_EMAIL=you@gmail.com
 *   hoặc truyền --token xxx --email yyy trên lệnh.
 *
 * Không cần: GEMINI_API_KEY, GCP project. Cần: useapi token $15/tháng + tài khoản Flow đã connect.
 * Video gen bằng tool này VẪN lưu trong Flow của tài khoản đó (project hiện tại).
 * Link videoUrl chỉ sống ~6h — tool lưu mediaGenerationId để lấy link mới sau.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_BASE = 'https://api.useapi.net/v1/google-flow';
const VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Credit table — Flow Help, Oct 2026. Veo tính theo clip, Omni tính theo độ dài.
// ---------------------------------------------------------------------------
export const CREDIT_TABLE = {
  'omni-flash': {
    '360p': { 4: 4, 6: 5, 8: 6, 10: 7 },
    '720p': { 4: 7, 6: 10, 8: 12, 10: 15 },
  },
  'veo-3.1-lite': { ultra: 5, normal: 10 },
  'veo-3.1-fast': { ultra: 10, normal: 20 },
  'veo-3.1-quality': { ultra: 100, normal: 100 },
  'veo-3.1-lite-lower-priority': { ultra: 0, normal: 0 }, // chỉ manager Ultra $199, family member KHÔNG có
};
export const UPSCALE_CREDITS = { '720p': 0, '1080p': 0, '4K': 50 };
export const MODELS = Object.keys(CREDIT_TABLE);

export function estimateCredits(item, ultra = true) {
  const model = item.model || 'omni-flash';
  const duration = Number(item.duration || (model === 'omni-flash' ? 8 : 8));
  const count = Number(item.count || 1);
  if (model === 'omni-flash') {
    const res = item.resolution || '720p';
    const table = CREDIT_TABLE['omni-flash'][res] || CREDIT_TABLE['omni-flash']['720p'];
    const per = table[duration] ?? table[8] ?? 12;
    return per * count;
  }
  const row = CREDIT_TABLE[model];
  if (!row) return 0;
  return (ultra ? row.ultra : row.normal) * count;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function loadEnvFile() {
  for (const p of ['.env', path.join(process.cwd(), '.env')]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.trim().match(/^([A-Z0-9_]+)\s*=\s*(.+)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}
loadEnvFile();

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const eq = key.indexOf('=');
      if (eq !== -1) args[key.slice(0, eq)] = key.slice(eq + 1);
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) args[key] = argv[++i];
      else args[key] = true;
    } else args._.push(a);
  }
  return args;
}
export function slugify(s = '') {
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'clip';
}
export function today() { return new Date().toISOString().slice(0, 10); }
export function log(...a) { console.log(`[${new Date().toLocaleTimeString('vi-VN')}]`, ...a); }
export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
export function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
export function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}
function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  return { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm' }[ext] || 'application/octet-stream';
}
function findMediaId(obj) {
  if (typeof obj === 'string' && obj.startsWith('user:')) return obj;
  if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj)) {
      const f = findMediaId(v);
      if (f) return f;
    }
  }
  return null;
}
function findUrl(obj) {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of ['videoUrl', 'url', 'signedUrl', 'downloadUrl', 'servingBaseUri']) {
    if (typeof obj[k] === 'string' && obj[k].startsWith('http')) return obj[k];
  }
  for (const v of Object.values(obj)) {
    const f = findUrl(v);
    if (f) return f;
  }
  return null;
}

// ---------------------------------------------------------------------------
// useapi client
// ---------------------------------------------------------------------------
async function api(pathname, { token, method = 'GET', body = null, rawBody = null, contentType = null } = {}) {
  const headers = { Authorization: `Bearer ${token}` };
  let payload = null;
  if (rawBody) { payload = rawBody; if (contentType) headers['Content-Type'] = contentType; }
  else if (body) { payload = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
  const res = await fetch(`${API_BASE}${pathname}`, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* raw bytes */ }
  if (!res.ok) {
    const msg = json?.error || json?.message || text.slice(0, 500);
    throw new Error(`API ${res.status} ${method} ${pathname}: ${msg}`);
  }
  return { json, text, res };
}

// Upload 1 file local -> mediaGenerationId (dùng cho referenceImage / startImage / character)
async function uploadAsset(filePath, token, email) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) throw new Error(`Không thấy file ảnh/video: ${abs}`);
  const buf = fs.readFileSync(abs);
  const { json } = await api(`/assets/${encodeURIComponent(email)}`, {
    token, method: 'POST', rawBody: buf, contentType: mimeFor(abs),
  });
  const id = findMediaId(json);
  if (!id) throw new Error(`Upload ${filePath} không trả về mediaGenerationId: ${JSON.stringify(json).slice(0, 300)}`);
  log(`  upload ${path.basename(filePath)} -> ${id.slice(0, 60)}...`);
  return id;
}

// Resolve 1 field: nếu là path local thì upload, nếu đã là user:... thì giữ nguyên
async function resolveRef(value, token, email, cache) {
  if (!value || typeof value !== 'string') return value;
  if (value.startsWith('user:') || value.startsWith('http')) return value;
  if (fs.existsSync(path.resolve(value))) {
    if (cache.has(value)) return cache.get(value);
    const id = await uploadAsset(value, token, email);
    cache.set(value, id);
    return id;
  }
  return value; // voice preset (Charon/Kore...), character id, ...
}

async function resolvePromptRefs(item, token, email, cache) {
  const out = { ...item };
  // referenceImage_1..7, startImage, endImage, referenceVideo_1
  for (const k of Object.keys(out)) {
    if (/^(referenceImage_\d|startImage|endImage|referenceVideo_1)$/.test(k)) {
      out[k] = await resolveRef(out[k], token, email, cache);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Prompts file
// ---------------------------------------------------------------------------
export function loadPrompts(file) {
  const raw = readJson(file);
  let defaults = {};
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (Array.isArray(raw.prompts)) { defaults = raw.defaults || {}; list = raw.prompts; }
  else throw new Error(`File ${file} phải là array [...] hoặc {defaults:{...}, prompts:[...]}`);
  return list.map((p, i) => {
    if (typeof p === 'string') p = { prompt: p };
    const merged = { model: 'omni-flash', duration: 8, resolution: '720p', aspectRatio: '9:16', count: 1, ...defaults, ...p };
    merged._index = i;
    merged.slug = p.slug || slugify(`${p.season || ''}-${p.landmark || ''}-${p.prompt || ''}`.slice(0, 80)) || `clip-${String(i + 1).padStart(3, '0')}`;
    return merged;
  });
}

function cmdEstimate(args) {
  const file = args.file || args.f || 'prompts.json';
  const ultra = args.ultra !== 'false' && args.ultra !== false;
  const list = loadPrompts(file);
  let total = 0;
  const byModel = {};
  for (const it of list) {
    const c = estimateCredits(it, ultra);
    total += c;
    byModel[it.model] = (byModel[it.model] || 0) + c;
  }
  console.log(`\n=== ESTIMATE: ${file} (${list.length} prompts, Ultra=${ultra}) ===`);
  console.log('Theo model:', byModel);
  console.log(`Tổng credit: ${total}`);
  console.log(`Trên pool 25.000 Ultra 20x: ${(total / 25000 * 100).toFixed(1)}% pool, còn lại ${25000 - total} credit`);
  console.log(`Nếu chỉ upscale 1080p (free): +0 credit. Nếu upscale 4K hết: +${list.length * 50} credit`);
  console.log(`Lưu ý: Veo Quality 100/clip, Omni edit 40/clip — tránh nếu muốn bào nhiều.`);
  return total;
}

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------
async function submitAndPoll(item, token, email, { pollIntervalMs = 15000, timeoutMs = 10 * 60 * 1000 } = {}) {
  const body = { email, prompt: item.prompt, model: item.model, duration: Number(item.duration), count: Number(item.count || 1), async: true };
  if (item.model === 'omni-flash' && item.resolution) body.resolution = item.resolution;
  if (item.aspectRatio) body.aspectRatio = item.aspectRatio;
  for (const k of Object.keys(item)) {
    if (/^(character_\d|referenceImage_\d|referenceAudio_\d|startImage|endImage|referenceVideo_1|startFrameIndex_1|endFrameIndex_1)$/.test(k)) body[k] = item[k];
  }
  const { json } = await api('/videos', { token, method: 'POST', body });
  const jobId = json.jobId || json.job?.jobId || json.id;
  if (!jobId) throw new Error(`POST /videos không trả jobId: ${JSON.stringify(json).slice(0, 400)}`);
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await sleep(pollIntervalMs);
    const { json: job } = await api(`/jobs/${encodeURIComponent(jobId)}`, { token });
    const status = job.status || job.job?.status || job.state || '';
    const media = job.media || job.job?.media || [];
    if (/complete|success|done/i.test(status) && media.length) return { jobId, job, media };
    if (/fail|error|cancel/i.test(status)) throw new Error(`Job ${jobId} ${status}: ${JSON.stringify(job).slice(0, 400)}`);
    if (media.length && media[0]?.videoUrl) return { jobId, job, media };
  }
  throw new Error(`Job ${jobId} timeout sau ${timeoutMs / 1000}s — vẫn lấy lại được bằng download --job ${jobId}`);
}

async function downloadUrl(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download ${res.status} ${url.slice(0, 120)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return buf.length;
}

async function cmdGenerate(args) {
  const file = args.file || args.f || 'prompts.json';
  const token = args.token || process.env.USEAPI_TOKEN;
  const email = args.email || process.env.FLOW_EMAIL;
  if (!token) throw new Error('Thiếu USEAPI_TOKEN — tạo .env từ .env.example hoặc --token xxx');
  if (!email) throw new Error('Thiếu FLOW_EMAIL — email tài khoản Flow đã join family, hoặc --email xxx@gmail.com');
  const ultra = args.ultra !== 'false';
  const noDownload = !!args['no-download'];
  const upscaleTo = args['upscale-to'] || null; // 1080p | 4K — làm sau khi gen, chỉ clip thắng nếu có --winners
  const outDir = args.out || args.o || path.join('output', `${today()}-${path.basename(file, path.extname(file))}`);
  fs.mkdirSync(outDir, { recursive: true });
  const list = loadPrompts(file);
  const manifestPath = path.join(outDir, 'manifest.json');
  let manifest = [];
  if (fs.existsSync(manifestPath) && !args.force) {
    manifest = readJson(manifestPath);
    log(`Resume: đã có ${manifest.length} entries trong ${manifestPath}`);
  }
  const doneSlugs = new Set(manifest.filter(m => m.status === 'completed').map(m => m.slug));
  const cache = new Map(); // local path -> mediaGenerationId, tránh upload trùng
  log(`\n=== GENERATE: ${list.length} prompts từ ${file} -> ${outDir} (Ultra=${ultra}) ===`);
  log(`Tổng credit ước tính: ${list.reduce((s, it) => s + estimateCredits(it, ultra), 0)} (xem lại bằng lệnh estimate)`);
  log(`Lưu ý: video vẫn lưu trong Flow project hiện tại của ${email}. Link videoUrl hết hạn ~6h, tool lưu mediaGenerationId để tải lại sau.`);

  for (const item of list) {
    const idx = String(item._index + 1).padStart(3, '0');
    if (doneSlugs.has(item.slug) && !args.force) { log(`[${idx}] SKIP ${item.slug} (đã completed)`); continue; }
    log(`\n[${idx}/${list.length}] ${item.slug} | ${item.model} ${item.duration}s ${item.resolution || ''} ${item.aspectRatio}`);
    try {
      const resolved = await resolvePromptRefs(item, token, email, cache);
      const { jobId, media } = await submitAndPoll(resolved, token, email);
      const entry = {
        slug: item.slug, index: item._index, prompt: item.prompt, model: item.model,
        duration: Number(item.duration), resolution: item.resolution || null, aspectRatio: item.aspectRatio || null,
        season: item.season || null, landmark: item.landmark || null,
        jobId, status: 'completed', credits: estimateCredits(item, ultra),
        media: media.map(m => ({ mediaGenerationId: m.mediaGenerationId, videoUrl: m.videoUrl || null, thumbnailUrl: m.thumbnailUrl || null })),
        createdAt: new Date().toISOString(),
      };
      const first = media[0];
      entry.mediaGenerationId = first?.mediaGenerationId || null;
      if (!noDownload && first?.videoUrl) {
        const fname = `${idx}-${item.slug}-${item.model}-${item.duration}s-${item.resolution || '720p'}.mp4`;
        const dest = path.join(outDir, fname);
        const size = await downloadUrl(first.videoUrl, dest);
        entry.file = fname; entry.bytes = size;
        log(`  ✓ tải về ${fname} (${(size / 1024 / 1024).toFixed(1)} MB)`);
      } else {
        log(`  ✓ job ${jobId} xong, mediaGenerationId=${entry.mediaGenerationId?.slice(0, 50)}... (chưa tải — dùng download --manifest để tải sau)`);
      }
      // Upscale ngay nếu user yêu cầu (khuyên: chỉ upscale clip thắng, xem lệnh upscale riêng)
      if (upscaleTo) {
        entry.upscaled = await doUpscale(entry, token, email, upscaleTo, outDir, idx);
      }
      const i = manifest.findIndex(m => m.slug === item.slug);
      if (i >= 0) manifest[i] = entry; else manifest.push(entry);
      writeJson(manifestPath, manifest);
    } catch (e) {
      log(`  ✗ LỖI ${item.slug}: ${e.message}`);
      const entry = { slug: item.slug, index: item._index, prompt: item.prompt, model: item.model, status: 'failed', error: e.message, createdAt: new Date().toISOString() };
      const i = manifest.findIndex(m => m.slug === item.slug);
      if (i >= 0) manifest[i] = entry; else manifest.push(entry);
      writeJson(manifestPath, manifest);
      if (args['stop-on-error']) throw e;
      await sleep(5000);
    }
  }
  const ok = manifest.filter(m => m.status === 'completed').length;
  const fail = manifest.filter(m => m.status === 'failed').length;
  log(`\n=== XONG: ${ok} completed, ${fail} failed. Manifest: ${manifestPath} ===`);
  log(`Trong Flow: mở flow.google.com bằng ${email} để thấy video trong project hiện tại.`);
  return manifest;
}

async function doUpscale(entry, token, email, resolution, outDir, idxPrefix = '') {
  const id = entry.mediaGenerationId;
  if (!id) return { status: 'skipped', reason: 'no mediaGenerationId' };
  log(`  upscale ${resolution} (1080p free, 4K = 50 credit)...`);
  const { json } = await api('/videos/upscale', { token, method: 'POST', body: { mediaGenerationId: id, resolution, email } });
  const media = json.media || [];
  const upId = media[0]?.mediaGenerationId || `${id}_upsampled`;
  const url = media[0]?.videoUrl || findUrl(json);
  let file = null;
  if (url) {
    file = `${idxPrefix ? idxPrefix + '-' : ''}${entry.slug}-${resolution}.mp4`;
    const size = await downloadUrl(url, path.join(outDir, file));
    log(`  ✓ upscale ${file} (${(size / 1024 / 1024).toFixed(1)} MB)`);
  }
  return { status: 'completed', resolution, mediaGenerationId: upId, file, credits: UPSCALE_CREDITS[resolution] ?? 0, videoUrl: url || null };
}

async function cmdUpscale(args) {
  const token = args.token || process.env.USEAPI_TOKEN;
  const email = args.email || process.env.FLOW_EMAIL;
  if (!token || !email) throw new Error('Thiếu USEAPI_TOKEN / FLOW_EMAIL');
  const manifestPath = args.manifest || args.m || 'output/manifest.json';
  const resolution = args.resolution || args.r || '1080p';
  if (!['720p', '1080p', '4K'].includes(resolution)) throw new Error('resolution phải là 720p | 1080p | 4K');
  const manifest = readJson(manifestPath);
  const outDir = path.dirname(manifestPath);
  let winners = null;
  if (args.winners) winners = new Set(readJson(args.winners).map(x => typeof x === 'string' ? x : x.slug));
  let total = 0;
  for (const entry of manifest) {
    if (entry.status !== 'completed') continue;
    if (winners && !winners.has(entry.slug)) continue;
    if (entry.upscaled?.resolution === resolution && entry.upscaled?.status === 'completed') { log(`SKIP ${entry.slug} đã upscale ${resolution} (cache, không tốn thêm credit)`); continue; }
    try {
      entry.upscaled = await doUpscale(entry, token, email, resolution, outDir, String(entry.index + 1).padStart(3, '0'));
      total += entry.upscaled.credits || 0;
      writeJson(manifestPath, manifest);
    } catch (e) { log(`✗ upscale ${entry.slug}: ${e.message}`); entry.upscaled = { status: 'failed', error: e.message }; writeJson(manifestPath, manifest); }
  }
  log(`\nXong upscale ${resolution}. Tổng credit upscale: ${total}. Manifest đã cập nhật: ${manifestPath}`);
}

async function cmdDownload(args) {
  const token = args.token || process.env.USEAPI_TOKEN;
  const email = args.email || process.env.FLOW_EMAIL;
  if (!token) throw new Error('Thiếu USEAPI_TOKEN');
  const manifestPath = args.manifest || args.m || 'output/manifest.json';
  const outDir = args.out || args.o || path.dirname(manifestPath);
  const manifest = readJson(manifestPath);
  // Cho phép download 1 job lẻ: --job <jobId>
  if (args.job) {
    const { json } = await api(`/jobs/${encodeURIComponent(args.job)}`, { token });
    console.log(JSON.stringify(json, null, 2));
    return;
  }
  for (const entry of manifest) {
    if (entry.status !== 'completed' || entry.file) continue;
    const id = entry.mediaGenerationId || entry.media?.[0]?.mediaGenerationId;
    if (!id) { log(`SKIP ${entry.slug}: không có mediaGenerationId`); continue; }
    try {
      // Lấy link mới — link cũ hết hạn ~6h
      let url = null;
      try {
        const { json } = await api(`/assets/${encodeURIComponent(id)}`, { token });
        url = findUrl(json);
      } catch (e) { log(`  GET /assets lỗi, thử ?raw=true: ${e.message}`); }
      const fname = `${String(entry.index + 1).padStart(3, '0')}-${entry.slug}-${entry.model}-${entry.duration}s-${entry.resolution || '720p'}.mp4`;
      const dest = path.join(outDir, fname);
      if (url) {
        const size = await downloadUrl(url, dest);
        entry.file = fname; entry.bytes = size;
        log(`✓ ${fname} (${(size / 1024 / 1024).toFixed(1)} MB)`);
      } else {
        // Fallback: stream bytes qua useapi
        const res = await fetch(`${API_BASE}/assets/${encodeURIComponent(id)}?raw=true`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(`raw download ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(dest, buf);
        entry.file = fname; entry.bytes = buf.length;
        log(`✓ ${fname} (qua ?raw=true, ${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
      }
      writeJson(manifestPath, manifest);
    } catch (e) { log(`✗ download ${entry.slug}: ${e.message}`); }
  }
  log(`\nXong download. Manifest: ${manifestPath}`);
}

async function cmdListProjects(args) {
  const token = args.token || process.env.USEAPI_TOKEN;
  const email = args.email || process.env.FLOW_EMAIL;
  if (!token || !email) throw new Error('Thiếu USEAPI_TOKEN / FLOW_EMAIL');
  const { json } = await api(`/assets/projects/${encodeURIComponent(email)}`, { token });
  console.log(JSON.stringify(json, null, 2));
}
async function cmdListMedia(args) {
  const token = args.token || process.env.USEAPI_TOKEN;
  const email = args.email || process.env.FLOW_EMAIL;
  if (!token || !email) throw new Error('Thiếu USEAPI_TOKEN / FLOW_EMAIL');
  const q = args['project-id'] ? `?projectId=${encodeURIComponent(args['project-id'])}` : '';
  const { json } = await api(`/assets/media/${encodeURIComponent(email)}${q}`, { token });
  const media = json.media || [];
  console.log(`Tổng ${media.length} entries (tối đa 25.000/call).`);
  for (const m of media.slice(0, 50)) console.log(`- ${m.createTime || ''} ${m.mediaType || ''} ${m.mediaGenerationId || ''}`);
  if (media.length > 50) console.log(`... và ${media.length - 50} entries nữa (xem full JSON bằng --json)`);
  if (args.json) console.log(JSON.stringify(json, null, 2));
}
async function cmdHealth(args) {
  const token = args.token || process.env.USEAPI_TOKEN;
  const email = args.email || process.env.FLOW_EMAIL;
  if (!token || !email) throw new Error('Thiếu USEAPI_TOKEN / FLOW_EMAIL');
  const { json } = await api(`/accounts/${encodeURIComponent(email)}`, { token });
  console.log(JSON.stringify(json, null, 2));
}
async function cmdCreateCharacter(args) {
  const token = args.token || process.env.USEAPI_TOKEN;
  const email = args.email || process.env.FLOW_EMAIL;
  if (!token || !email) throw new Error('Thiếu USEAPI_TOKEN / FLOW_EMAIL');
  const name = args.name || args.n;
  if (!name) throw new Error('--name là bắt buộc, vd --name "Tu Nhan Chibi"');
  if (!args.image) throw new Error('--image là bắt buộc: ảnh front của nhân vật, vd --image ./tu-nhan-front.png');
  const img1 = await uploadAsset(args.image, token, email);
  let img2 = null;
  if (args.image2) img2 = await uploadAsset(args.image2, token, email);
  const body = { displayName: name, imageReference_1: img1, email };
  if (img2) body.imageReference_2 = img2;
  if (args.personality) body.personalityNotes = args.personality;
  if (args.voice) body.voice = args.voice;
  const { json } = await api('/characters', { token, method: 'POST', body });
  console.log('\n=== CHARACTER ĐÃ TẠO ===');
  console.log(JSON.stringify(json, null, 2));
  console.log(`\nDùng trong prompts.json: "character_1": "${json.character || json.entityId || ''}"`);
  console.log('Lưu id này vào characters.json để tái sử dụng cho mọi batch sau.');
  return json;
}

function printHelp() {
  console.log(`
flow-tool v${VERSION} — Bào credit Google Flow bằng useapi.net (không dùng Gemini API key)

Lệnh:
  estimate --file <prompts.json> [--ultra]                    Ước tính credit trước khi chạy
  generate --file <prompts.json> [--out <dir>] [--no-download] [--upscale-to 1080p|4K] [--force]
  upscale  --manifest <manifest.json> --resolution 1080p|4K [--winners winners.json]
  download --manifest <manifest.json> [--out <dir>] [--job <jobId>]
  list-projects --email <gmail>
  list-media --email <gmail> [--project-id <id>] [--json]
  create-character --name <tên> --image <file> [--image2 <file>] [--voice Charon] [--personality "..."]
  health --email <gmail>

Config (.env hoặc env hoặc flag):
  USEAPI_TOKEN, FLOW_EMAIL, --token, --email

Ví dụ chạy xuyên đêm (3 file mùa):
  for f in examples/prompts-xuan.json examples/prompts-ha.json examples/prompts-thu.json; do
    node flow-tool.mjs generate --file "$f" --out "output/$(basename $f .json)"
  done

Lưu ý:
  - Video gen bằng tool vẫn lưu trong Flow project hiện tại của tài khoản đó.
  - Flow không tự tạo project theo file prompts.json — tạo project trước trên web, mở nó lên rồi mới chạy batch đó.
  - Veo 3.1 Lite Lower Priority 0 credit chỉ dành cho manager Ultra $199, family member không có.
  - 1080p upscale free, 4K upscale 50 credit. Upscale 1 video 2 lần trả về cache, không tốn thêm.
`);
}

// ---------------------------------------------------------------------------
const [, , cmd, ...rest] = process.argv;
const args = parseArgs(rest);
try {
  if (!cmd || cmd === 'help' || cmd === '--help' || args.help) printHelp();
  else if (cmd === 'estimate') cmdEstimate(args);
  else if (cmd === 'generate') await cmdGenerate(args);
  else if (cmd === 'upscale') await cmdUpscale(args);
  else if (cmd === 'download') await cmdDownload(args);
  else if (cmd === 'list-projects') await cmdListProjects(args);
  else if (cmd === 'list-media') await cmdListMedia(args);
  else if (cmd === 'health') await cmdHealth(args);
  else if (cmd === 'create-character') await cmdCreateCharacter(args);
  else { console.error(`Lệnh không biết: ${cmd}`); printHelp(); process.exitCode = 1; }
} catch (e) {
  console.error(`\n✗ LỖI: ${e.message}`);
  if (args.verbose) console.error(e.stack);
  process.exitCode = 1;
}
