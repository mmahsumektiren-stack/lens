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
      id: uid(), term: x.term, context: x.sentence, source: a.url, tweet: null,
      article: { id: a.id, title: a.title, site: a.site },
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
