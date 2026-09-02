/* 01_util.js — constants, helpers, event bus, lazy script loader */
(function(){
'use strict';
const F = window.F = window.F || {};
const U = F.util = {};

F.C = {
  APP: 'Folio',
  VERSION: '0.1.0',
  BUILD: '{{BUILD_ID}}',
  SITE: '{{SITE_MODE}}' === 'site',
  CDN: {
    PDFJS: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    PDFJS_WORKER: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    JSZIP: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
    TESSERACT: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
  },
  THEMES: [
    { id: 'paper', name: 'Paper' }, { id: 'sepia', name: 'Sepia' }, { id: 'dark', name: 'Dark' }, { id: 'night', name: 'Night' },
  ],
  FONTS: [
    { id: 'literata', name: 'Literata', css: "'Literata', Georgia, 'Times New Roman', serif" },
    { id: 'newsreader', name: 'Newsreader', css: "'Newsreader', Georgia, serif" },
    { id: 'atkinson', name: 'Atkinson Hyperlegible', css: "'Atkinson Hyperlegible', system-ui, sans-serif" },
    { id: 'inter', name: 'Inter', css: "'Inter', system-ui, -apple-system, sans-serif" },
    { id: 'system', name: 'System', css: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  ],
  // Voice personas: synthetic characters selected by tone, never impersonations of named people.
  PERSONAS: [
    { id: 'calm-narrator', name: 'Calm Narrator', tagline: 'Even, unhurried, low-key. Built for long sessions and late nights.', rate: 0.95, pitch: 0.95,
      labels: ['calm', 'narrative', 'soft', 'soothing', 'meditative', 'neutral'], browserHints: ['Samantha', 'Ava', 'Allison', 'Google US English', 'Microsoft Aria', 'Karen', 'Moira'],
      openaiVoice: 'sage', instructions: 'You are a calm, unhurried audiobook narrator. Keep an even, gentle pace with soft emphasis and natural pauses at punctuation. Never rush, never dramatize.' },
    { id: 'warm-storyteller', name: 'Warm Storyteller', tagline: 'Friendly and expressive, like being read to by someone who loves the book.', rate: 1.0, pitch: 1.05,
      labels: ['warm', 'friendly', 'pleasant', 'expressive', 'storyteller', 'casual', 'conversational'], browserHints: ['Karen', 'Samantha', 'Google UK English Female', 'Microsoft Jenny', 'Tessa', 'Fiona'],
      openaiVoice: 'nova', instructions: 'You are a warm, expressive storyteller reading aloud to a friend. Bring gentle life to dialogue, vary your pacing with the mood of the text, and keep a friendly, intimate tone.' },
    { id: 'measured-academic', name: 'Measured Academic', tagline: 'Precise and articulate. Good for non-fiction, essays, and dense passages.', rate: 0.92, pitch: 0.9,
      labels: ['authoritative', 'professional', 'articulate', 'mature', 'formal', 'intellectual', 'middle-aged'], browserHints: ['Daniel', 'Google UK English Male', 'Microsoft Ryan', 'Oliver', 'Arthur', 'Alex'],
      openaiVoice: 'echo', instructions: 'You are a measured, articulate lecturer reading a text aloud. Speak precisely, slightly slower than conversational pace, with clear enunciation and deliberate pauses between clauses.' },
    { id: 'bright-brisk', name: 'Bright & Brisk', tagline: 'Lively and quick. For light reading and getting through a lot of pages.', rate: 1.15, pitch: 1.1,
      labels: ['energetic', 'upbeat', 'young', 'bright', 'cheerful', 'confident'], browserHints: ['Zoe', 'Google US English', 'Microsoft Jenny', 'Nicky', 'Samantha'],
      openaiVoice: 'shimmer', instructions: 'You are a bright, energetic reader. Keep a brisk, lively pace with an upbeat tone, crisp consonants, and light emphasis. Stay clear and never breathless.' },
    { id: 'late-night-low', name: 'Late-Night Low', tagline: 'Deep, slow and quiet. The bedtime voice.', rate: 0.88, pitch: 0.85,
      labels: ['deep', 'calm', 'raspy', 'husky', 'gravelly', 'relaxed', 'soothing'], browserHints: ['Aaron', 'Daniel', 'Google UK English Male', 'Microsoft Guy', 'Fred', 'Tom', 'Rishi'],
      openaiVoice: 'onyx', instructions: 'You are a deep, quiet late-night narrator. Speak slowly and softly, with a low, relaxed tone and long, unhurried pauses. Intimate and calm, as if reading someone to sleep.' },
    { id: 'crisp-newsreader', name: 'Crisp Newsreader', tagline: 'Neutral, clear and efficient. For articles, reports and reference.', rate: 1.05, pitch: 1.0,
      labels: ['confident', 'crisp', 'professional', 'news', 'neutral', 'clear'], browserHints: ['Alex', 'Microsoft Aria', 'Google US English', 'Tom', 'Samantha', 'Daniel'],
      openaiVoice: 'alloy', instructions: 'You are a clear, neutral newsreader. Speak at an efficient conversational pace with crisp articulation and even emphasis. Informative, not dramatic.' },
  ],
  OPENAI_VOICES: ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse', 'marin', 'cedar'],
  ELEVEN_MODELS: [
    { id: 'eleven_multilingual_v2', name: 'Multilingual v2 (quality)' },
    { id: 'eleven_turbo_v2_5', name: 'Turbo v2.5 (fast)' },
    { id: 'eleven_flash_v2_5', name: 'Flash v2.5 (fastest, cheapest)' },
  ],
  DEFAULT_WPP: 280,
  SPEEDS: [0.6, 0.75, 0.85, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5],
  SLEEP_OPTIONS: [{ id: 0, name: 'Off' }, { id: 10, name: '10 min' }, { id: 20, name: '20 min' }, { id: 30, name: '30 min' }, { id: 45, name: '45 min' }, { id: 60, name: '60 min' }, { id: -1, name: 'End of chapter' }],
};

// ---- event bus ----
const handlers = {};
F.bus = {
  on(ev, fn){ (handlers[ev] = handlers[ev] || []).push(fn); return () => F.bus.off(ev, fn); },
  off(ev, fn){ handlers[ev] = (handlers[ev] || []).filter(f => f !== fn); },
  emit(ev, data){ (handlers[ev] || []).slice().forEach(fn => { try { fn(data); } catch (e) { console.error('[bus]', ev, e); } }); },
};

// ---- basics ----
U.uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));
U.sleep = ms => new Promise(r => setTimeout(r, ms));
U.clamp = (x, a, b) => Math.max(a, Math.min(b, x));
U.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
U.throttle = (fn, ms) => { let last = 0, t; return (...a) => { const now = Date.now(); if (now - last >= ms) { last = now; fn(...a); } else { clearTimeout(t); t = setTimeout(() => { last = Date.now(); fn(...a); }, ms - (now - last)); } }; };
U.uniq = arr => Array.from(new Set(arr.filter(Boolean)));
U.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
U.fmtNum = n => (n == null || isNaN(n)) ? '–' : Number(n).toLocaleString();
U.fmtCompact = n => { n = Number(n) || 0; if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'; if (n >= 1e4) return Math.round(n / 1e3) + 'k'; if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k'; return String(Math.round(n)); };
U.plural = (n, one, many) => `${U.fmtNum(n)} ${n === 1 ? one : (many || one + 's')}`;
U.pct = x => Math.round((x || 0) * 100) + '%';

// ---- dates ----
U.dayKey = (d = new Date()) => { const dt = d instanceof Date ? d : new Date(d); const y = dt.getFullYear(), m = String(dt.getMonth() + 1).padStart(2, '0'), day = String(dt.getDate()).padStart(2, '0'); return `${y}-${m}-${day}`; };
U.dayFromKey = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
U.addDays = (key, n) => { const d = U.dayFromKey(key); d.setDate(d.getDate() + n); return U.dayKey(d); };
U.fmtDate = (ts, opts) => { if (!ts) return '–'; try { return new Date(ts).toLocaleDateString(undefined, opts || { month: 'short', day: 'numeric', year: 'numeric' }); } catch (e) { return String(ts); } };
U.fmtTime = ts => { try { return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } };
U.relTime = ts => {
  if (!ts) return 'never';
  const diff = Date.now() - ts, m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d} days ago`;
  return U.fmtDate(ts, { month: 'short', day: 'numeric' });
};

// ---- colors for typographic covers ----
const PALETTE = [
  ['#2F5D50', '#F4F1EA'], ['#3B4A6B', '#F4F1EA'], ['#7A3E3E', '#F7EFE6'], ['#5B4B8A', '#F4F1EA'], ['#8A5A2B', '#FBF3E4'],
  ['#2B6777', '#EEF6F5'], ['#6B6B2E', '#F7F5E6'], ['#4A3B2A', '#F2E9DC'], ['#1F3A5F', '#EAF0F7'], ['#7B2D5B', '#F8EEF3'],
];
U.hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
U.hashColor = s => PALETTE[U.hash(String(s || '')) % PALETTE.length];

// ---- environment ----
U.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
U.isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
U.isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
U.isStandalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
U.reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- lazy script loading ----
const scriptCache = {};
U.loadScript = url => scriptCache[url] || (scriptCache[url] = new Promise((res, rej) => {
  const s = document.createElement('script');
  s.src = url; s.async = true; s.crossOrigin = 'anonymous';
  s.onload = () => res();
  s.onerror = () => { delete scriptCache[url]; rej(new Error('Failed to load library: ' + url)); };
  document.head.appendChild(s);
}));

// ---- fetch helpers ----
U.fetchWithTimeout = async (url, opts = {}, timeout = 20000) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try { return await fetch(url, Object.assign({}, opts, { signal: ctrl.signal })); }
  finally { clearTimeout(t); }
};
U.fetchJSON = async (url, opts = {}, timeout = 20000) => {
  const r = await U.fetchWithTimeout(url, opts, timeout);
  if (!r.ok) { let detail = ''; try { detail = (await r.text()).slice(0, 300); } catch (e) {} const err = new Error(`HTTP ${r.status}${detail ? ': ' + detail : ''}`); err.status = r.status; throw err; }
  return r.json();
};

// ---- files & images ----
U.readAsText = file => file.text ? file.text() : new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsText(file); });
U.readAsArrayBuffer = file => file.arrayBuffer ? file.arrayBuffer() : new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsArrayBuffer(file); });
U.blobToDataURL = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
U.dataURLToBlob = async dataURL => (await fetch(dataURL)).blob();
U.loadImage = src => new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error('Image could not be decoded')); img.src = src; });
U.imageToCanvas = async (src, maxDim = 2000) => {
  const isStr = typeof src === 'string';
  const url = isStr ? src : URL.createObjectURL(src);
  try {
    const img = await U.loadImage(url);
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const scale = Math.min(1, maxDim / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(h * scale));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally { if (!isStr) URL.revokeObjectURL(url); }
};
U.resizeToDataURL = async (src, maxDim = 640, quality = 0.82) => (await U.imageToCanvas(src, maxDim)).toDataURL('image/jpeg', quality);
// A document served with a CSP "sandbox" (without allow-same-origin) has an opaque origin: no storage, no downloads.
U.sandboxed = (() => { try { return self.origin === 'null'; } catch (e) { return false; } })();
U.download = (filename, blob) => {
  if (U.sandboxed && F.ui && F.ui.showTextForCopy && blob.type.startsWith('text') || (U.sandboxed && /json/.test(blob.type))) {
    blob.text().then(text => F.ui.showTextForCopy(filename, text));
    return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
};
// Persistent hidden file inputs (one per accept/multiple/capture combination) — more reliable on iOS Safari and for automation.
const pickers = {};
U.pickFiles = (accept, multiple = false, capture = null) => new Promise(res => {
  const key = `${accept}|${multiple ? 1 : 0}|${capture || ''}`;
  let inp = pickers[key];
  if (!inp) {
    inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept || ''; inp.multiple = !!multiple;
    if (capture) inp.setAttribute('capture', capture);
    inp.className = 'sr-only'; inp.tabIndex = -1; inp.setAttribute('aria-hidden', 'true');
    inp.dataset.role = capture ? 'camera-input' : (accept || '').startsWith('image') ? 'photo-input' : (accept || '').includes('json') ? 'backup-input' : 'book-input';
    inp.id = 'picker-' + inp.dataset.role;
    document.body.appendChild(inp);
    pickers[key] = inp;
  }
  inp.onchange = () => { const files = Array.from(inp.files || []); res(files); setTimeout(() => { inp.value = ''; }, 0); };
  inp.value = '';
  inp.click();
});

// ---- DOM helpers ----
U.$ = (sel, root = document) => root.querySelector(sel);
U.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
U.el = (tag, attrs = {}, children = []) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'text') e.textContent = v;
    else if (v === false || v == null) continue;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) { if (c == null) continue; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
  return e;
};
})();
