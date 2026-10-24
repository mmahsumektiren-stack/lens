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
  get model() { return store.get('model', 'gemini-2.5-flash') || 'gemini-2.5-flash'; },
  get closeAfterSave() { return store.get('closeAfterSave', true); },
  get autoSpeak() { return store.get('autoSpeak', false); }
};

/* ---------- IndexedDB ---------- */
const DB = {
  _db: null,
  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('lens-capture', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('cards', { keyPath: 'id' });
      r.onsuccess = () => res((this._db = r.result));
      r.onerror = () => rej(r.error);
    });
  },
  async tx(mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction('cards', mode);
      const out = fn(t.objectStore('cards'));
      t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
      t.onerror = () => rej(t.error);
    });
  },
  all() { return this.tx('readonly', (s) => s.getAll()); },
  put(c) { return this.tx('readwrite', (s) => s.put(c)); },
  del(id) { return this.tx('readwrite', (s) => s.delete(id)); }
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

async function askGemini(term, context) {
  const key = settings.apiKey;
  if (!key) throw new Error('NO_KEY');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.model)}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: buildPrompt(term, context) }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.3 }
    })
  });
  if (!res.ok) {
    let msg = 'HTTP ' + res.status;
    try { msg = (await res.json()).error?.message || msg; } catch {}
    throw new Error(msg);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  const json = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  if (!json.meaning_tr) throw new Error('Boş yanıt');
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
        c.error = e.message;
        if (/quota|429|API key|NO_KEY|403/i.test(e.message)) { await saveCard(c); break; }
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
  return (text.match(/[A-Za-z0-9’'\-]+|[^\sA-Za-z0-9’'\-]+/g) || []).map((raw) => ({ raw, word: /[A-Za-z]/.test(raw) }));
}
function sentenceAround(text, phrase) {
  if (!phrase || phrase === text) return text;
  const sentences = text.split(/(?<=[.!?…])\s+|\n+/);
  const hit = sentences.find((s) => s.toLowerCase().includes(phrase.toLowerCase()));
  return (hit || text).trim();
}
function highlight(context, term, asBlank = false) {
  const safe = esc(context);
  if (!term) return safe;
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
const TITLES = { review: 'Tekrar', add: 'Ekle', list: 'Kartlar', settings: 'Ayarlar' };
function show(view) {
  currentView = view;
  $$('.view').forEach((v) => (v.hidden = v.id !== 'view-' + view));
  $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  $('#title').textContent = TITLES[view];
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
  // seçim artık mevcut değilse temizle
  for (const i of [...addState.selected]) if (!addState.tokens[i]?.word) addState.selected.delete(i);
  const box = $('#tokens');
  const showTokens = addState.tokens.filter((t) => t.word).length > 1;
  box.innerHTML = showTokens
    ? addState.tokens.map((t, i) => (t.word ? `<button class="tok${addState.selected.has(i) ? ' on' : ''}" data-i="${i}">${esc(t.raw)}</button>` : '')).join('')
    : '';
  $('#targetPreview').textContent = currentTarget() || '—';
}
function currentTarget() {
  const text = $('#addText').value.trim();
  if (!addState.selected.size) return text.replace(/\s+/g, ' ');
  const idx = [...addState.selected].sort((a, b) => a - b);
  // ilk ve son seçili kelime arası (aradaki kelimeler dahil) — kalıp seçmek için iki uca dokunmak yeter
  return addState.tokens.slice(idx[0], idx[idx.length - 1] + 1).map((t) => t.raw).join(' ')
    .replace(/\s+([,.!?;:])/g, '$1').trim();
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
      id: uid(), term, context, source: addState.source || '',
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
  const front = reviewState.mode === 'cloze'
    ? `<div class="mode">Boşluğu doldur</div>
       <div class="ctx">${highlight(c.context, c.term, true)}</div>
       <div class="sub">İpucu: ${esc(a.meaning_tr)}</div>`
    : `<div class="mode">${esc(typeLabel(a.type))}</div>
       <div class="term"><div>${esc(c.term)}${a.ipa ? `<span class="ipa">${esc(a.ipa)}</span>` : ''}</div>
         <button class="speak" data-speak="${esc(c.term)}" aria-label="Sesli oku">🔊</button></div>
       ${c.context && c.context !== c.term ? `<div class="ctx">${highlight(c.context, c.term)}</div>` : ''}`;

  const back = reviewState.revealed ? `
    ${reviewState.mode === 'cloze' ? `<div class="term"><div>${esc(c.term)}${a.ipa ? `<span class="ipa">${esc(a.ipa)}</span>` : ''}</div>
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
    ${c.source ? `<a class="sub" href="${esc(c.source)}" target="_blank" rel="noopener">Kaynağa git ↗</a>` : ''}`;
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
        ${c.context && c.context !== c.term ? `<div class="ctx">${highlight(c.context, c.term)}</div>` : ''}
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
    const b = e.target.closest('.tok');
    if (!b) return;
    const i = +b.dataset.i;
    addState.selected.has(i) ? addState.selected.delete(i) : addState.selected.add(i);
    renderTokens();
  });
  $('#clearSelBtn').addEventListener('click', () => { addState.selected.clear(); renderTokens(); });
  $('#pasteBtn').addEventListener('click', pasteFromClipboard);
  $('#saveBtn').addEventListener('click', onSave);

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
    store.set('model', $('#model').value.trim() || 'gemini-2.5-flash');
    store.set('closeAfterSave', $('#closeAfterSave').checked);
    store.set('autoSpeak', $('#autoSpeak').checked);
    toast('Kaydedildi');
    enrichPending();
  });
  $('#testKey').addEventListener('click', async () => {
    store.set('apiKey', $('#apiKey').value.trim());
    store.set('model', $('#model').value.trim() || 'gemini-2.5-flash');
    toast('Test ediliyor…', 5000);
    try {
      const r = await askGemini('give up', 'Never give up on your side project.');
      toast('Çalışıyor ✓ "give up" = ' + r.meaning_tr, 3500);
    } catch (e) {
      toast(e.message === 'NO_KEY' ? 'Anahtar boş' : 'Hata: ' + e.message, 5000);
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
    if (document.visibilityState === 'visible') { refreshBadges(); if (currentView === 'review') renderReview(); enrichPending(); }
  });
}

async function pasteFromClipboard() {
  try {
    const t = await navigator.clipboard.readText();
    if (!t) return toast('Pano boş');
    $('#addText').value = cleanShared(t);
    addState.selected.clear();
    renderTokens();
  } catch {
    toast('Panoya erişilemedi — metin kutusuna uzun basıp yapıştır');
    $('#addText').focus();
  }
}

/* ---------- paylaşımdan gelen veri ---------- */
function handleLaunchParams() {
  const p = new URLSearchParams(location.search);
  const text = p.get('text') || '';
  const title = p.get('title') || '';
  const url = p.get('url') || '';
  const linkInText = (text.match(URL_RE) || [])[0] || '';
  const body = cleanShared(text) || cleanShared(title);

  if (body) {
    addState.fromShare = true;
    addState.source = url || linkInText;
    $('#addText').value = body;
    $('#sourceLine').hidden = !addState.source;
    $('#sourceLine').textContent = addState.source ? 'Kaynak: ' + addState.source : '';
    history.replaceState(null, '', location.pathname);
    show('add');
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
  $('#netBadge').hidden = navigator.onLine;
  try {
    await loadCards();
  } catch (e) {
    toast('Depolama açılamadı: ' + e.message, 5000);
  }
  refreshBadges();
  handleLaunchParams();
  enrichPending();
  if ('speechSynthesis' in window) speechSynthesis.getVoices();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
})();
