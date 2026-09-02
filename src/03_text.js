/* 03_text.js — tokenizer, canonical locators, normalization, readability, plain-text (Gutenberg-aware) parser */
(function(){
'use strict';
const F = window.F = window.F || {};
const T = F.text = {};

const ABBREV = new Set(('mr mrs ms dr prof sr jr st mt vs etc no col gen lt capt sgt rev hon esq inc ltd co fig vol ch pp ed eds approx dept est ' +
  'jan feb mar apr jun jul aug sep sept oct nov dec messrs mme mlle bros hon rt viz cf ibid op').split(' '));
const TERM = '.!?…';
const CLOSERS = '"\'”’)]»';
const OPENERS = '"\'“‘([«';

function wordBefore(str, idx){
  let j = idx - 1;
  while (j >= 0 && /[A-Za-z]/.test(str[j])) j--;
  return str.slice(j + 1, idx);
}

/** Split a paragraph into sentences: [{text, start}] where start is the char offset in the paragraph. */
T.splitSentences = function(p){
  const out = [];
  const n = p.length;
  let start = 0, i = 0;
  while (i < n) {
    const ch = p[i];
    if (TERM.includes(ch)) {
      let j = i;
      while (j < n && TERM.includes(p[j])) j++;
      while (j < n && CLOSERS.includes(p[j])) j++;
      if (j >= n) break;
      if (/\s/.test(p[j])) {
        let k = j;
        while (k < n && /\s/.test(p[k])) k++;
        if (k >= n) break;
        const next = p[k];
        const prev = wordBefore(p, i);
        const abbrev = ch === '.' && (ABBREV.has(prev.toLowerCase()) || /^[A-Z]$/.test(prev));
        const startsOk = ch === '.' ? (/[A-Z0-9]/.test(next) || OPENERS.includes(next)) : !/[a-z]/.test(next);
        if (!abbrev && startsOk) { out.push({ text: p.slice(start, k), start }); start = k; }
        i = k;
        continue;
      }
      i = j;
      continue;
    }
    i++;
  }
  if (start < n) out.push({ text: p.slice(start), start });
  return out.map(s => ({ text: s.text.replace(/\s+$/, ''), start: s.start })).filter(s => s.text.length);
};

/** Split a sentence into words: [{text, start}] (start relative to the sentence). */
T.splitWords = function(s){
  const out = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(s))) out.push({ text: m[0], start: m.index });
  return out;
};

T.countWords = function(text){
  const m = text.match(/\S+/g);
  return m ? m.length : 0;
};

// Tokenization cache (paragraph text -> {sentences:[{text,start,words,wordStart}], wordCount})
const tokCache = new Map();
const TOK_MAX = 600;
T.tokenize = function(paraText){
  let v = tokCache.get(paraText);
  if (v) return v;
  const sentences = T.splitSentences(paraText).map(s => ({ text: s.text, start: s.start, words: T.splitWords(s.text) }));
  let wc = 0;
  for (const s of sentences) { s.wordStart = wc; wc += s.words.length; }
  v = { sentences, wordCount: wc };
  if (tokCache.size >= TOK_MAX) tokCache.delete(tokCache.keys().next().value);
  tokCache.set(paraText, v);
  return v;
};

/** Normalize text for fuzzy matching (OCR vs edition): lowercase, ascii-fold, strip punctuation. */
T.normalize = function(s){
  return String(s || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[‘’‚‛`´]/g, "'")
    .replace(/[“”„‟«»]/g, '"')
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .replace(/['-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};
T.normWords = s => T.normalize(s).split(' ').filter(Boolean);

// ---- canonical locators: {c: chapter, p: paragraph, s: sentence, w: word} ----
const prefixCache = new WeakMap();
function prefix(ch){
  let a = prefixCache.get(ch);
  if (a) return a;
  if (!ch.pwc || ch.pwc.length !== ch.paras.length) ch.pwc = ch.paras.map(T.countWords);
  a = new Array(ch.paras.length + 1);
  a[0] = 0;
  for (let i = 0; i < ch.paras.length; i++) a[i + 1] = a[i] + ch.pwc[i];
  prefixCache.set(ch, a);
  return a;
}
T.ensureCounts = function(content){
  let total = 0;
  content.chapterOffsets = [];
  for (const ch of content.chapters) {
    content.chapterOffsets.push(total);
    total += prefix(ch)[ch.paras.length];
  }
  content.totalWords = total;
  return content;
};
T.chapterWords = (content, c) => { const ch = content.chapters[c]; return ch ? prefix(ch)[ch.paras.length] : 0; };
T.firstLoc = () => ({ c: 0, p: 0, s: 0, w: 0 });
T.locKey = loc => `${loc.c}.${loc.p}.${loc.s}.${loc.w}`;
T.parseKey = k => { const a = String(k).split('.').map(Number); return { c: a[0] || 0, p: a[1] || 0, s: a[2] || 0, w: a[3] || 0 }; };
T.compare = (a, b) => (a.c - b.c) || (a.p - b.p) || ((a.s || 0) - (b.s || 0)) || ((a.w || 0) - (b.w || 0));
T.sameSentence = (a, b) => a && b && a.c === b.c && a.p === b.p && (a.s || 0) === (b.s || 0);

T.clampLoc = function(content, loc){
  const chs = content.chapters;
  if (!chs.length) return T.firstLoc();
  let c = Math.max(0, Math.min(loc.c || 0, chs.length - 1));
  // skip empty chapters forward
  while (c < chs.length - 1 && !chs[c].paras.length) c++;
  const ch = chs[c];
  if (!ch.paras.length) return { c, p: 0, s: 0, w: 0 };
  const p = Math.max(0, Math.min(loc.p || 0, ch.paras.length - 1));
  const tok = T.tokenize(ch.paras[p]);
  const s = Math.max(0, Math.min(loc.s || 0, Math.max(0, tok.sentences.length - 1)));
  const sent = tok.sentences[s];
  const w = sent ? Math.max(0, Math.min(loc.w || 0, Math.max(0, sent.words.length - 1))) : 0;
  return { c, p, s, w };
};

T.locToGlobal = function(content, loc){
  if (!content.chapterOffsets) T.ensureCounts(content);
  const ch = content.chapters[loc.c];
  if (!ch) return content.totalWords;
  const pre = prefix(ch);
  if (!ch.paras.length) return content.chapterOffsets[loc.c];
  const p = Math.max(0, Math.min(loc.p || 0, ch.paras.length - 1));
  let g = content.chapterOffsets[loc.c] + pre[p];
  const tok = T.tokenize(ch.paras[p]);
  const sent = tok.sentences[Math.min(loc.s || 0, Math.max(0, tok.sentences.length - 1))];
  if (sent) g += sent.wordStart + Math.min(loc.w || 0, Math.max(0, sent.words.length - 1));
  return g;
};

T.globalToLoc = function(content, g){
  if (!content.chapterOffsets) T.ensureCounts(content);
  const chs = content.chapters;
  if (!chs.length) return T.firstLoc();
  g = Math.max(0, Math.min(g, Math.max(0, content.totalWords - 1)));
  let c = 0;
  for (let i = 0; i < chs.length; i++) {
    if (content.chapterOffsets[i] <= g && T.chapterWords(content, i) > 0) c = i;
    if (content.chapterOffsets[i] > g) break;
  }
  const ch = chs[c];
  const pre = prefix(ch);
  let local = g - content.chapterOffsets[c];
  // binary search paragraph
  let lo = 0, hi = ch.paras.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (pre[mid] <= local) lo = mid; else hi = mid - 1; }
  const p = lo;
  local -= pre[p];
  const tok = T.tokenize(ch.paras[p] || '');
  let s = 0;
  for (let i = 0; i < tok.sentences.length; i++) { if (tok.sentences[i].wordStart <= local) s = i; else break; }
  const sent = tok.sentences[s];
  const w = sent ? Math.max(0, Math.min(local - sent.wordStart, sent.words.length - 1)) : 0;
  return { c, p, s, w };
};

T.percent = function(content, loc){
  if (!content.chapterOffsets) T.ensureCounts(content);
  if (!content.totalWords) return 0;
  return Math.min(1, T.locToGlobal(content, loc) / content.totalWords);
};

/** Next sentence locator (crossing paragraphs/chapters), or null at end. */
T.nextSentence = function(content, loc){
  const chs = content.chapters;
  let { c, p, s } = loc;
  let ch = chs[c];
  if (!ch) return null;
  if (ch.paras[p] !== undefined) {
    const tok = T.tokenize(ch.paras[p]);
    if (s + 1 < tok.sentences.length) return { c, p, s: s + 1, w: 0 };
  }
  p += 1;
  while (c < chs.length) {
    ch = chs[c];
    while (p < ch.paras.length) {
      if (T.tokenize(ch.paras[p]).sentences.length) return { c, p, s: 0, w: 0 };
      p++;
    }
    c += 1; p = 0;
  }
  return null;
};
T.prevSentence = function(content, loc){
  const chs = content.chapters;
  let { c, p, s } = loc;
  if (s > 0) return { c, p, s: s - 1, w: 0 };
  p -= 1;
  while (c >= 0) {
    const ch = chs[c];
    while (p >= 0) {
      const tok = T.tokenize(ch.paras[p]);
      if (tok.sentences.length) return { c, p, s: tok.sentences.length - 1, w: 0 };
      p--;
    }
    c -= 1;
    if (c >= 0) p = chs[c].paras.length - 1;
  }
  return null;
};
T.sentenceAt = function(content, loc){
  const ch = content.chapters[loc.c];
  if (!ch || ch.paras[loc.p] === undefined) return null;
  const tok = T.tokenize(ch.paras[loc.p]);
  return tok.sentences[loc.s] || null;
};
T.paragraphStart = loc => ({ c: loc.c, p: loc.p, s: 0, w: 0 });
T.nextParagraph = function(content, loc){
  const chs = content.chapters;
  let { c, p } = loc; p += 1;
  while (c < chs.length) { if (p < chs[c].paras.length) return { c, p, s: 0, w: 0 }; c++; p = 0; }
  return null;
};
T.prevParagraph = function(content, loc){
  const chs = content.chapters;
  let { c, p } = loc; p -= 1;
  while (c >= 0) { if (p >= 0) return { c, p, s: 0, w: 0 }; c--; if (c >= 0) p = chs[c].paras.length - 1; }
  return null;
};

// ---- readability ----
T.syllables = function(word){
  let w = String(word).toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const m = w.match(/[aeiouy]{1,2}/g);
  return m ? Math.max(1, m.length) : 1;
};
function round(x, d = 0){ const k = Math.pow(10, d); return Math.round(x * k) / k; }
T.readability = function(content){
  const paras = [];
  for (const ch of content.chapters) for (const p of ch.paras) paras.push(p);
  if (!paras.length) return null;
  const step = Math.max(1, Math.floor(paras.length / 150));
  let words = 0, sentences = 0, syll = 0, dialog = 0, longWords = 0;
  for (let i = 0; i < paras.length && words < 5000; i += step) {
    const tok = T.tokenize(paras[i]);
    for (const s of tok.sentences) {
      sentences++;
      if (/["“”]/.test(s.text)) dialog++;
      for (const w of s.words) { words++; const sy = T.syllables(w.text); syll += sy; if (sy >= 3) longWords++; }
    }
  }
  if (!words || !sentences) return null;
  const wps = words / sentences, spw = syll / words;
  const flesch = 206.835 - 1.015 * wps - 84.6 * spw;
  const grade = 0.39 * wps + 11.8 * spw - 15.59;
  return {
    flesch: round(flesch), grade: round(Math.max(0, grade), 1),
    wordsPerSentence: round(wps, 1), syllablesPerWord: round(spw, 2),
    dialogueShare: round(dialog / sentences, 3), longWordShare: round(longWords / words, 3),
    band: flesch >= 70 ? 'Light' : flesch >= 50 ? 'Moderate' : 'Dense',
  };
};

// ---- plain text parsing (Gutenberg-aware) ----
/** Remove Gutenberg-style _italic_ markers while keeping the words. */
function stripItalics(s){
  return String(s).replace(/_+([^_\n]+?)_+/g, '$1').replace(/(^|\s)_+(?=\S)/g, '$1').replace(/_+(?=\s|$)/g, '');
}
T.stripItalics = stripItalics;
const HEAD_RE = /^(chapter|book|part|canto|letter|section|act|scene|stave|prologue|epilogue|introduction|preface|foreword|afterword|appendix|contents|dedication|volume|conclusion|postscript)\b/i;
const ROMAN_RE = /^[IVXLC]+\.?$/;
const NUM_RE = /^\d{1,3}\.?$/;
function isAllCaps(s){
  const letters = s.replace(/[^A-Za-z]/g, '');
  return letters.length >= 3 && letters === letters.toUpperCase();
}
function classifyBlock(b){
  const rawLines = b.split('\n');
  const lines = rawLines.map(l => l.replace(/\s+$/, '')).filter(l => l.trim().length);
  const trimmed = lines.map(l => l.trim());
  if (!trimmed.length) return null;
  const joined = trimmed.join(' ').replace(/\s+/g, ' ').trim();
  if (/^\[illustration/i.test(joined) && /\]$/.test(joined)) return { kind: 'illustration', text: joined };
  const words = T.countWords(joined);
  // TOC block: several lines that look like chapter entries
  if (trimmed.length >= 3) {
    const tocish = trimmed.filter(l => HEAD_RE.test(l) || /^[IVXLC]+\.?\s/.test(l) || /^\d{1,3}\.?\s/.test(l)).length;
    if (tocish / trimmed.length >= 0.6) return { kind: 'toc', text: joined };
  }
  if (trimmed.length <= 3 && joined.length <= 90 && words <= 12) {
    if (HEAD_RE.test(trimmed[0]) || ROMAN_RE.test(trimmed[0]) || NUM_RE.test(trimmed[0]) || (isAllCaps(joined) && !/[.!?]$/.test(joined))) {
      return { kind: 'heading', text: joined };
    }
  }
  if (trimmed.length >= 2) {
    const short = trimmed.filter(l => l.length < 55).length;
    const avg = trimmed.reduce((a, l) => a + l.length, 0) / trimmed.length;
    const indented = rawLines.filter(l => /^\s{2,}\S/.test(l)).length;
    if ((short / trimmed.length >= 0.75 && avg < 46) || indented / rawLines.length >= 0.6) {
      return { kind: 'verse', text: trimmed.join('\n') };
    }
  }
  return { kind: 'para', text: joined.replace(/\[illustration[^\]]*\]/ig, '').replace(/\s+/g, ' ').trim() };
}
T.classifyBlock = classifyBlock;

T.parsePlainText = function(raw, hints = {}){
  let text = String(raw || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').replace(/^\ufeff/, '').replace(/\f/g, '\n\n');
  const meta = { title: hints.title || '', author: hints.author || '', language: hints.language || '' };
  const startM = text.match(/^\*{3}\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*$/im);
  if (startM) {
    const head = text.slice(0, startM.index);
    const t = head.match(/^Title:\s*(.+)$/m), a = head.match(/^Author:\s*(.+)$/m), l = head.match(/^Language:\s*(.+)$/m);
    if (t && !meta.title) meta.title = t[1].trim();
    if (a && !meta.author) meta.author = a[1].trim();
    if (l && !meta.language) meta.language = l[1].trim();
    text = text.slice(startM.index + startM[0].length);
  }
  const endM = text.match(/^\*{3}\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*$/im);
  if (endM) text = text.slice(0, endM.index);

  const blocks = text.split(/\n[ \t]*\n+/).map(b => b.replace(/^\n+|\n+$/g, '')).filter(b => b.trim().length);
  const items = blocks.map(classifyBlock).filter(Boolean);

  // collapse runs of >= 3 consecutive headings (a table of contents laid out with blank lines)
  for (let i = 0; i < items.length; i++) {
    if (items[i].kind !== 'heading') continue;
    let j = i;
    while (j < items.length && items[j].kind === 'heading') j++;
    if (j - i >= 4) for (let k = i; k < j; k++) items[k].kind = 'toc';
    i = j;
  }

  const chapters = [];
  let cur = { title: '', paras: [] };
  for (const it of items) {
    if (it.kind === 'illustration' || it.kind === 'toc') continue;
    if (it.kind === 'heading') {
      if (cur.paras.length || cur.title) chapters.push(cur);
      cur = { title: it.text, paras: [] };
      continue;
    }
    if (it.text) cur.paras.push(it.text);
  }
  if (cur.paras.length || cur.title) chapters.push(cur);

  // guess title/author from the front block
  const front = chapters[0];
  if (front && !front.title) {
    const firstWords = front.paras.reduce((a, p) => a + T.countWords(p), 0);
    if (!meta.title && front.paras[0] && front.paras[0].length < 80) meta.title = front.paras[0].replace(/\s+/g, ' ').trim();
    const by = front.paras.find(p => /^by\s+\S/i.test(p) && p.length < 60);
    if (by && !meta.author) meta.author = by.replace(/^by\s+/i, '').trim();
    if (firstWords < 40 && chapters.length > 1) chapters.shift();
    else front.title = 'Front matter';
  }
  // merge empty headings: "BOOK ONE" + "CHAPTER I" -> "BOOK ONE · CHAPTER I"; drop other empty ones
  const merged = [];
  let carry = '';
  for (const ch of chapters) {
    if (!ch.paras.length) {
      if (/^(book|part|volume|act)\b/i.test(ch.title)) carry = carry ? carry + ' · ' + ch.title : ch.title;
      continue;
    }
    if (carry) { ch.title = ch.title ? carry + ' · ' + ch.title : carry; carry = ''; }
    merged.push(ch);
  }
  if (!merged.length && text.trim()) merged.push({ title: meta.title || 'Text', paras: [text.replace(/\s+/g, ' ').trim()] });
  merged.forEach((ch, i) => { if (!ch.title) ch.title = 'Section ' + (i + 1); ch.title = stripItalics(ch.title); ch.paras = ch.paras.map(stripItalics); ch.pwc = ch.paras.map(T.countWords); });
  return { title: meta.title, author: meta.author, language: meta.language, chapters: merged };
};

/** Turn heading-aware paragraph list [{text, heading:boolean}] into chapters (used by EPUB/PDF importers). */
T.chaptersFromBlocks = function(blocks, fallbackTitle){
  const chapters = [];
  let cur = { title: '', paras: [] };
  for (const b of blocks) {
    if (b.heading) {
      if (cur.paras.length || cur.title) chapters.push(cur);
      cur = { title: b.text, paras: [] };
    } else if (b.text && b.text.trim()) cur.paras.push(b.text.trim());
  }
  if (cur.paras.length || cur.title) chapters.push(cur);
  const out = [];
  let carry = '';
  for (const ch of chapters) {
    if (!ch.paras.length) { carry = carry ? carry + ' · ' + ch.title : ch.title; continue; }
    if (carry) { ch.title = ch.title ? carry + ' · ' + ch.title : carry; carry = ''; }
    out.push(ch);
  }
  out.forEach((ch, i) => { if (!ch.title) ch.title = i === 0 ? (fallbackTitle || 'Section 1') : 'Section ' + (i + 1); ch.pwc = ch.paras.map(T.countWords); });
  return out;
};

T.formatDuration = function(sec){
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
};
T.formatMinutes = function(min){
  min = Math.round(min);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};
T.readingTime = (words, wpm = 230) => words / Math.max(60, wpm); // minutes
})();
