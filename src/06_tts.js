/* 06_tts.js — speech providers (browser voices, on-device Kokoro, ElevenLabs, OpenAI, Google Cloud), playback controller, word sync */
(function(){
'use strict';
const F = window.F;
const U = F.util, T = F.text, S = F.store, C = F.C;
const X = F.tts = {};

const state = X.state = {
  status: 'idle',            // idle | loading | playing | paused
  provider: 'browser',       // browser | kokoro | elevenlabs | openai | google
  personaId: 'calm-narrator',
  speed: 1,
  bookId: null,
  loc: null,                 // { c, p, s } current sentence
  word: -1,                  // current word index within the sentence
  sleepMode: 0,              // 0 off, -1 end of chapter, N minutes
  sleepAt: null,
  error: null,
  loadingMsg: '',
};
let book = null, content = null;
let session = 0;            // increments on every stop/seek; async callbacks check it
let currentUtterance = null; // keep a reference (Chrome GC bug)
const emit = () => F.bus.emit('tts', Object.assign({}, state));

const PROVIDERS = {
  browser:    { name: 'Browser voices',   short: 'Browser',   ready: () => browser.available() },
  kokoro:     { name: 'On-device (Kokoro)', short: 'On-device', ready: () => kokoroSupported() },
  elevenlabs: { name: 'ElevenLabs',       short: 'ElevenLabs', ready: () => !!S.settings.get('elevenlabsKey') },
  openai:     { name: 'OpenAI',           short: 'OpenAI',    ready: () => !!S.settings.get('openaiKey') },
  google:     { name: 'Google Cloud',     short: 'Google',    ready: () => !!S.settings.get('googleTtsKey') },
};
X.PROVIDERS = PROVIDERS;
X.providerReady = id => !!(PROVIDERS[id] && PROVIDERS[id].ready());
X.providerName = id => (PROVIDERS[id] || {}).name || id;
X.providerShort = id => (PROVIDERS[id] || {}).short || id;

X.init = () => {
  state.provider = S.settings.get('ttsProvider', 'browser');
  state.personaId = S.settings.get('ttsPersona', 'calm-narrator');
  state.speed = +S.settings.get('ttsSpeed', 1) || 1;
  if (!X.providerReady(state.provider)) state.provider = 'browser';
  if (browser.available()) browser.loadVoices().then(v => { browser.voices = v; F.bus.emit('tts-voices', v); });
  try { if (window.speechSynthesis) speechSynthesis.addEventListener('voiceschanged', () => { browser.voices = speechSynthesis.getVoices(); F.bus.emit('tts-voices', browser.voices); }); } catch (e) {}
};
X.persona = () => C.PERSONAS.find(p => p.id === state.personaId) || C.PERSONAS[0];
X.load = (b, c) => {
  if (book && b && book.id !== b.id) X.stop();
  book = b; content = c;
  state.bookId = b ? b.id : null;
  if (!b) state.loc = null;
};
X.isPlaying = () => state.status === 'playing' || state.status === 'loading';

function fail(msg){
  state.status = 'idle'; state.error = msg; state.loadingMsg = '';
  emit();
  F.bus.emit('tts-error', { message: msg });
}
function setWord(w){
  if (w === state.word) return;
  state.word = w;
  if (state.loc) F.bus.emit('tts-word', { c: state.loc.c, p: state.loc.p, s: state.loc.s, w });
}
function setSentence(loc, w){
  state.loc = { c: loc.c, p: loc.p, s: loc.s };
  state.word = -1;
  F.bus.emit('tts-sentence', { c: loc.c, p: loc.p, s: loc.s, w: w || 0 });
  setWord(w || 0);
}
function wordAtChar(words, absChar){
  let lo = 0, hi = words.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (words[mid].start <= absChar) lo = mid; else hi = mid - 1; }
  return lo;
}
function sleepShouldStop(nextLoc){
  if (state.sleepMode === -1 && state.loc && nextLoc && nextLoc.c !== state.loc.c) return true;
  if (state.sleepAt && Date.now() >= state.sleepAt) return true;
  return false;
}
function finished(){
  state.status = 'idle'; state.loadingMsg = '';
  emit();
  F.bus.emit('tts-ended', { bookId: state.bookId });
}
function sleepStop(){
  X.pause();
  state.sleepMode = 0; state.sleepAt = null;
  emit();
  F.bus.emit('tts-sleep', {});
}
function setLoading(msg){
  if (state.status !== 'loading' && state.status !== 'playing') return;
  if (state.loadingMsg !== msg) { state.loadingMsg = msg; emit(); }
}

// =====================================================================
// Browser speech synthesis
// =====================================================================
const browser = X.browser = {
  voices: [],
  blocked: new Set(),
  available: () => 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window,
  loadVoices(){
    return new Promise(res => {
      const v = speechSynthesis.getVoices();
      if (v && v.length) return res(v);
      let done = false;
      const h = () => { if (done) return; done = true; res(speechSynthesis.getVoices() || []); };
      try { speechSynthesis.addEventListener('voiceschanged', h, { once: true }); } catch (e) {}
      setTimeout(h, 1500);
    });
  },
  pickVoice(persona, lang){
    const all = this.voices.length ? this.voices : (speechSynthesis.getVoices() || []);
    if (!all.length) return null;
    const voices = all.filter(v => !this.blocked.has(v.voiceURI));
    if (!voices.length) { this.blocked.clear(); return all[0]; }
    const override = S.settings.get('browserVoice:' + persona.id);
    if (override) { const v = voices.find(v => v.voiceURI === override || v.name === override); if (v) return v; }
    const pref = (lang || (book && book.language) || navigator.language || 'en').slice(0, 2).toLowerCase();
    let pool = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith(pref));
    if (!pool.length) pool = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith('en'));
    if (!pool.length) pool = voices.slice();
    const quality = pool.filter(v => /premium|enhanced|natural|neural|siri/i.test(v.name));
    for (const hint of persona.browserHints || []) {
      const v = quality.find(v => v.name.toLowerCase().includes(hint.toLowerCase())) || pool.find(v => v.name.toLowerCase().includes(hint.toLowerCase()));
      if (v) return v;
    }
    return quality[0] || pool.find(v => v.localService) || pool.find(v => v.default) || pool[0];
  },
};
const est = { cps: +S.settings.get('ttsCps', 15.5) || 15.5 }; // characters per second at rate 1 (learned)

function chunkText(text, max){
  if (text.length <= max) return [{ text, offset: 0 }];
  const out = [];
  let pos = 0;
  while (pos < text.length) {
    let end = Math.min(text.length, pos + max);
    if (end < text.length) {
      const slice = text.slice(pos, end);
      let cut = Math.max(slice.lastIndexOf('; '), slice.lastIndexOf(', '), slice.lastIndexOf(': '), slice.lastIndexOf(' — '), slice.lastIndexOf('—'));
      if (cut < max * 0.4) cut = slice.lastIndexOf(' ');
      if (cut > 0) end = pos + cut + 1;
    }
    out.push({ text: text.slice(pos, end), offset: pos });
    pos = end;
  }
  return out.filter(c => c.text.trim().length);
}

function speakSentence(loc, startWord, mySession, delayMs){
  if (mySession !== session) return;
  const sent = T.sentenceAt(content, loc);
  if (!sent || !sent.words.length) return advanceSentence(mySession);
  startWord = U.clamp(startWord || 0, 0, sent.words.length - 1);
  const fromChar = sent.words[startWord].start;
  const text = sent.text.slice(fromChar);
  const chunks = chunkText(text, 190);
  const words = sent.words;
  setSentence(loc, startWord);
  const persona = X.persona();
  const voice = browser.pickVoice(persona, book && book.language);
  const go = () => speakChunk(0);
  if (delayMs) setTimeout(() => { if (mySession === session) go(); }, delayMs); else go();

  function speakChunk(ci){
    if (mySession !== session) return;
    if (ci >= chunks.length) return advanceSentence(mySession);
    const chunk = chunks[ci];
    const u = new SpeechSynthesisUtterance(chunk.text);
    if (voice) { u.voice = voice; u.lang = voice.lang; }
    u.rate = U.clamp(persona.rate * state.speed, 0.5, 3.5);
    u.pitch = U.clamp(persona.pitch, 0.5, 2);
    u.volume = 1;
    const chunkStartWord = wordAtChar(words, fromChar + chunk.offset);
    const chunkEndWord = wordAtChar(words, fromChar + chunk.offset + chunk.text.length - 1);
    let gotBoundary = false, startedAt = 0, ended = false, estTimer = null, estTick = null, watchdog = null;
    const stopEstimate = () => { if (estTick) { clearTimeout(estTick); estTick = null; } if (estTimer) { clearTimeout(estTimer); estTimer = null; } if (watchdog) { clearTimeout(watchdog); watchdog = null; } };
    // If the engine never reports a start, the voice is unusable here (typical for some remote voices offline): try another voice once, then give up clearly.
    watchdog = setTimeout(() => {
      if (startedAt || ended || mySession !== session) return;
      ended = true; stopEstimate();
      try { speechSynthesis.cancel(); } catch (err) {}
      if (voice && !browser.blocked.has(voice.voiceURI) && browser.voices.length > 1 && !speakSentence.retried) {
        browser.blocked.add(voice.voiceURI);
        speakSentence.retried = true;
        setTimeout(() => { if (mySession === session) speakSentence(loc, startWord, mySession, 0); }, 120);
        return;
      }
      speakSentence.retried = false;
      fail('The speech voice did not start. Pick another voice under Settings → Voices, or check that the device is not muted.');
    }, 4500);
    const runEstimate = () => {
      const cps = est.cps * u.rate;
      const tick = () => {
        if (ended || mySession !== session) return;
        const chars = ((performance.now() - startedAt) / 1000) * cps;
        let acc = 0, idx = chunkStartWord;
        for (let i = chunkStartWord; i <= chunkEndWord; i++) {
          const w = words[i];
          acc += w.text.length + 1 + (/[,;:]$/.test(w.text) ? 2 : /[.!?…]["”’)]*$/.test(w.text) ? 4 : 0);
          idx = i;
          if (acc > chars) break;
        }
        setWord(idx);
        estTick = setTimeout(tick, 70);
      };
      tick();
    };
    u.onstart = () => {
      if (mySession !== session) return;
      startedAt = performance.now();
      speakSentence.retried = false;
      if (watchdog) { clearTimeout(watchdog); watchdog = null; }
      if (state.status !== 'playing') { state.status = 'playing'; state.loadingMsg = ''; emit(); }
      setWord(chunkStartWord);
      estTimer = setTimeout(() => { if (!gotBoundary && !ended && mySession === session) runEstimate(); }, 550);
    };
    u.onboundary = e => {
      if (mySession !== session || ended) return;
      if (e.name && e.name !== 'word') return;
      gotBoundary = true;
      if (estTick) { clearTimeout(estTick); estTick = null; }
      if (estTimer) { clearTimeout(estTimer); estTimer = null; }
      setWord(wordAtChar(words, fromChar + chunk.offset + (e.charIndex || 0)));
    };
    u.onend = () => {
      if (ended) return;
      ended = true;
      stopEstimate();
      if (mySession !== session) return;
      if (startedAt && !gotBoundary) {
        const dur = (performance.now() - startedAt) / 1000;
        if (dur > 0.5 && chunk.text.length > 20) {
          const observed = chunk.text.length / dur / u.rate;
          if (observed > 5 && observed < 40) { est.cps = est.cps * 0.7 + observed * 0.3; S.settings.set('ttsCps', Math.round(est.cps * 10) / 10); }
        }
      }
      speakChunk(ci + 1);
    };
    u.onerror = e => {
      if (ended) return;
      ended = true;
      stopEstimate();
      if (mySession !== session) return;
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      if (e.error === 'not-allowed') return fail('The browser blocked speech until you tap play again.');
      fail(`Speech failed (${e.error || 'unknown error'}). Try another voice in Settings.`);
    };
    currentUtterance = u;
    try { speechSynthesis.speak(u); } catch (err) { fail('Speech could not start: ' + err.message); }
  }
}

function advanceSentence(mySession){
  if (mySession !== session) return;
  const next = T.nextSentence(content, state.loc);
  if (!next) return finished();
  if (sleepShouldStop(next)) return sleepStop();
  const paragraphChanged = next.p !== state.loc.p || next.c !== state.loc.c;
  if (state.provider === 'browser') speakSentence(next, 0, mySession, paragraphChanged ? 350 : 0);
}

// =====================================================================
// Audio providers — per-paragraph units with word timing
// =====================================================================
let audioEl = null;
let unit = null;
const urlCache = new Map();
const MAX_UNIT_CHARS = 2400;

function unitsOfParagraph(c, p){
  const para = content.chapters[c].paras[p];
  const tok = T.tokenize(para);
  const units = [];
  // On-device generation can be slower than real time on weaker hardware, so keep its units short:
  // the first audio arrives sooner and the next unit is generated while this one plays.
  const maxChars = state.provider === 'kokoro' ? (kokoro.device === 'webgpu' ? 900 : 320) : MAX_UNIT_CHARS;
  let start = 0;
  while (start < tok.sentences.length) {
    let end = start, chars = 0;
    while (end < tok.sentences.length && (chars + tok.sentences[end].text.length <= maxChars || end === start)) { chars += tok.sentences[end].text.length + 1; end++; }
    const first = tok.sentences[start], last = tok.sentences[end - 1];
    units.push({ c, p, sStart: start, sEnd: end, charBase: first.start, text: para.slice(first.start, last.start + last.text.length) });
    start = end;
  }
  if (!units.length) units.push({ c, p, sStart: 0, sEnd: 0, charBase: 0, text: '' });
  return units;
}
function unitSentences(def){
  const tok = T.tokenize(content.chapters[def.c].paras[def.p]);
  const out = [];
  for (let s = def.sStart; s < def.sEnd; s++) out.push({ s, text: tok.sentences[s].text, len: tok.sentences[s].text.length });
  return out;
}
function unitWords(def){
  const tok = T.tokenize(content.chapters[def.c].paras[def.p]);
  const out = [];
  for (let s = def.sStart; s < def.sEnd; s++) {
    const sent = tok.sentences[s];
    sent.words.forEach((w, wi) => out.push({ s, w: wi, char: sent.start - def.charBase + w.start, len: w.text.length, text: w.text }));
  }
  return out;
}
function wordWeight(w){ return w.len + 1 + (/[,;:]$/.test(w.text) ? 2.5 : /[.!?…]["”’)]*$/.test(w.text) ? 5 : 0); }
/** Distribute word times over [start, end) proportional to weights. */
function spread(words, start, end){
  const weights = words.map(wordWeight);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  return words.map((w, i) => { const a = start + acc / total * (end - start); acc += weights[i]; return { start: a, end: start + acc / total * (end - start) }; });
}
function estimateWordTimes(words, duration){ return spread(words, 0, duration); }
/** Exact sentence boundaries (segments: [{sStart, sEnd, start, end}]) with words spread inside each segment. */
function timesFromSegments(words, segments){
  const times = new Array(words.length);
  for (const seg of segments) {
    const idx = [];
    words.forEach((w, i) => { if (w.s >= seg.sStart && w.s < seg.sEnd) idx.push(i); });
    if (!idx.length) continue;
    const t = spread(idx.map(i => words[i]), seg.start, seg.end);
    idx.forEach((i, k) => { times[i] = t[k]; });
  }
  for (let i = 0; i < times.length; i++) if (!times[i]) times[i] = times[i - 1] || { start: 0, end: 0 };
  return times;
}
function blobDuration(blob){
  return new Promise((res) => {
    const a = new Audio();
    const url = URL.createObjectURL(blob);
    const done = d => { URL.revokeObjectURL(url); res(isFinite(d) && d > 0 ? d : null); };
    a.onloadedmetadata = () => done(a.duration);
    a.onerror = () => done(null);
    a.src = url;
    setTimeout(() => done(a.duration), 6000);
  });
}
function b64ToBlob(b64, type){
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}
function escXml(s){ return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// ---------- ElevenLabs ----------
async function synthElevenLabs(text, persona){
  const key = S.settings.get('elevenlabsKey');
  if (!key) throw new Error('Add your ElevenLabs API key in Settings.');
  const voiceId = resolveElevenVoice(persona);
  if (!voiceId) throw new Error('No ElevenLabs voice is available. Open Settings → Voices and refresh the voice list.');
  const model = S.settings.get('elevenModel', 'eleven_multilingual_v2');
  const r = await U.fetchWithTimeout(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true } }),
  }, 120000);
  if (!r.ok) {
    let msg = `ElevenLabs error ${r.status}`;
    try { const j = await r.json(); msg += ': ' + ((j.detail && (j.detail.message || j.detail.status)) || JSON.stringify(j).slice(0, 160)); } catch (e) {}
    if (r.status === 401) msg = 'ElevenLabs rejected the API key (401). Check it in Settings.';
    throw new Error(msg);
  }
  const j = await r.json();
  const al = j.alignment || j.normalized_alignment;
  return { blob: b64ToBlob(j.audio_base64, 'audio/mpeg'), chars: al ? { starts: al.character_start_times_seconds, ends: al.character_end_times_seconds, n: (al.characters || []).length } : null };
}
X.fetchElevenVoices = async () => {
  const key = S.settings.get('elevenlabsKey');
  if (!key) throw new Error('Add your ElevenLabs API key first.');
  const j = await U.fetchJSON('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } }, 20000);
  const voices = (j.voices || []).map(v => ({ id: v.voice_id, name: v.name, labels: Object.values(v.labels || {}).map(x => String(x).toLowerCase()), category: v.category }));
  await S.settings.set('elevenVoices', voices);
  return voices;
};
function resolveElevenVoice(persona){
  const override = S.settings.get('elevenVoice:' + persona.id);
  if (override) return override;
  const voices = S.settings.get('elevenVoices', []);
  if (!voices.length) return null;
  let best = null, bestScore = -1;
  for (const v of voices) {
    const text = (v.labels || []).join(' ') + ' ' + v.name.toLowerCase();
    let score = 0;
    for (const l of persona.labels) if (text.includes(l)) score += 1;
    if (v.category === 'premade') score += 0.2;
    if (score > bestScore) { bestScore = score; best = v; }
  }
  return best ? best.id : voices[0].id;
}
X.resolveElevenVoice = resolveElevenVoice;

// ---------- OpenAI ----------
async function synthOpenAI(text, persona){
  const key = S.settings.get('openaiKey');
  if (!key) throw new Error('Add your OpenAI API key in Settings.');
  const model = S.settings.get('openaiTtsModel', 'gpt-4o-mini-tts');
  const voice = S.settings.get('openaiVoice:' + persona.id) || persona.openaiVoice;
  const body = { model, voice, input: text, response_format: 'mp3' };
  if (/gpt-4o|gpt-4\.1|gpt-5/.test(model)) body.instructions = persona.instructions;
  const r = await U.fetchWithTimeout('https://api.openai.com/v1/audio/speech', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 120000);
  if (!r.ok) {
    let msg = `OpenAI error ${r.status}`;
    try { const j = await r.json(); msg += ': ' + ((j.error && j.error.message) || '').slice(0, 200); } catch (e) {}
    if (r.status === 401) msg = 'OpenAI rejected the API key (401). Check it in Settings.';
    throw new Error(msg);
  }
  return { blob: await r.blob(), chars: null };
}

// ---------- Google Cloud Text-to-Speech ----------
const GOOGLE_TTS = 'https://texttospeech.googleapis.com/v1beta1';
X.fetchGoogleVoices = async () => {
  const key = S.settings.get('googleTtsKey');
  if (!key) throw new Error('Add your Google Cloud API key first.');
  const j = await U.fetchJSON(`${GOOGLE_TTS}/voices?languageCode=en&key=${encodeURIComponent(key)}`, {}, 20000);
  const voices = (j.voices || []).filter(v => /Chirp3-HD|Neural2|Studio|Wavenet/i.test(v.name)).map(v => ({ name: v.name, gender: (v.ssmlGender || '').toLowerCase(), lang: (v.languageCodes || [])[0] || 'en-US', family: /Chirp3-HD/i.test(v.name) ? 'Chirp 3 HD' : /Neural2/i.test(v.name) ? 'Neural2' : /Studio/i.test(v.name) ? 'Studio' : 'WaveNet' }))
    .sort((a, b) => ['Chirp 3 HD', 'Studio', 'Neural2', 'WaveNet'].indexOf(a.family) - ['Chirp 3 HD', 'Studio', 'Neural2', 'WaveNet'].indexOf(b.family) || a.name.localeCompare(b.name));
  await S.settings.set('googleVoices', voices);
  return voices;
};
function resolveGoogleVoice(persona){
  const override = S.settings.get('googleVoice:' + persona.id);
  if (override) return override;
  const list = S.settings.get('googleVoices', []);
  const prefs = [].concat(persona.googleVoice || []);
  if (list.length) {
    for (const p of prefs) if (list.find(v => v.name === p)) return p;
    const hd = list.find(v => v.family === 'Chirp 3 HD' && v.lang === 'en-US') || list[0];
    return hd.name;
  }
  return prefs[0] || 'en-US-Chirp3-HD-Charon';
}
X.resolveGoogleVoice = resolveGoogleVoice;
async function synthGoogle(def, persona){
  const key = S.settings.get('googleTtsKey');
  if (!key) throw new Error('Add your Google Cloud API key in Settings.');
  const name = resolveGoogleVoice(persona);
  const languageCode = name.split('-').slice(0, 2).join('-');
  const chirp = /Chirp/i.test(name);
  const sentences = def.sentences || [{ s: 0, text: def.text }];
  const body = { voice: { languageCode, name }, audioConfig: { audioEncoding: 'MP3', speakingRate: U.clamp(persona.rate || 1, 0.5, 1.5) } };
  if (chirp) body.input = { text: def.text };
  else { body.input = { ssml: '<speak>' + sentences.map((x, i) => `<mark name="s${i}"/>` + escXml(x.text)).join(' ') + '</speak>' }; body.enableTimePointing = ['SSML_MARK']; }
  const r = await U.fetchWithTimeout(`${GOOGLE_TTS}/text:synthesize?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 60000);
  if (!r.ok) {
    let msg = `Google Cloud TTS error ${r.status}`;
    try { const j = await r.json(); msg += ': ' + ((j.error && j.error.message) || '').slice(0, 220); } catch (e) {}
    if (r.status === 403) msg += ' (check that the Text-to-Speech API is enabled and the key allows this website)';
    throw new Error(msg);
  }
  const j = await r.json();
  const blob = b64ToBlob(j.audioContent, 'audio/mpeg');
  let segments = null;
  if (j.timepoints && j.timepoints.length && sentences.length) {
    const starts = j.timepoints.map(tp => ({ i: +String(tp.markName).slice(1), t: +tp.timeSeconds })).sort((a, b) => a.i - b.i);
    const duration = await blobDuration(blob);
    segments = starts.map((st, k) => ({ sStart: sentences[st.i].s, sEnd: sentences[st.i].s + 1, start: st.t, end: k + 1 < starts.length ? starts[k + 1].t : (duration || st.t + 3) }));
  }
  return { blob, chars: null, segments };
}

// ---------- Kokoro (on-device) ----------
// The model runs in a dedicated Web Worker so generation never freezes the reader; if workers or module imports are
// unavailable the engine falls back to the main thread.
const kokoro = { engine: null, loading: null, progress: 0, device: null, dtype: null, error: null, mem: new Map(), lastEmit: 0, voices: [] };
function kokoroSupported(){ return typeof WebAssembly !== 'undefined' && typeof AudioContext !== 'undefined'; }
X.kokoroStatus = () => ({ supported: kokoroSupported(), loaded: !!kokoro.engine, loading: !!kokoro.loading && !kokoro.engine, progress: kokoro.progress, device: kokoro.device, dtype: kokoro.dtype, error: kokoro.error ? (kokoro.error.message || String(kokoro.error)) : null, gpuAvailable: !!navigator.gpu, inWorker: !!(kokoro.engine && kokoro.engine.worker) });

const KOKORO_WORKER_SRC = `
let tts = null;
self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'load') {
      const mod = await import(m.lib);
      tts = await mod.KokoroTTS.from_pretrained(m.model, { dtype: m.dtype, device: m.device, progress_callback: p => { if (p && p.file) self.postMessage({ type: 'progress', file: p.file, status: p.status, loaded: p.loaded, total: p.total }); } });
      self.postMessage({ type: 'loaded', voices: Object.keys(tts.voices || {}) });
    } else if (m.type === 'generate') {
      const audio = await tts.generate(m.text, { voice: m.voice, speed: m.speed });
      const data = audio.audio || audio.data || audio;
      const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      self.postMessage({ type: 'result', id: m.id, sampleRate: audio.sampling_rate || 24000, buffer: buf }, [buf]);
    }
  } catch (err) { self.postMessage({ type: 'error', id: m.id || null, phase: m.type, message: (err && err.message) || String(err) }); }
};`;

function trackProgress(files, p, onProgress){
  if (!p || !p.file) return;
  if (p.status === 'progress' || p.status === 'done') files[p.file] = { loaded: p.status === 'done' ? (p.total || (files[p.file] && files[p.file].total) || 0) : (p.loaded || 0), total: p.total || (files[p.file] && files[p.file].total) || 0 };
  const tot = Object.values(files).reduce((a, f) => a + f.total, 0), got = Object.values(files).reduce((a, f) => a + Math.min(f.loaded, f.total || f.loaded), 0);
  kokoro.progress = tot ? got / tot : 0;
  const now = Date.now();
  if (now - kokoro.lastEmit > 250) { kokoro.lastEmit = now; onProgress && onProgress(kokoro.progress, got, tot); F.bus.emit('kokoro-progress', { progress: kokoro.progress, loaded: got, total: tot }); }
}

/** Worker-backed engine: { generate(text, voice, speed) -> {data, sampleRate}, worker } */
function workerEngine(device, dtype, onProgress){
  return new Promise((resolve, reject) => {
    let worker;
    try { worker = new Worker(URL.createObjectURL(new Blob([KOKORO_WORKER_SRC], { type: 'text/javascript' })), { type: 'module' }); }
    catch (e) { return reject(e); }
    const files = {};
    const pending = new Map();
    let nextId = 1, settled = false;
    worker.onmessage = e => {
      const m = e.data;
      if (m.type === 'progress') return trackProgress(files, m, onProgress);
      if (m.type === 'loaded') { settled = true; kokoro.voices = m.voices || []; return resolve({ worker, generate(text, voice, speed){ return new Promise((res, rej) => { const id = nextId++; pending.set(id, { res, rej }); worker.postMessage({ type: 'generate', id, text, voice, speed }); }); } }); }
      if (m.type === 'result') { const p = pending.get(m.id); if (p) { pending.delete(m.id); p.res({ data: new Float32Array(m.buffer), sampleRate: m.sampleRate }); } return; }
      if (m.type === 'error') { if (!settled) { settled = true; worker.terminate(); return reject(new Error(m.message)); } const p = pending.get(m.id); if (p) { pending.delete(m.id); p.rej(new Error(m.message)); } }
    };
    worker.onerror = e => { if (!settled) { settled = true; reject(new Error(e.message || 'Voice worker failed')); } };
    worker.postMessage({ type: 'load', lib: C.CDN.KOKORO, model: C.KOKORO_MODEL, device, dtype });
  });
}
/** Main-thread engine (fallback when workers cannot be used). */
async function mainEngine(device, dtype, onProgress){
  const mod = await import(C.CDN.KOKORO);
  const files = {};
  const tts = await mod.KokoroTTS.from_pretrained(C.KOKORO_MODEL, { dtype, device, progress_callback: p => trackProgress(files, p, onProgress) });
  kokoro.voices = Object.keys(tts.voices || {});
  return { worker: null, async generate(text, voice, speed){ const audio = await tts.generate(text, { voice, speed }); const data = audio.audio || audio.data || audio; return { data, sampleRate: audio.sampling_rate || 24000 }; } };
}
X.loadKokoro = (onProgress) => {
  if (kokoro.engine) return Promise.resolve(kokoro.engine);
  if (kokoro.loading) return kokoro.loading;
  kokoro.error = null;
  kokoro.loading = (async () => {
    const pref = S.settings.get('kokoroDevice', 'auto');
    // navigator.gpu can exist without a usable adapter (headless browsers, blocked drivers): probe before committing to the GPU build.
    let gpuOk = false;
    if (pref !== 'cpu' && navigator.gpu) { try { gpuOk = !!(await Promise.race([navigator.gpu.requestAdapter(), new Promise(r => setTimeout(() => r(null), 3000))])); } catch (e) { gpuOk = false; } }
    const wantGpu = pref === 'gpu' ? gpuOk : (pref === 'auto' && gpuOk);
    const plan = wantGpu ? [['webgpu', 'fp32'], ['wasm', 'q8']] : [['wasm', 'q8']];
    let lastErr = null;
    for (const [device, dtype] of plan) {
      for (const make of [workerEngine, mainEngine]) {
        try {
          kokoro.engine = await make(device, dtype, onProgress);
          kokoro.device = device; kokoro.dtype = dtype;
          kokoro.progress = 1;
          F.bus.emit('kokoro-progress', { progress: 1, done: true });
          return kokoro.engine;
        } catch (e) { lastErr = e; console.warn(`[kokoro] ${make.name} ${device}/${dtype} failed`, e && e.message); }
      }
    }
    throw lastErr || new Error('The on-device voice could not be loaded.');
  })().catch(e => { kokoro.loading = null; kokoro.error = e; throw e; });
  return kokoro.loading;
};
function floatToWav(samples, sampleRate){
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++, o += 2) { const s = Math.max(-1, Math.min(1, samples[i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return new Blob([buf], { type: 'audio/wav' });
}
/** Group sentences so each generation call is 60–380 characters (the model dislikes very short and very long inputs). */
function kokoroGroups(sentences){
  const groups = [];
  let cur = null;
  for (const s of sentences) {
    if (cur && cur.text.length + 1 + s.len <= 380 && (cur.text.length < 60 || s.len < 40)) { cur.text += ' ' + s.text; cur.sEnd = s.s + 1; continue; }
    if (cur) groups.push(cur);
    cur = { sStart: s.s, sEnd: s.s + 1, text: s.text };
  }
  if (cur) groups.push(cur);
  const out = [];
  for (const g of groups) {
    if (g.text.length <= 420) { out.push(g); continue; }
    for (const ch of chunkText(g.text, 380)) out.push({ sStart: g.sStart, sEnd: g.sEnd, text: ch.text, partial: true });
  }
  return out;
}
async function synthKokoro(def, persona){
  const engine = await X.loadKokoro((p, got, tot) => setLoading(`Downloading voice model ${Math.round(p * 100)}%${tot ? ` · ${(got / 1e6).toFixed(0)} / ${(tot / 1e6).toFixed(0)} MB` : ''}`));
  setLoading('Generating speech on this device…');
  const voice = S.settings.get('kokoroVoice:' + persona.id) || persona.kokoroVoice || 'af_heart';
  const speed = U.clamp(persona.kokoroSpeed || persona.rate || 1, 0.6, 1.4);
  const sentences = def.sentences || [{ s: 0, text: def.text, len: def.text.length }];
  const groups = kokoroGroups(sentences);
  const pieces = [];
  let sr = 24000, total = 0;
  const gap = Math.round(0.24 * sr);
  const segments = [];
  for (const g of groups) {
    const { data, sampleRate } = await engine.generate(g.text, voice, speed);
    sr = sampleRate || sr;
    const start = total / sr;
    pieces.push(data); total += data.length;
    pieces.push(new Float32Array(gap)); total += gap;
    const end = (total - gap) / sr;
    const last = segments[segments.length - 1];
    if (g.partial && last && last.sStart === g.sStart && last.sEnd === g.sEnd) last.end = end;
    else segments.push({ sStart: g.sStart, sEnd: g.sEnd, start, end });
  }
  const all = new Float32Array(total);
  let off = 0;
  for (const p of pieces) { all.set(p, off); off += p.length; }
  return { blob: floatToWav(all, sr), chars: null, segments, duration: total / sr };
}
X.kokoroPreviewVoice = async (voiceId, text) => {
  const engine = await X.loadKokoro();
  const { data, sampleRate } = await engine.generate(text || 'This is how I read. The evening was quiet, and the pages turned at their own pace.', voiceId, 1);
  const blob = floatToWav(data, sampleRate || 24000);
  const a = new Audio(URL.createObjectURL(blob));
  await a.play();
  return a;
};

// ---------- shared unit pipeline ----------
function voiceKey(){
  const persona = X.persona();
  switch (state.provider) {
    case 'elevenlabs': return `${resolveElevenVoice(persona)}|${S.settings.get('elevenModel', 'eleven_multilingual_v2')}`;
    case 'openai': return `${S.settings.get('openaiVoice:' + persona.id) || persona.openaiVoice}|${S.settings.get('openaiTtsModel', 'gpt-4o-mini-tts')}|${persona.id}`;
    case 'google': return `${resolveGoogleVoice(persona)}|${persona.rate}`;
    case 'kokoro': return `${S.settings.get('kokoroVoice:' + persona.id) || persona.kokoroVoice}|${persona.kokoroSpeed || persona.rate}`;
    default: return persona.id;
  }
}
async function synthesize(def){
  const persona = X.persona();
  def.sentences = def.sentences || (content ? unitSentences(def) : null);
  switch (state.provider) {
    case 'elevenlabs': return synthElevenLabs(def.text, persona);
    case 'openai': return synthOpenAI(def.text, persona);
    case 'google': return synthGoogle(def, persona);
    case 'kokoro': return synthKokoro(def, persona);
    default: throw new Error('Unknown provider');
  }
}
async function ensureUnitAudio(def){
  const key = `${book.id}|${state.provider}|${voiceKey()}|${def.c}|${def.p}|${def.sStart}`;
  const persist = state.provider !== 'kokoro';
  let rec = null;
  if (persist) { try { rec = await S.get('audio', key); } catch (e) {} }
  else rec = kokoro.mem.get(key) || null;
  const words = unitWords(def);
  if (!rec) {
    if (!def.text.trim()) throw new Error('Nothing to read here.');
    const { blob, chars, segments, duration: knownDuration } = await synthesize(def);
    let times = null, duration = knownDuration || null;
    if (chars && chars.starts && chars.starts.length) {
      const scale = chars.n && chars.n !== def.text.length ? chars.n / def.text.length : 1;
      const n = chars.starts.length;
      times = words.map(w => {
        const a = U.clamp(Math.round(w.char * scale), 0, n - 1);
        const b = U.clamp(Math.round((w.char + w.len - 1) * scale), 0, n - 1);
        return { start: chars.starts[a], end: (chars.ends && chars.ends[b]) || chars.starts[b] };
      });
      duration = (chars.ends && chars.ends[n - 1]) || chars.starts[n - 1];
    } else if (segments && segments.length) {
      times = timesFromSegments(words, segments);
      duration = duration || segments[segments.length - 1].end;
    } else {
      duration = duration || await blobDuration(blob);
      if (duration) times = estimateWordTimes(words, duration);
    }
    rec = { key, bookId: book.id, blob, times, duration, createdAt: Date.now(), chars: def.text.length };
    if (persist) { try { await S.put('audio', rec); } catch (e) { console.warn('audio cache write failed', e); } }
    else { kokoro.mem.set(key, rec); if (kokoro.mem.size > 10) { const k0 = kokoro.mem.keys().next().value; const u0 = urlCache.get(k0); if (u0) { URL.revokeObjectURL(u0); urlCache.delete(k0); } kokoro.mem.delete(k0); } }
  }
  let url = urlCache.get(key);
  if (!url) { url = URL.createObjectURL(rec.blob); urlCache.set(key, url); if (urlCache.size > 40) { const [k0, u0] = urlCache.entries().next().value; URL.revokeObjectURL(u0); urlCache.delete(k0); } }
  const times = rec.times || estimateWordTimes(words, rec.duration || Math.max(1, def.text.length / 15));
  return { url, duration: rec.duration, words: words.map((w, i) => Object.assign({}, w, times[i] || { start: 0, end: 0 })) };
}
function wordIndexAtTime(words, t){
  let lo = 0, hi = words.length - 1;
  if (!words.length) return -1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (words[mid].start <= t + 0.02) lo = mid; else hi = mid - 1; }
  return lo;
}
function nextUnitStart(u){
  if (u.sEnd < T.tokenize(content.chapters[u.c].paras[u.p]).sentences.length) return { c: u.c, p: u.p, s: u.sEnd, w: 0 };
  return T.nextParagraph(content, { c: u.c, p: u.p });
}
let prefetching = null;
function prefetch(loc){
  if (!loc || prefetching) return;
  try {
    const defs = unitsOfParagraph(loc.c, loc.p);
    const def = defs.find(d => loc.s >= d.sStart && loc.s < d.sEnd) || defs[0];
    prefetching = ensureUnitAudio(def).catch(() => {}).then(() => { prefetching = null; });
  } catch (e) { prefetching = null; }
}
async function playUnitFrom(loc, mySession){
  state.status = 'loading'; state.loadingMsg = state.provider === 'kokoro' ? (kokoro.engine ? 'Generating the next passage on this device…' : 'Preparing the on-device voice…') : 'Generating audio…'; state.error = null;
  emit();
  const defs = unitsOfParagraph(loc.c, loc.p);
  const def = defs.find(d => loc.s >= d.sStart && loc.s < d.sEnd) || defs[0];
  let rec;
  try { if (prefetching) await prefetching; rec = await ensureUnitAudio(def); } catch (e) { if (mySession === session) fail(e.message || String(e)); return; }
  if (mySession !== session) return;
  unit = Object.assign({}, def, rec);
  if (!audioEl) { audioEl = new Audio(); audioEl.preload = 'auto'; }
  audioEl.onended = null; audioEl.onerror = null; audioEl.onloadedmetadata = null;
  audioEl.src = rec.url;
  audioEl.playbackRate = state.speed;
  try { audioEl.preservesPitch = true; } catch (e) {}
  audioEl.onended = () => {
    if (mySession !== session) return;
    const next = nextUnitStart(unit);
    if (!next) return finished();
    if (sleepShouldStop(next)) return sleepStop();
    playUnitFrom(next, mySession);
  };
  audioEl.onerror = () => { if (mySession === session) fail('Audio playback failed.'); };
  const target = unit.words.find(x => x.s === loc.s && x.w === (loc.w || 0)) || unit.words.find(x => x.s === loc.s) || unit.words[0];
  const startAt = target ? target.start : 0;
  const startPlay = () => {
    if (mySession !== session) return;
    try { audioEl.currentTime = Math.max(0, startAt - 0.02); } catch (e) {}
    audioEl.play().then(() => {
      if (mySession !== session) return;
      state.status = 'playing'; state.loadingMsg = '';
      emit();
      setSentence({ c: def.c, p: def.p, s: target ? target.s : def.sStart }, target ? target.w : 0);
      loop(mySession);
      prefetch(nextUnitStart(unit));
      updateMediaSession();
    }).catch(e => fail('Playback was blocked: ' + (e.message || e)));
  };
  if (audioEl.readyState >= 1) startPlay(); else audioEl.onloadedmetadata = startPlay;
}
function loop(mySession){
  const step = () => {
    if (mySession !== session || !audioEl || audioEl.paused) return;
    const idx = wordIndexAtTime(unit.words, audioEl.currentTime);
    if (idx >= 0) {
      const w = unit.words[idx];
      if (!state.loc || w.s !== state.loc.s || w.w !== state.word) {
        if (!state.loc || w.s !== state.loc.s) setSentence({ c: unit.c, p: unit.p, s: w.s }, w.w); else setWord(w.w);
      }
    }
    if (state.sleepAt && Date.now() >= state.sleepAt) return sleepStop();
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function updateMediaSession(){
  if (!('mediaSession' in navigator) || !book) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: book.title, artist: book.author || 'Folio', album: 'Folio', artwork: book.cover ? [{ src: book.cover, sizes: '512x512', type: 'image/jpeg' }] : [] });
    navigator.mediaSession.setActionHandler('play', () => X.resume());
    navigator.mediaSession.setActionHandler('pause', () => X.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => X.skip(-1));
    navigator.mediaSession.setActionHandler('nexttrack', () => X.skip(1));
    navigator.mediaSession.setActionHandler('seekbackward', () => X.skip(-1));
    navigator.mediaSession.setActionHandler('seekforward', () => X.skip(1));
  } catch (e) {}
}

// =====================================================================
// Public controls
// =====================================================================
X.play = async (loc) => {
  if (!book || !content) return fail('Open a book first.');
  if (!X.providerReady(state.provider)) { state.provider = 'browser'; S.settings.set('ttsProvider', 'browser'); }
  if (state.provider === 'browser' && !X.providerReady('browser')) return fail('This browser has no speech voices. Use the on-device voice or add a provider key in Settings.');
  session++;
  const mySession = session;
  stopEngines();
  loc = T.clampLoc(content, loc || Object.assign({ w: Math.max(0, state.word) }, state.loc || T.firstLoc()));
  state.error = null;
  state.loc = { c: loc.c, p: loc.p, s: loc.s }; state.word = loc.w || 0;
  if (state.sleepMode > 0 && !state.sleepAt) state.sleepAt = Date.now() + state.sleepMode * 60000;
  if (state.provider === 'browser') {
    state.status = 'loading'; state.loadingMsg = 'Starting…'; emit();
    if (!browser.voices.length) browser.voices = await browser.loadVoices();
    if (mySession !== session) return;
    setTimeout(() => { if (mySession === session) speakSentence(loc, loc.w || 0, mySession, 0); }, 60);
  } else {
    playUnitFrom(loc, mySession);
  }
};
function stopEngines(){
  try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
  if (audioEl) { try { audioEl.pause(); } catch (e) {} }
}
X.pause = () => {
  if (state.status === 'idle') return;
  session++;
  stopEngines();
  state.status = 'paused'; state.loadingMsg = '';
  emit();
};
X.resume = () => { if (state.status === 'paused' || state.status === 'idle') X.play(Object.assign({ w: Math.max(0, state.word) }, state.loc || T.firstLoc())); };
X.toggle = () => { if (X.isPlaying()) X.pause(); else X.resume(); };
X.stop = () => {
  session++;
  stopEngines();
  state.status = 'idle'; state.loadingMsg = '';
  emit();
};
X.seek = (loc) => {
  if (!content) return;
  loc = T.clampLoc(content, loc);
  if (X.isPlaying()) X.play(loc);
  else { state.loc = { c: loc.c, p: loc.p, s: loc.s }; state.word = loc.w || 0; F.bus.emit('tts-sentence', Object.assign({}, loc)); F.bus.emit('tts-word', Object.assign({}, loc)); emit(); }
};
X.skip = (n) => {
  if (!content) return;
  let loc = state.loc ? Object.assign({ w: 0 }, state.loc) : T.firstLoc();
  const step = n > 0 ? T.nextSentence : T.prevSentence;
  for (let i = 0; i < Math.abs(n); i++) { const nx = step(content, loc); if (!nx) break; loc = nx; }
  X.seek(loc);
};
X.skipParagraph = (n) => {
  if (!content) return;
  const loc = state.loc ? Object.assign({ w: 0 }, state.loc) : T.firstLoc();
  const target = n > 0 ? T.nextParagraph(content, loc) : (state.loc && (state.loc.s > 0 || state.word > 3) ? T.paragraphStart(loc) : T.prevParagraph(content, loc));
  if (target) X.seek(target);
};
X.setSpeed = (x) => {
  state.speed = U.clamp(+x || 1, 0.5, 3);
  S.settings.set('ttsSpeed', state.speed);
  if (audioEl && state.provider !== 'browser') audioEl.playbackRate = state.speed;
  else if (state.provider === 'browser' && X.isPlaying()) X.play(Object.assign({ w: Math.max(0, state.word) }, state.loc));
  emit();
};
X.setPersona = (id) => {
  if (!C.PERSONAS.find(p => p.id === id)) return;
  state.personaId = id;
  S.settings.set('ttsPersona', id);
  if (X.isPlaying()) X.play(Object.assign({ w: Math.max(0, state.word) }, state.loc));
  emit();
};
X.setProvider = (id) => {
  const was = X.isPlaying();
  X.stop();
  state.provider = X.providerReady(id) ? id : 'browser';
  S.settings.set('ttsProvider', state.provider);
  emit();
  if (was) X.resume();
};
X.setSleep = (opt) => {
  state.sleepMode = +opt || 0;
  state.sleepAt = state.sleepMode > 0 ? Date.now() + state.sleepMode * 60000 : null;
  emit();
};
X.sleepRemaining = () => state.sleepAt ? Math.max(0, state.sleepAt - Date.now()) : null;

/** Speak a short sample in the current provider with the given persona (for Settings and the voice popover). */
X.preview = async (personaId) => {
  const persona = C.PERSONAS.find(p => p.id === personaId) || X.persona();
  const sample = 'This is how I read. Chapter one begins on a quiet morning, and the pages turn at your pace.';
  if (state.provider === 'browser') {
    if (!browser.available()) throw new Error('No browser voices available.');
    if (!browser.voices.length) browser.voices = await browser.loadVoices();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(sample);
    const v = browser.pickVoice(persona, 'en');
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = U.clamp(persona.rate * state.speed, 0.5, 3.5); u.pitch = persona.pitch;
    currentUtterance = u;
    speechSynthesis.speak(u);
    return;
  }
  const saved = state.personaId; state.personaId = persona.id;
  try {
    const def = { text: sample, sentences: T.splitSentences(sample).map((s, i) => ({ s: i, text: s.text, len: s.text.length })) };
    const { blob } = await synthesize(def);
    const a = new Audio(URL.createObjectURL(blob)); a.playbackRate = state.speed; await a.play();
  } finally { state.personaId = saved; }
};

X.clearAudioCache = async (bookId) => {
  kokoro.mem.clear();
  if (bookId) return S.delWhere('audio', 'bookId', bookId);
  return S.clear('audio');
};
X.audioCacheStats = async () => {
  const rows = await S.all('audio');
  return { count: rows.length, bytes: rows.reduce((a, r) => a + ((r.blob && r.blob.size) || 0), 0), chars: rows.reduce((a, r) => a + (r.chars || 0), 0) };
};
})();
