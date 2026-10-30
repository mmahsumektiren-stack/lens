/* Lens — okuyucu eklentileri: sözlükler, sürükleyerek kalıp seçme, yazı sonu özeti, zorluk etiketi. */
'use strict';

/* ---------- sözlükler ---------- */
const DICTS = [
  { id: 'cambridge', name: 'Cambridge', url: (q) => `https://dictionary.cambridge.org/search/direct/?datasetsearch=english&q=${q}` },
  { id: 'oxford', name: 'Oxford Learner’s', url: (q) => `https://www.oxfordlearnersdictionaries.com/search/english/direct/?q=${q}` },
  { id: 'youglish', name: 'YouGlish (telaffuz)', url: (q) => `https://youglish.com/pronounce/${q}/english` },
  { id: 'tureng', name: 'Tureng', url: (q) => `https://tureng.com/tr/turkce-ingilizce/${q}` },
  { id: 'cambridge-tr', name: 'Cambridge İng→Tr', url: (q) => `https://dictionary.cambridge.org/search/direct/?datasetsearch=english-turkish&q=${q}` },
  { id: 'longman', name: 'Longman', url: (q) => `https://www.ldoceonline.com/search/english/direct/?q=${q}` },
  { id: 'mw', name: 'Merriam-Webster', url: (q) => `https://www.merriam-webster.com/dictionary/${q}` },
  { id: 'collins', name: 'Collins', url: (q) => `https://www.collinsdictionary.com/search/?dictCode=english&q=${q}` }
];
// sözlüğe gönderilecek hali: tek kelimede kök (squeezing → squeeze), kalıpta olduğu gibi
function dictQuery(term) {
  const t = term.trim().replace(/[“”"‘’.,!?;:()]+$|^[“”"‘’(]+/g, '');
  if (/\s/.test(t)) return t.toLowerCase();
  const ox = oxLookup(t);
  return (ox ? ox.word : t).toLowerCase();
}
function dictPanelHTML(term) {
  const q = dictQuery(term);
  const enc = encodeURIComponent(q);
  const used = store.get('dictLast', ''); // sıra sabit; son kullanılan sadece vurgulanır
  return `<div class="sub dict-q">“${esc(q)}” için:</div>
    <div class="dict-grid">${DICTS.map((d) => `<a class="dict${d.id === used ? ' last' : ''}" data-dict="${d.id}" href="${esc(d.url(enc))}" target="_blank" rel="noopener">${esc(d.name)}</a>`).join('')}</div>`;
}

/* ---------- sürükleyerek kalıp seçme ---------- */
function bindDragSelect() {
  const body = $('#readerBody');
  let timer = null, drag = null, sx = 0, sy = 0, suppress = false;
  body.addEventListener('touchstart', (e) => {
    const w = e.target.closest('.w');
    if (!w || e.touches.length > 1) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      drag = { b: +w.dataset.b, i: +w.dataset.i };
      rd.extend = false;
      rd.sel = { b: drag.b, i0: drag.i, i1: drag.i };
      markSelection();
      document.body.classList.add('dragging');
      if (navigator.vibrate) navigator.vibrate(12);
    }, 320);
  }, { passive: true });
  body.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (!drag) {
      if (timer && Math.hypot(t.clientX - sx, t.clientY - sy) > 10) { clearTimeout(timer); timer = null; }
      return;
    }
    e.preventDefault(); // sürüklerken sayfa kaymasın
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const w = el && el.closest ? el.closest('.w') : null;
    if (w && +w.dataset.b === drag.b) {
      const i = +w.dataset.i;
      rd.sel = { b: drag.b, i0: Math.min(drag.i, i), i1: Math.max(drag.i, i) };
      markSelection();
    }
  }, { passive: false });
  const end = () => {
    clearTimeout(timer); timer = null;
    if (!drag) return;
    drag = null;
    document.body.classList.remove('dragging');
    suppress = true;
    setTimeout(() => (suppress = false), 450);
    openSheet();
  };
  body.addEventListener('touchend', end);
  body.addEventListener('touchcancel', end);
  // uzun basıştan sonra gelen "click" kelimeyi tekrar tek seçime çevirmesin
  body.addEventListener('click', (e) => { if (suppress) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  body.addEventListener('contextmenu', (e) => { if (e.target.closest('.w')) e.preventDefault(); });
}

/* ---------- okurken bakılan kelimeler ---------- */
let lookedSaveT = null;
function recordLooked(term, sentence) {
  const a = rd.art;
  if (!a || !term) return;
  a.looked = a.looked || [];
  const k = term.toLowerCase();
  if (!a.looked.some((x) => x.term.toLowerCase() === k)) {
    a.looked.push({ term, sentence, at: now() });
    if (a.looked.length > 150) a.looked.shift();
    clearTimeout(lookedSaveT);
    lookedSaveT = setTimeout(() => saveArticle(a), 600);
    updateEndSummary();
  }
}
const cardFor = (term) => cards.find((c) => c.term.toLowerCase() === term.toLowerCase());
function lookedMeaning(x) {
  const c = cardFor(x.term);
  const ai = (c && c.ai) || rd.cache.get(x.term.toLowerCase() + '|' + x.sentence) || aiCacheGet(x.term.toLowerCase() + '|' + x.sentence);
  return ai ? ai.meaning_tr : '';
}
function endSummaryHTML(a) {
  const L = a.looked || [];
  if (!L.length) return `<div class="sub">Okurken dokunduğun kelimeler burada toplanır; sonunda hepsini tek seferde karta çevirebilirsin.</div>`;
  const fresh = L.filter((x) => !cardFor(x.term));
  return `<h3>Bu yazıda baktığın ${L.length} kelime</h3>
    <ul class="sum-list">${L.map((x, i) => {
      const inCards = !!cardFor(x.term);
      const m = lookedMeaning(x);
      return `<li><label><input type="checkbox" data-sum="${i}" ${inCards ? 'disabled' : 'checked'}>
        <span class="sum-t">${esc(x.term)}</span>${m ? ` <span class="sub">— ${esc(m)}</span>` : ''}${inCards ? ` <span class="sub in-cards">${icon('check', 13)}kartlarında</span>` : ''}</label></li>`;
    }).join('')}</ul>
    ${fresh.length ? `<button class="primary" id="sumAdd">Seçilenleri karta ekle (${fresh.length})</button>` : '<div class="sub">Hepsi kartlarında.</div>'}`;
}
function updateEndSummary() {
  const box = $('#rSum');
  if (box && rd.art) box.innerHTML = endSummaryHTML(rd.art);
}
async function addLookedToCards() {
  const a = rd.art;
  const picks = $$('#rSum input[data-sum]:checked:not(:disabled)').map((el) => a.looked[+el.dataset.sum]).filter(Boolean);
  if (!picks.length) return toast('Seçili kelime yok');
  let n = 0;
  for (const x of picks) {
    if (cardFor(x.term)) continue;
    const ai = rd.cache.get(x.term.toLowerCase() + '|' + x.sentence) || aiCacheGet(x.term.toLowerCase() + '|' + x.sentence) || null;
    await saveCard({
      id: uid(), term: x.term, context: x.sentence, source: a.url, tweet: a.tweet || null,
      article: a.tweet ? null : { id: a.id, title: a.title, site: a.site },
      createdAt: now(), status: ai ? 'ready' : 'pending', ai, error: null, seen: 1, srs: SRS.fresh()
    });
    n++;
  }
  toast(`${n} kelime kartlara eklendi`);
  refreshBadges();
  enrichPending();
  const y = window.scrollY;
  renderArticle();
  window.scrollTo(0, y);
}

/* ---------- zorluk etiketi ---------- */
const DIFF_V = 3;
function computeDifficulty(a) {
  const counts = [0, 0, 0, 0, 0, 0, 0]; // 1..5 = A1..C1, 6 = listede yok
  const hard = new Set();
  const known = knownSet();
  let total = 0;
  for (const bl of a.blocks) {
    if (!bl.text || bl.t === 'cap') continue;
    const toks = bl.text.match(/[A-Za-z][A-Za-z'’-]*/g) || [];
    toks.forEach((raw, idx) => {
      const w = raw.replace(/[’]/g, "'").replace(/'s$/i, '');
      if (w.length < 2) return;
      const lower = w.toLowerCase();
      const o = oxLookup(lower);
      // cümle ortasında büyük harfle başlayan ve listede olmayan: büyük ihtimalle özel isim → sayma
      if (!o && /^[A-Z]/.test(w) && idx > 0) return;
      const lvl = o ? o.level : 6;
      counts[lvl]++;
      total++;
      const lemma = o ? o.word : lower;
      if ((lvl >= 4 || (!o && lower.length >= 5)) && !lemmaCandidates(lower).some((k) => known.has(k))) hard.add(lemma);
    });
  }
  if (!total) return null;
  const cov = (L) => counts.slice(1, L + 1).reduce((s, n) => s + n, 0) / total;
  let level = 'C1+';
  for (const [L, name] of [[2, 'A2'], [3, 'B1'], [4, 'B2'], [5, 'C1']]) if (cov(L) >= 0.92) { level = name; break; }
  if (level === 'C1+' && cov(5) >= 0.88) level = 'C1'; // birkaç alan terimi yüzünden C1+ demeyelim
  return { v: DIFF_V, level, hard: hard.size };
}
async function ensureDifficulty(list) {
  await loadOxford();
  for (const a of list) {
    if (a.diff && a.diff.v === DIFF_V) continue;
    const d = computeDifficulty(a);
    if (d) { a.diff = d; saveArticle(a); }
  }
}
function diffBadge(a) {
  if (!a.diff) return '';
  const cls = { A2: 'l2', B1: 'l3', B2: 'l4', C1: 'l5', 'C1+': 'l5' }[a.diff.level] || '';
  return `<span class="lv ${cls}">${esc(a.diff.level)}</span> <span class="sub">~${a.diff.hard} zor kelime</span>`;
}

/* ---------- kartladığın kelimelere yeni yazılarda rastlamak ----------
   Yazı açılınca kartlarındaki kelime/kalıpların geçtiği cümleler bulunur ve karta "başka yerlerde" örneği olarak eklenir.
   Kelimeler çekimleriyle eşleşir (brake kartı → "brakes"), kalıplar olduğu gibi aranır. */
const SIGHT_MAX = 8;
let cardIdxCache = null;
function cardIndex() {
  const key = cards.length + ':' + (cards[0]?.id || '') + ':' + (cards[cards.length - 1]?.id || '');
  if (cardIdxCache && cardIdxCache.key === key) return cardIdxCache;
  const single = new Map(), multi = [];
  for (const c of cards) {
    const t = normalizeText(c.term).toLowerCase();
    if (!t || t.length < 2) continue;
    if (/\s/.test(t)) { if (t.split(/\s+/).length <= 6) multi.push([t, c]); }
    else lemmaCandidates(t).forEach((k) => { if (!single.has(k)) single.set(k, c); });
  }
  return (cardIdxCache = { key, single, multi });
}
function splitSentences(text) {
  return String(text || '').split(/(?<=[.!?…]["”’)]?)\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 3);
}
const isOrigin = (c, a) => (c.article && c.article.id === a.id) || (c.source && a.url && normUrl(c.source) === normUrl(a.url));
// yazıda geçen kartlar: Map(kartId → { card, hits: [{ s: cümle, w: geçtiği biçim }] })
function cardHits(a) {
  const idx = cardIndex();
  const out = new Map();
  if (!idx.single.size && !idx.multi.length) return out;
  const add = (c, s, w) => {
    let h = out.get(c.id);
    if (!h) out.set(c.id, (h = { card: c, hits: [] }));
    if (h.hits.length < 3 && !h.hits.some((x) => x.s === s)) h.hits.push({ s, w });
  };
  const texts = (a.blocks || []).filter((b) => b.text && b.t !== 'img').map((b) => b.text);
  for (const s of texts.flatMap(splitSentences)) {
    for (const m of s.matchAll(/[A-Za-z][A-Za-z'’-]*/g)) {
      const c = lemmaCandidates(m[0]).map((k) => idx.single.get(k)).find(Boolean);
      if (c) add(c, s, m[0]);
    }
    const low = s.toLowerCase();
    for (const [t, c] of idx.multi) { const i = low.indexOf(t); if (i >= 0) add(c, s, s.slice(i, i + t.length)); }
  }
  return out;
}
const hitCountCache = new Map();
function cardHitCount(a) {
  const k = a.id + '|' + cardIndex().key;
  if (!hitCountCache.has(k)) hitCountCache.set(k, cardHits(a).size);
  return hitCountCache.get(k);
}
// açılan yazıdaki cümleleri ilgili kartlara "başka yerlerde gördün" olarak ekle (kaynağı bu yazı olan kart hariç)
async function recordSightings(a) {
  if (!a || !cards.length) return;
  for (const { card: c, hits } of cardHits(a).values()) {
    if (isOrigin(c, a)) continue;
    c.sightings = c.sightings || [];
    if (c.sightings.some((x) => x.aid === a.id)) continue;
    const h = hits.find((x) => normalizeText(x.s) !== normalizeText(c.context || '')) || null;
    if (!h) continue;
    c.sightings.unshift({ s: h.s, w: h.w, aid: a.id, url: a.url || '', title: a.title || '', site: a.site || '', at: now() });
    if (c.sightings.length > SIGHT_MAX) c.sightings.length = SIGHT_MAX;
    await saveCard(c);
  }
}
function sightingsHTML(c) {
  const S = c.sightings || [];
  if (!S.length) return '';
  return `<div class="block sights"><div class="sub">Başka yerlerde de gördün (${S.length})</div>
    ${S.map((x) => `<div class="sight"><p>${highlight(x.s, x.w || c.term)}</p>
      <div class="sub">${articles.some((y) => y.id === x.aid) ? `<a href="#" data-open-art="${esc(x.aid)}">${icon('article', 14)} ${esc(x.site || x.title)}</a>` : x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.site || x.title)} ${icon('external', 12)}</a>` : esc(x.site)} · ${esc(fmtAdded(x.at))}</div></div>`).join('')}
  </div>`;
}

/* ---------- yazıdaki kalıplar (Gemini) ----------
   Yazı açılınca bir kez: öğrenmeye değer kalıplar, phrasal verb'ler, deyimler. Metinde noktalı alt çizgiyle işaretlenir,
   kelime panelinde "bu kelime bir kalıbın parçası" olarak önerilir, yazı sonunda liste halinde karta eklenebilir. */
const PH_V = 1;
const phrasesTried = new Set();
function phrasePrompt(text) {
  return `You help a Turkish learner (B1–C1) read English. From the text below pick up to 10 multi-word expressions worth learning: phrasal verbs, idioms, fixed expressions, strong collocations. Skip proper names, trivial combinations (e.g. "the best", "a lot of") and single words.
"text" MUST be copied exactly as it appears in the text (same inflection, same words). "base" is the dictionary form (e.g. "put the brakes on").
Return JSON: {"phrases":[{"text":"…","base":"…","type":"phrasal_verb|idiom|collocation|expression","meaning_tr":"kısa Türkçe anlam","level":"B1|B2|C1|C2"}]}

TEXT:
${text}`;
}
async function ensurePhrases(a) {
  if (!a || (a.phrases && a.phV === PH_V) || !settings.apiKey || phrasesTried.has(a.id)) return;
  const text = (a.blocks || []).filter((b) => b.text && b.t !== 'img').map((b) => b.text).join('\n').slice(0, 9000);
  if (wordCount(text) < 12) return;
  phrasesTried.add(a.id);
  updatePhrases();
  let list = [];
  try {
    const j = await geminiJSON(phrasePrompt(text), 0.2);
    const low = text.toLowerCase().replace(/[’]/g, "'");
    const seen = new Set();
    list = (j.phrases || []).filter((p) => p && p.text && /\s/.test(p.text.trim()))
      .map((p) => ({ text: p.text.trim().replace(/[’]/g, "'"), base: (p.base || p.text).trim(), type: p.type || 'expression', meaning_tr: p.meaning_tr || '', level: p.level || '' }))
      .filter((p) => low.includes(p.text.toLowerCase()) && !seen.has(p.base.toLowerCase()) && seen.add(p.base.toLowerCase()))
      .slice(0, 10);
  } catch (e) {
    a.phErr = friendlyGeminiError(e);
    if (rd.art === a) updatePhrases();
    return;
  }
  a.phrases = list; a.phV = PH_V; delete a.phErr;
  await saveArticle(a);
  if (rd.art === a && currentView === 'reader') {
    const y = window.scrollY, sel = rd.sel;
    renderArticle(); rd.sel = sel; markSelection(); window.scrollTo(0, y);
  }
}
// bir bloktaki kelime sırası → kalıp eşleşmeleri: Map(token index → kalıp index)
function phraseMarks(text, phrases) {
  const marks = new Map();
  if (!phrases?.length) return marks;
  const toks = tokenize(text);
  const words = [];
  toks.forEach((t, i) => { if (t.word) words.push([t.raw.toLowerCase().replace(/[’]/g, "'"), i]); });
  phrases.forEach((p, pi) => {
    const pw = tokenize(p.text).filter((t) => t.word).map((t) => t.raw.toLowerCase());
    if (!pw.length) return;
    for (let k = 0; k + pw.length <= words.length; k++) {
      if (pw.every((w, j) => words[k + j][0] === w)) {
        for (let i = words[k][1]; i <= words[k + pw.length - 1][1]; i++) if (!marks.has(i)) marks.set(i, pi);
      }
    }
  });
  return marks;
}
function phrasesHTML(a) {
  if (!settings.apiKey) return '';
  if (!a.phrases) return phrasesTried.has(a.id)
    ? (a.phErr ? `<div class="sub">Kalıplar bulunamadı: ${esc(a.phErr)}</div>` : `<div class="sub">${icon('phrase', 14)} Yazıdaki kalıplar aranıyor…</div>`) : '';
  if (!a.phrases.length) return `<div class="sub">Bu yazıda öne çıkan bir kalıp bulunamadı.</div>`;
  return `<h3>Bu yazıdaki kalıplar (${a.phrases.length})</h3>
    <ul class="ph-list">${a.phrases.map((p, i) => {
      const inCards = !!cardFor(p.base) || !!cardFor(p.text);
      return `<li><div class="ph-txt"><b>${esc(p.base)}</b>${p.level ? ` <span class="lv">${esc(p.level)}</span>` : ''}
          <div class="sub">${esc(typeLabel(p.type === 'collocation' || p.type === 'expression' ? 'phrase' : p.type))}${p.meaning_tr ? ' — ' + esc(p.meaning_tr) : ''}</div></div>
        ${inCards ? `<span class="sub in-cards">${icon('check', 13)}kartlarında</span>` : `<button class="icon-btn ph-add" data-ph-add="${i}" aria-label="Kartlara ekle">${icon('plus', 20)}</button>`}</li>`;
    }).join('')}</ul>`;
}
function updatePhrases() {
  const box = $('#rPh');
  if (box && rd.art) { box.innerHTML = phrasesHTML(rd.art); box.hidden = !box.innerHTML; }
}
function phraseSentence(a, p) {
  for (const b of a.blocks || []) {
    if (!b.text) continue;
    const s = splitSentences(b.text).find((x) => x.toLowerCase().replace(/[’]/g, "'").includes(p.text.toLowerCase()));
    if (s) return s;
  }
  return p.text;
}
async function addPhraseToCards(i) {
  const a = rd.art, p = a?.phrases?.[i];
  if (!p || cardFor(p.base)) return;
  await saveCard({
    id: uid(), term: p.base, context: phraseSentence(a, p), source: a.url, tweet: a.tweet || null,
    article: a.tweet ? null : { id: a.id, title: a.title, site: a.site },
    createdAt: now(), status: 'pending', ai: null, error: null, seen: 1, srs: SRS.fresh()
  });
  toast('Kalıp kartlara eklendi');
  refreshBadges();
  enrichPending();
  updatePhrases();
}
// seçili kelime bir kalıbın parçasıysa o kalıbın token aralığı
function phraseAtSelection() {
  const a = rd.art;
  if (!a?.phrases?.length || !rd.sel || rd.sel.b < 0) return null;
  const { b, i0, i1 } = rd.sel;
  const marks = phraseMarks(a.blocks[b].text, a.phrases);
  const pi = marks.get(i0);
  if (pi == null) return null;
  let s = i0, e = i0; // işaretler kalıbın kelimeleri arasındaki boşlukları da kapsar: bitişik aralığı genişlet
  while (marks.get(s - 1) === pi) s--;
  while (marks.get(e + 1) === pi) e++;
  if (s === i0 && e === i1 && i0 !== i1) return null; // zaten kalıbın tamamı seçili
  return { p: a.phrases[pi], b, i0: s, i1: e };
}
