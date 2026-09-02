/* 11_app.js — boot sequence */
(function(){
'use strict';
const F = window.F;
const S = F.store;
const APP = F.app = {};

APP.addSample = async (force) => {
  if (!force && S.settings.get('seeded')) return false;
  if (!force && (await S.count('books')) > 0) { await S.settings.set('seeded', true); return false; }
  const sb = F.SAMPLE_BOOK;
  if (!sb) return false;
  const res = await F.ingest.fromText(sb.text, { title: sb.title, author: sb.author, language: sb.language, subjects: sb.subjects, description: sb.description, source: 'sample' });
  res.book.source = 'sample';
  await F.ingest.save(res);
  await S.settings.set('seeded', true);
  F.catalog.enrichBook(res.book.id).catch(() => {});
  return true;
};

async function boot(){
  try {
    await S.ready();
    await S.settings.load();
    F.reader.init();
    F.reader.applyPrefs(false);
    F.tts.init();
    await F.analytics.recover();
    try { await APP.addSample(false); } catch (e) { console.warn('sample failed', e); }
    F.ui.init();
    if (!S.available) F.ui.toast(F.util.sandboxed ? 'This host runs Folio in a sandbox that blocks storage: your library will reset when the tab closes.' : 'This browser is refusing storage (private mode?): your library will not persist after this tab closes.', { type: 'error', timeout: 9000 });
    S.requestPersist();
  } catch (e) {
    console.error(e);
    document.getElementById('main').innerHTML = `<div class="notice warn">Folio could not start: ${F.util.esc(e.message || e)}</div>`;
  }
}
window.addEventListener('error', e => console.error('[folio]', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('[folio]', e.reason));
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
