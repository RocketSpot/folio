/* 07_reader.js — full-screen reader: rendering, pagination, 3D page turns, gestures, karaoke highlight, physical mode */
(function(){
'use strict';
const F = window.F;
const U = F.util, T = F.text, S = F.store, C = F.C;
const R = F.reader = {};
const st = R.state = { open: false, book: null, content: null, chapter: -1, page: 0, pages: 1, mode: 'paged', cols: 1, colW: 0, gap: 0, innerW: 0, pageW: 0, physical: false, turning: false, autoAdvance: true, turnStyle: 'flip', spread: true, pushed: false };
let els = {};
let wordSpans = [];
let activeS = null, activeW = null;
let cal = null, progress = null;
let saveTimer = null, chromeTimer = null;
let physTimer = null, physStart = 0, physAccum = 0, physRunning = false;

// ---------- preferences ----------
const prefs = R.prefs = () => ({
  theme: S.settings.get('theme', 'paper'), font: S.settings.get('font', 'literata'), size: +S.settings.get('fontSize', 19) || 19,
  lineHeight: +S.settings.get('lineHeight', 1.55) || 1.55, margin: +S.settings.get('margin', 28) || 28, mode: S.settings.get('readMode', 'paged'),
  turn: S.settings.get('pageTurn', 'flip'), spread: S.settings.get('spread', true) !== false, autoAdvance: S.settings.get('autoAdvance', true) !== false, justify: !!S.settings.get('justify', false),
});
R.applyPrefs = (relayout = true) => {
  const p = prefs();
  document.documentElement.dataset.theme = p.theme;
  const font = C.FONTS.find(f => f.id === p.font) || C.FONTS[0];
  const rs = document.documentElement.style;
  rs.setProperty('--rd-font', font.css); rs.setProperty('--rd-size', p.size + 'px'); rs.setProperty('--rd-lh', String(p.lineHeight)); rs.setProperty('--rd-margin', p.margin + 'px');
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = ({ paper: '#F4F1EA', sepia: '#EFE4D0', dark: '#141414', night: '#000000' })[p.theme] || '#F4F1EA';
  st.mode = p.mode; st.turnStyle = U.reducedMotion() ? (p.turn === 'none' ? 'none' : 'slide') : p.turn; st.autoAdvance = p.autoAdvance; st.spread = p.spread;
  if (els.flow) els.flow.classList.toggle('justify', p.justify);
  if (els.viewport) els.viewport.classList.toggle('scroll', st.mode === 'scroll');
  if (st.open && !st.physical && relayout) R.relayout(true);
};

// ---------- init ----------
R.init = () => {
  const $ = id => document.getElementById(id);
  els = { root: $('reader'), top: $('rd-top'), bottom: $('rd-bottom'), back: $('rd-back'), title: $('rd-title'), chapter: $('rd-chapter'), toc: $('rd-toc'), aa: $('rd-aa'), more: $('rd-more'), stage: $('rd-stage'), viewport: $('rd-viewport'), flow: $('rd-flow'), turn: $('rd-turn'), physical: $('rd-physical'), range: $('rd-range'), pos: $('rd-pos'), voice: $('rd-voice'), prev: $('rd-prev'), play: $('rd-play'), next: $('rd-next'), sleep: $('rd-sleep'), popover: $('rd-popover'), status: $('rd-status') };
  const I = F.ui.icon;
  els.back.innerHTML = I('back'); els.toc.innerHTML = I('list'); els.aa.innerHTML = I('aa'); els.more.innerHTML = I('more');
  els.prev.innerHTML = I('prev'); els.next.innerHTML = I('next'); els.play.innerHTML = I('play');
  els.back.onclick = () => R.close();
  els.toc.onclick = () => togglePopover('toc'); els.aa.onclick = () => togglePopover('aa'); els.more.onclick = () => togglePopover('more');
  els.voice.onclick = () => togglePopover('voice'); els.sleep.onclick = () => togglePopover('sleep');
  els.play.onclick = () => {
    if (F.tts.isPlaying()) return F.tts.pause();
    const ts = F.tts.state;
    let loc = ts.loc ? Object.assign({ w: Math.max(0, ts.word) }, ts.loc) : null;
    if (!loc || !locVisible(loc)) loc = currentLoc();
    F.tts.play(loc);
  };
  els.prev.onclick = () => F.tts.skip(-1);
  els.next.onclick = () => F.tts.skip(1);
  els.range.addEventListener('input', () => { if (!st.content) return; els.pos.textContent = posText(T.globalToLoc(st.content, rangeG())); });
  els.range.addEventListener('change', () => { if (!st.content) return; const loc = T.globalToLoc(st.content, rangeG()); if (F.tts.isPlaying()) F.tts.seek(loc); else gotoLoc(loc, false); });
  els.viewport.addEventListener('scroll', U.debounce(() => { if (st.mode === 'scroll' && st.open && !st.physical) afterMove(); }, 250));
  setupGestures(); setupKeys();
  F.bus.on('tts', onTtsState); F.bus.on('tts-sentence', onTtsSentence); F.bus.on('tts-word', onTtsWord);
  F.bus.on('tts-ended', () => { if (!st.open) return; F.ui.toast('That was the last sentence. The end.'); saveProgressNow(T.globalToLoc(st.content, st.content.totalWords - 1)); });
  F.bus.on('tts-error', e => F.ui.toast(e.message, { type: 'error', timeout: 6500 }));
  F.bus.on('tts-sleep', () => { F.ui.toast('Sleep timer reached. Paused here for you.'); updateSleepBtn(); });
  F.bus.on('calibration', async e => { if (st.book && e.bookId === st.book.id) { cal = await F.calib.getCal(st.book.id); updatePos(); if (st.physical) renderPhysical(); } });
  const onResize = U.debounce(() => { if (st.open && !st.physical) R.relayout(true); }, 160);
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 250));
};
function rangeG(){ return Math.round(els.range.value / 1000 * Math.max(0, st.content.totalWords - 1)); }

// ---------- open / close ----------
R.open = async (bookId, opts = {}) => {
  if (st.open && st.book && st.book.id === bookId && !opts.loc && !opts.physical) return;
  if (st.open) await R.close(true);
  const book = await S.get('books', bookId);
  const content = await S.get('content', bookId);
  if (!book || !content || !content.chapters.length) { F.ui.toast('That book could not be opened.', { type: 'error' }); return; }
  T.ensureCounts(content);
  st.book = book; st.content = content; st.open = true; st.physical = false; st.page = 0; st.chapter = -1;
  cal = await F.calib.getCal(bookId);
  progress = (await S.get('progress', bookId)) || { bookId, loc: T.firstLoc(), percent: 0 };
  let loc = T.clampLoc(content, opts.loc || progress.loc || T.firstLoc());
  F.tts.load(book, content);
  els.root.hidden = false; document.body.classList.add('reading');
  els.title.textContent = book.title;
  R.applyPrefs(false);
  book.lastOpenedAt = Date.now();
  S.put('books', book).then(() => F.bus.emit('books-changed', { bookId, action: 'opened' }));
  els.voice.innerHTML = `${F.ui.icon('headphones')}<span>${U.esc(F.tts.persona().name)} · ${F.tts.state.speed}×</span>`;
  updateSleepBtn(); updatePlayBtn(F.tts.state);
  if (!opts.fromRoute) { st.pushed = true; location.hash = '#/read/' + bookId; } else st.pushed = false;
  if (opts.physical) { showPhysical(); }
  else {
    els.physical.hidden = true; els.viewport.hidden = false; els.bottom.hidden = false;
    renderChapter(loc.c);
    gotoLoc(loc, false);
    showChrome(true);
    F.analytics.begin(bookId, 'read', { g: T.locToGlobal(content, loc), page: physPage(loc) });
    if (opts.listen) setTimeout(() => F.tts.play(loc), 80);
  }
};
R.openPhysical = (bookId) => R.open(bookId, { physical: true });
R.close = async (silent) => {
  if (!st.open) return;
  F.tts.stop();
  hidePopover();
  if (physRunning) stopPhysicalTimer();
  await F.analytics.end();
  if (!st.physical && st.content) await saveProgressNow();
  st.open = false; st.physical = false;
  els.root.hidden = true; document.body.classList.remove('reading');
  els.flow.innerHTML = ''; wordSpans = []; els.turn.innerHTML = ''; activeS = activeW = null;
  const id = st.book && st.book.id;
  st.book = null; st.content = null;
  F.bus.emit('reader-closed', { bookId: id });
  if (!silent && location.hash.startsWith('#/read/')) { if (st.pushed && history.length > 1) history.back(); else location.hash = '#/library'; }
};

// ---------- rendering & layout ----------
function renderChapter(c){
  st.chapter = c;
  const ch = st.content.chapters[c];
  const parts = [`<h2 class="rd-h">${U.esc(ch.title)}</h2>`];
  ch.paras.forEach((para, p) => {
    const tok = T.tokenize(para);
    const verse = para.includes('\n');
    let html = `<p class="rd-p${verse ? ' verse' : ''}" data-p="${p}">`;
    tok.sentences.forEach((sent, s) => {
      html += `<span class="rd-s" data-s="${s}">`;
      let prevEnd = 0;
      sent.words.forEach((w, wi) => {
        if (wi > 0) html += sent.text.slice(prevEnd, w.start).includes('\n') ? '<br>' : ' ';
        html += `<span class="rd-w" data-w="${wi}">${U.esc(w.text)}</span>`;
        prevEnd = w.start + w.text.length;
      });
      html += '</span>';
      const nx = tok.sentences[s + 1];
      if (nx) html += para.slice(sent.start + sent.text.length, nx.start).includes('\n') ? '<br>' : ' ';
    });
    parts.push(html + '</p>');
  });
  const prevT = c > 0 ? st.content.chapters[c - 1].title : null, nextT = c < st.content.chapters.length - 1 ? st.content.chapters[c + 1].title : null;
  parts.push(`<div class="rd-chapnav">${prevT ? `<button data-nav="prev">← ${U.esc(prevT)}</button>` : '<span></span>'}${nextT ? `<button data-nav="next">${U.esc(nextT)} →</button>` : `<span class="muted">End of book</span>`}</div>`);
  els.flow.innerHTML = parts.join('');
  els.flow.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); if (b.dataset.nav === 'next') nextChapter(); else prevChapter(true); }));
  wordSpans = Array.from(els.flow.querySelectorAll('.rd-w'));
  activeS = activeW = null;
  els.chapter.textContent = ch.title;
  layout();
  if (st.turnStyle !== 'none' && !U.reducedMotion()) { try { els.flow.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' }); } catch (e) {} }
}
function layout(){
  const p = prefs();
  const rect = els.stage.getBoundingClientRect();
  const cs = getComputedStyle(els.viewport);
  const padTop = parseFloat(cs.paddingTop) || 0, padBottom = parseFloat(cs.paddingBottom) || 0;
  if (st.mode === 'scroll') { els.flow.style.cssText = ''; st.pages = 1; st.page = 0; return; }
  const wide = st.spread && rect.width >= 980;
  st.cols = wide ? 2 : 1;
  st.gap = Math.max(56, p.margin * 2 + 8);
  st.innerW = Math.max(200, rect.width - 2 * p.margin);
  st.colW = (st.innerW - st.gap * (st.cols - 1)) / st.cols;
  st.pageW = st.innerW + st.gap;
  const h = Math.max(200, rect.height - padTop - padBottom);
  els.flow.style.cssText = `column-width:${st.colW}px;column-gap:${st.gap}px;column-fill:auto;width:${st.innerW}px;height:${h}px;`;
  const last = els.flow.lastElementChild;
  st.pages = Math.max(1, (last ? pageOfEl(last) : 0) + 1);
  st.page = U.clamp(st.page, 0, st.pages - 1);
  applyTransform(st.page);
}
function applyTransform(k){ els.flow.style.transform = `translate3d(${-k * st.pageW}px,0,0)`; }
function pageOfEl(el){ return Math.max(0, Math.floor((el.offsetLeft + 2) / (st.colW + st.gap) / st.cols)); }
function locOfSpan(span){ const s = span.parentElement, p = s.parentElement; return { c: st.chapter, p: +p.dataset.p, s: +s.dataset.s, w: +span.dataset.w }; }
function spanForLoc(loc){
  if (loc.c !== st.chapter) return null;
  const p = els.flow.querySelector(`.rd-p[data-p="${loc.p}"]`);
  if (!p) return null;
  const s = p.querySelector(`.rd-s[data-s="${loc.s || 0}"]`) || p.querySelector('.rd-s');
  if (!s) return null;
  return s.querySelector(`.rd-w[data-w="${loc.w || 0}"]`) || s.querySelector('.rd-w');
}
function firstSpanOnPage(k){
  let lo = 0, hi = wordSpans.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (pageOfEl(wordSpans[mid]) >= k) { ans = mid; hi = mid - 1; } else lo = mid + 1; }
  return ans >= 0 ? wordSpans[ans] : null;
}
function currentLoc(){
  if (!st.content) return T.firstLoc();
  if (!wordSpans.length) return { c: st.chapter, p: 0, s: 0, w: 0 };
  if (st.mode === 'paged') { const span = firstSpanOnPage(st.page); return span ? locOfSpan(span) : locOfSpan(wordSpans[wordSpans.length - 1]); }
  const top = els.viewport.getBoundingClientRect().top + 6;
  let lo = 0, hi = wordSpans.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (wordSpans[mid].getBoundingClientRect().bottom >= top) { ans = mid; hi = mid - 1; } else lo = mid + 1; }
  return ans >= 0 ? locOfSpan(wordSpans[ans]) : locOfSpan(wordSpans[0]);
}
R.currentLoc = currentLoc;
function locVisible(loc){
  const span = spanForLoc(loc);
  if (!span) return false;
  if (st.mode === 'paged') return pageOfEl(span) === st.page;
  const r = span.getBoundingClientRect(), v = els.viewport.getBoundingClientRect();
  return r.top >= v.top && r.bottom <= v.bottom;
}
R.relayout = (keepLoc) => {
  if (!st.open || st.physical) return;
  const loc = keepLoc ? currentLoc() : null;
  layout();
  if (loc) gotoLoc(loc, false); else afterMove();
};
function gotoLoc(loc, animate){
  loc = T.clampLoc(st.content, loc);
  if (loc.c !== st.chapter) renderChapter(loc.c);
  const span = spanForLoc(loc);
  if (st.mode === 'paged') gotoPage(span ? pageOfEl(span) : 0, animate);
  else {
    if (span) { const v = els.viewport.getBoundingClientRect(), r = span.getBoundingClientRect(); els.viewport.scrollTop += (r.top - v.top) - 10; }
    afterMove();
  }
}
R.gotoLoc = gotoLoc;
function gotoPage(k, animate = true){
  k = U.clamp(k, 0, st.pages - 1);
  if (k === st.page) { afterMove(); return; }
  const dir = k > st.page ? 1 : -1;
  if (!animate || st.turnStyle === 'none' || st.turning) { st.page = k; applyTransform(k); afterMove(); return; }
  if (st.turnStyle === 'slide' || Math.abs(k - st.page) > 1) {
    els.flow.classList.add('sliding'); st.page = k; applyTransform(k);
    setTimeout(() => els.flow.classList.remove('sliding'), 380);
    afterMove(); return;
  }
  const turn = beginTurn(dir, k);
  if (!turn) { st.page = k; applyTransform(k); afterMove(); return; }
  turn.finish();
}
function nextPage(){ if (st.mode !== 'paged') return; if (st.page + 1 < st.pages) gotoPage(st.page + 1); else nextChapter(); }
function prevPage(){ if (st.mode !== 'paged') return; if (st.page > 0) gotoPage(st.page - 1); else prevChapter(true); }
function nextChapter(){ if (st.chapter + 1 >= st.content.chapters.length) { F.ui.toast('You are at the end of the book.'); return; } renderChapter(st.chapter + 1); st.page = 0; applyTransform(0); if (st.mode === 'scroll') els.viewport.scrollTop = 0; afterMove(); }
function prevChapter(toEnd){ if (st.chapter === 0) return; renderChapter(st.chapter - 1); st.page = toEnd && st.mode === 'paged' ? st.pages - 1 : 0; applyTransform(st.page); if (st.mode === 'scroll') els.viewport.scrollTop = toEnd ? els.viewport.scrollHeight : 0; afterMove(); }

// ---------- 3D page turn ----------
function beginTurn(dir, target){
  if (st.turning || st.mode !== 'paged') return null;
  target = target == null ? st.page + dir : target;
  if (target < 0 || target >= st.pages) return null;
  st.turning = true;
  const from = st.page;
  const spread = st.cols === 2;
  const W = els.viewport.getBoundingClientRect().width;
  const halfW = W / 2;
  const sheet = U.el('div', { class: 'rd-sheet' });
  const front = U.el('div', { class: 'rd-face front' }), back = U.el('div', { class: 'rd-face back' });
  const fShade = U.el('div', { class: 'face-shade' }), bShade = U.el('div', { class: 'face-shade' });
  const under = U.el('div', { class: 'rd-under-shade' + (dir < 0 ? ' right' : '') });
  const mkClone = (page, offsetX) => {
    const vp = els.viewport.cloneNode(false);
    vp.removeAttribute('id'); vp.classList.add('rd-vp-clone');
    vp.style.cssText = `position:absolute;top:0;bottom:0;left:${offsetX}px;width:${W}px;`;
    const fl = els.flow.cloneNode(true);
    fl.removeAttribute('id');
    fl.style.transform = `translate3d(${-page * st.pageW}px,0,0)`;
    fl.querySelectorAll('.active').forEach(e => e.classList.remove('active'));
    vp.appendChild(fl);
    return vp;
  };
  let leftCover = null;
  if (spread) {
    sheet.style.left = '50%'; sheet.style.width = '50%';
    front.appendChild(mkClone(dir > 0 ? from : target, -halfW));
    back.appendChild(mkClone(dir > 0 ? target : from, 0));
    if (dir > 0) { leftCover = U.el('div', { class: 'rd-left-cover' }); leftCover.appendChild(mkClone(from, 0)); }
  } else {
    front.appendChild(mkClone(dir > 0 ? from : target, 0));
  }
  front.appendChild(fShade); back.appendChild(bShade);
  sheet.append(front, back);
  els.turn.innerHTML = '';
  if (leftCover) els.turn.appendChild(leftCover);
  els.turn.append(under, sheet);
  if (dir > 0) applyTransform(target);
  sheet.style.transform = `rotateY(${dir > 0 ? 0 : -180}deg)`;
  let done = false, lastT = 0;
  const setProgress = t => {
    t = U.clamp(t, 0, 1); lastT = t;
    sheet.style.transform = `rotateY(${dir > 0 ? -180 * t : -180 * (1 - t)}deg)`;
    const mid = Math.sin(Math.PI * t);
    fShade.style.opacity = String(mid * 0.9); bShade.style.opacity = String(mid * 0.9); under.style.opacity = String(mid * 0.85);
  };
  const cleanup = () => { if (done) return; done = true; els.turn.innerHTML = ''; st.turning = false; };
  const animateTo = (t, onEnd) => {
    sheet.classList.add('animate');
    if (lastT < 0.02 || lastT > 0.98) { [fShade, bShade, under].forEach(e => { e.style.opacity = ''; e.classList.add('pulse'); }); }
    else { [fShade, bShade, under].forEach(e => { e.style.transition = 'opacity .35s ease'; }); requestAnimationFrame(() => [fShade, bShade, under].forEach(e => { e.style.opacity = '0'; })); }
    requestAnimationFrame(() => { sheet.style.transform = `rotateY(${dir > 0 ? -180 * t : -180 * (1 - t)}deg)`; });
    let fired = false;
    const end = () => { if (fired) return; fired = true; onEnd(); };
    sheet.addEventListener('transitionend', end, { once: true });
    setTimeout(end, 760);
  };
  const finish = () => { if (done) return; animateTo(1, () => { st.page = target; applyTransform(target); cleanup(); afterMove(); }); };
  const cancel = () => { if (done) return; animateTo(0, () => { applyTransform(from); cleanup(); }); };
  return { setProgress, finish, cancel, dir, target, from, width: spread ? halfW : W, get lastT(){ return lastT; } };
}

// ---------- gestures & keys ----------
function setupGestures(){
  const stage = els.stage;
  let pid = null, startX = 0, startY = 0, lastX = 0, lastTime = 0, vx = 0, dragging = false, moved = false, turn = null;
  stage.addEventListener('pointerdown', e => {
    if (st.physical || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (!els.popover.hidden) { hidePopover(); pid = null; return; }
    pid = e.pointerId; startX = lastX = e.clientX; startY = e.clientY; lastTime = performance.now(); vx = 0; dragging = false; moved = false; turn = null;
  });
  stage.addEventListener('pointermove', e => {
    if (e.pointerId !== pid) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    const now = performance.now();
    vx = (e.clientX - lastX) / Math.max(1, now - lastTime); lastX = e.clientX; lastTime = now;
    if (!dragging) {
      if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        moved = true;
        if (st.mode !== 'paged') return;
        dragging = true;
        const dir = dx < 0 ? 1 : -1;
        if ((dir > 0 && st.page + 1 >= st.pages) || (dir < 0 && st.page === 0)) { turn = null; return; }
        turn = st.turnStyle === 'flip' ? beginTurn(dir) : null;
        if (turn) { try { stage.setPointerCapture(pid); } catch (err) {} const sel = window.getSelection && window.getSelection(); if (sel) sel.removeAllRanges(); els.flow.style.userSelect = 'none'; }
        else { turn = { simple: true, dir }; }
      } else if (Math.abs(dy) > 14) moved = true;
      return;
    }
    if (turn && !turn.simple) turn.setProgress((turn.dir > 0 ? -dx : dx) / turn.width);
  });
  const finishDrag = e => {
    if (e.pointerId !== pid) return;
    pid = null;
    els.flow.style.userSelect = '';
    if (dragging) {
      const dx = e.clientX - startX;
      if (turn && !turn.simple) { const fling = (turn.dir > 0 ? -vx : vx) > 0.4; if (turn.lastT > 0.32 || fling) turn.finish(); else turn.cancel(); }
      else if (turn && turn.simple && Math.abs(dx) > 50) { if (turn.dir > 0) nextPage(); else prevPage(); }
      else if (!turn && Math.abs(dx) > 60) { if (dx < 0) nextPage(); else prevPage(); }
      turn = null; dragging = false; return;
    }
    if (!moved && e.type === 'pointerup') handleTap(e);
  };
  stage.addEventListener('pointerup', finishDrag);
  stage.addEventListener('pointercancel', finishDrag);
  stage.addEventListener('wheel', U.throttle(e => {
    if (st.mode !== 'paged' || st.physical) return;
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : (e.shiftKey ? e.deltaY : 0);
    if (Math.abs(d) < 24) return;
    if (d > 0) nextPage(); else prevPage();
  }, 500), { passive: true });
}
function handleTap(e){
  const w = e.target && e.target.closest ? e.target.closest('.rd-w') : null;
  if (w && els.flow.contains(w)) { F.tts.seek(locOfSpan(w)); showChrome(true); return; }
  if (e.target && e.target.closest && e.target.closest('.rd-chapnav')) return;
  const rect = els.stage.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  if (st.mode === 'paged' && x < 0.22) return prevPage();
  if (st.mode === 'paged' && x > 0.78) return nextPage();
  toggleChrome();
}
function setupKeys(){
  document.addEventListener('keydown', e => {
    if (!st.open || st.physical) return;
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    if (e.key === 'Escape') { if (!els.popover.hidden) return hidePopover(); return R.close(); }
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) { e.preventDefault(); if (st.mode === 'paged') nextPage(); else els.viewport.scrollBy({ top: els.viewport.clientHeight * 0.85, behavior: 'smooth' }); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) { e.preventDefault(); if (st.mode === 'paged') prevPage(); else els.viewport.scrollBy({ top: -els.viewport.clientHeight * 0.85, behavior: 'smooth' }); }
    else if (e.key === 'k' || e.key === 'p') els.play.click();
    else if (e.key === 'j') F.tts.skip(-1);
    else if (e.key === 'l') F.tts.skip(1);
  });
}

// ---------- chrome ----------
function showChrome(on){ els.root.classList.toggle('chrome-hidden', !on); clearTimeout(chromeTimer); if (on && F.tts.isPlaying()) chromeTimer = setTimeout(() => { if (F.tts.isPlaying() && els.popover.hidden) els.root.classList.add('chrome-hidden'); }, 5000); }
function toggleChrome(){ const hidden = els.root.classList.contains('chrome-hidden'); hidePopover(); showChrome(hidden); }
function showStatus(msg){ els.status.textContent = msg; els.status.hidden = false; }
function hideStatus(){ els.status.hidden = true; }

// ---------- position & progress ----------
function physPage(loc){ if (!cal || !F.calib.hasMapping(cal) || !st.content) return null; return F.calib.globalToPage(cal, T.locToGlobal(st.content, loc), st.content.totalWords); }
function posText(loc){
  const pct = Math.round(T.percent(st.content, loc) * 100);
  const parts = [`${pct}%`];
  if (st.mode === 'paged' && st.pages > 1) parts.push(`${st.page + 1}/${st.pages}`);
  const chWords = T.chapterWords(st.content, loc.c);
  const left = chWords - (T.locToGlobal(st.content, loc) - st.content.chapterOffsets[loc.c]);
  const wpm = S.settings.get('userWpm', 230);
  if (left > 0) parts.push(`${Math.max(1, Math.round(left / wpm))} min left in chapter`);
  const pp = physPage(loc);
  if (pp) parts.push(`paper p. ~${pp}`);
  return parts.join(' · ');
}
function updatePos(loc){
  if (!st.content || st.physical) return;
  loc = loc || currentLoc();
  els.range.value = Math.round(T.percent(st.content, loc) * 1000);
  els.pos.textContent = posText(loc);
}
function afterMove(){
  if (!st.open || st.physical) return;
  const loc = currentLoc();
  updatePos(loc);
  saveProgress(loc);
  F.analytics.touch();
}
function saveProgress(loc, extra){ clearTimeout(saveTimer); saveTimer = setTimeout(() => saveProgressNow(loc, extra), 700); }
async function saveProgressNow(loc, extra){
  if (!st.book || !st.content) return;
  clearTimeout(saveTimer);
  loc = loc || currentLoc();
  const percent = T.percent(st.content, loc);
  progress = Object.assign(progress || { bookId: st.book.id }, { bookId: st.book.id, loc, percent, updatedAt: Date.now() }, extra || {});
  await S.put('progress', progress);
  F.bus.emit('progress', { bookId: st.book.id, progress });
  F.analytics.update({ g: T.locToGlobal(st.content, loc), page: physPage(loc) });
  if (percent >= 0.985 && !st.book.finishedAt) {
    st.book.finishedAt = Date.now();
    await S.put('books', st.book);
    F.bus.emit('books-changed', { bookId: st.book.id, action: 'finished' });
    F.ui.toast('Finished. Nicely done.', { type: 'ok' });
  }
}
R.saveProgressNow = saveProgressNow;

// ---------- TTS sync ----------
function updatePlayBtn(s){
  const I = F.ui.icon;
  els.play.innerHTML = I(s.status === 'playing' || s.status === 'loading' ? 'pause' : 'play');
  els.play.classList.toggle('loading', s.status === 'loading');
  els.play.setAttribute('aria-label', s.status === 'playing' || s.status === 'loading' ? 'Pause' : 'Play');
}
function updateSleepBtn(){
  const s = F.tts.state;
  const I = F.ui.icon;
  let label = 'Sleep';
  if (s.sleepMode === -1) label = 'End of chapter';
  else if (s.sleepAt) label = `${Math.max(1, Math.round((s.sleepAt - Date.now()) / 60000))} min`;
  els.sleep.innerHTML = `${I('moon')}<span>${label}</span>`;
  els.sleep.classList.toggle('on', !!(s.sleepMode));
}
function onTtsState(s){
  updatePlayBtn(s); updateSleepBtn();
  els.voice.innerHTML = `${F.ui.icon('headphones')}<span>${U.esc(F.tts.persona().name)} · ${s.speed}×</span>`;
  if (!st.open || !st.book) return;
  if (s.status === 'loading') showStatus(s.loadingMsg || 'Loading…'); else hideStatus();
  if (s.status === 'playing') { F.analytics.begin(st.book.id, 'listen', { g: s.loc ? T.locToGlobal(st.content, s.loc) : undefined }); showChrome(true); }
  else if (s.status === 'paused' || s.status === 'idle') { if (!st.physical) F.analytics.begin(st.book.id, 'read', { g: T.locToGlobal(st.content, currentLoc()) }); showChrome(true); }
}
function onTtsSentence(loc){
  if (!st.open || st.physical || !st.content) return;
  if (loc.c !== st.chapter) renderChapter(loc.c);
  const sEl = els.flow.querySelector(`.rd-p[data-p="${loc.p}"] > .rd-s[data-s="${loc.s}"]`);
  if (activeS && activeS !== sEl) activeS.classList.remove('active');
  if (sEl) { sEl.classList.add('active'); activeS = sEl; }
  const wEl = spanForLoc(loc);
  if (activeW && activeW !== wEl) activeW.classList.remove('active');
  if (wEl) { wEl.classList.add('active'); activeW = wEl; }
  ensureVisible(wEl || sEl);
  saveProgress(loc);
}
function onTtsWord(loc){
  if (!st.open || st.physical || loc.c !== st.chapter) return;
  const wEl = spanForLoc(loc);
  if (activeW === wEl) return;
  if (activeW) activeW.classList.remove('active');
  if (wEl) { wEl.classList.add('active'); activeW = wEl; if (F.tts.isPlaying()) ensureVisible(wEl); }
}
function ensureVisible(el){
  if (!el) return;
  if (st.mode === 'paged') {
    const pg = pageOfEl(el);
    if (pg !== st.page && !st.turning) { if (F.tts.isPlaying() && !st.autoAdvance) return; gotoPage(pg, true); }
  } else {
    const r = el.getBoundingClientRect(), v = els.viewport.getBoundingClientRect();
    if (r.top < v.top + 24 || r.bottom > v.top + v.height * 0.7) {
      els.viewport.scrollTo({ top: Math.max(0, els.viewport.scrollTop + (r.top - v.top) - v.height * 0.32), behavior: F.tts.isPlaying() ? 'smooth' : 'auto' });
    }
  }
}

// ---------- popovers ----------
function hidePopover(){ els.popover.hidden = true; els.popover.innerHTML = ''; els.popover.dataset.kind = ''; }
function togglePopover(kind){ if (!els.popover.hidden && els.popover.dataset.kind === kind) return hidePopover(); showPopover(kind); }
function showPopover(kind){
  const I = F.ui.icon, esc = U.esc;
  const p = prefs(), ts = F.tts.state;
  const X_persona = () => F.tts.persona();
  let html = '';
  const top = kind === 'toc' || kind === 'aa' || kind === 'more';
  if (kind === 'toc') {
    html = `<h3>Contents</h3><div class="chapters">${st.content.chapters.map((ch, i) => `<button data-act="chapter" data-i="${i}" class="${i === st.chapter ? 'on' : ''}"><span>${esc(ch.title)}</span><span class="cw">${U.fmtCompact(T.chapterWords(st.content, i))} words</span></button>`).join('')}</div>`;
  } else if (kind === 'aa') {
    const seg = (name, opts, cur) => `<div class="segmented" data-seg="${name}">${opts.map(o => `<button data-v="${o.id}" class="${o.id === cur ? 'on' : ''}">${esc(o.name)}</button>`).join('')}</div>`;
    html = `<h3>Display</h3>
      <div class="setting-row"><div class="sl">Theme</div><div class="sc swatches">${C.THEMES.map(t => `<button class="swatch ${t.id === p.theme ? 'on' : ''}" data-act="theme" data-v="${t.id}" data-t="${t.id}" aria-label="${t.name}"></button>`).join('')}</div></div>
      <div class="setting-row"><div class="sl">Font</div><div class="sc"><select class="select" data-act="font">${C.FONTS.map(f => `<option value="${f.id}" ${f.id === p.font ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></div></div>
      <div class="setting-row"><div class="sl">Size</div><div class="sc size-ctl"><button class="small-a" data-act="size" data-v="-1">A</button><span>${p.size}</span><button class="big-a" data-act="size" data-v="1">A</button></div></div>
      <div class="setting-row"><div class="sl">Line spacing</div><div class="sc size-ctl"><button data-act="lh" data-v="-1">−</button><span>${p.lineHeight.toFixed(2)}</span><button data-act="lh" data-v="1">+</button></div></div>
      <div class="setting-row"><div class="sl">Margins</div><div class="sc size-ctl"><button data-act="margin" data-v="-1">−</button><span>${p.margin}</span><button data-act="margin" data-v="1">+</button></div></div>
      <div class="setting-row"><div class="sl">Layout</div><div class="sc">${seg('readMode', [{ id: 'paged', name: 'Pages' }, { id: 'scroll', name: 'Scroll' }], p.mode)}</div></div>
      <div class="setting-row"><div class="sl">Page turn</div><div class="sc">${seg('pageTurn', [{ id: 'flip', name: 'Flip' }, { id: 'slide', name: 'Slide' }, { id: 'none', name: 'None' }], p.turn)}</div></div>
      <div class="setting-row"><div><div class="sl">Two-page spread</div><div class="sd">On wide screens</div></div><div class="sc"><button class="switch ${p.spread ? 'on' : ''}" data-act="toggle" data-k="spread" aria-label="Two-page spread"></button></div></div>
      <div class="setting-row"><div><div class="sl">Follow narration</div><div class="sd">Turn pages as the voice reads</div></div><div class="sc"><button class="switch ${p.autoAdvance ? 'on' : ''}" data-act="toggle" data-k="autoAdvance" aria-label="Follow narration"></button></div></div>
      <div class="setting-row"><div class="sl">Justify text</div><div class="sc"><button class="switch ${p.justify ? 'on' : ''}" data-act="toggle" data-k="justify" aria-label="Justify"></button></div></div>`;
  } else if (kind === 'voice') {
    const provs = Object.keys(F.tts.PROVIDERS);
    const kk = F.tts.kokoroStatus();
    const kName = pe => ts.provider === 'piper' ? F.tts.piperVoiceLabel(F.tts.resolvePiperVoice(pe)) : (C.KOKORO_VOICES.find(v => v.id === (S.settings.get('kokoroVoice:' + pe.id) || pe.kokoroVoice)) || { name: '' }).name;
    const bookLang = F.tts.bookLang();
    html = `<h3>Voice</h3>
      <div class="segmented" data-seg="provider" style="margin-bottom:8px">${provs.map(id => `<button data-v="${id}" class="${ts.provider === id ? 'on' : ''}" ${F.tts.providerReady(id) ? '' : 'disabled title="Set up in Settings"'}>${esc(F.tts.providerShort(id))}</button>`).join('')}</div>
      ${ts.provider === 'kokoro' && !kk.loaded ? `<div class="notice" style="margin-bottom:8px">${kk.loading ? `Downloading the on-device voice model… ${Math.round(kk.progress * 100)}%` : 'First play downloads the on-device voice model once (about 92 MB, or 326 MB on the GPU build). After that it works offline.'}</div>` : ''}
      ${ts.provider === 'kokoro' && bookLang !== 'en' ? `<div class="notice warn" style="margin-bottom:8px">This book is in ${esc(C.LANG_NAMES[bookLang] || bookLang)}; Kokoro voices are English-only. Switch to Piper for an on-device ${esc(C.LANG_NAMES[bookLang] || '')} voice.</div>` : ''}
      ${ts.provider === 'piper' ? `<div class="notice" style="margin-bottom:8px">Reading in ${esc(C.LANG_NAMES[bookLang] || bookLang)} with ${esc(F.tts.piperVoiceLabel(F.tts.resolvePiperVoice(X_persona())))}. ${F.tts.piperStoredCached().includes(F.tts.resolvePiperVoice(X_persona())) ? 'Downloaded.' : 'First play downloads this voice once.'} Change voices per language in Settings.</div>` : ''}
      ${['Narrators', 'Readers'].map(g => `<h3 style="margin-top:12px">${g}</h3>` + C.PERSONAS.filter(pe => (pe.group || 'Narrators') === g).map(pe => `<div class="persona ${pe.id === ts.personaId ? 'on' : ''}" data-act="persona" data-v="${pe.id}"><div><div class="pn">${esc(pe.name)}${(ts.provider === 'kokoro' || (ts.provider === 'piper' && bookLang === 'en')) && kName(pe) ? ` <span class="muted" style="font-weight:500">· ${esc(kName(pe))}</span>` : ''}</div><div class="pt">${esc(pe.tagline)}</div></div>${pe.id === ts.personaId ? `<span class="pv">${I('check')}</span>` : ''}</div>`).join('')).join('')}
      <div class="setting-row" style="border:none"><div class="sl">Speed <span class="muted" id="rd-speed-v">${ts.speed}×</span></div><div class="sc" style="flex:1"><input type="range" min="0.6" max="2.5" step="0.05" value="${ts.speed}" data-act="speed" style="width:100%;accent-color:var(--accent)"></div></div>
      <div class="row between"><button class="btn sm" data-act="preview">${I('play')} Preview voice</button><a class="btn sm ghost" href="#/settings" data-act="settings">Voice settings</a></div>`;
  } else if (kind === 'sleep') {
    html = `<h3>Sleep timer</h3><div class="menu">${C.SLEEP_OPTIONS.map(o => `<button data-act="sleep" data-v="${o.id}">${ts.sleepMode === o.id ? I('check') : '<span style="width:20px"></span>'} ${esc(o.name)}</button>`).join('')}</div>`;
  } else if (kind === 'more') {
    html = `<h3>${esc(st.book.title)}</h3><div class="menu">
      <button data-act="physical">${I('paper')}<span>Paper mode<span class="md">Time a session with your physical copy</span></span></button>
      <button data-act="calibrate">${I('target')}<span>Calibrate with a photo<span class="md">Match a printed page to this text</span></span></button>
      <button data-act="details">${I('book')}<span>Book details<span class="md">Reading Label, chapters, edit</span></span></button>
      <button data-act="close">${I('back')}<span>Back to library</span></button></div>`;
  }
  els.popover.className = 'rd-popover' + (top ? ' top' : '');
  els.popover.dataset.kind = kind;
  els.popover.innerHTML = html;
  els.popover.hidden = false;
  els.popover.onclick = async e => {
    const seg = e.target.closest('[data-seg] button');
    if (seg) {
      const key = seg.parentElement.dataset.seg, v = seg.dataset.v;
      if (key === 'provider') { F.tts.setProvider(v); showPopover('voice'); return; }
      await S.settings.set(key, v); R.applyPrefs(true); showPopover('aa'); return;
    }
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act, v = t.dataset.v;
    if (act === 'chapter') { hidePopover(); const loc = { c: +t.dataset.i, p: 0, s: 0, w: 0 }; if (F.tts.isPlaying()) F.tts.seek(loc); else gotoLoc(loc, false); }
    else if (act === 'theme') { await S.settings.set('theme', v); R.applyPrefs(false); showPopover('aa'); }
    else if (act === 'font') { await S.settings.set('font', t.value); R.applyPrefs(true); }
    else if (act === 'size') { await S.settings.set('fontSize', U.clamp(p.size + (+v) * 1, 13, 34)); R.applyPrefs(true); showPopover('aa'); }
    else if (act === 'lh') { await S.settings.set('lineHeight', U.clamp(Math.round((p.lineHeight + (+v) * 0.1) * 100) / 100, 1.2, 2.2)); R.applyPrefs(true); showPopover('aa'); }
    else if (act === 'margin') { await S.settings.set('margin', U.clamp(p.margin + (+v) * 8, 12, 96)); R.applyPrefs(true); showPopover('aa'); }
    else if (act === 'toggle') { const k = t.dataset.k; await S.settings.set(k, !p[k]); R.applyPrefs(true); showPopover('aa'); }
    else if (act === 'persona') { F.tts.setPersona(v); showPopover('voice'); }
    else if (act === 'preview') { try { await F.tts.preview(F.tts.state.personaId); } catch (err) { F.ui.toast(err.message, { type: 'error' }); } }
    else if (act === 'settings') { hidePopover(); R.close(); }
    else if (act === 'sleep') { F.tts.setSleep(+v); updateSleepBtn(); hidePopover(); F.ui.toast(+v === 0 ? 'Sleep timer off.' : +v === -1 ? 'Pausing at the end of this chapter.' : `Pausing in ${v} minutes.`); }
    else if (act === 'physical') { hidePopover(); showPhysical(); }
    else if (act === 'calibrate') { hidePopover(); F.ui.calibrate(st.book.id, { fromReader: true }); }
    else if (act === 'details') { hidePopover(); F.ui.openBook(st.book.id, { fromReader: true }); }
    else if (act === 'close') { hidePopover(); R.close(); }
  };
  els.popover.onchange = e => { const t = e.target.closest('[data-act]'); if (!t) return; if (t.dataset.act === 'font') { S.settings.set('font', t.value).then(() => R.applyPrefs(true)); } };
  els.popover.oninput = e => { const t = e.target.closest('[data-act="speed"]'); if (t) { F.tts.setSpeed(+t.value); const v = els.popover.querySelector('#rd-speed-v'); if (v) v.textContent = (+t.value).toFixed(2).replace(/0$/, '') + '×'; } };
}

// ---------- physical (paper) mode ----------
function showPhysical(){
  st.physical = true;
  F.tts.stop();
  hidePopover();
  els.viewport.hidden = true; els.bottom.hidden = true; els.physical.hidden = false; els.turn.innerHTML = '';
  els.chapter.textContent = 'Paper mode';
  showChrome(true);
  renderPhysical();
}
function hidePhysical(){
  stopPhysicalTimer();
  st.physical = false;
  els.physical.hidden = true; els.viewport.hidden = false; els.bottom.hidden = false;
  renderChapter(T.clampLoc(st.content, progress.loc || T.firstLoc()).c);
  gotoLoc(progress.loc || T.firstLoc(), false);
  F.analytics.begin(st.book.id, 'read', { g: T.locToGlobal(st.content, progress.loc || T.firstLoc()) });
}
function fmtClock(ms){ const s = Math.floor(ms / 1000); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60; return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0'); }
function renderPhysical(){
  const I = F.ui.icon, esc = U.esc;
  const total = F.calib.estimatedTotalPages(cal, st.content.totalWords);
  const mapped = F.calib.hasMapping(cal);
  const digitalPage = mapped ? F.calib.globalToPage(cal, T.locToGlobal(st.content, progress.loc || T.firstLoc()), st.content.totalWords) : null;
  const page = progress.physicalPage || digitalPage || '';
  const loc = T.clampLoc(st.content, progress.loc || T.firstLoc());
  const info = mapped
    ? `Digital position: ${esc(st.content.chapters[loc.c].title)} · ${Math.round(T.percent(st.content, loc) * 100)}%${total ? ` · about ${total} pages in your edition` : ''}. Quality: ${F.calib.quality(cal)}.`
    : 'No page mapping yet. Calibrate with a photo of a page (or set the total pages in Book details) so check-ins move your digital position too.';
  els.physical.innerHTML = `
    <div><div class="eyebrow">Paper mode</div><div class="ph-title">${esc(st.book.title)}</div><div class="muted">${esc(st.book.author || '')}</div></div>
    <div class="ph-timer ${physRunning ? 'running' : ''}" id="ph-timer">${fmtClock(physAccum + (physRunning ? Date.now() - physStart : 0))}</div>
    <div class="row"><button class="btn primary" id="ph-toggle">${I(physRunning ? 'pause' : 'play')} ${physRunning ? 'Pause timer' : (physAccum ? 'Resume timer' : 'Start timer')}</button><button class="btn" id="ph-end" ${physAccum || physRunning ? '' : 'disabled'}>End session</button></div>
    <div class="card ph-card"><div class="field" style="margin-top:0"><label>Page you're on</label><div class="stepper"><button class="ibtn" id="ph-minus" aria-label="Previous page">−</button><input class="input" id="ph-page" type="number" inputmode="numeric" min="1" value="${page}" placeholder="—"><button class="ibtn" id="ph-plus" aria-label="Next page">+</button></div></div><button class="btn primary" id="ph-checkin">${I('check')} Check in</button><div class="muted small" style="margin-top:10px">${info}</div></div>
    <div class="row"><button class="btn sm" id="ph-calib">${I('target')} Calibrate with a photo</button><button class="btn sm" id="ph-digital">${I('text')} Read this spot on screen</button></div>`;
  const $ = id => els.physical.querySelector('#' + id);
  $('ph-toggle').onclick = () => { if (physRunning) pausePhysicalTimer(); else startPhysicalTimer(); renderPhysical(); };
  $('ph-end').onclick = async () => { const ms = physAccum + (physRunning ? Date.now() - physStart : 0); stopPhysicalTimer(); const s = await F.analytics.end(); F.ui.toast(s ? `Session saved: ${T.formatDuration(ms / 1000)}${s.pages ? ` · ${s.pages} pages` : ''}.` : 'Session was too short to keep.'); renderPhysical(); };
  $('ph-minus').onclick = () => { const i = $('ph-page'); i.value = Math.max(1, (+i.value || 1) - 1); };
  $('ph-plus').onclick = () => { const i = $('ph-page'); i.value = (+i.value || 0) + 1; };
  $('ph-checkin').onclick = () => checkIn(+$('ph-page').value);
  $('ph-calib').onclick = () => F.ui.calibrate(st.book.id, { fromReader: true });
  $('ph-digital').onclick = () => hidePhysical();
}
function startPhysicalTimer(){
  if (physRunning) return;
  physRunning = true; physStart = Date.now();
  F.analytics.begin(st.book.id, 'physical', { page: progress.physicalPage || undefined, g: progress.loc ? T.locToGlobal(st.content, progress.loc) : undefined });
  physTimer = setInterval(() => { const t = els.physical.querySelector('#ph-timer'); if (t) t.textContent = fmtClock(physAccum + Date.now() - physStart); F.analytics.touch(); }, 1000);
}
function pausePhysicalTimer(){ if (!physRunning) return; physAccum += Date.now() - physStart; physRunning = false; clearInterval(physTimer); physTimer = null; }
function stopPhysicalTimer(){ pausePhysicalTimer(); physAccum = 0; }
async function checkIn(page){
  if (!page || page < 1) { F.ui.toast('Enter the page number you are on.', { type: 'error' }); return; }
  const totalWords = st.content.totalWords;
  if (F.calib.hasMapping(cal)) {
    const g = F.calib.pageToGlobal(cal, page, totalWords);
    const loc = T.globalToLoc(st.content, g);
    await saveProgressNow(loc, { physicalPage: page });
    F.analytics.update({ page, g });
    F.ui.toast(`Checked in at page ${page} · ${Math.round(T.percent(st.content, loc) * 100)}% · ${st.content.chapters[loc.c].title}`);
  } else {
    progress = Object.assign(progress || { bookId: st.book.id }, { physicalPage: page, updatedAt: Date.now() });
    if (cal && cal.totalPages) progress.percent = U.clamp(page / cal.totalPages, 0, 1);
    await S.put('progress', progress);
    F.bus.emit('progress', { bookId: st.book.id, progress });
    F.analytics.update({ page });
    F.ui.toast(`Checked in at page ${page}. Add a calibration photo to sync the digital text.`);
  }
  if (!physRunning) startPhysicalTimer();
  renderPhysical();
}
})();
