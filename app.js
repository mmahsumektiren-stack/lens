/* Lens Capture — paylaş menüsünden İngilizce yakala, Gemini ile kart üret, aralıklı tekrarla öğren. */
'use strict';

/* ---------- küçük yardımcılar ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAY = 86400000;
const now = () => Date.now();
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(now()) + Math.random().toString(16).slice(2));

function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), ms);
}

/* ---------- ayarlar ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('lens.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('lens.' + k, JSON.stringify(v)); } catch {} }
};
const settings = {
  get apiKey() { return store.get('apiKey', ''); },
  get model() { return store.get('model', 'gemini-2.5-flash-lite') || 'gemini-2.5-flash-lite'; },
  get closeAfterSave() { return store.get('closeAfterSave', true); },
  get autoSpeak() { return store.get('autoSpeak', false); }
};

/* ---------- IndexedDB ---------- */
const DB = {
  _db: null,
  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('lens-capture', 2);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('cards')) db.createObjectStore('cards', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('articles')) db.createObjectStore('articles', { keyPath: 'id' });
      };
      r.onsuccess = () => res((this._db = r.result));
      r.onerror = () => rej(r.error);
    });
  },
  async tx(mode, fn, store = 'cards') {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const out = fn(t.objectStore(store));
      t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
      t.onerror = () => rej(t.error);
    });
  },
  all(store = 'cards') { return this.tx('readonly', (s) => s.getAll(), store); },
  put(c, store = 'cards') { return this.tx('readwrite', (s) => s.put(c), store); },
  del(id, store = 'cards') { return this.tx('readwrite', (s) => s.delete(id), store); }
};

let cards = [];
async function loadCards() { cards = (await DB.all()) || []; }
async function saveCard(c) {
  await DB.put(c);
  const i = cards.findIndex((x) => x.id === c.id);
  if (i >= 0) cards[i] = c; else cards.push(c);
}

/* ---------- aralıklı tekrar (SM-2 sadeleştirilmiş) ---------- */
const SRS = {
  fresh() { return { due: now(), interval: 0, ease: 2.5, reps: 0, lapses: 0 }; },
  next(srs, grade) {
    const s = { ...srs };
    if (grade === 0) {
      s.reps = 0; s.interval = 0; s.lapses++;
      s.ease = Math.max(1.3, s.ease - 0.2);
      s.due = now() + 10 * 60000; // 10 dk sonra tekrar
      return s;
    }
    if (grade === 1) {
      s.interval = s.reps === 0 ? 1 : Math.max(1, Math.round(s.interval * 1.2));
      s.ease = Math.max(1.3, s.ease - 0.15);
    } else if (grade === 2) {
      s.interval = s.reps === 0 ? 1 : s.reps === 1 ? 3 : Math.round(s.interval * s.ease);
    } else {
      s.interval = s.reps === 0 ? 3 : Math.round(Math.max(s.interval, 1) * s.ease * 1.3);
      s.ease += 0.15;
    }
    s.reps++;
    s.due = now() + s.interval * DAY;
    return s;
  },
  label(srs, grade) {
    if (grade === 0) return '10 dk';
    const d = this.next(srs, grade).interval;
    return d < 30 ? d + ' gün' : d < 365 ? Math.round(d / 30) + ' ay' : (d / 365).toFixed(1) + ' yıl';
  }
};

/* ---------- Gemini ---------- */
function buildPrompt(term, context) {
  return `You are an English tutor for a native Turkish speaker (intermediate level, software developer).
The learner saw this while browsing on their phone.

TERM (what they want to learn): ${JSON.stringify(term)}
CONTEXT (where they saw it): ${JSON.stringify(context)}

Explain the TERM *as it is used in this CONTEXT*. If it is an idiom, phrasal verb, slang or internet/X jargon, say so.
If the TERM is a whole sentence, translate it naturally and pick up to 3 notable words/phrases from it in "key_phrases".

Return ONLY JSON with exactly these keys:
{
  "type": "word" | "phrase" | "idiom" | "phrasal_verb" | "slang" | "sentence",
  "term": "the term, base form if a word (keep phrases as written)",
  "ipa": "IPA pronunciation, empty string for sentences",
  "pos": "part of speech in Turkish (isim, fiil, sıfat, zarf, kalıp, deyim…) or empty",
  "meaning_tr": "short natural Turkish meaning (max 8 words)",
  "explanation_tr": "1-2 Turkish sentences: nuance, when/how it's used, register",
  "context_tr": "natural Turkish translation of the CONTEXT",
  "examples": [{"en": "new everyday example sentence", "tr": "Turkish translation"}, {"en": "...", "tr": "..."}],
  "synonyms": ["up to 3 English synonyms or similar expressions"],
  "key_phrases": [{"en": "...", "tr": "..."}]
}`;
}

/* Gemini: kota dolunca sıradaki modele geç, yeniden açılma zamanını hatırla */
const MODEL_CHAIN = ['gemini-2.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash'];
function modelOrder() {
  const first = settings.model;
  return [first, ...MODEL_CHAIN.filter((m) => m !== first)];
}
function parseRetryMs(err) {
  const d = (err.details || []).find((x) => /RetryInfo/.test(x['@type'] || ''));
  const src = d?.retryDelay || (String(err.message || '').match(/retry in ([\dhms.]+)/i) || [])[1] || '';
  let ms = 0;
  for (const [, n, u] of src.matchAll(/([\d.]+)\s*(h|m(?!s)|s)/g)) ms += +n * (u === 'h' ? 3600e3 : u === 'm' ? 60e3 : 1e3);
  return ms || 3600e3;
}
class GeminiError extends Error {
  constructor(msg, kind, until) { super(msg); this.kind = kind; this.until = until; }
}
async function geminiJSON(prompt, temperature = 0.3) {
  const key = settings.apiKey;
  if (!key) throw new GeminiError('NO_KEY', 'nokey');
  const blocked = store.get('modelBlocked', {});
  let soonest = Infinity, lastErr = null;
  for (const model of modelOrder()) {
    if (blocked[model] && blocked[model] > now()) { soonest = Math.min(soonest, blocked[model]); continue; }
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature } })
    });
    if (res.ok) {
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      store.set('lastModel', model);
      return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
    }
    let err = {};
    try { err = (await res.json()).error || {}; } catch {}
    if (res.status === 429) {
      blocked[model] = now() + parseRetryMs(err);
      soonest = Math.min(soonest, blocked[model]);
    } else if (res.status === 404 || (res.status === 400 && /not found|not supported/i.test(err.message || ''))) {
      blocked[model] = now() + 7 * DAY; // bu model hesapta yok
    } else if (res.status === 400 || res.status === 403) {
      store.set('modelBlocked', blocked);
      throw new GeminiError(err.message || 'HTTP ' + res.status, /API key/i.test(err.message || '') ? 'badkey' : 'other');
    } else {
      lastErr = err.message || 'HTTP ' + res.status;
      continue;
    }
    store.set('modelBlocked', blocked);
  }
  store.set('modelBlocked', blocked);
  if (soonest < Infinity) throw new GeminiError('QUOTA', 'quota', soonest);
  throw new GeminiError(lastErr || 'Gemini yanıt vermedi', 'other');
}
function friendlyGeminiError(e) {
  if (e.kind === 'nokey' || e.message === 'NO_KEY') return 'Ayarlar’dan Gemini anahtarı ekle.';
  if (e.kind === 'badkey') return 'Gemini anahtarı geçersiz görünüyor, Ayarlar’dan kontrol et.';
  if (e.kind === 'quota') {
    const ms = Math.max(0, e.until - now());
    const h = Math.floor(ms / 3600e3), m = Math.ceil((ms % 3600e3) / 60e3);
    return `Günlük ücretsiz Gemini kotası doldu (tüm modellerde). Yaklaşık ${h ? h + ' sa ' : ''}${m} dk sonra yenilenir.`;
  }
  return 'Anlam alınamadı: ' + String(e.message || '').slice(0, 140);
}

// Aynı terim + cümle için tekrar istek atma (kota dostu)
const AI_CACHE_MAX = 400;
function aiCacheGet(k) { return store.get('aiCache', {})[k] || null; }
function aiCacheSet(k, v) {
  const c = store.get('aiCache', {});
  c[k] = v;
  const keys = Object.keys(c);
  if (keys.length > AI_CACHE_MAX) keys.slice(0, keys.length - AI_CACHE_MAX).forEach((x) => delete c[x]);
  store.set('aiCache', c);
}
async function askGemini(term, context) {
  const k = term.toLowerCase() + '|' + context;
  const hit = aiCacheGet(k);
  if (hit) return hit;
  const json = await geminiJSON(buildPrompt(term, context));
  if (!json.meaning_tr) throw new Error('Boş yanıt');
  aiCacheSet(k, json);
  return json;
}

let enriching = false;
async function enrichPending() {
  if (enriching || !navigator.onLine || !settings.apiKey) return;
  enriching = true;
  try {
    for (const c of cards.filter((x) => x.status === 'pending')) {
      try {
        c.ai = await askGemini(c.term, c.context);
        c.status = 'ready';
        c.error = null;
      } catch (e) {
        c.error = friendlyGeminiError(e);
        if (e.kind === 'quota' || e.kind === 'nokey' || e.kind === 'badkey') { await saveCard(c); break; }
      }
      await saveCard(c);
      refreshBadges();
      if (currentView === 'review' && !reviewState.card) renderReview();
      if (currentView === 'list') renderList();
    }
  } finally {
    enriching = false;
  }
}

/* ---------- metin hazırlama ---------- */
const URL_RE = /https?:\/\/\S+/g;
function cleanShared(text) {
  return String(text || '').replace(URL_RE, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
function tokenize(text) {
  // kelimeleri noktalama olmadan, ama orijinal sırasıyla
  // satır sonları ayrı token olarak tutulur ki X'teki düzen korunsun
  return (text.match(/\s+|[A-Za-z0-9’'\-]+|[^\sA-Za-z0-9’'\-]+/g) || []).map((raw) =>
    /^\s/.test(raw) ? { raw, space: true, word: false } : { raw, word: /[A-Za-z]/.test(raw) });
}
function normalizeText(t) {
  // satır sonlarını koru, satır içi fazla boşlukları sadeleştir
  return String(t).split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
function sentenceAround(text, phrase) {
  if (!phrase || phrase === text) return text;
  const sentences = text.split(/(?<=[.!?…])\s+|\n+/);
  const hit = sentences.find((s) => s.toLowerCase().includes(phrase.toLowerCase()));
  return (hit || text).trim();
}
function highlight(context, term, asBlank = false) {
  const safe = esc(context);
  if (!term || normalizeText(term) === normalizeText(context)) return safe;
  const re = new RegExp(esc(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return re.test(safe)
    ? safe.replace(re, (m) => (asBlank ? '<span class="blank">&nbsp;</span>' : `<mark>${m}</mark>`))
    : safe;
}

/* ---------- ses ---------- */
function speak(text) {
  if (!('speechSynthesis' in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.92;
  const v = speechSynthesis.getVoices().find((x) => /^en[-_]US/i.test(x.lang)) || speechSynthesis.getVoices().find((x) => /^en/i.test(x.lang));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

/* ---------- görünümler ---------- */
let currentView = 'review';
const TITLES = { review: 'Tekrar', read: 'Oku', add: 'Ekle', list: 'Kartlar', settings: 'Ayarlar', reader: '' };
function show(view) {
  currentView = view;
  $$('.view').forEach((v) => (v.hidden = v.id !== 'view-' + view));
  $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  $('#title').textContent = TITLES[view];
  document.body.classList.toggle('reading', view === 'reader');
  if (view !== 'reader' && typeof closeSheet === 'function') { closeSheet(); stopReadAloud(); }
  if (view === 'read') renderLibrary();
  if (view === 'review') renderReview();
  if (view === 'list') renderList();
  if (view === 'settings') renderSettings();
  if (view === 'add') renderTokens();
}

function dueCards() {
  const t = now();
  return cards.filter((c) => c.status === 'ready' && c.srs.due <= t).sort((a, b) => a.srs.due - b.srs.due);
}
function refreshBadges() {
  const n = dueCards().length;
  const b = $('#dueBadge');
  b.hidden = n === 0;
  b.textContent = n > 99 ? '99+' : n;
}

/* ----- Ekle / Yakala ----- */
const addState = { fromShare: false, source: '', selected: new Set(), tokens: [] };

function renderTokens() {
  const text = $('#addText').value;
  addState.tokens = tokenize(text);
  for (const i of [...addState.selected]) if (!addState.tokens[i]?.word) addState.selected.delete(i);
  const body = addState.tokens.map((t, i) => (t.word
    ? `<span class="w${addState.selected.has(i) ? ' on' : ''}" data-i="${i}">${esc(t.raw)}</span>`
    : esc(t.raw))).join('');
  const hasWords = addState.tokens.some((t) => t.word);
  const box = $('#tokens');
  box.innerHTML = !hasWords ? '' : addState.tweet
    ? tweetHTML(addState.tweet, body)
    : `<div class="plainpost">${body}</div>`;
  // tweet varsa ham metin kutusu gizli; "Metni düzenle" ile açılır
  $('#addText').hidden = !!addState.tweet && !addState.editing;
  $('#editTextBtn').hidden = !addState.tweet;
  $('#targetPreview').textContent = currentTarget() || '—';
  $('#toReaderBtn').hidden = !!addState.tweet || wordCount(text) < 60;
}
function currentTarget() {
  const text = $('#addText').value.trim();
  if (!addState.selected.size) return normalizeText(text);
  const idx = [...addState.selected].sort((a, b) => a - b);
  // ilk ve son seçili kelime arası (aradaki her şey dahil) — kalıp seçmek için iki uca dokunmak yeter
  return normalizeText(addState.tokens.slice(idx[0], idx[idx.length - 1] + 1).map((t) => t.raw).join(''));
}

/* ---------- X gönderisi görünümü ---------- */
function tweetDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit' }) + ' · ' +
    d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: '2-digit' });
}
function tweetHTML(t, bodyHTML) {
  const initial = esc((t.name || t.handle || '?').trim()[0] || '?');
  const avatar = t.avatar
    ? `<img class="tw-av" src="${esc(t.avatar)}" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'tw-av tw-av-f',textContent:'${initial}'}))">`
    : `<div class="tw-av tw-av-f">${initial}</div>`;
  const photos = (t.photos || []).slice(0, 4);
  return `<article class="tw">
    <header class="tw-head">${avatar}
      <div class="tw-id"><div class="tw-name">${esc(t.name || t.handle || 'X')}</div>
      ${t.handle ? `<div class="tw-handle">@${esc(t.handle)}</div>` : ''}</div>
      <span class="tw-x" aria-hidden="true">𝕏</span>
    </header>
    <div class="tw-text">${bodyHTML}</div>
    ${photos.length ? `<div class="tw-media n${photos.length}">${photos.map((u) => `<img src="${esc(u)}" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.remove()">`).join('')}</div>` : ''}
    <footer class="tw-foot">${esc(tweetDate(t.date))}${t.url ? ` · <a href="${esc(t.url)}" target="_blank" rel="noopener">X'te aç ↗</a>` : ''}</footer>
  </article>`;
}

async function onSave() {
  const text = $('#addText').value.trim();
  if (!text) return toast('Önce bir metin ekle');
  const term = currentTarget();
  const context = sentenceAround(cleanShared(text), term);
  const dup = cards.find((c) => c.term.toLowerCase() === term.toLowerCase());
  if (dup) {
    dup.srs.due = Math.min(dup.srs.due, now()); // tekrar karşılaştın → öne al
    dup.seen = (dup.seen || 1) + 1;
    await saveCard(dup);
    toast('Zaten vardı, tekrara öne alındı');
  } else {
    const card = {
      id: uid(), term, context, source: addState.source || '', tweet: addState.tweet || null,
      createdAt: now(), status: 'pending', ai: null, error: null, seen: 1, srs: SRS.fresh()
    };
    await saveCard(card);
    toast(settings.apiKey ? 'Kaydedildi, kart hazırlanıyor…' : 'Kaydedildi. Kart için Ayarlar’a API anahtarı ekle');
  }
  const wasShare = addState.fromShare;
  resetAdd();
  refreshBadges();
  enrichPending();
  if (wasShare && settings.closeAfterSave) {
    // AI isteği bitmeden kapanmasın diye kısa bekle; kapanmazsa sorun yok, sonraki açılışta tamamlanır
    setTimeout(() => { window.close(); }, 1800);
  }
}
function resetAdd() {
  $('#addText').value = '';
  addState.selected.clear();
  addState.source = '';
  addState.fromShare = false;
  addState.tweet = null;
  addState.editing = false;
  $('#sourceLine').hidden = true;
  renderTokens();
}

/* ----- Tekrar ----- */
const reviewState = { card: null, revealed: false, mode: 'card' };

function pickMode(c) {
  const canCloze = c.ai && c.ai.type !== 'sentence' && c.context && c.context.length > c.term.length + 8 &&
    c.context.toLowerCase().includes(c.term.toLowerCase());
  return canCloze && c.srs.reps >= 1 && Math.random() < 0.5 ? 'cloze' : 'card';
}

function renderReview() {
  const due = dueCards();
  const pending = cards.filter((c) => c.status === 'pending').length;
  const learned = cards.filter((c) => c.srs.interval >= 21).length;
  $('#reviewStats').innerHTML = `
    <div class="stat"><b>${due.length}</b><span>bugün</span></div>
    <div class="stat"><b>${cards.length}</b><span>toplam</span></div>
    <div class="stat"><b>${learned}</b><span>oturmuş</span></div>`;
  const area = $('#reviewArea');

  if (!reviewState.card || !due.includes(reviewState.card)) {
    reviewState.card = due[0] || null;
    reviewState.revealed = false;
    if (reviewState.card) reviewState.mode = pickMode(reviewState.card);
  }
  const c = reviewState.card;
  if (!c) {
    const next = cards.filter((x) => x.status === 'ready').sort((a, b) => a.srs.due - b.srs.due)[0];
    area.innerHTML = `<div class="empty"><span class="big-ico">✓</span>
      ${cards.length ? 'Şimdilik tekrar edecek kart yok.' : 'Henüz kart yok. X’te ya da tarayıcıda bir metni seç → Paylaş → <b>Lens</b>.'}
      ${next ? `<p class="sub">Sıradaki: ${esc(fmtDue(next.srs.due))}</p>` : ''}
      ${pending ? `<p class="sub">${pending} kart AI’dan bekliyor${settings.apiKey ? '' : ' (API anahtarı yok)'}.</p>` : ''}
    </div>`;
    return;
  }

  const a = c.ai || {};
  const wholeTweet = c.tweet && normalizeText(c.term) === normalizeText(c.tweet.text);
  const front = c.tweet
    ? `<div class="mode">${reviewState.mode === 'cloze' ? 'Boşluğu doldur' : esc(typeLabel(a.type))}</div>
       ${reviewState.mode === 'card' && !wholeTweet ? `<div class="term${c.term.length > 60 ? ' long' : ''}"><div>${esc(c.term)}${a.ipa ? `<span class="ipa">${esc(a.ipa)}</span>` : ''}</div>
         <button class="speak" data-speak="${esc(c.term)}" aria-label="Sesli oku">🔊</button></div>` : ''}
       ${tweetHTML(c.tweet, highlight(c.tweet.text, c.term, reviewState.mode === 'cloze'))}
       ${reviewState.mode === 'cloze' ? `<div class="sub">İpucu: ${esc(a.meaning_tr)}</div>` : ''}
       ${wholeTweet ? `<button class="speak" data-speak="${esc(c.term)}">🔊 Dinle</button>` : ''}`
    : reviewState.mode === 'cloze'
    ? `<div class="mode">Boşluğu doldur</div>
       <div class="ctx">${highlight(c.context, c.term, true)}</div>
       <div class="sub">İpucu: ${esc(a.meaning_tr)}</div>`
    : `<div class="mode">${esc(typeLabel(a.type))}</div>
       <div class="term${c.term.length > 60 ? ' long' : ''}"><div>${esc(c.term)}${a.ipa ? `<span class="ipa">${esc(a.ipa)}</span>` : ''}</div>
         <button class="speak" data-speak="${esc(c.term)}" aria-label="Sesli oku">🔊</button></div>
       ${c.context && c.context !== c.term ? `<div class="ctx">${highlight(c.context, c.term)}</div>` : ''}`;

  const back = reviewState.revealed ? `
    ${reviewState.mode === 'cloze' ? `<div class="term${c.term.length > 60 ? ' long' : ''}"><div>${esc(c.term)}${a.ipa ? `<span class="ipa">${esc(a.ipa)}</span>` : ''}</div>
      <button class="speak" data-speak="${esc(c.context)}">🔊</button></div>` : ''}
    ${detailHTML(c)}
    <div class="grades">
      ${['Bilmedim', 'Zor', 'İyi', 'Kolay'].map((l, g) => `<button class="g${g}" data-grade="${g}">${l}<small>${SRS.label(c.srs, g)}</small></button>`).join('')}
    </div>` : `<button id="revealBtn" class="primary big">Göster</button>`;

  area.innerHTML = `<div class="card">${front}${back}</div>`;
  if (settings.autoSpeak && !reviewState.revealed && reviewState.mode === 'card') speak(c.term);
}

function detailHTML(c) {
  const a = c.ai || {};
  return `<div class="block">
      <div class="meaning">${esc(a.meaning_tr)}</div>
      ${a.pos ? `<div class="sub">${esc(a.pos)}</div>` : ''}
      ${a.explanation_tr ? `<p>${esc(a.explanation_tr)}</p>` : ''}
    </div>
    ${a.context_tr && c.context !== c.term ? `<div class="block"><div class="sub">Gördüğün yerde:</div><p>${esc(a.context_tr)}</p></div>` : ''}
    ${(a.key_phrases || []).length ? `<div class="block"><div class="sub">Öne çıkanlar</div>${a.key_phrases.map((k) => `<p><b>${esc(k.en)}</b> — ${esc(k.tr)}</p>`).join('')}</div>` : ''}
    ${(a.examples || []).length ? `<div class="block"><div class="sub">Örnekler</div>${a.examples.map((x) =>
      `<div class="ex"><div>${esc(x.en)} <button class="speak" data-speak="${esc(x.en)}">🔊</button></div><div class="tr">${esc(x.tr)}</div></div>`).join('')}</div>` : ''}
    ${(a.synonyms || []).length ? `<div class="chips">${a.synonyms.map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div>` : ''}
    ${c.source ? `<a class="sub" href="${esc(c.source)}" target="_blank" rel="noopener">${c.article ? '📰 ' + esc(c.article.title) + ' — ' + esc(c.article.site) : 'Kaynağa git'} ↗</a>` : ''}`;
}

function typeLabel(t) {
  return ({ word: 'Kelime', phrase: 'Kalıp', idiom: 'Deyim', phrasal_verb: 'Phrasal verb', slang: 'Argo', sentence: 'Cümle' })[t] || 'Kart';
}
function fmtDue(ts) {
  const d = ts - now();
  if (d <= 0) return 'şimdi';
  if (d < 3600000) return Math.ceil(d / 60000) + ' dk sonra';
  if (d < DAY) return Math.round(d / 3600000) + ' saat sonra';
  return Math.round(d / DAY) + ' gün sonra';
}

async function grade(g) {
  const c = reviewState.card;
  if (!c) return;
  c.srs = SRS.next(c.srs, g);
  c.lastReviewed = now();
  await saveCard(c);
  reviewState.card = null;
  refreshBadges();
  renderReview();
}

/* ----- Kartlar listesi ----- */
const openItems = new Set();
function renderList() {
  const q = $('#search').value.trim().toLowerCase();
  const list = cards
    .filter((c) => !q || c.term.toLowerCase().includes(q) || (c.ai?.meaning_tr || '').toLowerCase().includes(q) || (c.context || '').toLowerCase().includes(q))
    .sort((a, b) => b.createdAt - a.createdAt);
  const pending = cards.filter((c) => c.status === 'pending');
  const bar = $('#pendingBar');
  bar.hidden = !pending.length;
  bar.innerHTML = pending.length
    ? `<span>${pending.length} kart AI bekliyor${pending[0].error ? ` — ${esc(pending[0].error).slice(0, 80)}` : ''}</span><button class="ghost" id="retryBtn">Tekrar dene</button>`
    : '';
  $('#cardList').innerHTML = list.length ? list.map((c) => `
    <li class="item" data-id="${c.id}">
      <div class="head" data-toggle="${c.id}">
        <div><div class="t">${esc(c.term)}</div>
          <div class="m">${c.status === 'ready' ? esc(c.ai.meaning_tr) : '<span class="tag-pending">AI bekliyor</span>'}</div></div>
        <div class="due">${c.status === 'ready' ? esc(fmtDue(c.srs.due)) : ''}</div>
      </div>
      <div class="detail" ${openItems.has(c.id) ? '' : 'hidden'}>
        ${c.tweet ? tweetHTML(c.tweet, highlight(c.tweet.text, c.term)) : c.context && c.context !== c.term ? `<div class="ctx">${highlight(c.context, c.term)}</div>` : ''}
        ${c.status === 'ready' ? detailHTML(c) : ''}
        <div class="row">
          <button class="ghost" data-act="now" data-id="${c.id}">Şimdi tekrar et</button>
          <button class="ghost" data-act="regen" data-id="${c.id}">AI’yı yenile</button>
          <button class="ghost" data-act="del" data-id="${c.id}">Sil</button>
        </div>
      </div>
    </li>`).join('') : `<div class="empty">${q ? 'Eşleşen kart yok.' : 'Henüz kart yok.'}</div>`;
}

/* ----- Ayarlar ----- */
function renderSettings() {
  $('#apiKey').value = settings.apiKey;
  $('#model').value = settings.model;
  $('#closeAfterSave').checked = settings.closeAfterSave;
  $('#siteLayout').checked = store.get('siteLayout', true);
  $('#autoSpeak').checked = settings.autoSpeak;
  const ready = cards.filter((c) => c.status === 'ready');
  const reviewedToday = cards.filter((c) => c.lastReviewed && now() - c.lastReviewed < DAY).length;
  $('#statsBox').textContent = `${cards.length} kart · ${ready.length} hazır · son 24 saatte ${reviewedToday} tekrar`;
}

/* ---------- olaylar ---------- */
function bind() {
  $$('.tabs button').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));

  $('#addText').addEventListener('input', () => { addState.selected.clear(); renderTokens(); });
  $('#tokens').addEventListener('click', (e) => {
    const b = e.target.closest('.w');
    if (!b) return;
    const i = +b.dataset.i;
    addState.selected.has(i) ? addState.selected.delete(i) : addState.selected.add(i);
    renderTokens();
  });
  $('#editTextBtn').addEventListener('click', () => {
    addState.editing = !addState.editing;
    renderTokens();
    if (addState.editing) $('#addText').focus();
  });
  $('#addText').addEventListener('change', () => {
    // metin elle değiştiyse artık birebir tweet değil
    if (addState.tweet && normalizeText($('#addText').value) !== normalizeText(addState.tweet.text)) { addState.tweet = null; renderTokens(); }
  });
  $('#clearSelBtn').addEventListener('click', () => { addState.selected.clear(); renderTokens(); });
  $('#pasteBtn').addEventListener('click', pasteFromClipboard);
  $('#clipAdd').addEventListener('click', () => {
    const t = $('#clipBanner').dataset.text || '';
    store.set('lastClip', t);
    $('#clipBanner').hidden = true;
    addState.selected.clear();
    addState.source = '';
    $('#sourceLine').hidden = true;
    show('add');
    $('#addText').value = t;
    renderTokens();
  });
  $('#clipNo').addEventListener('click', () => {
    store.set('lastClip', $('#clipBanner').dataset.text || '');
    $('#clipBanner').hidden = true;
  });
  $('#saveBtn').addEventListener('click', onSave);
  $('#toReaderBtn').addEventListener('click', () => {
    const t = $('#addText').value, src = addState.source;
    resetAdd();
    importTextArticle(t, '', src);
  });
  $('#netTest').addEventListener('click', runNetTest);

  $('#reviewArea').addEventListener('click', (e) => {
    const sp = e.target.closest('[data-speak]');
    if (sp) return speak(sp.dataset.speak);
    if (e.target.closest('#revealBtn')) {
      reviewState.revealed = true;
      renderReview();
      if (settings.autoSpeak) speak(reviewState.card.term);
      return;
    }
    const g = e.target.closest('[data-grade]');
    if (g) grade(+g.dataset.grade);
  });

  $('#search').addEventListener('input', renderList);
  $('#view-list').addEventListener('click', async (e) => {
    const sp = e.target.closest('[data-speak]');
    if (sp) return speak(sp.dataset.speak);
    if (e.target.closest('#retryBtn')) {
      if (!settings.apiKey) return toast('Önce Ayarlar’dan API anahtarı ekle');
      toast('Deneniyor…');
      return enrichPending();
    }
    const act = e.target.closest('[data-act]');
    if (act) {
      const c = cards.find((x) => x.id === act.dataset.id);
      if (!c) return;
      if (act.dataset.act === 'del') {
        if (!confirm(`"${c.term}" silinsin mi?`)) return;
        await DB.del(c.id);
        cards = cards.filter((x) => x.id !== c.id);
        toast('Silindi');
      } else if (act.dataset.act === 'now') {
        c.srs.due = now();
        await saveCard(c);
        toast('Tekrar listesine eklendi');
      } else if (act.dataset.act === 'regen') {
        c.status = 'pending';
        await saveCard(c);
        toast('Yeniden hazırlanıyor…');
        enrichPending();
      }
      refreshBadges();
      return renderList();
    }
    const head = e.target.closest('[data-toggle]');
    if (head) {
      const id = head.dataset.toggle;
      openItems.has(id) ? openItems.delete(id) : openItems.add(id);
      renderList();
    }
  });

  $('#saveSettings').addEventListener('click', () => {
    store.set('apiKey', $('#apiKey').value.trim());
    store.set('model', $('#model').value.trim() || 'gemini-2.5-flash-lite');
    store.set('closeAfterSave', $('#closeAfterSave').checked);
    store.set('siteLayout', $('#siteLayout').checked);
    store.set('autoSpeak', $('#autoSpeak').checked);
    toast('Kaydedildi');
    enrichPending();
  });
  $('#testKey').addEventListener('click', async () => {
    store.set('apiKey', $('#apiKey').value.trim());
    store.set('model', $('#model').value.trim() || 'gemini-2.5-flash-lite');
    toast('Test ediliyor…', 5000);
    try {
      const r = await askGemini('give up', 'Never give up on your side project.');
      toast('Çalışıyor ✓ (' + store.get('lastModel', '') + ') "give up" = ' + r.meaning_tr, 4000);
    } catch (e) {
      toast(friendlyGeminiError(e), 6000);
    }
  });

  $('#exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ app: 'lens-capture', version: 1, exportedAt: new Date().toISOString(), cards }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lens-yedek-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('#importFile').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const list = Array.isArray(data) ? data : data.cards;
      let n = 0;
      for (const c of list || []) {
        if (!c.id || !c.term) continue;
        c.srs = c.srs || SRS.fresh();
        c.status = c.ai ? 'ready' : 'pending';
        await saveCard(c);
        n++;
      }
      toast(n + ' kart içe aktarıldı');
      refreshBadges();
      renderSettings();
      enrichPending();
    } catch {
      toast('Dosya okunamadı');
    }
    e.target.value = '';
  });

  window.addEventListener('online', () => { $('#netBadge').hidden = true; enrichPending(); });
  window.addEventListener('offline', () => { $('#netBadge').hidden = false; });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { refreshBadges(); if (currentView === 'review') renderReview(); enrichPending(); checkClipboard(); }
  });
}

async function pasteFromClipboard() {
  try {
    const t = await navigator.clipboard.readText();
    if (!t) return toast('Pano boş');
    $('#addText').value = cleanShared(t);
    store.set('lastClip', cleanShared(t));
    $('#clipBanner').hidden = true;
    addState.selected.clear();
    renderTokens();
  } catch {
    toast('Panoya erişilemedi — metin kutusuna uzun basıp yapıştır');
    $('#addText').focus();
  }
}

/* ---------- X (Twitter) linkinden tweet metni ---------- */
async function fetchJSON(url, ms = 7000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}
function oembedJSONP(tweetUrl, ms = 7000) {
  return new Promise((res, rej) => {
    const cb = '__lens_cb' + Date.now();
    const s = document.createElement('script');
    const done = (fn, v) => { clearTimeout(timer); delete window[cb]; s.remove(); fn(v); };
    const timer = setTimeout(() => done(rej, new Error('timeout')), ms);
    window[cb] = (d) => done(res, d);
    s.onerror = () => done(rej, new Error('oembed'));
    s.src = `https://publish.twitter.com/oembed?omit_script=1&dnt=1&callback=${cb}&url=${encodeURIComponent(tweetUrl.replace('x.com', 'twitter.com'))}`;
    document.head.appendChild(s);
  });
}
async function getTweetText(tweetUrl, id) {
  const tries = [
    ['fxtwitter', async () => {
      const t = (await fetchJSON(`https://api.fxtwitter.com/status/${id}`)).tweet;
      return t && {
        text: t.raw_text?.text || t.text, name: t.author?.name, handle: t.author?.screen_name,
        avatar: t.author?.avatar_url, date: (t.created_timestamp || 0) * 1000 || Date.parse(t.created_at) || 0,
        photos: [...(t.media?.photos || []).map((m) => m.url), ...(t.media?.videos || []).map((m) => m.thumbnail_url)].filter(Boolean),
        url: t.url || tweetUrl
      };
    }],
    ['vxtwitter', async () => {
      const t = await fetchJSON(`https://api.vxtwitter.com/Twitter/status/${id}`);
      return t && {
        text: t.text, name: t.user_name, handle: t.user_screen_name, avatar: t.user_profile_image_url,
        date: (t.date_epoch || 0) * 1000, url: t.tweetURL || tweetUrl,
        photos: (t.media_extended || []).map((m) => (m.type === 'image' ? m.url : m.thumbnail_url)).filter(Boolean)
      };
    }],
    ['oembed', async () => {
      const d = await oembedJSONP(tweetUrl);
      const div = document.createElement('div');
      div.innerHTML = d.html || '';
      const p = div.querySelector('p');
      if (p) p.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
      return { text: p?.textContent, name: d.author_name, handle: (d.author_url || '').split('/').pop(), url: tweetUrl, photos: [] };
    }]
  ];
  const errs = [];
  for (const [name, fn] of tries) {
    try {
      const tw = await fn();
      const txt = cleanShared(tw?.text);
      if (txt) return { text: txt, tweet: { ...tw, text: txt }, errs };
      errs.push(name + ': boş');
    } catch (e) {
      errs.push(name + ': ' + (e.name === 'AbortError' ? 'zaman aşımı' : e.message || 'erişilemedi (CORS/ağ)'));
    }
  }
  return { text: '', errs };
}
async function loadTweetText(tweetUrl, id) {
  const ta = $('#addText');
  const diag = $('#diag');
  ta.placeholder = 'Tweet metni getiriliyor…';
  diag.hidden = false;
  diag.innerHTML = 'Tweet metni getiriliyor…';
  const { text, tweet, errs } = await getTweetText(tweetUrl, id);
  ta.placeholder = 'İngilizce kelime, kalıp ya da cümle…';
  if (text) {
    diag.hidden = true;
    if (!ta.value.trim()) {
      ta.value = text;
      addState.tweet = tweet;
      addState.selected.clear();
      renderTokens();
    }
  } else {
    diag.innerHTML = `Tweet metni alınamadı.<br><small>${esc(errs.join(' · '))}</small><br>
      <button class="ghost" id="retryTweet">Tekrar dene</button> <button class="ghost" id="pasteInstead">Panodan yapıştır</button>`;
    $('#retryTweet').onclick = () => loadTweetText(tweetUrl, id);
    $('#pasteInstead').onclick = pasteFromClipboard;
  }
}

/* ---------- panoda yeni metin varsa öner ---------- */
async function checkClipboard() {
  const banner = $('#clipBanner');
  if (!navigator.clipboard?.readText || document.visibilityState !== 'visible') return;
  if (currentView === 'add' && $('#addText').value.trim()) return;
  try {
    // izin bir kez verildiyse dokunmadan okunabilir; verilmediyse sessizce geçer
    const perm = await navigator.permissions?.query({ name: 'clipboard-read' }).catch(() => null);
    if (perm && perm.state !== 'granted') return;
    const t = cleanShared(await navigator.clipboard.readText());
    if (!t || t.length > 1500 || !/[A-Za-z]{2}/.test(t) || t === store.get('lastClip', '')) return;
    banner.querySelector('span').textContent = t.length > 80 ? t.slice(0, 80) + '…' : t;
    banner.dataset.text = t;
    banner.hidden = false;
  } catch {}
}

/* ---------- bağlantı testi ---------- */
async function runNetTest() {
  const box = $('#netResult');
  const T = 'https://example.com/';
  const tests = [
    ['Jina (web sayfası metni)', () => fetch('https://r.jina.ai/' + T, { headers: { Accept: 'application/json' } }).then((r) => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))).then((j) => /Example Domain/.test(JSON.stringify(j)))],
    ['allorigins (site düzeni)', () => fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(T)).then((r) => r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status))).then((t) => /Example Domain/.test(t))],
    ['corsproxy (site düzeni)', () => fetch('https://corsproxy.io/?url=' + encodeURIComponent(T)).then((r) => r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status))).then((t) => /Example Domain/.test(t))],
    ['fxtwitter (tweet metni)', () => fetch('https://api.fxtwitter.com/status/20').then((r) => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))).then((j) => !!j.tweet)]
  ];
  box.innerHTML = tests.map(([n]) => `<div>⏳ ${esc(n)}</div>`).join('');
  const res = await Promise.all(tests.map(async ([n, fn]) => {
    const t0 = performance.now();
    try {
      const ok = await withTimeout(fn(), 15000);
      return `<div>${ok ? '✅' : '⚠️'} ${esc(n)} <span class="sub">${Math.round(performance.now() - t0)} ms${ok ? '' : ' · beklenmeyen yanıt'}</span></div>`;
    } catch (e) {
      return `<div>❌ ${esc(n)} <span class="sub">${esc(e.message || 'erişilemedi')}</span></div>`;
    }
  }));
  box.innerHTML = res.join('');
}

/* ---------- paylaşımdan gelen veri ---------- */
function handleLaunchParams() {
  const p = new URLSearchParams(location.search);
  const text = p.get('text') || '';
  const title = p.get('title') || '';
  const url = p.get('url') || '';
  const linkInText = (text.match(URL_RE) || [])[0] || '';
  if (text || title || url) store.set('lastShare', { text, title, url, at: new Date().toISOString() });
  const source = url || linkInText;
  const tweetId = (source.match(/(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/i) || [])[1];
  // Bir web sayfasının kendisi paylaşıldıysa (seçili metin yok, sadece link): okuyucuya aktar
  if (!cleanShared(text) && source && !tweetId) {
    history.replaceState(null, '', location.pathname);
    importArticle(source, cleanShared(title));
    return;
  }
  const body = cleanShared(text) || (tweetId ? '' : cleanShared(title));
  // Uzun metin (ör. sayfada "Tümünü seç → Paylaş") → okuyucuda yazı olarak aç
  if (!tweetId && wordCount(body) >= 60) {
    history.replaceState(null, '', location.pathname);
    importTextArticle(body, cleanShared(title) !== body ? cleanShared(title) : '', source);
    return;
  }

  if (body || tweetId) {
    addState.fromShare = true;
    addState.source = source;
    $('#addText').value = body;
    $('#sourceLine').hidden = !source;
    $('#sourceLine').textContent = source ? 'Kaynak: ' + source : '';
    history.replaceState(null, '', location.pathname);
    show('add');
    // X'in paylaş düğmesi sadece link gönderir → tweet metnini kendimiz çekiyoruz
    if (!body && tweetId) loadTweetText(source, tweetId);
    return;
  }
  if (text || title || url) {
    // tanımadığımız bir paylaşım biçimi: gelen ham veriyi göster
    history.replaceState(null, '', location.pathname);
    show('add');
    $('#diag').hidden = false;
    $('#diag').innerHTML = `Paylaşımda metin bulunamadı.<br><small>${esc(JSON.stringify({ text, title, url }))}</small>`;
    return;
  }
  const view = p.get('view');
  if (view && TITLES[view]) {
    history.replaceState(null, '', location.pathname);
    show(view);
    if (p.get('paste')) setTimeout(pasteFromClipboard, 300);
    return;
  }
  show('review');
}

/* ---------- başlat ---------- */
(async function init() {
  bind();
  bindReader();
  $('#netBadge').hidden = navigator.onLine;
  try {
    await loadCards();
  } catch (e) {
    toast('Depolama açılamadı: ' + e.message, 5000);
  }
  refreshBadges();
  handleLaunchParams();
  enrichPending();
  checkClipboard();
  if ('speechSynthesis' in window) speechSynthesis.getVoices();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
})();
