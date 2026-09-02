/* 08_calibration.js — physical-book calibration: shingle index, OCR-to-edition matching, page <-> position mapping */
(function(){
'use strict';
const F = window.F;
const T = F.text, S = F.store, U = F.util, C = F.C;
const K = F.calib = {};

const SH = 4;                 // words per shingle
const P_MUL = 1e4, C_MUL = 1e8; // packing: c*1e8 + p*1e4 + normalizedWordIndex
const indexCache = new Map();  // bookId -> { index: Map<string, number[]>, normLens: number[][] }

/** Normalized tokens of a paragraph plus a map from normalized index -> {s, w} display locator parts. */
function paraNorm(para){
  const tok = T.tokenize(para);
  const toks = [], map = [];
  tok.sentences.forEach((sent, si) => sent.words.forEach((wd, wi) => {
    const parts = T.normWords(wd.text);
    for (const p of parts) { toks.push(p); map.push({ s: si, w: wi }); }
  }));
  return { toks, map };
}
K.paraNorm = paraNorm;

K.buildIndex = async function(bookId, content, onProgress){
  const cached = indexCache.get(bookId);
  if (cached) return cached;
  const index = new Map();
  const normLens = [];
  let n = 0;
  const total = content.chapters.length;
  for (let c = 0; c < total; c++) {
    const ch = content.chapters[c];
    normLens.push([]);
    for (let p = 0; p < ch.paras.length; p++) {
      const { toks } = paraNorm(ch.paras[p]);
      normLens[c].push(toks.length);
      for (let i = 0; i + SH <= toks.length; i++) {
        const key = toks[i] + ' ' + toks[i + 1] + ' ' + toks[i + 2] + ' ' + toks[i + 3];
        let arr = index.get(key);
        if (!arr) { arr = []; index.set(key, arr); }
        if (arr.length < 64) arr.push(c * C_MUL + p * P_MUL + i);
      }
      n++;
      if (n % 300 === 0) { onProgress && onProgress(c / total); await U.sleep(0); }
    }
  }
  const built = { index, normLens, bookId };
  indexCache.set(bookId, built);
  return built;
};
K.invalidate = bookId => indexCache.delete(bookId);
K.isIndexed = bookId => indexCache.has(bookId);

function unpack(v){
  const c = Math.floor(v / C_MUL);
  const rem = v - c * C_MUL;
  const p = Math.floor(rem / P_MUL);
  return { c, p, nw: rem - p * P_MUL };
}

/** Convert (chapter, paragraph, normalized word index possibly out of range) into a display locator. */
function toLoc(content, normLens, c, p, nw){
  const ch = content.chapters[c];
  const lens = normLens[c];
  while (nw < 0 && p > 0) { p--; nw += lens[p]; }
  while (p < lens.length - 1 && nw >= lens[p]) { nw -= lens[p]; p++; }
  nw = Math.max(0, Math.min(nw, Math.max(0, lens[p] - 1)));
  const { map } = paraNorm(ch.paras[p]);
  const m = map[nw] || { s: 0, w: 0 };
  return { c, p, s: m.s, w: m.w };
}

function snippetAt(content, loc, words = 14){
  const ch = content.chapters[loc.c];
  if (!ch) return '';
  const tok = T.tokenize(ch.paras[loc.p] || '');
  const sent = tok.sentences[loc.s];
  if (!sent) return '';
  const all = [];
  for (let si = loc.s; si < tok.sentences.length && all.length < words; si++) {
    const s = tok.sentences[si];
    const startW = si === loc.s ? loc.w : 0;
    for (let wi = startW; wi < s.words.length && all.length < words; wi++) all.push(s.words[wi].text);
  }
  return all.join(' ') + (all.length >= words ? '…' : '');
}

/**
 * Match OCR (or typed) text against the book. Returns
 * { ok, confidence, loc, endLoc, chapterTitle, snippet, matched, total } or { ok:false, reason }.
 */
K.match = async function(bookId, content, text, onProgress){
  const { index, normLens } = await K.buildIndex(bookId, content, onProgress);
  const toks = T.normWords(text);
  if (toks.length < SH + 2) return { ok: false, reason: 'Not enough readable text. Try a clearer photo or type a longer passage.' };
  const votes = new Map();
  const hits = [];
  let queryShingles = 0;
  for (let i = 0; i + SH <= toks.length; i++) {
    queryShingles++;
    const key = toks[i] + ' ' + toks[i + 1] + ' ' + toks[i + 2] + ' ' + toks[i + 3];
    const arr = index.get(key);
    if (!arr) continue;
    const wgt = 1 / Math.sqrt(arr.length);
    for (const v of arr) { const pos = unpack(v); const k = pos.c + ':' + pos.p; votes.set(k, (votes.get(k) || 0) + wgt); hits.push({ qi: i, c: pos.c, p: pos.p, nw: pos.nw }); }
  }
  if (!hits.length) return { ok: false, reason: 'No matching passage was found in this book. Make sure the photo is from the same book.' };
  let bestK = null, bestV = 0;
  for (const [k, v] of votes) if (v > bestV) { bestV = v; bestK = k; }
  const [bc, bp] = bestK.split(':').map(Number);
  const lens = normLens[bc];
  const paraOffsets = [];
  let acc = 0;
  for (let p = 0; p < lens.length; p++) { paraOffsets.push(acc); acc += lens[p]; }
  const win = hits.filter(h => h.c === bc && Math.abs(h.p - bp) <= 8);
  const offs = win.map(h => (paraOffsets[h.p] + h.nw) - h.qi).sort((a, b) => a - b);
  const med = offs[Math.floor(offs.length / 2)];
  const good = win.filter(h => Math.abs((paraOffsets[h.p] + h.nw) - h.qi - med) <= 15);
  if (!good.length) return { ok: false, reason: 'The match was too weak to trust.' };
  const uniqQ = new Set(good.map(h => h.qi)).size;
  const confidence = Math.min(1, uniqQ / Math.max(1, queryShingles));
  good.sort((a, b) => a.qi - b.qi);
  const first = good[0], last = good[good.length - 1];
  // Anchor to the first/last matched phrase. Unmatched leading or trailing tokens are usually running
  // headers, page numbers or OCR noise, so we only extend by a couple of words at most.
  const lead = Math.min(2, first.qi), tail = Math.min(2, Math.max(0, toks.length - (last.qi + SH)));
  const lensC = normLens[bc];
  const startLoc = toLoc(content, normLens, bc, first.p, Math.max(0, first.nw - lead));
  const endLoc = toLoc(content, normLens, bc, last.p, Math.min(Math.max(0, lensC[last.p] - 1), last.nw + SH - 1 + tail));
  return { ok: true, confidence, loc: startLoc, endLoc, chapterTitle: content.chapters[bc].title, snippet: snippetAt(content, startLoc), matched: uniqQ, total: queryShingles };
};

// ---------- calibration records ----------
K.getCal = async bookId => (await S.get('calibration', bookId)) || { bookId, points: [], totalPages: null };
K.addPoint = async (bookId, content, page, loc, confidence) => {
  const cal = await K.getCal(bookId);
  const g = T.locToGlobal(content, loc);
  cal.points = cal.points.filter(pt => pt.page !== page);
  cal.points.push({ page, g, loc, confidence: confidence == null ? null : Math.round(confidence * 100) / 100, at: Date.now() });
  cal.points.sort((a, b) => a.page - b.page);
  await S.put('calibration', cal);
  F.bus.emit('calibration', { bookId });
  return cal;
};
K.removePoint = async (bookId, page) => {
  const cal = await K.getCal(bookId);
  cal.points = cal.points.filter(pt => pt.page !== page);
  await S.put('calibration', cal);
  F.bus.emit('calibration', { bookId });
  return cal;
};
K.setTotalPages = async (bookId, n) => {
  const cal = await K.getCal(bookId);
  cal.totalPages = n > 0 ? Math.round(n) : null;
  await S.put('calibration', cal);
  F.bus.emit('calibration', { bookId });
  return cal;
};

// ---------- mapping ----------
K.wordsPerPage = (cal, totalWords) => {
  const pts = (cal && cal.points) || [];
  if (pts.length >= 2) {
    const a = pts[0], b = pts[pts.length - 1];
    if (b.page !== a.page && b.g !== a.g) return Math.max(20, (b.g - a.g) / (b.page - a.page));
  }
  if (cal && cal.totalPages && totalWords) return totalWords / cal.totalPages;
  return C.DEFAULT_WPP;
};
K.hasMapping = cal => !!(cal && (cal.points.length || cal.totalPages));
K.pageToGlobal = (cal, page, totalWords) => {
  if (!K.hasMapping(cal)) return null;
  const pts = cal.points;
  const wpp = K.wordsPerPage(cal, totalWords);
  if (!pts.length) return U.clamp(Math.round((page - 1) * wpp), 0, totalWords);
  if (page <= pts[0].page) return U.clamp(Math.round(pts[0].g - (pts[0].page - page) * wpp), 0, totalWords);
  const lastPt = pts[pts.length - 1];
  if (page >= lastPt.page) return U.clamp(Math.round(lastPt.g + (page - lastPt.page) * wpp), 0, totalWords);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (page >= a.page && page <= b.page) { const t = (page - a.page) / (b.page - a.page); return U.clamp(Math.round(a.g + t * (b.g - a.g)), 0, totalWords); }
  }
  return null;
};
K.globalToPage = (cal, g, totalWords) => {
  if (!K.hasMapping(cal)) return null;
  const pts = cal.points;
  const wpp = K.wordsPerPage(cal, totalWords);
  if (!pts.length) return Math.max(1, Math.floor(g / wpp) + 1);
  if (g <= pts[0].g) return Math.max(1, Math.round(pts[0].page - (pts[0].g - g) / wpp));
  const lastPt = pts[pts.length - 1];
  if (g >= lastPt.g) return Math.round(lastPt.page + (g - lastPt.g) / wpp);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (g >= a.g && g <= b.g) { const t = b.g === a.g ? 0 : (g - a.g) / (b.g - a.g); return Math.round(a.page + t * (b.page - a.page)); }
  }
  return null;
};
K.estimatedTotalPages = (cal, totalWords) => {
  if (!cal) return null;
  if (cal.totalPages) return cal.totalPages;
  if (!cal.points.length) return null;
  return Math.max(cal.points[cal.points.length - 1].page, K.globalToPage(cal, totalWords, totalWords) || 0);
};
K.quality = cal => !cal || (!cal.points.length && !cal.totalPages) ? 'none' : cal.points.length >= 2 ? 'good' : cal.points.length === 1 ? 'rough' : 'estimate';
})();
