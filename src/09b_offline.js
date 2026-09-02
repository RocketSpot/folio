/* 09b_offline.js — offline readiness: dependency pack, status checks, connectivity events */
(function(){
'use strict';
const F = window.F;
const U = F.util, S = F.store, C = F.C;
const O = F.offline = {};

const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,600;1,7..72,400&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&display=swap';
O.CORE = [
  { url: C.CDN.PDFJS, label: 'PDF engine' },
  { url: C.CDN.PDFJS_WORKER, label: 'PDF engine worker' },
  { url: C.CDN.JSZIP, label: 'EPUB unpacker' },
  { url: C.CDN.TESSERACT, label: 'Text recognition library' },
  { url: C.CDN.KOKORO, label: 'On-device voice library' },
];
O.voiceUrl = id => `https://huggingface.co/${C.KOKORO_MODEL}/resolve/main/voices/${id}.bin`;
O.online = () => navigator.onLine !== false;
O.swActive = () => !!(navigator.serviceWorker && navigator.serviceWorker.controller);
O.cachesOk = () => { try { return !U.sandboxed && 'caches' in window && typeof caches.keys === 'function'; } catch (e) { return false; } };

async function cachedUrl(url){ try { return !!(await caches.match(url)); } catch (e) { return false; } }
async function anyCached(pred){
  try {
    for (const name of await caches.keys()) {
      const c = await caches.open(name);
      for (const req of await c.keys()) if (pred(req.url, name)) return true;
    }
  } catch (e) {}
  return false;
}

/** What is available offline right now. */
O.status = async () => {
  const st = { online: O.online(), sw: O.swActive(), caches: O.cachesOk(), core: [], coreReady: false, ocr: false, kokoroModel: false, kokoroVoices: 0, fonts: false, packedAt: S.settings.get('offlinePackAt', null), usage: null, quota: null };
  try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); st.usage = e.usage || 0; st.quota = e.quota || 0; } } catch (e) {}
  if (!st.caches) return st;
  for (const item of O.CORE) st.core.push({ label: item.label, ok: await cachedUrl(item.url) });
  st.coreReady = st.core.every(x => x.ok);
  st.ocr = await anyCached(u => /tessdata|tesseract-core|tesseract\.js\/dist\/worker/i.test(u));
  st.kokoroModel = await anyCached((u, name) => /Kokoro-82M[^ ]*\/onnx\/model/i.test(u) || (/transformers/i.test(name) && /\.onnx(\?|$)/i.test(u)));
  let v = 0;
  for (const vv of C.KOKORO_VOICES) if (await anyCached(u => u.includes('/voices/' + vv.id + '.bin'))) v++;
  st.kokoroVoices = v;
  st.fonts = await anyCached(u => /fonts\.gstatic\.com/.test(u));
  return st;
};

/** Download everything the app needs to work without a connection. onProgress({label, percent}) */
O.prepare = async (onProgress = () => {}) => {
  if (!O.cachesOk()) throw new Error('This copy runs inside a sandbox that blocks offline storage. Use the installed site (rocketspot.github.io/folio) instead.');
  if (!O.online()) throw new Error('You are offline right now. Connect once to download the offline pack.');
  if (!O.swActive()) {
    // give a freshly-installed worker a moment to take control
    try { await navigator.serviceWorker.ready; } catch (e) {}
  }
  const warnings = [];
  const N = 5;
  const step = (i, label, sub) => onProgress({ label, percent: (i + (sub || 0)) / N });
  // Write straight into the runtime cache the service worker reads from, so the pack works even before a new
  // worker version has taken control of this tab.
  const rt = await caches.open('folio-runtime-v1');
  const store = async (url) => {
    if (await rt.match(url)) return true;
    let res = null;
    try { res = await fetch(url, { mode: 'cors' }); } catch (e) {}
    if (!res || !(res.ok || res.type === 'opaque')) { try { res = await fetch(url, { mode: 'no-cors' }); } catch (e) { res = null; } }
    if (!res) throw new Error('could not fetch ' + url.split('/').pop());
    await rt.put(url, res);
    return true;
  };

  step(0, 'Downloading the reading and import libraries…');
  await Promise.all(O.CORE.map(item => store(item.url).catch(e => warnings.push(item.label + ': ' + e.message))));
  try {
    // a variant URL avoids the opaque stylesheet the page itself cached; the font files are what matter offline
    const css = await (await fetch(FONT_CSS + '&folio=pack', { mode: 'cors' })).text();
    const urls = U.uniq(Array.from(css.matchAll(/url\((https:[^)]+)\)/g)).map(m => m[1]));
    await Promise.all(urls.slice(0, 48).map(u => store(u).catch(() => null)));
  } catch (e) { warnings.push('Fonts: ' + e.message); }

  step(1, 'Downloading the text-recognition engine and English data…');
  try { await F.ingest.getOCRWorker(S.settings.get('ocrLang', 'eng')); } catch (e) { warnings.push('Text recognition: ' + (e.message || e)); }

  step(2, 'Downloading the on-device voice model…');
  try { await F.tts.loadKokoro((p, got, tot) => step(2, `Downloading the on-device voice model… ${Math.round(p * 100)}%${tot ? ` (${(got / 1e6).toFixed(0)} / ${(tot / 1e6).toFixed(0)} MB)` : ''}`, p)); }
  catch (e) { warnings.push('On-device voice: ' + (e.message || e)); }

  step(3, 'Downloading the voice gallery…');
  let done = 0;
  await Promise.all(C.KOKORO_VOICES.map(v => store(O.voiceUrl(v.id)).catch(e => warnings.push(`Voice ${v.name}: ${e.message}`)).then(() => step(3, `Downloading the voice gallery… ${++done}/${C.KOKORO_VOICES.length}`, done / C.KOKORO_VOICES.length))));

  step(4, 'Checking…');
  await S.settings.set('offlinePackAt', Date.now());
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) {}
  const st = await O.status();
  step(5, 'Offline pack ready.');
  return { warnings, status: st };
};

// ---- connectivity events ----
window.addEventListener('online', () => { F.bus.emit('net', { online: true }); if (F.ui && F.ui.toast) F.ui.toast('Back online.'); });
window.addEventListener('offline', () => { F.bus.emit('net', { online: false }); if (F.ui && F.ui.toast) F.ui.toast('You are offline. Your books and the on-device voice keep working; catalog search and cloud voices need a connection.', { timeout: 7000 }); });
})();
