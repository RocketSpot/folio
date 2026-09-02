/* 10_ui.js — views (Library, Discover, Insights, Settings), modals, toasts, import and calibration flows */
(function(){
'use strict';
const F = window.F;
const U = F.util, T = F.text, S = F.store, C = F.C;
const UI = F.ui = {};
const esc = U.esc;

// ---------- icons ----------
const ICONS = {
  library: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3h2A1.5 1.5 0 0 1 9 4.5v15A1.5 1.5 0 0 1 7.5 21h-2A1.5 1.5 0 0 1 4 19.5z"/><path d="M10 4.5A1.5 1.5 0 0 1 11.5 3h2A1.5 1.5 0 0 1 15 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-2A1.5 1.5 0 0 1 10 19.5z"/><path d="m16.2 5.4 1.9-.5a1.5 1.5 0 0 1 1.8 1.1l3 11.6a1.5 1.5 0 0 1-1.1 1.8l-1.9.5a1.5 1.5 0 0 1-1.8-1.1l-3-11.6a1.5 1.5 0 0 1 1.1-1.8z"/>',
  discover: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  insights: '<path d="M4 20v-8"/><path d="M10 20V4"/><path d="M16 20v-6"/><path d="M22 20H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="m4.9 4.9 2.1 2.1"/><path d="m17 17 2.1 2.1"/><path d="M2 12h3"/><path d="M19 12h3"/><path d="m4.9 19.1 2.1-2.1"/><path d="m17 7 2.1-2.1"/>',
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>',
  prev: '<path d="M11 19 3 12l8-7"/><path d="m21 19-8-7 8-7"/>',
  next: '<path d="m13 5 8 7-8 7"/><path d="m3 5 8 7-8 7"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  moon: '<path d="M21 13.5A8.5 8.5 0 0 1 10.5 3a7 7 0 1 0 10.5 10.5z"/>',
  list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  more: '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 20h16"/>',
  camera: '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2l1.3-2h6l1.3 2h1.2A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.5"/>',
  close: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  headphones: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="5" height="7" rx="2"/><rect x="16" y="14" width="5" height="7" rx="2"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 19a2 2 0 0 1 2-2h14"/>',
  edit: '<path d="M12 20h9"/><path d="m16.5 3.5 4 4L8 20H4v-4z"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v3"/><path d="M12 18v3"/><path d="M3 12h3"/><path d="M18 12h3"/>',
  paper: '<path d="M6 3h9l5 5v13H6z"/><path d="M15 3v5h5"/><path d="M9 13h6"/><path d="M9 17h6"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  download: '<path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/>',
  flame: '<path d="M12 22c4.4 0 7-2.8 7-7 0-3-2-5.5-3-7-1 2-2 3-3 3 .5-3-1-6-4-8 .5 3-1 5-3 7-1.5 1.5-2 3-2 5 0 4.2 3.6 7 8 7z"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M9 2h6"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  text: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h10"/>',
  type: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
};
UI.icon = (name, cls = '') => name === 'aa' ? `<span class="${cls}" style="font-family:var(--serif);font-weight:600;font-size:17px;line-height:1">Aa</span>` : `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
const I = UI.icon;

// ---------- toasts & modals ----------
UI.toast = (msg, { type = '', timeout = 3800, action, onAction } = {}) => {
  const root = document.getElementById('toast-root');
  const el = U.el('div', { class: `toast ${type}` }, [U.el('span', { text: msg })]);
  if (action) el.append(U.el('button', { text: action, onClick: () => { onAction && onAction(); el.remove(); } }));
  root.appendChild(el);
  while (root.children.length > 3) root.firstChild.remove();
  if (timeout) setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 320); }, timeout);
  return el;
};
UI.modal = ({ title, sub, body, actions = [], wide = false, onClose, closable = true }) => {
  const root = document.getElementById('modal-root');
  const back = U.el('div', { class: 'modal-back' });
  const box = U.el('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' });
  const head = U.el('div', { class: 'modal-head' });
  const titles = U.el('div');
  if (title) titles.append(U.el('div', { class: 'modal-title', text: title }));
  if (sub) titles.append(U.el('div', { class: 'modal-sub', html: sub }));
  head.append(titles);
  if (closable) head.append(U.el('button', { class: 'ibtn', 'aria-label': 'Close', html: I('close'), onClick: () => handle.close() }));
  box.append(head);
  const bodyEl = U.el('div', { class: 'modal-body' });
  if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.append(body);
  box.append(bodyEl);
  if (actions.length) {
    const actEl = U.el('div', { class: 'modal-actions' });
    actions.forEach(a => actEl.append(U.el('button', { class: 'btn ' + (a.primary ? 'primary' : a.danger ? 'danger' : ''), text: a.label, onClick: async () => { const r = a.onClick ? await a.onClick(handle) : undefined; if (r !== false && !a.keepOpen) handle.close(); } })));
    box.append(actEl);
  }
  back.append(box); root.append(back);
  const onKey = e => { if (e.key === 'Escape' && closable) handle.close(); };
  document.addEventListener('keydown', onKey);
  if (closable) back.addEventListener('pointerdown', e => { if (e.target === back) handle.close(); });
  const handle = {
    el: box, body: bodyEl, back,
    close(){ if (!back.isConnected) return; back.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); },
    setBody(html){ if (typeof html === 'string') bodyEl.innerHTML = html; else { bodyEl.innerHTML = ''; bodyEl.append(html); } },
    setTitle(t){ const te = box.querySelector('.modal-title'); if (te) te.textContent = t; },
  };
  return handle;
};
UI.confirm = (title, text, { okLabel = 'Confirm', danger = false } = {}) => new Promise(res => {
  let decided = false;
  UI.modal({ title, body: `<p>${esc(text)}</p>`, actions: [{ label: 'Cancel', onClick: () => { decided = true; res(false); } }, { label: okLabel, primary: !danger, danger, onClick: () => { decided = true; res(true); } }], onClose: () => { if (!decided) res(false); } });
});
UI.prompt = (title, { label, value = '', placeholder = '', multiline = false, okLabel = 'Save' } = {}) => new Promise(res => {
  let decided = false;
  const inp = multiline ? U.el('textarea', { class: 'input', placeholder }) : U.el('input', { class: 'input', placeholder, value });
  if (multiline) inp.value = value;
  const body = U.el('div', { class: 'field' }, [label ? U.el('label', { text: label }) : null, inp]);
  UI.modal({ title, body, actions: [{ label: 'Cancel', onClick: () => { decided = true; res(null); } }, { label: okLabel, primary: true, onClick: () => { decided = true; res(inp.value); } }], onClose: () => { if (!decided) res(null); } });
  setTimeout(() => inp.focus(), 50);
});
UI.showTextForCopy = (filename, text) => {
  const ta = U.el('textarea', { class: 'input', style: { minHeight: '220px', fontFamily: 'ui-monospace, monospace', fontSize: '12px' } });
  ta.value = text;
  const body = U.el('div', {}, [U.el('div', { class: 'notice warn', style: { marginBottom: '10px' }, html: `Downloads are blocked in this sandboxed copy, so here is <b>${esc(filename)}</b> as text. Copy it and save it as a file.` }), ta]);
  UI.modal({ title: 'Your backup', body, actions: [{ label: 'Close' }, { label: 'Copy to clipboard', primary: true, keepOpen: true, onClick: async () => { try { await navigator.clipboard.writeText(text); UI.toast('Copied.', { type: 'ok' }); } catch (e) { ta.focus(); ta.select(); UI.toast('Select the text and copy it manually.', { type: 'error' }); } } }] });
};
UI.progressModal = (title) => {
  const body = U.el('div', { class: 'progress-box', html: `<div class="spinner"></div><div class="pm">Starting…</div><div class="ps"></div><div class="pbar lg" style="margin-top:12px"><i style="width:0%"></i></div>` });
  const m = UI.modal({ title, body, closable: false });
  return {
    update(p){
      if (!p) return;
      if (p.message) body.querySelector('.pm').textContent = p.message;
      body.querySelector('.ps').textContent = p.stage === 'ocr' ? 'On-device text recognition runs page by page; a long scan can take a few minutes.' : p.stage === 'downloading' ? 'Fetching from the Internet Archive.' : p.stage === 'warn' ? (p.message || '') : '';
      if (typeof p.percent === 'number') body.querySelector('.pbar i').style.width = Math.round(U.clamp(p.percent, 0, 1) * 100) + '%';
    },
    setTitle: t => m.setTitle(t),
    close: () => m.close(),
  };
};

// ---------- helpers ----------
function coverHTML(b, cls = ''){
  const src = b.cover || b.coverUrl;
  const fmt = cls.includes('sm') ? '' : `<span class="fmt">${esc((b.format || '').toUpperCase())}${b.ocrUsed ? ' · OCR' : ''}</span>`;
  const done = b.finishedAt && !cls.includes('sm') ? `<span class="done">${I('check')}</span>` : '';
  if (src) return `<div class="cover ${cls}"><img src="${esc(src)}" alt="" loading="lazy">${fmt}${done}</div>`;
  const [bg, fg] = b.coverColor || U.hashColor(b.title);
  return `<div class="cover typo ${cls}" style="background:${bg};color:${fg}"><div class="t">${esc(b.title)}</div><div class="a">${esc(b.author || '')}</div>${fmt}${done}</div>`;
}
UI.coverHTML = coverHTML;
function hoursText(words, wpm){ const h = words / (wpm || 230) / 60; return h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : `${h.toFixed(1).replace(/\.0$/, '')} h`; }
function greeting(){ const h = new Date().getHours(); return h < 5 ? 'Late night pages' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }
function locTitle(book, content, loc){ if (!content) return ''; const ch = content.chapters[loc.c]; return ch ? ch.title : ''; }
async function loadLibrary(){
  const [books, progressRows] = await Promise.all([S.all('books'), S.all('progress')]);
  const prog = {};
  progressRows.forEach(p => { prog[p.bookId] = p; });
  books.sort((a, b) => (b.lastOpenedAt || b.addedAt) - (a.lastOpenedAt || a.addedAt));
  return { books, prog };
}
function progressFor(b, prog){ const p = prog[b.id]; return p ? (p.percent || 0) : 0; }

// ---------- navigation ----------
const VIEWS = [{ id: 'library', name: 'Library', icon: 'library' }, { id: 'discover', name: 'Discover', icon: 'discover' }, { id: 'insights', name: 'Insights', icon: 'insights' }, { id: 'settings', name: 'Settings', icon: 'settings' }];
UI.view = 'library';
UI.lastView = 'library';
function navHTML(){ return VIEWS.map(v => `<a href="#/${v.id}" data-view="${v.id}" class="nav-item ${UI.view === v.id ? 'on' : ''}">${I(v.icon)}<span>${v.name}</span></a>`).join(''); }
function renderNav(){
  document.getElementById('nav-side').innerHTML = navHTML();
  document.getElementById('nav-tab').innerHTML = navHTML();
  const foot = document.querySelector('.sidenav-foot');
  if (foot) foot.innerHTML = F.offline && !F.offline.online() ? '<span class="chip warn" style="margin-bottom:6px">Offline</span><br>Your books and the on-device voice keep working. Search and cloud voices will return with the connection.' : 'Everything you import stays on this device. Nothing is uploaded unless you add an API key and press play.';
}
UI.navigate = view => { location.hash = '#/' + view; };
UI.route = async () => {
  const parts = (location.hash || '#/library').replace(/^#\/?/, '').split('/');
  const view = parts[0] || 'library';
  if (view === 'read' && parts[1]) { await F.reader.open(parts[1], { fromRoute: true }); return; }
  if (F.reader.state.open) await F.reader.close(true);
  if (!VIEWS.find(v => v.id === view)) { location.replace('#/library'); return; }
  UI.lastView = UI.view = view;
  renderNav();
  window.scrollTo(0, 0);
  const main = document.getElementById('main');
  main.innerHTML = '<div class="muted" style="padding:40px 0;text-align:center">Loading…</div>';
  try {
    if (view === 'library') await renderLibrary();
    else if (view === 'discover') await renderDiscover();
    else if (view === 'insights') await renderInsights();
    else if (view === 'settings') await renderSettings();
  } catch (e) { console.error(e); main.innerHTML = `<div class="notice warn">Something went wrong rendering this view: ${esc(e.message)}</div>`; }
};
UI.init = () => {
  renderNav();
  window.addEventListener('hashchange', () => UI.route());
  const rerender = U.debounce(() => { if (!F.reader.state.open && (UI.view === 'library' || UI.view === 'insights')) UI.route(); }, 400);
  F.bus.on('books-changed', e => { if (e.action !== 'opened') rerender(); else if (UI.view === 'library') rerender(); });
  F.bus.on('reader-closed', () => rerender());
  F.bus.on('kokoro-progress', U.throttle(() => { if (UI.view === 'settings' && !F.reader.state.open && !document.querySelector('.modal-back')) renderSettings(); }, 1200));
  F.bus.on('net', () => { renderNav(); if (!F.reader.state.open && (UI.view === 'discover' || UI.view === 'library' || UI.view === 'settings')) UI.route(); });
  UI.route();
};

// ---------- Library ----------
async function renderLibrary(){
  const { books, prog } = await loadLibrary();
  const current = books.find(b => b.lastOpenedAt) || books[0];
  const main = document.getElementById('main');
  const totalWords = books.reduce((a, b) => a + (b.words || 0), 0);
  main.innerHTML = `
    <div class="view-head">
      <div><div class="eyebrow">Your library</div><h1>${greeting()}</h1>
      <p class="lead">${books.length ? `${U.plural(books.length, 'book')} on the shelf, ${U.fmtCompact(totalWords)} words in all. ${S.mode === 'memory' ? 'Storage is unavailable on this host; see the note below.' : 'Everything stays on this device.'}` : 'Add a PDF, an EPUB, a photographed page, or find a public-domain classic.'}</p></div>
      <div class="row"><button class="btn primary" id="lib-add">${I('plus')} Add a book</button></div>
    </div>
    ${S.mode === 'memory' ? `<div class="notice warn" style="margin-bottom:18px"><b>This copy cannot save anything on this device.</b> ${U.sandboxed ? 'The host serves this page inside a security sandbox that blocks browser storage (IndexedDB, localStorage).' : 'The browser is refusing storage (private mode or a strict privacy setting).'} Everything works for this session, but the library resets when the tab closes. To keep your books, run Folio from a host that allows storage, or use <a href="#/settings">Settings → Your data → Export</a> before you leave.</div>` : ''}
    ${current ? await continueCard(current, prog[current.id]) : ''}
    <div class="section">
      <div class="section-head"><h2>Shelf</h2>${books.length > 6 ? '<input class="input" id="lib-filter" placeholder="Filter by title or author" style="max-width:260px">' : ''}</div>
      ${books.length ? `<div class="shelf" id="shelf">${books.map(b => bookCard(b, progressFor(b, prog))).join('')}</div>` : `<div class="empty"><h3>Nothing here yet</h3>Import a book to begin, or open Discover to find a free classic.</div>`}
    </div>`;
  main.querySelector('#lib-add').onclick = () => UI.addMenu();
  const filter = main.querySelector('#lib-filter');
  if (filter) filter.oninput = () => { const q = T.normalize(filter.value); main.querySelectorAll('.book-card').forEach(c => { c.style.display = !q || T.normalize(c.dataset.title).includes(q) ? '' : 'none'; }); };
  main.querySelectorAll('.book-card').forEach(c => c.onclick = () => UI.openBook(c.dataset.id));
  main.querySelectorAll('[data-open]').forEach(b => b.onclick = e => { e.stopPropagation(); const id = b.dataset.open; const how = b.dataset.how; if (how === 'listen') F.reader.open(id, { listen: true }); else if (how === 'physical') F.reader.openPhysical(id); else F.reader.open(id); });
}
function bookCard(b, pct){
  return `<button class="book-card" data-id="${b.id}" data-title="${esc(b.title + ' ' + (b.author || ''))}">${coverHTML(b)}<div class="bt">${esc(b.title)}</div><div class="ba">${esc(b.author || (b.source === 'photo' ? 'Photographed pages' : ''))}</div><div class="pbar"><i style="width:${Math.round(pct * 100)}%"></i></div></button>`;
}
async function continueCard(b, p){
  const content = await S.get('content', b.id);
  const loc = p && p.loc ? p.loc : T.firstLoc();
  const pct = p ? p.percent || 0 : 0;
  const wpm = S.settings.get('userWpm', 230);
  const left = Math.max(0, (b.words || 0) * (1 - pct));
  const chapter = content ? locTitle(b, content, T.clampLoc(content, loc)) : '';
  return `<div class="continue">
    ${coverHTML(b, 'lg')}
    <div>
      <div class="eyebrow">${b.lastOpenedAt ? 'Continue' : 'Start here'}</div>
      <div class="ct">${esc(b.title)}</div><div class="ca">${esc(b.author || '')}</div>
      <div class="cm"><span>${Math.round(pct * 100)}% read</span>${chapter ? `<span>${esc(chapter)}</span>` : ''}<span>${hoursText(left, wpm)} left at your pace</span>${p && p.physicalPage ? `<span>paper p. ${p.physicalPage}</span>` : ''}</div>
      <div class="actions"><button class="btn primary" data-open="${b.id}" data-how="read">${I('book')} Read</button><button class="btn" data-open="${b.id}" data-how="listen">${I('headphones')} Listen</button><button class="btn" data-open="${b.id}" data-how="physical">${I('paper')} Paper mode</button></div>
    </div></div>`;
}

// ---------- Add menu & import ----------
UI.addMenu = () => {
  const m = UI.modal({ title: 'Add a book', body: `<div class="menu">
    <button data-a="upload">${I('upload')}<span>Upload a file<span class="md">PDF, EPUB, TXT or HTML. Scanned PDFs are recognized automatically.</span></span></button>
    <button data-a="photo">${I('camera')}<span>Photograph pages<span class="md">Point the camera at a page of a paper book; the text is recognized on this device.</span></span></button>
    <button data-a="discover">${I('discover')}<span>Find a public-domain book<span class="md">Open Library, Internet Archive, Project Gutenberg, Google Books.</span></span></button>
    <button data-a="paste">${I('text')}<span>Paste text<span class="md">Turn any text into a readable, listenable book.</span></span></button></div>` });
  m.body.onclick = async e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a; m.close();
    if (a === 'upload') { const files = await U.pickFiles('.pdf,.epub,.txt,.html,.htm,.xhtml,.md,application/pdf,application/epub+zip,text/plain,text/html', true); if (files.length) UI.importFiles(files); }
    else if (a === 'photo') UI.photographPages();
    else if (a === 'discover') UI.navigate('discover');
    else if (a === 'paste') {
      const text = await UI.prompt('Paste text', { label: 'Text', multiline: true, okLabel: 'Import' });
      if (text && text.trim()) { const title = await UI.prompt('Title', { label: 'Give it a title', value: text.trim().split('\n')[0].slice(0, 60) }); await UI.importText(text, { title: title || 'Pasted text' }); }
    }
  };
};
UI.importFiles = async (files) => {
  for (const f of files) {
    const pm = UI.progressModal(`Importing ${f.name}`);
    try {
      const res = await F.ingest.fromFile(f, { onProgress: p => pm.update(p) });
      pm.update({ message: 'Saving…', percent: 0.98 });
      await F.ingest.save(res);
      pm.close();
      UI.toast(`Added “${res.book.title}” · ${U.fmtCompact(res.book.words)} words`, { type: 'ok', action: 'Open', onAction: () => UI.openBook(res.book.id) });
      F.catalog.enrichBook(res.book.id).catch(() => {});
    } catch (e) { pm.close(); console.error(e); UI.toast(e.message || 'Import failed', { type: 'error', timeout: 8000 }); }
  }
};
UI.importText = async (text, hints) => {
  const pm = UI.progressModal('Importing text');
  try { const res = await F.ingest.fromText(text, hints, { onProgress: p => pm.update(p) }); await F.ingest.save(res); pm.close(); UI.toast(`Added “${res.book.title}”`, { type: 'ok', action: 'Open', onAction: () => UI.openBook(res.book.id) }); }
  catch (e) { pm.close(); UI.toast(e.message, { type: 'error' }); }
};
UI.photographPages = async (existingBookId) => {
  const files = await U.pickFiles('image/*', true, existingBookId === undefined ? 'environment' : 'environment');
  if (!files.length) return;
  let target = existingBookId || null;
  if (!target) {
    const scans = (await S.all('books')).filter(b => b.format === 'scan');
    if (scans.length) {
      target = await new Promise(res => {
        let decided = false;
        const m = UI.modal({ title: 'Add these pages to…', body: `<div class="menu"><button data-t="new">${I('plus')}<span>A new book</span></button>${scans.map(b => `<button data-t="${b.id}">${I('paper')}<span>${esc(b.title)}<span class="md">${U.fmtCompact(b.words)} words so far</span></span></button>`).join('')}</div>`, onClose: () => { if (!decided) res('cancel'); } });
        m.body.onclick = e => { const b = e.target.closest('[data-t]'); if (!b) return; decided = true; m.close(); res(b.dataset.t === 'new' ? null : b.dataset.t); };
      });
      if (target === 'cancel') return;
    }
  }
  const pm = UI.progressModal(target ? 'Adding pages' : 'Recognizing pages');
  try {
    if (target) { const n = await F.ingest.appendImagesToBook(target, files, { onProgress: p => pm.update(p) }); pm.close(); UI.toast(`Added ${U.plural(n, 'paragraph')} from ${U.plural(files.length, 'photo')}.`, { type: 'ok', action: 'Open', onAction: () => UI.openBook(target) }); }
    else { const res = await F.ingest.fromImages(files, { onProgress: p => pm.update(p) }); await F.ingest.save(res); pm.close(); UI.toast(`Added “${res.book.title}”`, { type: 'ok', action: 'Open', onAction: () => UI.openBook(res.book.id) }); }
  } catch (e) { pm.close(); console.error(e); UI.toast(e.message || 'Recognition failed', { type: 'error', timeout: 8000 }); }
};

// ---------- Book detail ----------
UI.openBook = async (bookId, opts = {}) => {
  const book = await S.get('books', bookId);
  if (!book) return UI.toast('Book not found', { type: 'error' });
  const [progress, content, sessions, cal, allBooks] = await Promise.all([S.get('progress', bookId), S.get('content', bookId), F.analytics.getSessions(), F.calib.getCal(bookId), S.all('books')]);
  if (content) T.ensureCounts(content);
  const pct = progress ? progress.percent || 0 : 0;
  const stats = F.analytics.bookStats(sessions, bookId);
  const wpm = S.settings.get('userWpm', 230);
  const lib = { wpm: F.analytics.userWpm(sessions), medianWords: (() => { const a = allBooks.map(b => b.words || 0).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; })() };
  const label = F.analytics.label(book, stats, progress, lib);
  const loc = progress && progress.loc && content ? T.clampLoc(content, progress.loc) : T.firstLoc();
  let tab = opts.tab || 'chapters';
  const body = U.el('div');
  const render = () => {
    body.innerHTML = `
      <div class="book-sheet">${coverHTML(book, 'lg')}
        <div>
          <div class="bs-title">${esc(book.title)}</div><div class="bs-author">${esc(book.author || '')}${book.year ? ` · ${book.year}` : ''}</div>
          <div class="bs-meta"><span>${esc((book.format || '').toUpperCase())}${book.ocrUsed ? ' · OCR' : ''}</span><span>${U.fmtNum(book.words)} words</span><span>${U.plural(book.chapterCount || 1, 'chapter')}</span><span>${hoursText(book.words, wpm)}</span>${book.readability ? `<span>${esc(book.readability.band)} prose</span>` : ''}${book.language ? `<span>${esc(book.language)}</span>` : ''}</div>
          ${book.subjects && book.subjects.length ? `<div class="chips" style="margin-top:10px">${book.subjects.slice(0, 6).map(s => `<span class="chip neutral">${esc(s)}</span>`).join('')}</div>` : ''}
          <div style="margin-top:14px"><div class="row between small muted"><span>${Math.round(pct * 100)}% · ${content ? esc(locTitle(book, content, loc)) : ''}</span>${progress && progress.physicalPage ? `<span>paper p. ${progress.physicalPage}</span>` : ''}</div><div class="pbar lg" style="margin-top:6px"><i style="width:${Math.round(pct * 100)}%"></i></div></div>
          <div class="row" style="margin-top:16px"><button class="btn primary" data-a="read">${I('book')} ${pct > 0 ? 'Continue' : 'Read'}</button><button class="btn" data-a="listen">${I('headphones')} Listen</button><button class="btn" data-a="physical">${I('paper')} Paper mode</button><button class="btn" data-a="calibrate">${I('target')} Calibrate</button></div>
        </div>
      </div>
      ${book.description ? `<p class="muted small" style="margin-top:16px;line-height:1.5">${esc(book.description.slice(0, 420))}${book.description.length > 420 ? '…' : ''}</p>` : ''}
      <div class="tabs" style="margin-top:18px"><button data-tab="chapters" class="${tab === 'chapters' ? 'on' : ''}">Chapters</button><button data-tab="label" class="${tab === 'label' ? 'on' : ''}">Reading Label</button><button data-tab="calibration" class="${tab === 'calibration' ? 'on' : ''}">Paper sync</button><button data-tab="manage" class="${tab === 'manage' ? 'on' : ''}">Manage</button></div>
      <div id="bs-tab">${tab === 'chapters' ? chaptersHTML(content, loc) : tab === 'label' ? labelHTML(label, book) : tab === 'calibration' ? calibrationHTML(cal, content, book) : manageHTML(book)}</div>`;
    body.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });
    body.querySelectorAll('.chapters button').forEach(b => b.onclick = () => { m.close(); F.reader.open(bookId, { loc: { c: +b.dataset.c, p: 0, s: 0, w: 0 } }); });
    body.onclick = async e => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'read') { m.close(); F.reader.open(bookId); }
      else if (a === 'listen') { m.close(); F.reader.open(bookId, { listen: true }); }
      else if (a === 'physical') { m.close(); F.reader.openPhysical(bookId); }
      else if (a === 'calibrate') { m.close(); UI.calibrate(bookId, { fromReader: opts.fromReader }); }
      else if (a === 'edit') { m.close(); UI.editBook(bookId); }
      else if (a === 'addpages') { m.close(); UI.photographPages(bookId); }
      else if (a === 'finish') { await F.ingest.updateBook(bookId, { finishedAt: book.finishedAt ? null : Date.now() }); m.close(); UI.toast(book.finishedAt ? 'Marked as unfinished.' : 'Marked as finished.'); }
      else if (a === 'export') { const txt = content.chapters.map(ch => ch.title + '\n\n' + ch.paras.join('\n\n')).join('\n\n\n'); U.download(book.title.replace(/[^\w\- ]+/g, '').trim() + '.txt', new Blob([txt], { type: 'text/plain' })); }
      else if (a === 'clearaudio') { await F.tts.clearAudioCache(bookId); UI.toast('Cached audio for this book removed.'); }
      else if (a === 'delete') { if (await UI.confirm('Delete this book?', `“${book.title}” and its progress will be removed from this device. Reading history stays in Insights.`, { okLabel: 'Delete', danger: true })) { m.close(); await F.ingest.deleteBook(bookId); UI.toast('Deleted.'); } }
      else if (a === 'removept') { await F.calib.removePoint(bookId, +b.dataset.page); Object.assign(cal, await F.calib.getCal(bookId)); render(); }
      else if (a === 'savetotal') { const v = +body.querySelector('#bs-total').value; await F.calib.setTotalPages(bookId, v > 0 ? v : null); Object.assign(cal, await F.calib.getCal(bookId)); UI.toast(v > 0 ? `Total pages set to ${v}.` : 'Total pages cleared.'); render(); }
      else if (a === 'jump') { m.close(); F.reader.open(bookId, { loc: JSON.parse(b.dataset.loc) }); }
    };
  };
  const m = UI.modal({ body, wide: true, onClose: () => { if (opts.fromReader && F.reader.state.book && F.reader.state.book.id === bookId) { /* stay in reader */ } } });
  render();
};
function chaptersHTML(content, loc){
  if (!content) return '<div class="muted">No content.</div>';
  return `<div class="chapters">${content.chapters.map((ch, i) => `<button data-c="${i}" class="${i === loc.c ? 'on' : ''}"><span>${esc(ch.title)}</span><span class="cw">${U.fmtCompact(T.chapterWords(content, i))} words · ${hoursText(T.chapterWords(content, i), S.settings.get('userWpm', 230))}</span></button>`).join('')}</div>`;
}
function labelHTML(L, book){
  const dv = (x) => `<span class="dv">${Math.round(x * 100)}%</span>`;
  const bar = (x) => `<div class="label-bar"><i style="width:${Math.round(U.clamp(x, 0, 1) * 100)}%"></i></div>`;
  const cx = L.complexity;
  const complexityPct = cx.flesch == null ? 0 : U.clamp((100 - cx.flesch) / 100, 0, 1);
  return `<div class="row" style="align-items:flex-start;gap:22px;flex-wrap:wrap">
    <div class="label-card">
      <div class="lt">Reading Facts</div>
      <div class="ls">Serving: one book · ${U.fmtNum(L.words)} words · ${U.plural(L.chapters, 'chapter')}</div>
      <div class="label-row thick"><b>Time to finish</b><b>${L.hours < 1 ? Math.round(L.hours * 60) + ' min' : L.hours.toFixed(1) + ' h'}</b></div>
      <div class="label-row"><span>Length · ${esc(L.lengthBand)}</span>${dv(L.lengthDV)}</div>
      ${bar(Math.min(1, L.lengthDV / 2))}
      <div class="label-row"><span>Average chapter</span><span>${U.fmtNum(L.avgChapterWords)} words</span></div>
      <div class="label-row thick"><b>Complexity · ${esc(cx.band)}</b>${dv(complexityPct)}</div>
      ${bar(complexityPct)}
      <div class="label-row sub"><span>Words per sentence</span><span>${cx.wps ?? '–'}</span></div>
      <div class="label-row sub"><span>Reading ease (Flesch)</span><span>${cx.flesch ?? '–'}</span></div>
      <div class="label-row sub"><span>Long words</span><span>${cx.longWords == null ? '–' : Math.round(cx.longWords * 100) + '%'}</span></div>
      <div class="label-row"><span>Dialogue</span><span>${L.dialogue == null ? '–' : Math.round(L.dialogue * 100) + '% of sentences'}</span></div>
      <div class="label-row thick"><b>Your pace</b><b>${L.pace.yourWpm ? L.pace.yourWpm + ' wpm' : 'not yet measured'}</b></div>
      ${L.pace.compare ? `<div class="label-row sub"><span>Compared to you</span><span>${esc(L.pace.compare)}</span></div>` : ''}
      <div class="label-row"><span>Completed</span>${dv(L.completion)}</div>
      ${bar(L.completion)}
      <div class="label-row"><span>Time spent</span><span>${T.formatMinutes(L.minutes)} · ${U.plural(L.sessions, 'session')}</span></div>
      <div class="label-row"><span>Listening share</span><span>${Math.round(L.listenShare * 100)}%</span></div>
      <div class="label-foot">Genre: ${L.genre.length ? esc(L.genre.join(', ')) : 'not tagged'}. Percentages compare this book with the rest of your shelf; complexity is a plain-text estimate, not a judgment.</div>
    </div>
    <div class="muted small" style="max-width:300px;line-height:1.5">A Reading Label is a plain statement of what this book asks of you: how long it is, how dense the prose runs, how much of it is people talking, and how you have been getting on with it. Nothing here is scored against other readers.</div>
  </div>`;
}
function calibrationHTML(cal, content, book){
  const q = F.calib.quality(cal);
  const total = F.calib.estimatedTotalPages(cal, content ? content.totalWords : 0);
  return `<div class="stack">
    <div class="notice">Paper sync maps the page numbers of your printed copy onto this text. Photograph a page (or type a sentence from it), tell Folio the printed page number, and both copies stay in step. Two points give a solid mapping; one point is a rough guide.</div>
    <div class="row between"><div><b>Mapping quality:</b> ${q === 'good' ? '<span class="chip ok">Good</span>' : q === 'rough' ? '<span class="chip">Rough (1 point)</span>' : q === 'estimate' ? '<span class="chip">Estimate from total pages</span>' : '<span class="chip neutral">None yet</span>'} ${total ? `<span class="muted small">≈ ${total} pages in your edition</span>` : ''}</div><button class="btn sm primary" data-a="calibrate">${I('target')} Add a calibration point</button></div>
    ${cal.points.length ? `<div>${cal.points.map(pt => `<div class="cal-point"><span>Page <b>${pt.page}</b> → ${content ? esc(content.chapters[pt.loc.c].title) : ''} · ${Math.round(pt.g / Math.max(1, content ? content.totalWords : 1) * 100)}%${pt.confidence != null ? ` · match ${Math.round(pt.confidence * 100)}%` : ''}</span><span class="row"><button class="btn xs" data-a="jump" data-loc='${JSON.stringify(pt.loc)}'>Open</button><button class="btn xs ghost" data-a="removept" data-page="${pt.page}" aria-label="Remove">${I('close')}</button></span></div>`).join('')}</div>` : ''}
    <div class="field"><label>Total pages in your printed edition (optional)</label><div class="row"><input class="input" id="bs-total" type="number" inputmode="numeric" style="max-width:160px" value="${cal.totalPages || ''}" placeholder="${book.physical && book.physical.pagesHint ? 'e.g. ' + book.physical.pagesHint : 'e.g. 320'}"><button class="btn sm" data-a="savetotal">Save</button></div><div class="hint">Used as a fallback when there are fewer than two calibration points.</div></div>
  </div>`;
}
function manageHTML(book){
  return `<div class="menu">
    <button data-a="edit">${I('edit')}<span>Edit details<span class="md">Title, author, language, subjects, description</span></span></button>
    ${book.format === 'scan' ? `<button data-a="addpages">${I('camera')}<span>Photograph more pages<span class="md">Append recognized text to this book</span></span></button>` : ''}
    <button data-a="finish">${I('check')}<span>${book.finishedAt ? 'Mark as unfinished' : 'Mark as finished'}</span></button>
    <button data-a="export">${I('download')}<span>Export as text file</span></button>
    <button data-a="clearaudio">${I('headphones')}<span>Clear cached narration audio</span></button>
    <button data-a="delete" class="danger">${I('trash')}<span>Delete from this device</span></button></div>`;
}
UI.editBook = async (bookId) => {
  const book = await S.get('books', bookId);
  const cal = await F.calib.getCal(bookId);
  const body = U.el('div', { html: `
    <div class="field"><label>Title</label><input class="input" id="eb-title" value="${esc(book.title)}"></div>
    <div class="field"><label>Author</label><input class="input" id="eb-author" value="${esc(book.author || '')}"></div>
    <div class="row"><div class="field" style="flex:1"><label>Language</label><input class="input" id="eb-lang" value="${esc(book.language || '')}" placeholder="en"></div><div class="field" style="flex:1"><label>Total printed pages</label><input class="input" id="eb-pages" type="number" value="${cal.totalPages || ''}"></div></div>
    <div class="field"><label>Subjects (comma separated)</label><input class="input" id="eb-subj" value="${esc((book.subjects || []).join(', '))}"></div>
    <div class="field"><label>Description</label><textarea class="input" id="eb-desc">${esc(book.description || '')}</textarea></div>` });
  UI.modal({ title: 'Edit details', body, actions: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: async () => {
    const g = id => body.querySelector('#' + id).value.trim();
    await F.ingest.updateBook(bookId, { title: g('eb-title') || book.title, author: g('eb-author'), language: g('eb-lang'), subjects: g('eb-subj').split(',').map(s => s.trim()).filter(Boolean).slice(0, 12), description: g('eb-desc') });
    const tp = +g('eb-pages'); await F.calib.setTotalPages(bookId, tp > 0 ? tp : null);
    UI.toast('Saved.');
  } }] });
};

// ---------- Calibration flow ----------
UI.calibrate = async (bookId, opts = {}) => {
  const book = await S.get('books', bookId);
  const content = await S.get('content', bookId);
  if (!book || !content) return;
  T.ensureCounts(content);
  let step = 'choose', ocrText = '', thumb = null, match = null, pageGuess = '';
  const body = U.el('div');
  const m = UI.modal({ title: 'Paper sync', sub: `Match a page of your printed copy of <b>${esc(book.title)}</b> to this text.`, body, wide: false });
  const indexing = !F.calib.isIndexed(bookId);
  if (indexing) F.calib.buildIndex(bookId, content).catch(() => {});
  const render = () => {
    if (step === 'choose') {
      body.innerHTML = `<div class="menu">
        <button data-a="camera">${I('camera')}<span>Photograph a page<span class="md">Fill the frame with the text; the page number is read too.</span></span></button>
        <button data-a="upload">${I('upload')}<span>Choose a photo<span class="md">A picture you took earlier.</span></span></button>
        <button data-a="type">${I('type')}<span>Type a sentence from the page<span class="md">Ten words or more is plenty.</span></span></button></div>
        ${indexing ? '<div class="muted small" style="margin-top:10px">Preparing the text index…</div>' : ''}`;
    } else if (step === 'ocr') {
      body.innerHTML = `<div class="progress-box"><div class="spinner"></div><div class="pm" id="cal-msg">Recognizing text…</div><div class="pbar lg" style="margin-top:12px"><i id="cal-bar" style="width:0%"></i></div></div>`;
    } else if (step === 'review') {
      body.innerHTML = `<div class="row" style="align-items:flex-start">${thumb ? `<img class="photo-thumb" src="${thumb}" alt="">` : ''}<div style="flex:1;min-width:200px"><div class="field" style="margin-top:0"><label>Recognized text (edit if needed)</label><textarea class="input" id="cal-text" style="min-height:150px">${esc(ocrText)}</textarea></div></div></div>
        <div class="modal-actions"><button class="btn" data-a="back">Back</button><button class="btn primary" data-a="find">${I('target')} Find in book</button></div>`;
    } else if (step === 'result') {
      if (!match.ok) {
        body.innerHTML = `<div class="notice warn">${esc(match.reason)}</div><div class="modal-actions"><button class="btn" data-a="review">Edit text</button><button class="btn primary" data-a="choose">Try another page</button></div>`;
      } else {
        const pct = Math.round(match.confidence * 100);
        const quality = pct >= 55 ? 'Strong match' : pct >= 30 ? 'Likely match' : 'Weak match — check the snippet';
        body.innerHTML = `<div class="stack">
          <div><div class="eyebrow">${esc(match.chapterTitle)}</div><div class="snippet" style="margin-top:6px">${esc(match.snippet)}</div></div>
          <div class="conf"><span>${quality}</span><span class="track"><i style="width:${pct}%"></i></span><span class="muted">${match.matched}/${match.total} phrases</span></div>
          <div class="field"><label>Printed page number of this page</label><input class="input" id="cal-page" type="number" inputmode="numeric" style="max-width:180px" value="${pageGuess}" placeholder="e.g. 37"><div class="hint">${pageGuess ? 'Read from the photo; correct it if it is wrong.' : 'Look at the corner of the page.'}</div></div>
          <div class="modal-actions"><button class="btn" data-a="choose">Another page</button><button class="btn" data-a="jump">${I('book')} Read from here</button><button class="btn primary" data-a="save">${I('check')} Save calibration point</button></div></div>`;
        setTimeout(() => { const i = body.querySelector('#cal-page'); if (i && !i.value) i.focus(); }, 50);
      }
    }
  };
  const runOCR = async (file) => {
    step = 'ocr'; render();
    try {
      const r = await F.ingest.ocrImageFile(file, { onProgress: p => { const b = body.querySelector('#cal-bar'); if (b) b.style.width = Math.round(p * 100) + '%'; } });
      thumb = r.thumb;
      const lines = r.text.split('\n').map(l => l.trim()).filter(Boolean);
      const numLine = lines.slice(0, 3).concat(lines.slice(-3)).find(l => /^\d{1,4}$/.test(l)) || (lines[0] && lines[0].match(/(?:^|\s)(\d{1,4})$/) ? lines[0].match(/(?:^|\s)(\d{1,4})$/)[0] : null);
      pageGuess = numLine ? String(numLine).trim() : '';
      ocrText = r.paragraphs.join('\n\n') || r.text;
      step = 'review'; render();
    } catch (e) { UI.toast(e.message || 'Recognition failed', { type: 'error' }); step = 'choose'; render(); }
  };
  const find = async (text) => {
    step = 'ocr'; render();
    const msg = body.querySelector('#cal-msg'); if (msg) msg.textContent = 'Searching the text…';
    try { match = await F.calib.match(bookId, content, text, p => { const b = body.querySelector('#cal-bar'); if (b) b.style.width = Math.round(p * 100) + '%'; }); }
    catch (e) { match = { ok: false, reason: e.message }; }
    step = 'result'; render();
  };
  body.onclick = async e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a;
    if (a === 'camera' || a === 'upload') { const files = await U.pickFiles('image/*', false, a === 'camera' ? 'environment' : null); if (files[0]) runOCR(files[0]); }
    else if (a === 'type') { thumb = null; pageGuess = ''; ocrText = ''; step = 'review'; render(); }
    else if (a === 'back' || a === 'choose') { step = 'choose'; render(); }
    else if (a === 'review') { step = 'review'; render(); }
    else if (a === 'find') { ocrText = body.querySelector('#cal-text').value; if (T.countWords(ocrText) < 5) return UI.toast('Type at least five words.', { type: 'error' }); find(ocrText); }
    else if (a === 'jump') { m.close(); F.reader.open(bookId, { loc: match.loc }); }
    else if (a === 'save') {
      const page = +body.querySelector('#cal-page').value;
      if (!page || page < 1) return UI.toast('Enter the printed page number.', { type: 'error' });
      const cal = await F.calib.addPoint(bookId, content, page, match.loc, match.confidence);
      const q = F.calib.quality(cal);
      UI.toast(`Saved: page ${page} ↔ ${match.chapterTitle}. Mapping is now ${q === 'good' ? 'good' : 'rough; add a second page for a solid mapping'}.`, { type: 'ok', timeout: 6000 });
      const again = cal.points.length < 2 && await UI.confirm('Add a second point?', 'Two pages from different parts of the book give a much better mapping. Add another now?', { okLabel: 'Add another' });
      if (again) { step = 'choose'; render(); } else m.close();
    }
  };
  render();
};

// ---------- Discover ----------
const recoCache = { key: null, data: null };
async function renderDiscover(){
  const main = document.getElementById('main');
  const enabled = S.settings.get('discoverSources', { openlibrary: true, archive: true, gutenberg: true, google: false });
  const lastQ = S.settings.get('discoverQuery', '');
  const SRC = [['openlibrary', 'Open Library'], ['archive', 'Internet Archive'], ['gutenberg', 'Project Gutenberg'], ['google', 'Google Books']];
  main.innerHTML = `
    <div class="view-head"><div><div class="eyebrow">Discover</div><h1>Public-domain shelves</h1><p class="lead">Search Open Library, the Internet Archive, Project Gutenberg and Google Books. Anything marked <b>Full text</b> imports with one tap; other results are for lookup, with a link to the source.</p></div></div>
    ${F.offline.online() ? '' : '<div class="notice warn" style="margin-bottom:14px"><b>You are offline.</b> Catalog search and imports need a connection; your library and the on-device voice keep working.</div>'}
    <div class="searchbar"><input class="input" id="ds-q" placeholder="Title, author or subject" autocomplete="off" value="${esc(lastQ)}"><button class="btn primary" id="ds-go">${I('discover')} Search</button></div>
    <div class="sources" id="ds-sources">${SRC.map(([id, name]) => `<span class="chip ${enabled[id] ? '' : 'off'}" data-src="${id}">${name}</span>`).join('')}</div>
    <div id="ds-results" class="section" style="margin-top:22px"></div>
    <div class="section" id="ds-reco"><div class="section-head"><h2>For you</h2><button class="btn sm" id="ds-reco-refresh">${I('refresh')} Refresh</button></div><div id="ds-reco-body" class="muted">Working out your taste…</div></div>`;
  const q = main.querySelector('#ds-q'), results = main.querySelector('#ds-results');
  const run = async () => {
    const query = q.value.trim();
    if (!query) return;
    S.settings.set('discoverQuery', query);
    const sources = SRC.map(s => s[0]).filter(id => enabled[id]);
    if (!sources.length) return UI.toast('Turn on at least one source.', { type: 'error' });
    results.innerHTML = `<div class="row muted small"><div class="spinner" style="width:18px;height:18px;border-width:2px;margin:0"></div> Searching ${sources.length} sources…</div>`;
    const { results: rows, errors } = await F.catalog.search(query, sources);
    const seen = new Set();
    const ordered = rows.filter(r => { const k = T.normalize(r.title) + '|' + T.normalize((r.author || '').split(',')[0]); if (seen.has(k) && !r.fullText) return false; seen.add(k); return true; })
      .sort((a, b) => (b.fullText ? 1 : 0) - (a.fullText ? 1 : 0) || (b.downloads || 0) - (a.downloads || 0));
    results.innerHTML = `<div class="section-head"><h2>${ordered.length ? `${ordered.length} results` : 'No results'}</h2><span class="muted small">${Object.keys(errors).length ? 'Unavailable: ' + Object.keys(errors).map(k => SRC.find(s => s[0] === k)[1]).join(', ') : ''}</span></div>${ordered.map(r => resultRow(r)).join('')}`;
    wireResults(results, ordered);
  };
  q.onkeydown = e => { if (e.key === 'Enter') run(); };
  main.querySelector('#ds-go').onclick = run;
  main.querySelector('#ds-sources').onclick = e => { const c = e.target.closest('[data-src]'); if (!c) return; enabled[c.dataset.src] = !enabled[c.dataset.src]; c.classList.toggle('off', !enabled[c.dataset.src]); S.settings.set('discoverSources', enabled); };
  if (lastQ) run();
  const recoBody = main.querySelector('#ds-reco-body');
  const loadReco = async (force) => {
    const { books, prog } = await loadLibrary();
    const sessions = await F.analytics.getSessions();
    const profile = F.analytics.profile(books, sessions, prog);
    const key = JSON.stringify([profile.topSubjects.map(s => s.name), profile.topAuthors.map(a => a.name), books.length]);
    if (!force && recoCache.key === key && recoCache.data) return showReco(recoCache.data, profile);
    recoBody.innerHTML = '<div class="row muted small"><div class="spinner" style="width:18px;height:18px;border-width:2px;margin:0"></div> Looking for books that fit your shelf…</div>';
    try { const data = await F.catalog.recommend(profile, books); recoCache.key = key; recoCache.data = data; showReco(data, profile); }
    catch (e) { recoBody.innerHTML = `<div class="notice warn">Could not load recommendations: ${esc(e.message)}</div>`; }
  };
  const showReco = (data, profile) => {
    if (!data.items.length) { recoBody.innerHTML = `<div class="empty"><h3>Nothing to suggest yet</h3>${esc(data.note || 'Read a little more and come back.')}</div>`; return; }
    recoBody.innerHTML = `<div class="muted small" style="margin-bottom:6px">Based on ${profile.topSubjects.slice(0, 3).map(s => `<span class="chip neutral">${esc(s.name)}</span>`).join(' ')}${profile.topAuthors.length ? ` and ${esc(profile.topAuthors[0].name)}` : ''}. Ranked by overlap with what you finish, novelty, and whether a free copy exists.</div>${data.items.map(r => resultRow(r, true)).join('')}`;
    wireResults(recoBody, data.items);
  };
  main.querySelector('#ds-reco-refresh').onclick = () => loadReco(true);
  loadReco(false);
}
function resultRow(r, withReasons){
  const src = { openlibrary: 'Open Library', archive: 'Internet Archive', gutenberg: 'Gutenberg', google: 'Google Books' }[r.source] || r.source;
  const avail = r.fullText === 'archive' || r.fullText === 'gutenberg' ? '<span class="chip ok">Full text</span>' : r.fullText === 'google-download' ? '<span class="chip">Download at source</span>' : r.ebookAccess === 'borrowable' ? '<span class="chip neutral">Borrow only</span>' : '<span class="chip neutral">Lookup</span>';
  const action = (r.fullText === 'archive' || r.fullText === 'gutenberg') ? `<button class="btn sm primary" data-import="${esc(r.id)}">${I('download')} Import</button>` : r.url ? `<a class="btn sm" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${I('external')} Open</a>` : '';
  return `<div class="result" data-id="${esc(r.id)}">
    ${r.cover ? `<img class="thumb" src="${esc(r.cover)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : '<div class="thumb"></div>'}
    <div><div class="rt">${esc(r.title)}</div><div class="rm">${esc(r.author || 'Unknown author')}${r.year ? ` · ${r.year}` : ''}${r.pages ? ` · ${r.pages} pages` : ''}${r.rating ? ` · ★ ${(+r.rating).toFixed(1)}` : ''}</div>
      <div class="chips">${avail}<span class="chip neutral">${src}</span>${(r.subjects || []).slice(0, 3).map(s => `<span class="chip neutral">${esc(s)}</span>`).join('')}</div>
      ${withReasons && r.reasons && r.reasons.length ? `<ul class="reasons">${r.reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${r.description ? `<div class="rm" style="margin-top:4px">${esc(r.description.slice(0, 160))}${r.description.length > 160 ? '…' : ''}</div>` : ''}</div>
    <div class="ra">${action}</div></div>`;
}
function wireResults(root, rows){
  root.querySelectorAll('[data-import]').forEach(b => b.onclick = () => { const r = rows.find(x => x.id === b.dataset.import); if (r) UI.importResult(r); });
}
UI.importResult = async (r) => {
  const pm = UI.progressModal(`Importing ${r.title}`);
  try {
    const res = await F.catalog.importResult(r, p => pm.update(p));
    pm.update({ message: 'Saving…', percent: 0.98 });
    await F.ingest.save(res);
    pm.close();
    UI.toast(`Added “${res.book.title}” · ${U.fmtCompact(res.book.words)} words`, { type: 'ok', action: 'Open', onAction: () => UI.openBook(res.book.id) });
    F.catalog.enrichBook(res.book.id).catch(() => {});
  } catch (e) {
    pm.close(); console.error(e);
    UI.toast(e.message || 'Import failed', { type: 'error', timeout: 9000, action: e.link ? 'Open source' : undefined, onAction: e.link ? () => window.open(e.link, '_blank', 'noopener') : undefined });
  }
};

// ---------- Insights ----------
async function renderInsights(){
  const main = document.getElementById('main');
  const [{ books, prog }, sessions] = await Promise.all([loadLibrary(), F.analytics.getSessions()]);
  const A = F.analytics;
  const totals = A.totals(sessions, books);
  const streak = A.streak(sessions);
  const daily = A.daily(sessions, 30);
  const week = daily.slice(-7).reduce((a, d) => a + d.minutes, 0);
  const profile = A.profile(books, sessions, prog);
  const wpm = A.userWpm(sessions);
  if (wpm) S.settings.set('userWpm', wpm);
  const maxMin = Math.max(10, ...daily.map(d => d.minutes));
  const W = 600, H = 150, pad = 4, bw = (W - pad * 2) / daily.length;
  const bars = daily.map((d, i) => {
    const h = Math.round(d.minutes / maxMin * (H - 30));
    const lh = Math.round(d.listen / maxMin * (H - 30));
    const x = pad + i * bw + 1, y = H - 22 - h;
    return `<g><title>${d.day}: ${Math.round(d.minutes)} min${d.listen ? ` (${Math.round(d.listen)} listening)` : ''}, ${U.fmtCompact(d.words)} words</title><rect x="${x}" y="${y}" width="${Math.max(1, bw - 3)}" height="${h}" rx="2" fill="var(--accent)" opacity="${d.minutes ? .9 : .15}"></rect>${lh ? `<rect x="${x}" y="${H - 22 - lh}" width="${Math.max(1, bw - 3)}" height="${lh}" rx="2" fill="var(--hl)"></rect>` : ''}</g>`;
  }).join('');
  const labels = [0, 10, 20, 29].map(i => `<text x="${pad + i * bw + bw / 2}" y="${H - 6}" font-size="10" text-anchor="middle" fill="var(--muted)">${daily[i].day.slice(5).replace('-', '/')}</text>`).join('');
  main.innerHTML = `
    <div class="view-head"><div><div class="eyebrow">Insights</div><h1>How you read</h1><p class="lead">Sessions are recorded automatically while you read, listen or run the paper timer. Idle time is not counted. Numbers describe; they do not nag.</p></div></div>
    <div class="tiles">
      <div class="tile"><div class="v">${streak.current}</div><div class="k">Day streak</div><div class="s">Best ${streak.best} · ${streak.activeDays} active days${streak.today ? ' · read today' : ''}</div></div>
      <div class="tile"><div class="v">${T.formatMinutes(week)}</div><div class="k">Last 7 days</div><div class="s">${T.formatMinutes(totals.minutes)} all time</div></div>
      <div class="tile"><div class="v">${U.fmtCompact(totals.words)}</div><div class="k">Words read</div><div class="s">${totals.listenMinutes ? `${Math.round(totals.listenMinutes / Math.max(1, totals.minutes) * 100)}% by ear` : 'on screen'}</div></div>
      <div class="tile"><div class="v">${wpm || '–'}</div><div class="k">Words / minute</div><div class="s">${wpm ? 'measured while reading on screen' : 'read a little to measure'}</div></div>
      <div class="tile"><div class="v">${totals.finished}<span class="muted" style="font-size:18px">/${totals.books}</span></div><div class="k">Finished</div><div class="s">${profile.completionRate != null ? Math.round(profile.completionRate * 100) + '% of what you start' : 'books on the shelf'}</div></div>
    </div>
    <div class="card section"><div class="section-head"><h2>Last 30 days</h2><span class="muted small">minutes per day · <span style="color:var(--hl)">■</span> listening</span></div><svg class="bars" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${bars}${labels}</svg></div>
    <div class="card section">
      <div class="section-head"><h2>Taste profile</h2><span class="chip">${esc(profile.label)}</span></div>
      ${profile.topSubjects.length ? profile.topSubjects.slice(0, 6).map(s => `<div class="hbar"><span>${esc(s.name)}</span><span class="track"><i style="width:${Math.round(s.weight * 100)}%"></i></span><span class="muted small">${U.plural(s.books, 'book')}</span></div>`).join('') : '<div class="muted">Subjects appear as your books gain tags (imports are enriched from Open Library).</div>'}
      <div class="divider"></div>
      <dl class="kv">
        <dt>Authors you return to</dt><dd>${profile.topAuthors.length ? esc(profile.topAuthors.slice(0, 3).map(a => a.name).join(', ')) : '–'}</dd>
        <dt>Preferred length</dt><dd>${profile.preferredWords ? `${U.fmtCompact(profile.preferredWords)} words (≈ ${profile.preferredPages} pages)` : '–'}</dd>
        <dt>Pace</dt><dd>${profile.avgWpm ? profile.avgWpm + ' wpm' : '–'}</dd>
        <dt>When you read</dt><dd>${profile.timeOfDay ? esc(profile.timeOfDay) : '–'}</dd>
        <dt>Listening share</dt><dd>${Math.round(profile.listenShare * 100)}%</dd>
      </dl>
    </div>
    <div class="card section"><div class="section-head"><h2>Books</h2></div>
      ${books.length ? `<table class="table"><thead><tr><th>Title</th><th class="num">Progress</th><th class="num">Time</th><th class="num">Pace</th><th class="num">Last read</th></tr></thead><tbody>
      ${books.map(b => { const s = A.bookStats(sessions, b.id); const pct = progressFor(b, prog); return `<tr data-id="${b.id}" style="cursor:pointer"><td><div class="row" style="gap:10px;flex-wrap:nowrap">${coverHTML(b, 'sm')}<div><div style="font-weight:600">${esc(b.title)}</div><div class="muted small">${esc(b.author || '')}</div></div></div></td><td class="num">${Math.round(pct * 100)}%${b.finishedAt ? ' ✓' : ''}</td><td class="num">${s.minutes ? T.formatMinutes(s.minutes) : '–'}</td><td class="num">${s.wpm ? s.wpm + ' wpm' : '–'}</td><td class="num">${s.lastRead ? U.relTime(s.lastRead) : '–'}</td></tr>`; }).join('')}
      </tbody></table>` : '<div class="muted">No books yet.</div>'}
    </div>`;
  main.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => UI.openBook(tr.dataset.id, { tab: 'label' }));
}

// ---------- Settings: Piper voice catalog ----------
UI.piperLang = null;
async function renderPiperSection(root){
  const el = root.querySelector('#piper-section');
  if (!el) return;
  let catalog;
  try { catalog = await F.tts.piperCatalog(); } catch (e) { el.innerHTML = `<div class="notice warn">The voice catalog could not be loaded (${esc(e.message)}). It needs a connection the first time.</div>`; return; }
  if (!root.isConnected) return;
  const stored = new Set(F.tts.piperStoredCached());
  const langs = [];
  for (const v of catalog) if (!langs.find(l => l.family === v.family)) langs.push({ family: v.family, name: v.langName, count: catalog.filter(x => x.family === v.family).length });
  langs.sort((a, b) => a.name.localeCompare(b.name));
  const cur = UI.piperLang || F.tts.bookLang(null) || 'en';
  const lang = langs.find(l => l.family === cur) ? cur : 'en';
  const voices = catalog.filter(v => v.family === lang);
  const deflt = S.settings.get('piperVoice:lang:' + lang) || (C.PIPER_LANG_DEFAULTS[lang] || [])[0] || (voices[0] && voices[0].key);
  const langName = (langs.find(l => l.family === lang) || {}).name || lang;
  const ps = F.tts.piperStatus();
  el.innerHTML = `
    <div class="row between" style="margin-bottom:8px"><div class="row"><label class="muted small" for="piper-lang">Language</label><select class="select" id="piper-lang" data-piper-langsel style="max-width:260px">${langs.map(l => `<option value="${l.family}" ${l.family === lang ? 'selected' : ''}>${esc(l.name)} (${l.count})</option>`).join('')}</select></div><span class="muted small">${stored.size} voice${stored.size === 1 ? '' : 's'} downloaded${ps.loaded ? ' · runtime ready' : ''}</span></div>
    ${voices.map(v => { const has = stored.has(v.key); const isDef = v.key === deflt; const spk = S.settings.get('piperSpeaker:' + v.key, 0); return `
    <div class="setting-row" style="align-items:flex-start">
      <div><div class="sl">${esc(v.name)} <span class="chip neutral">${esc(v.quality.replace('_', ' '))}</span>${v.speakers > 1 ? ` <span class="chip">${v.speakers} speakers</span>` : ''}${isDef ? ' <span class="chip ok">default for ' + esc(langName) + '</span>' : ''}</div>
        <div class="sd">${esc(v.lang.replace('_', '-'))}${v.country ? ' · ' + esc(v.country) : ''} · ${v.sizeMB} MB${has ? ' · downloaded' : ''} <span data-piper-progress="${esc(v.key)}"></span></div></div>
      <div class="sc" style="flex-wrap:wrap;justify-content:flex-end">
        ${v.speakers > 1 ? `<input class="input" type="number" min="0" max="${v.speakers - 1}" value="${spk}" data-piper-speaker="${esc(v.key)}" style="width:84px" title="Speaker number (0–${v.speakers - 1})">` : ''}
        <button class="btn xs" data-piper-preview="${esc(v.key)}">${I('play')} Preview</button>
        <button class="btn xs ${isDef ? 'primary' : ''}" data-piper-default="${esc(v.key)}" data-lang="${lang}">${isDef ? 'Default' : 'Use for ' + esc(langName)}</button>
        ${has ? `<button class="btn xs ghost" data-piper-remove="${esc(v.key)}" title="Remove the downloaded model">${I('trash')}</button>` : `<button class="btn xs" data-piper-download="${esc(v.key)}">${I('download')} Download</button>`}
      </div></div>`; }).join('')}`;
}
F.bus.on('piper-progress', U.throttle(p => {
  const el = document.querySelector(`[data-piper-progress="${p.voiceId}"]`);
  if (el) el.textContent = p.total ? `· downloading ${Math.round(p.loaded / p.total * 100)}%` : '· downloading…';
}, 300));
F.bus.on('piper-voices', () => { const root = document.getElementById('settings-root'); if (root && !document.querySelector('.modal-back')) renderPiperSection(root); });

// ---------- Settings ----------
function row(label, desc, control){ return `<div class="setting-row"><div><div class="sl">${label}</div>${desc ? `<div class="sd">${desc}</div>` : ''}</div><div class="sc">${control}</div></div>`; }
function sw(key, on){ return `<button class="switch ${on ? 'on' : ''}" data-switch="${key}" aria-label="${key}"></button>`; }
function sel(key, options, cur){ return `<select class="select" data-set="${key}">${options.map(o => `<option value="${esc(o.id)}" ${o.id === cur ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>`; }
function keyField(key, placeholder){ const has = !!S.settings.get(key); return `<div class="row" style="flex-wrap:nowrap"><input class="input" type="password" data-key="${key}" placeholder="${has ? '•••••••• saved on this device' : placeholder}" autocomplete="off" style="min-width:180px"><button class="btn sm" data-savekey="${key}">Save</button>${has ? `<button class="btn sm ghost" data-clearkey="${key}">Clear</button>` : ''}</div>`; }
async function renderSettings(){
  const main = document.getElementById('main');
  const p = F.reader.prefs();
  const ts = F.tts.state;
  const est = await S.estimate();
  const audio = await F.tts.audioCacheStats();
  const bVoices = (F.tts.browser.voices || []).slice().sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));
  const eVoices = S.settings.get('elevenVoices', []);
  const gVoices = S.settings.get('googleVoices', []);
  const elevenSource = F.tts.elevenKeySource();
  const hasEleven = !!elevenSource, hasOpenAI = !!S.settings.get('openaiKey'), hasGoogle = !!S.settings.get('googleTtsKey');
  const kk = F.tts.kokoroStatus();
  const kdev = S.settings.get('kokoroDevice', 'auto');
  const kShowAll = !!S.settings.get('kokoroShowAll', false);
  const gradeRank = g => ({ 'A': 9, 'A-': 8, 'B+': 7, 'B': 6, 'B-': 5, 'C+': 4, 'C': 3, 'C-': 2, 'D+': 1, 'D': 0, 'D-': -1, 'F+': -2, 'F': -3 })[g] ?? 0;
  const pCat = F.tts.piperCatalogCached();
  const pEnglish = pCat ? pCat.filter(v => v.family === 'en') : C.PIPER_LANG_DEFAULTS.en.map(k => ({ key: k, name: k.split('-')[1], lang: k.split('-')[0], quality: k.split('-')[2] }));
  const off = { caches: F.offline.cachesOk(), online: F.offline.online() };
  const OCR_LANGS = [['eng', 'English'], ['deu', 'German'], ['fra', 'French'], ['spa', 'Spanish'], ['ita', 'Italian'], ['por', 'Portuguese'], ['nld', 'Dutch'], ['rus', 'Russian'], ['pol', 'Polish'], ['swe', 'Swedish'], ['lat', 'Latin'], ['jpn', 'Japanese'], ['chi_sim', 'Chinese (simplified)']];
  main.innerHTML = `<div id="settings-root">
    <div class="view-head"><div><div class="eyebrow">Settings</div><h1>Make it yours</h1><p class="lead">Reading defaults, voices, recognition, and your data. API keys are stored only in this browser and sent only to the provider you chose.</p></div></div>
    <div class="card section" style="margin-top:0"><h2>Reading</h2>
      ${row('Theme', 'Also in the reader under Aa', `<div class="swatches">${C.THEMES.map(t => `<button class="swatch ${t.id === p.theme ? 'on' : ''}" data-set="theme" data-v="${t.id}" data-t="${t.id}" aria-label="${t.name}"></button>`).join('')}</div>`)}
      ${row('Font', '', sel('font', C.FONTS, p.font))}
      ${row('Text size', '', `<div class="size-ctl"><button class="small-a" data-step="fontSize" data-v="-1" data-min="13" data-max="34" data-inc="1">A</button><span>${p.size}</span><button class="big-a" data-step="fontSize" data-v="1" data-min="13" data-max="34" data-inc="1">A</button></div>`)}
      ${row('Layout', 'Pages with turns, or one continuous scroll', sel('readMode', [{ id: 'paged', name: 'Pages' }, { id: 'scroll', name: 'Scroll' }], p.mode))}
      ${row('Page turn', '', sel('pageTurn', [{ id: 'flip', name: '3D flip' }, { id: 'slide', name: 'Slide' }, { id: 'none', name: 'Instant' }], p.turn))}
      ${row('Two-page spread', 'On wide screens such as an iPad in landscape', sw('spread', p.spread))}
      ${row('Follow narration', 'Turn the page when the voice reaches it', sw('autoAdvance', p.autoAdvance))}
    </div>
    <div class="card section"><h2>Voices</h2>
      <p class="muted small" style="margin:6px 0 10px;line-height:1.5">Five ways to be read to. <b>Browser voices</b> use what the device already has (Edge's "Natural" voices and iOS "Premium" voices are the good ones). <b>On-device</b> runs an open-source voice model inside this browser: free, private, and offline after a one-time download. <b>ElevenLabs</b> gives the most natural voices with exact word timing. <b>OpenAI</b> and <b>Google Cloud</b> are cloud voices billed to your own key (Google includes a free monthly allowance). Every persona is an original synthetic character chosen for how it reads, never an imitation of a real person.</p>
      ${row('Default provider', '', `<div class="segmented" data-seg="ttsProvider">${Object.keys(F.tts.PROVIDERS).map(id => `<button data-v="${id}" class="${ts.provider === id ? 'on' : ''}" ${F.tts.providerReady(id) ? '' : 'disabled title="Set up below"'}>${esc(F.tts.providerShort(id))}</button>`).join('')}</div>`)}
      <div class="divider"></div>
      <h3 style="margin-bottom:6px">On-device voice (Kokoro)</h3>
      ${row('Voice model', kk.loaded ? `Ready · running on ${kk.device === 'webgpu' ? 'the GPU (fp32, 326 MB)' : 'WebAssembly (q8, 92 MB)'}` : kk.loading ? `Downloading… ${Math.round(kk.progress * 100)}%` : kk.error ? `Could not load: ${esc(kk.error)}` : `Not downloaded yet. About ${(kdev === 'gpu' || (kdev === 'auto' && kk.gpuAvailable)) ? '326 MB (GPU build)' : '92 MB'}, once; kept in the browser cache.`, kk.loaded ? '<span class="chip ok">Ready</span>' : `<button class="btn sm primary" data-a="kokoro-load" ${kk.loading ? 'disabled' : ''}>${I('download')} ${kk.loading ? 'Downloading…' : 'Download voice model'}</button>`)}
      ${row('Compute', 'GPU is faster and full precision but a larger download; WebAssembly runs anywhere. Reload after changing.', `<div class="segmented" data-seg="kokoroDevice"><button data-v="auto" class="${kdev === 'auto' ? 'on' : ''}">Auto</button><button data-v="gpu" class="${kdev === 'gpu' ? 'on' : ''}" ${kk.gpuAvailable ? '' : 'disabled title="No WebGPU in this browser"'}>GPU</button><button data-v="cpu" class="${kdev === 'cpu' ? 'on' : ''}">WebAssembly</button></div>`)}
      <div class="row between" style="margin:10px 0 6px"><span class="muted small">Voice gallery (English). Tap one to hear it${kk.loaded ? '' : ' (the first tap downloads the model)'}:</span><button class="btn xs ghost" data-a="kokoro-showall">${kShowAll ? 'Show recommended only' : `Show all ${C.KOKORO_VOICES.length} voices`}</button></div>
      <div class="chips" style="margin-bottom:4px">${C.KOKORO_VOICES.filter(v => kShowAll || gradeRank(v.grade) >= gradeRank('C')).map(v => `<button class="chip" data-kvoice="${v.id}" title="${esc(v.desc)} · model-card grade ${v.grade}" style="cursor:pointer;border:1px solid transparent;gap:6px">${I('play')} <b>${esc(v.name)}</b> <span style="font-weight:500;opacity:.8">${esc(v.desc)} · ${esc(v.accent)} · ${esc(v.grade)}</span></button>`).join('')}</div>
      <div class="divider"></div>
      <h3 style="margin-bottom:6px">On-device multilingual voices (Piper)</h3>
      <p class="muted small" style="margin:4px 0 8px;line-height:1.5">124 open voice models in 38 languages from the Piper project, several with many speakers (the British VCTK model carries 109, the American LibriTTS model 904). Each model is a one-time download of about 20–130 MB and then works offline. Folio picks a voice from the book's language automatically; choose your own default per language here, and pick a speaker number on multi-speaker models.</p>
      <div id="piper-section" class="muted small">Loading the voice catalog…</div>
      <div class="divider"></div>
      <h3 style="margin-bottom:6px">Cloud providers</h3>
      ${elevenSource === 'shared' || (elevenSource === 'own' && U.sharedKey('elevenlabs')) ? row('Shared ElevenLabs key', elevenSource === 'shared' ? 'Provided by the site owner for everyone who uses this site; a key of your own below takes precedence' : 'Provided by the site owner; you are using your own key instead', `<span id="eleven-usage" class="muted small">Checking this month's allowance…</span>`) : ''}
      ${row('ElevenLabs API key', elevenSource === 'shared' ? 'Optional: your own key for the most natural voices with exact word sync; overrides the shared one' : 'The most natural voices, exact word sync; subscription credits', keyField('elevenlabsKey', 'xi-…'))}
      ${hasEleven ? row('ElevenLabs model', '', sel('elevenModel', C.ELEVEN_MODELS, S.settings.get('elevenModel', 'eleven_multilingual_v2'))) : ''}
      ${hasEleven ? row('ElevenLabs voice list', eVoices.length ? `${eVoices.length} voices loaded` : 'Load the voices available to your account', `<button class="btn sm" data-a="refresh-eleven">${I('refresh')} Refresh voices</button>`) : ''}
      ${row('OpenAI API key', 'Pay-as-you-go voices steered by each persona; also enables vision OCR', keyField('openaiKey', 'sk-…'))}
      ${hasOpenAI ? row('OpenAI speech model', 'gpt-4o-mini-tts follows persona directions; tts-1 is cheaper', `<input class="input" data-set-text="openaiTtsModel" value="${esc(S.settings.get('openaiTtsModel', 'gpt-4o-mini-tts'))}" style="max-width:200px">`) : ''}
      ${row('Google Cloud API key', 'Chirp 3 HD and Neural2 voices; 1M characters a month free, then pay-as-you-go. Enable the Text-to-Speech API and restrict the key to this website.', keyField('googleTtsKey', 'AIza…'))}
      ${hasGoogle ? row('Google voice list', gVoices.length ? `${gVoices.length} English voices loaded` : 'Load the voices available to your project', `<button class="btn sm" data-a="refresh-google">${I('refresh')} Refresh voices</button>`) : ''}
      <div class="divider"></div>
      <h3 style="margin-bottom:6px">Personas</h3>
      <div class="muted small" style="margin-bottom:4px">Each persona picks a fitting voice on every provider by itself. Override any of them here.</div>
      ${['Narrators', 'Readers'].map(group => `<div class="eyebrow" style="margin:14px 0 2px">${group}</div>` + C.PERSONAS.filter(pe => (pe.group || 'Narrators') === group).map(pe => `<div class="setting-row" style="align-items:flex-start"><div><div class="sl">${esc(pe.name)}</div><div class="sd">${esc(pe.tagline)}</div></div><div class="sc" style="flex-direction:column;align-items:stretch;gap:6px;min-width:230px">
        <select class="select" data-set="browserVoice:${pe.id}"><option value="">Browser: automatic</option>${bVoices.map(v => `<option value="${esc(v.voiceURI)}" ${S.settings.get('browserVoice:' + pe.id) === v.voiceURI ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('')}</select>
        <select class="select" data-set="kokoroVoice:${pe.id}"><option value="">On-device: ${esc((C.KOKORO_VOICES.find(v => v.id === pe.kokoroVoice) || { name: pe.kokoroVoice }).name)} (default)</option>${C.KOKORO_VOICES.map(v => `<option value="${v.id}" ${S.settings.get('kokoroVoice:' + pe.id) === v.id ? 'selected' : ''}>${esc(v.name)} · ${esc(v.desc)} · ${esc(v.grade)}</option>`).join('')}</select>
        <select class="select" data-set="piperVoice:${pe.id}"><option value="">Piper: ${esc(F.tts.piperVoiceLabel(pe.piperVoice))} (default)</option>${pEnglish.map(v => `<option value="${esc(v.key)}" ${S.settings.get('piperVoice:' + pe.id) === v.key ? 'selected' : ''}>${esc(v.name)} · ${esc(String(v.lang).replace('_', '-'))} · ${esc(v.quality)}${v.speakers > 1 ? ` · ${v.speakers} speakers` : ''}</option>`).join('')}</select>
        ${hasEleven && eVoices.length ? `<select class="select" data-set="elevenVoice:${pe.id}"><option value="">ElevenLabs: automatic</option>${eVoices.map(v => `<option value="${esc(v.id)}" ${S.settings.get('elevenVoice:' + pe.id) === v.id ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>` : ''}
        ${hasOpenAI ? `<select class="select" data-set="openaiVoice:${pe.id}"><option value="">OpenAI: ${esc(pe.openaiVoice)} (default)</option>${C.OPENAI_VOICES.map(v => `<option value="${v}" ${S.settings.get('openaiVoice:' + pe.id) === v ? 'selected' : ''}>${v}</option>`).join('')}</select>` : ''}
        ${hasGoogle && gVoices.length ? `<select class="select" data-set="googleVoice:${pe.id}"><option value="">Google: ${esc(F.tts.resolveGoogleVoice(pe))} (auto)</option>${gVoices.map(v => `<option value="${esc(v.name)}" ${S.settings.get('googleVoice:' + pe.id) === v.name ? 'selected' : ''}>${esc(v.name)} · ${esc(v.family)}${v.gender ? ' · ' + esc(v.gender) : ''}</option>`).join('')}</select>` : ''}
        <button class="btn xs" data-preview="${pe.id}">${I('play')} Preview with ${esc(F.tts.providerShort(ts.provider))}</button></div></div>`).join('')).join('')}
    </div>
    <div class="card section"><h2>Recognition (OCR)</h2>
      ${row('Engine', 'On-device recognition never leaves this browser', `<div class="segmented" data-seg="ocrEngine"><button data-v="tesseract" class="${S.settings.get('ocrEngine', 'tesseract') === 'tesseract' ? 'on' : ''}">On device</button><button data-v="openai" class="${S.settings.get('ocrEngine') === 'openai' ? 'on' : ''}" ${hasOpenAI ? '' : 'disabled'}>OpenAI vision</button></div>`)}
      ${row('Language', 'For on-device recognition', sel('ocrLang', OCR_LANGS.map(([id, name]) => ({ id, name })), S.settings.get('ocrLang', 'eng')))}
      ${row('Recognize scanned PDFs automatically', 'Pages without a text layer are OCR’d during import', sw('ocrAuto', S.settings.get('ocrAuto', true) !== false))}
      ${hasOpenAI ? row('OpenAI vision model', '', `<input class="input" data-set-text="openaiVisionModel" value="${esc(S.settings.get('openaiVisionModel', 'gpt-4o-mini'))}" style="max-width:200px">`) : ''}
    </div>
    <div class="card section"><h2>Catalog</h2>
      ${row('Google Books API key', 'Optional; lifts the anonymous rate limit', keyField('googleBooksKey', 'AIza…'))}
    </div>
    <div class="card section" id="offline-card"><h2>Offline</h2>
      <p class="muted small" style="margin:6px 0 10px;line-height:1.5">Your books, progress and settings already live on this device. The offline pack adds everything else the app needs without a connection: the PDF and EPUB engines, text recognition with English data, the on-device voice model and the voice gallery, and the fonts. Catalog search and cloud voices always need a connection.</p>
      <div id="offline-status" class="muted small">Checking…</div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-a="offline-pack" ${off.caches ? '' : 'disabled'}>${I('download')} Download everything for offline</button><button class="btn sm" data-a="offline-recheck">${I('refresh')} Re-check</button></div>
      ${off.caches ? '' : '<div class="notice warn" style="margin-top:10px">Offline storage is not available in this copy (sandboxed host). Use the installed site instead.</div>'}
    </div>
    <div class="card section"><h2>Your data</h2>
      ${row('Storage', est ? `${(est.usage / 1e6).toFixed(1)} MB used${est.quota ? ` of about ${Math.round(est.quota / 1e9)} GB available` : ''} · ${S.mode === 'memory' ? '<b>not persisting (private mode?)</b>' : 'IndexedDB on this device'}` : 'IndexedDB on this device', '')}
      ${row('Narration cache', `${audio.count} clips · ${(audio.bytes / 1e6).toFixed(1)} MB · ${U.fmtCompact(audio.chars)} characters synthesized`, `<button class="btn sm" data-a="clear-audio">Clear</button>`)}
      ${row('Backup', 'Books, progress, sessions and settings as one JSON file (keys excluded)', `<div class="row"><button class="btn sm" data-a="export">${I('download')} Export</button><button class="btn sm" data-a="import">${I('upload')} Restore</button></div>`)}
      ${row('Sample book', 'Re-add the bundled public-domain sample', `<button class="btn sm" data-a="sample">Add sample</button>`)}
      ${row('Reset pace estimate', 'Forget the learned speech timing used for browser-voice highlighting', `<button class="btn sm" data-a="reset-cps">Reset</button>`)}
      ${row('Delete everything', 'Removes all books, history and settings from this device', `<button class="btn sm danger" data-a="wipe">${I('trash')} Delete all</button>`)}
    </div>
    <div class="card section"><h2>About Folio</h2>
      <p class="muted small" style="margin-top:8px;line-height:1.55">Version ${C.VERSION} · build ${esc(C.BUILD)}${C.SITE ? ' · installed-site build' : ' · single-file build'}${U.isStandalone() ? ' · running as an installed app' : ''}. Folio is a single-file reading room: PDF and EPUB parsing, text recognition, narration, page mapping and statistics all run inside this browser tab. There is no account and no server of its own. The only network calls are to the public catalogs you search (Open Library, Internet Archive, Gutendex, Google Books), to fonts and the code libraries it loads (pdf.js, JSZip, Tesseract.js), and to a speech provider if you add a key.<br><br>On iPhone or iPad, open this page in Safari and choose <b>Share → Add to Home Screen</b> for a full-screen app. On Android, use <b>Install app</b> from the browser menu.</p>
    </div></div>`;
  const root = main.querySelector('#settings-root');
  root.addEventListener('click', async e => {
    const seg = e.target.closest('[data-seg] button');
    if (seg) { const key = seg.parentElement.dataset.seg, v = seg.dataset.v; if (key === 'ttsProvider') F.tts.setProvider(v); else await S.settings.set(key, v); return renderSettings(); }
    const swb = e.target.closest('[data-switch]');
    if (swb) { const k = swb.dataset.switch; const cur = k === 'ocrAuto' ? S.settings.get('ocrAuto', true) !== false : k === 'spread' ? p.spread : k === 'autoAdvance' ? p.autoAdvance : !!S.settings.get(k); await S.settings.set(k, !cur); F.reader.applyPrefs(false); return renderSettings(); }
    const sset = e.target.closest('[data-set][data-v]');
    if (sset) { await S.settings.set(sset.dataset.set, sset.dataset.v); F.reader.applyPrefs(false); return renderSettings(); }
    const step = e.target.closest('[data-step]');
    if (step) { const k = step.dataset.step; const cur = +S.settings.get(k, 19); await S.settings.set(k, U.clamp(cur + (+step.dataset.v) * (+step.dataset.inc), +step.dataset.min, +step.dataset.max)); F.reader.applyPrefs(false); return renderSettings(); }
    const sk = e.target.closest('[data-savekey]');
    if (sk) { const k = sk.dataset.savekey; const inp = main.querySelector(`[data-key="${k}"]`); const v = inp.value.trim(); if (!v) return UI.toast('Paste a key first.', { type: 'error' }); await S.settings.set(k, v); UI.toast('Key saved on this device.', { type: 'ok' }); if (k === 'elevenlabsKey') { try { await F.tts.fetchElevenVoices(); } catch (err) { UI.toast(err.message, { type: 'error' }); } } if (k === 'googleTtsKey') { try { await F.tts.fetchGoogleVoices(); } catch (err) { UI.toast(err.message, { type: 'error', timeout: 8000 }); } } return renderSettings(); }
    const ck = e.target.closest('[data-clearkey]');
    if (ck) { await S.settings.remove(ck.dataset.clearkey); if (ck.dataset.clearkey === 'elevenlabsKey') await S.settings.remove('elevenVoices'); if (ck.dataset.clearkey === 'googleTtsKey') await S.settings.remove('googleVoices'); if (!F.tts.providerReady(F.tts.state.provider)) F.tts.setProvider('browser'); return renderSettings(); }
    const pv = e.target.closest('[data-preview]');
    if (pv) { try { if (F.tts.state.provider === 'kokoro' && !F.tts.kokoroStatus().loaded) UI.toast('Downloading the on-device voice model first…'); await F.tts.preview(pv.dataset.preview); } catch (err) { UI.toast(err.message, { type: 'error' }); } return; }
    const pp = e.target.closest('[data-piper-preview]');
    if (pp) { const key = pp.dataset.piperPreview; try { if (!F.tts.piperStoredCached().includes(key)) UI.toast('Downloading this voice first (once)…', { timeout: 6000 }); await F.tts.piperPreview(key, S.settings.get('piperSpeaker:' + key, 0)); } catch (err) { UI.toast(err.message || 'Could not play this voice', { type: 'error', timeout: 8000 }); } return; }
    const pd = e.target.closest('[data-piper-default]');
    if (pd) { await S.settings.set('piperVoice:lang:' + pd.dataset.lang, pd.dataset.piperDefault); UI.toast(`Default ${esc(C.LANG_NAMES[pd.dataset.lang] || pd.dataset.lang)} voice set.`, { type: 'ok' }); renderPiperSection(root); return; }
    const pdl = e.target.closest('[data-piper-download]');
    if (pdl) { const key = pdl.dataset.piperDownload; pdl.disabled = true; pdl.textContent = 'Downloading…'; try { await F.tts.piperDownload(key); UI.toast('Voice downloaded.', { type: 'ok' }); } catch (err) { UI.toast(err.message || 'Download failed', { type: 'error', timeout: 8000 }); } renderPiperSection(root); return; }
    const prm = e.target.closest('[data-piper-remove]');
    if (prm) { if (await UI.confirm('Remove this voice?', 'The downloaded model is deleted from this device. You can download it again any time.', { okLabel: 'Remove', danger: true })) { try { await F.tts.piperRemove(prm.dataset.piperRemove); } catch (err) { UI.toast(err.message, { type: 'error' }); } renderPiperSection(root); } return; }
    const kv = e.target.closest('[data-kvoice]');
    if (kv) { try { if (!F.tts.kokoroStatus().loaded) UI.toast('Downloading the on-device voice model first (once)…', { timeout: 6000 }); await F.tts.kokoroPreviewVoice(kv.dataset.kvoice); } catch (err) { UI.toast(err.message || 'Could not play this voice', { type: 'error' }); } return; }
    const a = e.target.closest('[data-a]');
    if (!a) return;
    const act = a.dataset.a;
    if (act === 'offline-pack') {
      const pm = UI.progressModal('Preparing Folio for offline use');
      try {
        const r = await F.offline.prepare(p => pm.update({ message: p.label, percent: p.percent }));
        pm.close();
        UI.toast(r.warnings.length ? `Offline pack ready with ${r.warnings.length} warning(s): ${r.warnings[0]}` : 'Offline pack ready. Folio now works without a connection on this device.', { type: r.warnings.length ? 'error' : 'ok', timeout: 8000 });
      } catch (err) { pm.close(); UI.toast(err.message || String(err), { type: 'error', timeout: 8000 }); }
      renderSettings(); return;
    }
    if (act === 'offline-recheck') { renderSettings(); return; }
    if (act === 'kokoro-showall') { await S.settings.set('kokoroShowAll', !kShowAll); return renderSettings(); }
    if (act === 'kokoro-load') { try { UI.toast('Downloading the on-device voice model…'); await F.tts.loadKokoro(); UI.toast('On-device voice ready.', { type: 'ok' }); } catch (err) { UI.toast('Voice model failed to load: ' + (err.message || err), { type: 'error', timeout: 9000 }); } renderSettings(); }
    else if (act === 'refresh-google') { try { const v = await F.tts.fetchGoogleVoices(); UI.toast(`${v.length} Google voices loaded.`, { type: 'ok' }); renderSettings(); } catch (err) { UI.toast(err.message, { type: 'error', timeout: 8000 }); } }
    else if (act === 'refresh-eleven') { try { const v = await F.tts.fetchElevenVoices(); UI.toast(`${v.length} ElevenLabs voices loaded.`, { type: 'ok' }); renderSettings(); } catch (err) { UI.toast(err.message, { type: 'error' }); } }
    else if (act === 'clear-audio') { await F.tts.clearAudioCache(); UI.toast('Narration cache cleared.'); renderSettings(); }
    else if (act === 'export') { const data = await S.exportAll(); U.download(`folio-backup-${U.dayKey()}.json`, new Blob([JSON.stringify(data)], { type: 'application/json' })); }
    else if (act === 'import') { const files = await U.pickFiles('.json,application/json'); if (!files[0]) return; try { const data = JSON.parse(await U.readAsText(files[0])); const counts = await S.importAll(data); UI.toast(`Restored ${counts.books} books, ${counts.sessions} sessions.`, { type: 'ok' }); F.bus.emit('books-changed', {}); F.reader.applyPrefs(false); renderSettings(); } catch (err) { UI.toast(err.message, { type: 'error' }); } }
    else if (act === 'sample') { await F.app.addSample(true); UI.toast('Sample book added.', { type: 'ok' }); }
    else if (act === 'reset-cps') { await S.settings.remove('ttsCps'); UI.toast('Pace estimate reset.'); }
    else if (act === 'wipe') { if (await UI.confirm('Delete everything?', 'All books, reading history, calibration, cached audio and settings on this device will be removed. This cannot be undone.', { okLabel: 'Delete all', danger: true })) { await S.wipe(); location.hash = '#/library'; location.reload(); } }
  });
  renderPiperSection(root);
  if (hasEleven) F.tts.elevenUsage().then(u => {
    const el = root.querySelector('#eleven-usage');
    if (!el || !u) return;
    const pct = u.limit ? Math.round(u.used / u.limit * 100) : 0;
    const left = Math.max(0, u.limit - u.used);
    el.innerHTML = `<span class="chip ${left < 500 ? 'warn' : 'ok'}">${esc(u.tier)} plan</span> ${U.fmtNum(u.used)} of ${U.fmtNum(u.limit)} characters used this month (${pct}%) · about ${Math.round(left / 15 / 60)} min of narration left${u.resetAt ? ` · resets ${esc(U.fmtDate(u.resetAt))}` : ''}`;
  }).catch(e => { const el = root.querySelector('#eleven-usage'); if (el) el.textContent = 'Allowance could not be checked: ' + (e.message || e); });
  // offline status is async; fill it in after the first paint
  F.offline.status().then(st => {
    const el = root.querySelector('#offline-status');
    if (!el) return;
    const yes = t => `<span class="chip ok">${esc(t)}</span>`, no = t => `<span class="chip neutral">${esc(t)}</span>`;
    const rows = [
      ['Connection', st.online ? yes('Online') : `<span class="chip warn">Offline</span>`],
      ['App shell (service worker)', st.sw ? yes('Cached') : no(st.caches ? 'Not yet controlling this tab; reload once' : 'Unavailable')],
      ['Import engines (PDF, EPUB)', st.core.filter(c => c.ok).length === st.core.length ? yes('Cached') : no(`${st.core.filter(c => c.ok).length}/${st.core.length} cached`)],
      ['Text recognition (OCR)', st.ocr ? yes('Cached') : no('Not yet')],
      ['On-device voice model', st.kokoroModel ? yes('Cached') : no('Not yet')],
      ['Voice gallery', st.kokoroVoices >= C.KOKORO_VOICES.length ? yes('All voices cached') : no(`${st.kokoroVoices}/${C.KOKORO_VOICES.length} voices`)],
      ['Multilingual voices (Piper)', st.piperRuntime ? yes(`Runtime cached · ${st.piperVoices} voice${st.piperVoices === 1 ? '' : 's'} downloaded`) : no(st.piperVoices ? `${st.piperVoices} voices downloaded, runtime not yet cached` : 'Not yet')],
      ['Fonts', st.fonts ? yes('Cached') : no('Fallback fonts only')],
    ];
    el.innerHTML = `<div class="kv" style="grid-template-columns:auto auto;gap:8px 16px">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</div>` +
      `<div style="margin-top:8px">${st.packedAt ? `Offline pack last prepared ${esc(U.relTime(st.packedAt))}.` : 'Offline pack not prepared yet.'}${st.usage ? ` Storage in use: ${(st.usage / 1e6).toFixed(0)} MB${st.quota ? ` of about ${Math.round(st.quota / 1e9)} GB available` : ''}.` : ''}</div>`;
  }).catch(() => {});
  root.addEventListener('change', async e => {
    const pl = e.target.closest('[data-piper-langsel]');
    if (pl) { UI.piperLang = pl.value; renderPiperSection(root); return; }
    const psk = e.target.closest('[data-piper-speaker]');
    if (psk) { await S.settings.set('piperSpeaker:' + psk.dataset.piperSpeaker, Math.max(0, +psk.value || 0)); UI.toast(`Speaker ${Math.max(0, +psk.value || 0)} selected.`); return; }
    const s = e.target.closest('[data-set]');
    if (s && s.tagName === 'SELECT') { if (s.value === '') await S.settings.remove(s.dataset.set); else await S.settings.set(s.dataset.set, s.value); F.reader.applyPrefs(false); if (['font', 'readMode', 'pageTurn', 'theme'].includes(s.dataset.set)) renderSettings(); return; }
    const t = e.target.closest('[data-set-text]');
    if (t) { await S.settings.set(t.dataset.setText, t.value.trim()); UI.toast('Saved.'); }
  });
}
})();
