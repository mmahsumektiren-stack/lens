/* Lens Reader — paylaşılan web sayfalarını sade okuyucuda aç, kelimeye dokun, öğren. */
'use strict';

/* ---------- Oxford 3000/5000 (resmi CEFR listeleri, offline) ----------
   Kaynak: oxfordlearnersdictionaries.com — The Oxford 3000 / 5000 by CEFR level (PDF), © Oxford University Press.
   oxford.json: { kelime: seviye }  1=A1 2=A2 3=B1 4=B2 5=C1 */
const LEVELS = ['', 'A1', 'A2', 'B1', 'B2', 'C1'];
let OX = null;
async function loadOxford() {
  if (OX) return OX;
  try {
    OX = await (await fetch('oxford.json?v=2')).json();
    for (const k in OX) if (Array.isArray(OX[k])) OX[k] = OX[k][0]; // eski biçime karşı koruma
  } catch { OX = {}; }
  return OX;
}
// basit kök bulma: tariffs → tariff, announced → announce, studies → study
const IRREGULAR = (() => {
  const m = {};
  'am is are was were been being:be|has had having:have|does did done doing:do|said says:say|went gone goes:go|got gotten:get|made:make|took taken:take|saw seen:see|came:come|knew known:know|thought:think|gave given:give|found:find|told:tell|became:become|left:leave|felt:feel|brought:bring|began begun:begin|kept:keep|held:hold|wrote written:write|stood:stand|heard:hear|meant:mean|met:meet|ran:run|paid:pay|sat:sit|spoke spoken:speak|led:lead|grew grown:grow|lost:lose|fell fallen:fall|sent:send|built:build|understood:understand|drew drawn:draw|broke broken:break|spent:spend|rose risen:rise|drove driven:drive|bought:buy|wore worn:wear|chose chosen:choose|sought:seek|threw thrown:throw|caught:catch|dealt:deal|won:win|forgot forgotten:forget|sold:sell|fought:fight|taught:teach|ate eaten:eat|sang sung:sing|drank drunk:drink|slept:sleep|flew flown:fly|hid hidden:hide|shot:shoot|fed:feed|rode ridden:ride|shook shaken:shake|stole stolen:steal|woke woken:wake|bore born:bear|beaten:beat|bit bitten:bite|blew blown:blow|dug:dig|hung:hang|laid:lay|lent:lend|lit:light|shone:shine|sank sunk:sink|stuck:stick|struck:strike|swam swum:swim|swung:swing|tore torn:tear|froze frozen:freeze|forgave forgiven:forgive|arose arisen:arise|fled:flee|bent:bend|bound:bind|sped:speed|swore sworn:swear|wept:weep|withdrew withdrawn:withdraw|undertook undertaken:undertake|overcame:overcome|men:man|women:woman|children:child|feet:foot|teeth:tooth|mice:mouse|better best:good|worse worst:bad|further furthest farther farthest:far|lives:life|wives:wife|knives:knife|leaves:leaf|halves:half|selves:self|analyses:analysis|crises:crisis|criteria:criterion|phenomena:phenomenon|data:data|media:media'.split('|').forEach((g) => { const [forms, base] = g.split(':'); forms.split(' ').forEach((f) => (m[f] = base)); });
  return m;
})();
function lemmaCandidates(w) {
  w = w.toLowerCase().replace(/[’]/g, "'").replace(/'s$/, '');
  // kısaltmalar: don't → do, we'll → we, can't → can, won't → will
  if (/n't$/.test(w)) w = { "won't": 'will', "can't": 'can', "shan't": 'shall', "ain't": 'be' }[w] || w.slice(0, -3);
  else w = w.replace(/'(ll|re|ve|d|m)$/, '');
  const c = [w];
  if (IRREGULAR[w]) c.unshift(IRREGULAR[w]);
  const add = (x) => x.length > 1 && !c.includes(x) && c.push(x);
  if (w.endsWith('ies')) add(w.slice(0, -3) + 'y');
  if (w.endsWith('es')) add(w.slice(0, -2));
  if (w.endsWith('s') && !w.endsWith('ss')) add(w.slice(0, -1));
  if (w.endsWith('ied')) add(w.slice(0, -3) + 'y');
  if (w.endsWith('ed')) { add(w.slice(0, -2)); add(w.slice(0, -1)); if (/(.)\1ed$/.test(w)) add(w.slice(0, -3)); }
  if (w.endsWith('ing')) { add(w.slice(0, -3)); add(w.slice(0, -3) + 'e'); if (/(.)\1ing$/.test(w)) add(w.slice(0, -4)); }
  if (w.endsWith('er')) { add(w.slice(0, -2)); add(w.slice(0, -1)); }
  if (w.endsWith('est')) { add(w.slice(0, -3)); add(w.slice(0, -2)); }
  if (w.endsWith('ly')) { add(w.slice(0, -2)); if (w.endsWith('ily')) add(w.slice(0, -3) + 'y'); }
  return c;
}
function oxLookup(w) {
  if (!OX) return null;
  for (const k of lemmaCandidates(w)) if (OX[k]) return { word: k, level: OX[k] };
  return null;
}
function knownSet() {
  const set = new Set();
  for (const c of cards) {
    const t = c.term.trim().toLowerCase();
    if (!/\s/.test(t)) lemmaCandidates(t).forEach((x) => set.add(x));
  }
  return set;
}

/* ---------- makaleyi getir ---------- */
const READ_SVCS = [
  ['jina', async (url) => {
    const r = await fetchWithTimeout('https://r.jina.ai/' + url, { headers: { Accept: 'application/json' } }, 25000);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const d = j.data || j;
    const blocks = markdownToBlocks(d.content || '');
    return { title: d.title, blocks, published: d.publishedTime || '', site: hostOf(d.url || url) };
  }],
  ['jina-html', async (url) => {
    const html = await jinaHTML(url, 25000);
    return htmlToArticle(html, url);
  }]
];
function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('zaman aşımı')), ms))]);
}
const normTxt = (s) => String(s || '').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();
// Jina'dan sayfanın HTML'i (Markdown yetersiz kalırsa Readability ile ayrıştırmak için)
async function jinaHTML(url, ms = 20000) {
  const r = await fetchWithTimeout('https://r.jina.ai/' + url, { headers: { Accept: 'application/json', 'X-Return-Format': 'html' } }, ms);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  if (/json/.test(r.headers.get('content-type') || '')) {
    const j = await r.json();
    const d = j.data || j;
    const h = d.html || d.content || '';
    if (!/<\w+[\s>]/.test(h)) throw new Error('HTML yok');
    return h;
  }
  return r.text();
}
async function fetchWithTimeout(url, opts, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctl.signal }); } finally { clearTimeout(t); }
}
function cleanTitle(t, site) {
  t = String(t || '').trim();
  const parts = t.split(/\s+[|–—]\s+/);
  if (parts.length > 1) {
    // en uzun parça genelde asıl başlıktır
    t = parts.reduce((a, b) => (b.length > a.length ? b : a));
  }
  return t;
}
function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } }

function htmlToArticle(html, url) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const base = doc.createElement('base');
  base.href = url;
  doc.head.prepend(base);
  return extractArticle(doc, url); // page-extract.js (Lens Seçim de aynısını kullanır)
}
function absUrl(u, base) { return peAbsUrl(u, base); }
function markdownToBlocks(md) {
  const out = [];
  const clean = (s) => s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/<https?:[^>]+>/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ').trim();
  let para = [];
  const flush = () => { const t = clean(para.join(' ')); if (t) out.push({ t: 'p', text: t }); para = []; };
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const img = line.match(/^!\[[^\]]*\]\(([^)\s]+)/);
    if (img) { flush(); out.push({ t: 'img', src: img[1] }); continue; }
    if (/^#{1,6}\s/.test(line)) { flush(); const t = clean(line.replace(/^#+\s*/, '')); if (t) out.push({ t: 'h', text: t }); continue; }
    if (/^([-*+]|\d+\.)\s+/.test(line)) { flush(); const t = clean(line.replace(/^([-*+]|\d+\.)\s+/, '')); if (t) out.push({ t: 'li', text: t }); continue; }
    if (/^>/.test(line)) { flush(); const t = clean(line.replace(/^>+\s*/, '')); if (t) out.push({ t: 'q', text: t }); continue; }
    if (/^(-{3,}|={3,}|\*{3,}|\|)/.test(line)) { flush(); continue; }
    if (/^\[[^\]]*\]\([^)]*\)$/.test(line)) { flush(); continue; } // tek başına link = menü kırıntısı
    // kısa, noktalamasız satırları ("Share", "Menu") ayrı blok yap ki ayıklansın
    if (clean(line).split(' ').length <= 3 && !/[.!?:"”]$/.test(clean(line))) { flush(); para.push(line); flush(); continue; }
    para.push(line);
  }
  flush();
  return out;
}
// menü, paylaş butonları gibi kırıntıları ayıkla
function tidyBlocks(blocks, title) {
  const seen = new Set();
  const norm = (s) => s.toLowerCase().replace(/\W+/g, ' ').trim();
  const res = [];
  for (const b of blocks) {
    if (b.t === 'img') { if (!seen.has(b.src)) { seen.add(b.src); res.push(b); } continue; }
    const n = norm(b.text);
    if (!n || seen.has(n)) continue;
    if (title && n === norm(title)) continue;
    if (b.t !== 'h' && b.text.split(' ').length < 4 && !/[.!?:]$/.test(b.text)) continue; // "Share", "Menu" vb.
    seen.add(n);
    res.push(b);
  }
  return res;
}

let articles = [];
async function loadArticles() { try { articles = (await DB.all('articles')) || []; } catch { articles = []; } }
async function saveArticle(a) {
  await DB.put(a, 'articles');
  const i = articles.findIndex((x) => x.id === a.id);
  if (i >= 0) articles[i] = a; else articles.push(a);
}
function normUrl(u) { try { const x = new URL(u); x.hash = ''; ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'].forEach((k) => x.searchParams.delete(k)); return x.href; } catch { return u; } }

// Reddit gönderisini (ham JSON: [gönderi, yorumlar]) kütüphaneye kaydedip açar
async function saveRedditArticle(j, path, url, note = '', fresh = false) {
  const a = redditToArticle(j, path);
  if (note) a.blocks.push({ t: 'cap', text: note });
  const key = 'reddit:' + ((path.match(/\/comments\/([a-z0-9]+)/i) || [])[1] || path);
  await loadArticles();
  const same = articles.find((x) => x.key === key);
  if (same && !fresh) return openArticle(same.id); // aynı gönderi başka bir bağlantıyla eklenmiş
  const blocks = a.blocks.filter((b) => b.t === 'img' || (b.text && b.text.trim()));
  const words = blocks.filter((b) => b.text).reduce((n, b) => n + b.text.split(/\s+/).length, 0);
  const art = {
    id: same ? same.id : uid(), url: normUrl(url || a.url), key, title: a.title, site: a.site, byline: a.byline, published: a.published, image: a.image,
    blocks, words, minutes: Math.max(1, Math.round(words / 200)), createdAt: same ? same.createdAt : now(), progress: 0, scrollY: 0, trans: {}, via: 'reddit'
  };
  await saveArticle(art);
  return openArticle(art.id);
}
// Lens Seçim uygulamasının telefondan çekip gönderdiği Reddit verisi (?reddit=…)
async function importRedditData(raw, url) {
  try {
    const d = JSON.parse(raw);
    if (!Array.isArray(d.j) || !d.j[0]?.data?.children?.[0]) throw new Error('boş veri');
    // JSON dışındaki yollarda kaynağı ve (teşhis için) nedenini sonda küçük bir notla göster
    logSvc('reddit-telefon', true);
    const note = d.via && d.via !== 'json'
      ? 'Kaynak: ' + (d.via === 'page' ? 'Reddit sayfası' : 'Reddit RSS (puanlar yok)') + (d.diag ? ' · ' + d.diag.replace(/ · $/, '') : '') : '';
    return await saveRedditArticle(d.j, d.path || '', url || ('https://www.reddit.com' + (d.path || '')), note, true); // Lens Seçim'den gelen taze veri eskisinin yerine geçer
  } catch (e) {
    toast('Reddit verisi okunamadı');
    if (url) return importArticle(url);
  }
}

async function importArticle(url, titleHint = '', opts = {}) {
  url = normUrl(url);
  await loadArticles();
  const existing = articles.find((a) => a.url === url);
  if (existing && !looksBlocked(existing.title, existing.blocks)) return openArticle(existing.id);
  if (existing) { await DB.del(existing.id, 'articles'); articles = articles.filter((x) => x !== existing); } // eski engel sayfası kaydını at
  show('reader');
  const host = $('#readerBody');
  $('#readerSite').textContent = hostOf(url);
  host.innerHTML = `<div class="r-loading"><div class="spinner"></div><p>Sayfa sadeleştiriliyor…</p><p class="sub r-url">${esc(titleHint || url)}</p></div>`;
  const errs = window.launchErr ? [window.launchErr] : [];
  if (window.launchErr) logSvc(/^Lens Seçim/.test(window.launchErr) ? 'reddit-telefon' : 'telefon', false, hostOf(url) + ': ' + window.launchErr.replace(/^(telefon|Lens Seçim): /, ''));
  window.launchErr = '';
  // Reddit Jina'yı engelliyor: gönderinin JSON'unu telefondan doğrudan iste
  if (isReddit(url)) {
    try {
      const { j, path } = await fetchReddit(url);
      logSvc('reddit', true);
      return await saveRedditArticle(j, path, url);
    } catch (e) {
      errs.push('reddit: ' + (e.message || 'erişilemedi'));
      logSvc('reddit', false, e.message || 'erişilemedi');
    }
  }

  // Lens Seçim'in telefonda açıp çıkardığı yazı varsa önce onu dene (bot korumasına takılmaz)
  const svcs = opts.page ? [['telefon', async () => opts.page], ...READ_SVCS] : READ_SVCS;
  for (const [name, fn] of svcs) {
    try {
      const a = await fn(url);
      const blocks = tidyBlocks(a.blocks || [], cleanTitle(a.title || titleHint));
      const words = blocks.filter((b) => b.text).reduce((n, b) => n + b.text.split(/\s+/).length, 0);
      if (looksBlocked(a.title, blocks)) { errs.push(name + ': engel sayfası geldi (bot koruması)'); logSvc(name, false, hostOf(url) + ': engel sayfası'); continue; }
      if (words < 40) { errs.push(name + ': metin çok kısa (muhtemelen bot doğrulaması)'); logSvc(name, false, hostOf(url) + ': metin çok kısa'); continue; }
      logSvc(name, true);
      const art = {
        id: uid(), url, title: cleanTitle(a.title || titleHint, a.site) || hostOf(url), site: a.site || hostOf(url), byline: a.byline || '',
        published: a.published || '', image: a.image || blocks.find((x) => x.t === 'img')?.src || '', blocks, words, minutes: Math.max(1, Math.round(words / 200)),
        createdAt: now(), progress: 0, scrollY: 0, trans: {}, via: name
      };
      await saveArticle(art);
      return openArticle(art.id);
    } catch (e) {
      const m = e.name === 'AbortError' ? 'zaman aşımı' : e.message || 'erişilemedi';
      errs.push(name + ': ' + m);
      logSvc(name, false, hostOf(url) + ': ' + m);
    }
  }
  store.set('failedImport', { url, title: titleHint, at: now() });
  if (isReddit(url)) {
    host.innerHTML = `<div class="r-loading">${failHTML({
      title: 'Reddit gönderisi buradan açılamadı',
      text: 'Reddit, Lens gibi web uygulamalarının gönderiyi okumasına izin vermiyor. <b>Lens Seçim</b> gönderiyi telefonundan alıp burada açar.',
      primary: { label: 'Lens Seçim ile aç', ico: 'phone', href: resolveIntentUrl(url), primary: true },
      secondary: [{ label: 'Tekrar dene', ico: 'refresh', id: 'rRetry' }],
      note: `İpucu: Reddit'te <b>Paylaş → ${IS_DEV ? 'Lens Test' : 'Lens'}</b> dersen gönderi doğrudan açılır, bu ekran hiç çıkmaz.`,
      details: errs.join(' · ')
    })}</div>`;
    $('#rRetry').onclick = () => importArticle(url, titleHint);
    return;
  }
  const blocked = errs.some((e) => /metin çok kısa|engel sayfası|HTTP 40[13]|HTTP 451/.test(e));
  host.innerHTML = `<div class="r-loading">${failHTML({
    title: 'Bu sayfa getirilemedi',
    text: blocked
      ? 'Site otomatik erişimi engelliyor (bot koruması).' + (opts.page ? '' : ' <b>Telefonla aç</b> sayfayı senin bağlantınla açar, çoğu sitede işe yarar.')
      : 'Okuma servislerine ulaşılamadı. Tekrar deneyebilir ya da sayfayı telefonla açabilirsin.',
    primary: opts.page ? null : { label: 'Telefonla aç', ico: 'phone', href: fetchIntentUrl(url), primary: true },
    secondary: [{ label: 'Sayfayı aç', ico: 'external', href: url }, { label: 'Tekrar dene', ico: 'refresh', id: 'rRetry' }],
    note: 'O da olmazsa: sayfayı Chrome’da aç → yazıya uzun bas → <b>Tümünü seç</b> → <b>Paylaş → Lens</b>.',
    details: errs.join(' · ')
  })}</div>`;
  $('#rRetry').onclick = () => importArticle(url, titleHint);
}

/* ---------- paylaşılan uzun metinden yazı (bot korumalı siteler için: Tümünü seç → Paylaş) ---------- */
const wordCount = (s) => (String(s || '').match(/[A-Za-z]{2,}/g) || []).length;
function textToBlocks(text) {
  const out = [];
  for (let line of String(text).split(/\n+/)) {
    line = line.replace(/[ \t]+/g, ' ').trim();
    if (!line) continue;
    if (/^[•·\-*–]\s+/.test(line)) { out.push({ t: 'li', text: line.replace(/^[•·\-*–]\s+/, '') }); continue; }
    const n = line.split(' ').length;
    const heading = n >= 3 && n <= 14 && !/[.!?:;,"”)]$/.test(line) && /^[A-Z0-9“"‘']/.test(line);
    out.push({ t: heading ? 'h' : 'p', text: line });
  }
  return out;
}
const isLongPara = (s) => s.split(' ').length >= 18 && /[.!?"”]$/.test(s);
function slugWords(url) {
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean).sort((a, b) => b.length - a.length)[0] || '';
    return new Set(decodeURIComponent(seg).toLowerCase().replace(/\.[a-z]+$/, '').split(/[-_]+/).filter((w) => w.length > 2 && !/^\d{4,}$/.test(w)));
  } catch { return new Set(); }
}
function pickTitle(lines, url) {
  const firstLong = lines.findIndex((l) => isLongPara(l));
  const pool = (firstLong > 0 ? lines.slice(0, firstLong) : lines.slice(0, 12))
    .filter((l) => { const n = l.split(' ').length; return n >= 5 && n <= 25 && !/[.]$/.test(l); });
  if (!pool.length) return '';
  const slug = slugWords(url);
  if (slug.size) {
    const score = (l) => l.toLowerCase().split(/[^a-z0-9]+/).filter((w) => slug.has(w)).length;
    const best = pool.reduce((a, b) => (score(b) > score(a) ? b : a));
    if (score(best) >= 3) return best;
  }
  const clean = pool.filter((l) => !/[A-Z]{3,}\/|rights|illustration|photo|image|getty|reuters\/|©|cookie|subscribe|sign in|newsletter/i.test(l));
  return (clean.length ? clean : pool).reduce((a, b) => (b.split(' ').length > a.split(' ').length ? b : a));
}
async function importTextArticle(text, title = '', url = '') {
  await loadArticles();
  // bu metin az önce içeri alınamayan bir sayfadan geliyorsa onun linkini kullan
  const failed = store.get('failedImport', null);
  if (!url && failed && now() - failed.at < 20 * 60000) { url = failed.url; title = title || failed.title || ''; }
  url = url ? normUrl(url) : '';
  const lines0 = String(text).split(/\n+/).map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean);
  const textKey = 'text:' + normTxt(lines0.find((l) => isLongPara(l)) || text).slice(0, 160);
  const key = url || textKey;
  const existing = articles.find((a) => (url && a.url === url) || a.textKey === textKey);
  if (existing) return openArticle(existing.id);

  const lines = String(text).split(/\n+/).map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean);
  const pickedTitle = cleanTitle(title) || pickTitle(lines, url);
  // gövde ilk gerçek paragraftan başlar (öncesi menü, tarih, fotoğraf açıklaması)
  const firstLong = lines.findIndex((l) => isLongPara(l));
  const bodyLines = firstLong > 0 ? lines.slice(firstLong) : lines.filter((l) => l !== pickedTitle);
  let blocks = textToBlocks(bodyLines.join('\n'));
  const t = pickedTitle || 'Paylaşılan yazı';
  blocks = tidyBlocks(blocks, t);
  const words = blocks.filter((b) => b.text).reduce((n, b) => n + b.text.split(/\s+/).length, 0);
  const art = {
    id: uid(), url, key, textKey, title: t, site: url ? hostOf(url) : 'Paylaşılan metin', byline: '', published: '', image: '',
    blocks, words, minutes: Math.max(1, Math.round(words / 200)), createdAt: now(), progress: 0, scrollY: 0, trans: {}, via: 'paylaşım', layout: null
  };
  if (failed && url === normUrl(failed.url)) store.set('failedImport', null);
  await saveArticle(art);
  return openArticle(art.id);
}

/* ---------- kütüphane ---------- */
async function renderLibrary() {
  await loadArticles();
  // eski sürümlerde yazı sanılıp kaydedilmiş engel sayfalarını temizle
  for (const a of articles.filter((x) => looksBlocked(x.title, x.blocks))) await DB.del(a.id, 'articles');
  articles = articles.filter((x) => !looksBlocked(x.title, x.blocks));
  const list = articles.slice().sort((a, b) => (b.lastOpened || b.createdAt) - (a.lastOpened || a.createdAt));
  await ensureDifficulty(list);
  $('#libList').innerHTML = list.length ? list.map((a) => `
    <li class="lib-item" data-open="${a.id}">
      ${a.image ? `<img src="${esc(a.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
      <div class="lib-txt">
        <div class="lib-title">${esc(a.title)}</div>
        <div class="sub">${esc(a.site)} · ${a.minutes} dk${a.progress > 0.97 ? ' · bitti' : a.progress > 0.02 ? ` · %${Math.round(a.progress * 100)}` : ''}</div>
        ${a.diff ? `<div class="lib-diff">${diffBadge(a)}${a.looked?.length ? ` <span class="sub">· ${a.looked.length} kelimeye baktın</span>` : ''}</div>` : ''}
        <div class="lib-bar"><span style="width:${Math.round((a.progress || 0) * 100)}%"></span></div>
      </div>
      <button class="lib-del icon-btn" data-del="${a.id}" aria-label="Sil">${icon('close', 18)}</button>
    </li>`).join('') : emptyHTML({ ico: 'article', title: 'Kütüphanen boş', text: 'Keşfet’ten bir yazı seç, Chrome’da bir sayfayı ⋮ → Paylaş → <b>Lens</b> ile gönder ya da linki yukarıya yapıştır.' });
}

/* ---------- okuyucu ---------- */
const rd = { art: null, sel: null, extend: false, saveT: null, cache: new Map(), reading: false };
const readPrefs = {
  get size() { return store.get('readSize', 17); },
  get font() { const f = store.get('readFont', 'sans'); return f === 'serif' ? 'serif' : 'sans'; },
  get theme() { return store.get('readTheme', 'auto'); },
  get ox() { return store.get('oxLevel', 3); } // 0 = kapalı, 1 = A1+ … 5 = C1
};

function applyReadPrefs() {
  const v = $('#view-reader');
  v.style.setProperty('--r-size', readPrefs.size + 'px');
  v.dataset.font = readPrefs.font;
  v.dataset.theme = readPrefs.theme;
}

async function openArticle(id) {
  await loadOxford();
  if (!articles.length) await loadArticles();
  const a = articles.find((x) => x.id === id);
  if (!a) return show('read');
  rd.art = a;
  rd.sel = null;
  a.lastOpened = now();
  saveArticle(a);
  show('reader');
  if (history.state?.reader !== a.id) history.pushState({ reader: a.id }, '');
  applyReadPrefs();
  $('#readerSite').textContent = a.site;
  renderArticle();
  requestAnimationFrame(() => window.scrollTo(0, a.scrollY || 0));
}

function renderArticle() {
  const a = rd.art;
  const known = knownSet();
  const min = readPrefs.ox;
  const date = a.published && !isNaN(Date.parse(a.published)) ? new Date(a.published).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const wordSpan = (raw, b, i) => {
    let cls = 'w';
    const lw = raw.toLowerCase();
    if (lemmaCandidates(lw).some((k) => known.has(k))) cls += ' kn';
    else if (min) { const o = oxLookup(lw); if (o && o.level >= min) cls += ' ox l' + o.level; }
    return `<span class="${cls}" data-b="${b}" data-i="${i}">${esc(raw)}</span>`;
  };
  const textHTML = (text, b) => tokenize(text).map((t, i) => (t.word ? wordSpan(t.raw, b, i) : esc(t.raw))).join('');
  const tnorm = (s) => String(s || '').toLowerCase().replace(/\W+/g, ' ').trim();
  const parts = a.blocks.map((bl, b) => {
    if (bl.t === 'h' && b < 3 && tnorm(bl.text) === tnorm(a.title)) return ''; // başlığın içerikteki kopyası
    if (bl.t === 'img') return `<img class="r-img" src="${esc(bl.src)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`;
    const tag = { h: 'h2', li: 'li', q: 'blockquote', cap: 'p', p: 'p' }[bl.t] || 'p';
    const tr = a.trans?.[b] && a.showTr?.[b] ? `<div class="r-tr" data-trof="${b}"><span class="r-tr-l">Türkçe</span>${esc(a.trans[b])}</div>` : '';
    return `<${tag} class="rb rb-${bl.t}" data-block="${b}">${textHTML(bl.text, b)}</${tag}>${tr}`;
  });
  $('#readerBody').innerHTML = `
    <header class="r-head">
      <div class="r-meta">${esc(a.site)}${date ? ' · ' + esc(date) : ''} · ${a.minutes} dk</div>
      <h1 class="r-title">${textHTML(a.title = cleanTitle(a.title), -1)}</h1>
      ${a.byline ? `<div class="r-meta">${esc(a.byline)}</div>` : ''}
    </header>
    ${a.image && !a.blocks.some((x) => x.t === 'img') ? `<img class="r-img" src="${esc(a.image)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
    <div class="r-text">${parts.join('')}</div>
    <section class="r-sum" id="rSum">${endSummaryHTML(a)}</section>
    <footer class="r-end">${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener">Orijinal sayfa ${icon('external', 14)}</a>` : ''}</footer>`;
  if (rd.sel) markSelection();
}

function blockText(b) { return b === -1 ? rd.art.title : rd.art.blocks[b].text; }

function markSelection() {
  $$('#readerBody .w.sel').forEach((x) => x.classList.remove('sel'));
  if (!rd.sel) return;
  const { b, i0, i1 } = rd.sel;
  $$(`#readerBody .w[data-b="${b}"]`).forEach((x) => { const i = +x.dataset.i; if (i >= i0 && i <= i1) x.classList.add('sel'); });
}

function selectionInfo() {
  const { b, i0, i1 } = rd.sel;
  const toks = tokenize(blockText(b));
  const term = normalizeText(toks.slice(i0, i1 + 1).map((t) => t.raw).join(''));
  const start = toks.slice(0, i0).reduce((n, t) => n + t.raw.length, 0);
  const end = start + term.length;
  const text = blockText(b);
  // terimi içeren cümle
  let s = 0, e = text.length;
  const re = /[.!?…]["”’)]?\s+/g;
  let m;
  while ((m = re.exec(text))) {
    const pos = m.index + m[0].length;
    if (pos <= start) s = pos; else if (m.index >= end) { e = m.index + m[0].trimEnd().length; break; }
  }
  return { term, sentence: text.slice(s, e).trim() };
}

function onReaderTap(e) {
  const w = e.target.closest('.w');
  if (!w) { if (!e.target.closest('#sheet')) closeSheet(); return; }
  const b = +w.dataset.b, i = +w.dataset.i;
  if (rd.extend && rd.sel && rd.sel.b === b) {
    rd.sel = { b, i0: Math.min(rd.sel.i0, i), i1: Math.max(rd.sel.i1, i) };
    rd.extend = false;
  } else {
    rd.sel = { b, i0: i, i1: i };
    rd.extend = false;
  }
  markSelection();
  openSheet();
}

/* ----- alt panel ----- */
async function openSheet() {
  const { term, sentence } = selectionInfo();
  const single = !/\s/.test(term);
  const ox = single ? oxLookup(term) : null;
  const inCards = cards.find((c) => c.term.toLowerCase() === term.toLowerCase());
  const sh = $('#sheet');
  sh.hidden = false;
  document.body.classList.add('sheet-open');
  sh.innerHTML = `
    <div class="sh-grip"></div>
    <div class="sh-top">
      <div class="sh-term">${esc(term)}</div>
      ${ox && LEVELS[ox.level] ? `<span class="lv l${ox.level}">${LEVELS[ox.level]}</span>` : ''}
      <button class="speak" data-speak="${esc(term)}" aria-label="Sesli oku">${icon('speak', 18)}</button>
      <button class="sh-x icon-btn" id="shClose" aria-label="Kapat">${icon('close', 20)}</button>
    </div>
    <div class="sub sh-ipa"></div>
    <div id="shBody" class="sh-body"><div class="sub">${settings.apiKey ? 'Anlam getiriliyor…' : 'Anlam için Ayarlar’dan Gemini anahtarı ekle.'}</div></div>
    <div class="sh-actions">
      <button class="primary act" id="shAdd">${inCards ? icon('check', 18) + '<span>Kartlarında</span>' : icon('plus', 18) + '<span>Kartlara ekle</span>'}</button>
      <button class="ghost act${rd.extend ? ' on' : ''}" id="shExt">${icon('phrase', 18)}<span>Kalıp seç</span></button>
      <button class="ghost act" id="shDictBtn">${icon('dict', 18)}<span>Sözlük</span></button>
      <button class="ghost act" id="shTr">${icon('translate', 18)}<span>Paragrafı çevir</span></button>
      <button class="ghost act" id="shRead">${icon('play', 18)}<span>Paragrafı dinle</span></button>
    </div>
    <div id="shDict" class="sh-dict" hidden></div>`;
  recordLooked(term, sentence);
  if (!settings.apiKey) return;
  const key = term.toLowerCase() + '|' + sentence;
  try {
    let ai = rd.cache.get(key) || (inCards?.ai ?? null);
    if (!ai) ai = await askGemini(term, sentence);
    rd.cache.set(key, ai);
    updateEndSummary(); // yazı sonu listesinde anlamı göster
    if (!rd.sel || selectionInfo().term !== term) return; // bu arada başka kelimeye dokunuldu
    if (ai.ipa && $('.sh-ipa')) $('.sh-ipa').textContent = ai.ipa;
    $('#shBody').innerHTML = `
      <div class="meaning">${esc(ai.meaning_tr)}</div>
      ${ai.pos ? `<div class="sub">${esc(ai.pos)}${ai.type && ai.type !== 'word' ? ' · ' + esc(typeLabel(ai.type)) : ''}</div>` : ''}
      ${ai.explanation_tr ? `<p>${esc(ai.explanation_tr)}</p>` : ''}
      ${ai.context_tr ? `<p class="sh-ctx"><span class="sub">Cümle:</span> ${esc(ai.context_tr)}</p>` : ''}`;
  } catch (e) {
    const gt = 'https://translate.google.com/?sl=en&tl=tr&op=translate&text=' + encodeURIComponent(sentence);
    // kota doluysa en azından temel anlamı göster (ücretsiz çeviri + sözlük)
    let basic = null;
    if (e.kind === 'quota' || e.kind === 'other') { try { basic = await basicAI(term, sentence); } catch {} }
    if (!rd.sel || selectionInfo().term !== term) return;
    if (basic) {
      if (basic.ipa && $('.sh-ipa')) $('.sh-ipa').textContent = basic.ipa;
      $('#shBody').innerHTML = `
        <div class="meaning">${esc(basic.meaning_tr)}</div>
        ${basic.pos ? `<div class="sub">${esc(basic.pos)}</div>` : ''}
        ${basic.explanation_tr.startsWith('İngilizce') ? `<p>${esc(basic.explanation_tr.replace(/ \(Temel kart.*$/, ''))}</p>` : ''}
        <div class="sub">Temel çeviri — ${esc(friendlyGeminiError(e))}</div>`;
      return;
    }
    $('#shBody').innerHTML = `<div class="sub">${esc(friendlyGeminiError(e))}</div>
      <a class="sub" href="${gt}" target="_blank" rel="noopener">Google Çeviri'de aç ${icon('external', 14)}</a>`;
  }
}
function closeSheet() {
  const sh = $('#sheet');
  if (!sh || sh.hidden) return;
  sh.hidden = true;
  document.body.classList.remove('sheet-open');
  rd.sel = null;
  rd.extend = false;
  markSelection();
}

async function addSelectionToCards() {
  const { term, sentence } = selectionInfo();
  const a = rd.art;
  const dup = cards.find((c) => c.term.toLowerCase() === term.toLowerCase());
  if (dup) {
    dup.srs.due = Math.min(dup.srs.due, now());
    dup.seen = (dup.seen || 1) + 1;
    await saveCard(dup);
    toast('Zaten vardı, tekrara öne alındı');
  } else {
    const ai = rd.cache.get(term.toLowerCase() + '|' + sentence) || null;
    await saveCard({
      id: uid(), term, context: sentence, source: a.url, tweet: null,
      article: { id: a.id, title: a.title, site: a.site },
      createdAt: now(), status: ai ? 'ready' : 'pending', ai, error: null, seen: 1, srs: SRS.fresh()
    });
    toast('Kartlara eklendi');
    if (!ai) enrichPending();
  }
  refreshBadges();
  const y = window.scrollY;
  const sel = rd.sel;
  renderArticle();
  rd.sel = sel;
  markSelection();
  window.scrollTo(0, y);
  const btn = $('#shAdd');
  if (btn) btn.innerHTML = icon('check', 18) + '<span>Kartlarında</span>';
}

async function translateBlock(b) {
  const a = rd.art;
  if (b < 0) return toast('Başlık çevirisi için bir paragraftaki kelimeye dokun');
  a.showTr = a.showTr || {};
  if (a.trans?.[b]) {
    a.showTr[b] = !a.showTr[b];
  } else {
    if (!settings.apiKey) return toast('Çeviri için Ayarlar’dan Gemini anahtarı ekle');
    toast('Çevriliyor…', 4000);
    try {
      a.trans = a.trans || {};
      a.trans[b] = await geminiTranslate(a.blocks[b].text);
      a.showTr[b] = true;
    } catch (e) {
      return toast(friendlyGeminiError(e), 5000);
    }
  }
  await saveArticle(a);
  const y = window.scrollY;
  const sel = rd.sel;
  renderArticle();
  rd.sel = sel;
  markSelection();
  window.scrollTo(0, y);
}
async function geminiTranslate(text) {
  const j = await geminiJSON(`Translate this English paragraph into natural, fluent Turkish. Keep names as they are. Return ONLY JSON {"tr": "..."}.\n\n${text}`, 0.2);
  return j.tr;
}

/* ----- sesli okuma ----- */
function readBlocksFrom(b) {
  stopReadAloud();
  if (!('speechSynthesis' in window)) return toast('Bu tarayıcıda sesli okuma yok');
  rd.reading = true;
  $('#rListen').innerHTML = icon('stop', 22);
  const step = (i) => {
    const blocks = rd.art.blocks;
    while (i < blocks.length && !blocks[i].text) i++;
    if (!rd.reading || i >= blocks.length) return stopReadAloud();
    $$('#readerBody .rb.reading').forEach((x) => x.classList.remove('reading'));
    const el = $(`#readerBody .rb[data-block="${i}"]`);
    if (el) { el.classList.add('reading'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    const u = new SpeechSynthesisUtterance(blocks[i].text);
    u.lang = 'en-US';
    u.rate = 0.95;
    const v = speechSynthesis.getVoices().find((x) => /^en[-_]US/i.test(x.lang));
    if (v) u.voice = v;
    u.onend = () => rd.reading && step(i + 1);
    speechSynthesis.speak(u);
  };
  step(Math.max(0, b));
}
function stopReadAloud() {
  rd.reading = false;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  $$('#readerBody .rb.reading').forEach((x) => x.classList.remove('reading'));
  const btn = $('#rListen');
  if (btn) btn.innerHTML = icon('listen', 22);
}
function firstVisibleBlock() {
  const els = $$('#readerBody .rb');
  const el = els.find((x) => x.getBoundingClientRect().bottom > 70);
  return el ? +el.dataset.block : 0;
}

/* ----- yazı ayarları ----- */
function renderPrefs() {
  const p = $('#rPrefs');
  const sizes = [15, 16, 17, 18, 20, 22];
  const looks = [['sans', 'Orijinale yakın'], ['serif', 'Kitap']];
  p.innerHTML = `
    <div class="pref"><span>Görünüm</span><div class="seg">${looks.map(([k, l]) => `<button data-font="${k}" class="${readPrefs.font === k ? 'on' : ''}"${k === 'serif' ? ' style="font-family:Georgia,serif"' : ''}>${l}</button>`).join('')}</div></div>
    <div class="pref"><span>Boyut</span><div class="seg">${sizes.map((s) => `<button data-size="${s}" class="${readPrefs.size === s ? 'on' : ''}" style="font-size:${Math.round(s * 0.75)}px">A</button>`).join('')}</div></div>
    <div class="pref"><span>Tema</span><div class="seg">
      ${[['auto', 'Oto'], ['light', 'Açık'], ['sepia', 'Sepya'], ['dark', 'Koyu']].map(([k, l]) => `<button data-theme="${k}" class="${readPrefs.theme === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="pref"><span>Oxford vurgusu</span><div class="seg">
      ${[[0, 'Kapalı'], [1, 'Hepsi'], [2, 'A2+'], [3, 'B1+'], [4, 'B2+'], [5, 'C1']].map(([k, l]) => `<button data-ox="${k}" class="${readPrefs.ox === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="legend"><span class="w ox l3">altı çizili</span> Oxford listesinde, seçtiğin seviye ve üstü · <span class="w kn">yeşil zeminli</span> kartlarında var</div>`;
}

function bindReader() {
  $('#readerBody').addEventListener('click', (e) => {
    if (e.target.closest('#sumAdd')) return addLookedToCards();
    if (e.target.closest('#rSum')) return; // onay kutuları paneli kapatmasın
    onReaderTap(e);
  });
  bindDragSelect();
  $('#sheet').addEventListener('click', (e) => {
    const sp = e.target.closest('[data-speak]');
    if (sp) return speak(sp.dataset.speak);
    if (e.target.closest('#shClose')) return closeSheet();
    if (e.target.closest('#shDictBtn')) {
      const box = $('#shDict');
      box.hidden = !box.hidden;
      if (!box.hidden) {
        box.innerHTML = dictPanelHTML(selectionInfo().term);
        box.scrollIntoView({ block: 'nearest' });
      }
      return;
    }
    const dl = e.target.closest('[data-dict]');
    if (dl) { store.set('dictLast', dl.dataset.dict); return; } // bağlantı normal açılır
    if (e.target.closest('#shAdd')) return addSelectionToCards();
    if (e.target.closest('#shExt')) {
      rd.extend = !rd.extend;
      e.target.closest('#shExt').classList.toggle('on', rd.extend);
      if (rd.extend) toast('Kalıbın son kelimesine dokun');
      return;
    }
    if (e.target.closest('#shTr')) return rd.sel && translateBlock(rd.sel.b);
    if (e.target.closest('#shRead')) return rd.sel && (rd.sel.b < 0 ? speak(rd.art.title) : readBlocksFrom(rd.sel.b));
  });
  $('#rBack').addEventListener('click', () => (history.state?.reader ? history.back() : show('read')));
  $('#rListen').addEventListener('click', () => (rd.reading ? stopReadAloud() : readBlocksFrom(firstVisibleBlock())));
  $('#rAa').addEventListener('click', () => {
    const p = $('#rPrefs');
    p.hidden = !p.hidden;
    if (!p.hidden) renderPrefs();
  });
  $('#rPrefs').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.size) store.set('readSize', +b.dataset.size);
    if (b.dataset.font) store.set('readFont', b.dataset.font);
    if (b.dataset.theme) store.set('readTheme', b.dataset.theme);
    if (b.dataset.ox) store.set('oxLevel', +b.dataset.ox);
    applyReadPrefs();
    renderPrefs();
    if (b.dataset.ox) renderArticle();
  });
  window.addEventListener('scroll', () => {
    if (currentView !== 'reader' || !rd.art) return;
    const h = document.documentElement.scrollHeight - innerHeight;
    const pr = h > 0 ? Math.min(1, scrollY / h) : 1;
    $('#rProgress').style.width = Math.round(pr * 100) + '%';
    clearTimeout(rd.saveT);
    rd.saveT = setTimeout(() => {
      rd.art.scrollY = scrollY;
      rd.art.progress = Math.max(rd.art.progress || 0, pr);
      saveArticle(rd.art);
    }, 700);
  }, { passive: true });

  // Android geri tuşu: okuyucudan kütüphaneye dön
  window.addEventListener('popstate', () => { if (currentView === 'reader') show('read'); });

  // kütüphane
  $('#libList').addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      const a = articles.find((x) => x.id === del.dataset.del);
      if (a && confirm(`"${a.title}" silinsin mi?`)) { await DB.del(a.id, 'articles'); renderLibrary(); }
      return;
    }
    const it = e.target.closest('[data-open]');
    if (it) openArticle(it.dataset.open);
  });
  $('#libGo').addEventListener('click', () => {
    const v = $('#libUrl').value.trim();
    const m = v.match(/https?:\/\/\S+/);
    if (!m) return toast('Geçerli bir link yapıştır');
    $('#libUrl').value = '';
    importArticle(m[0]);
  });
}
