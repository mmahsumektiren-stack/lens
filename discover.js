/* Lens — Keşfet: seçili kaynaklardan en yeni yazılar.
   Akışlar GitHub Actions'ta 3 saatte bir toplanır (tools/feeds.py) ve `feed` dalına yazılır. */
'use strict';

const FEED_URL = 'https://raw.githubusercontent.com/mmahsumektiren-stack/lens/feed/feed.json';
const DISC_TABS = [
  ['all', 'Tümü'], ['trend', '🔥 Gündemde'], ['tech', 'Teknoloji'], ['world', 'Dünya'],
  ['ent', 'Magazin'], ['blogs', 'Bloglar'], ['read', 'Okuma']
];
const CAT_NAMES = Object.fromEntries(DISC_TABS);
const disc = { data: null, tab: 'all', shown: 15, loading: false }; // tab, bindDiscover'da ayardan okunur

function feedCache() { return store.get('feedCache', null); }
async function loadFeed(force = false) {
  const c = feedCache();
  if (c && !disc.data) disc.data = c.data;
  if (!force && c && now() - c.at < 30 * 60000) return disc.data;
  if (disc.loading) return disc.data;
  disc.loading = true;
  try {
    const r = await fetchWithTimeout(FEED_URL + '?t=' + Math.floor(now() / 600000), {}, 15000);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    disc.data = data;
    store.set('feedCache', { at: now(), data });
    logSvc('feed', true);
  } catch (e) {
    logSvc('feed', false, e.message || 'erişilemedi');
    if (!disc.data) throw e;
  } finally {
    disc.loading = false;
  }
  return disc.data;
}

const srcOff = () => new Set(store.get('srcOff', []));
// akışı olan ve yazıları Jina ile açılabilen kaynaklar
function usableSources(data) {
  return (data?.sources || []).filter((s) => s.count > 0 && !(Array.isArray(s.jina) && s.jina[0] === false));
}

function timeAgo(iso) {
  if (!iso) return '';
  const d = (now() - Date.parse(iso)) / 60000;
  if (!(d >= 0)) return '';
  if (d < 60) return Math.max(1, Math.round(d)) + ' dk önce';
  if (d < 1440) return Math.round(d / 60) + ' sa önce';
  if (d < 1440 * 30) return Math.round(d / 1440) + ' gün önce';
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function discItems() {
  const data = disc.data;
  if (!data) return [];
  const ok = new Set(usableSources(data).map((s) => s.id));
  const off = srcOff();
  const t = (x) => Date.parse(x.date || '') || 0;
  const byLink = new Map();
  for (const it of data.items.slice().sort((a, b) => t(b) - t(a))) {
    if (!ok.has(it.src) || off.has(it.src)) continue;
    if (disc.tab !== 'all' && it.cat !== disc.tab) continue;
    const k = normUrl(it.link);
    const prev = byLink.get(k);
    if (prev) { // aynı yazı birden çok kaynakta: ilkini tut, Hacker News puanını kaybetme
      if (it.points && !prev.points) byLink.set(k, { ...prev, points: it.points });
      continue;
    }
    byLink.set(k, it);
  }
  return [...byLink.values()];
}

async function renderDiscover() {
  const tabs = $('#discTabs');
  tabs.innerHTML = DISC_TABS.map(([k, l]) => `<button class="chip${disc.tab === k ? ' on' : ''}" data-tab="${k}">${l}</button>`).join('');
  const list = $('#discList');
  if (!disc.data) {
    disc.data = feedCache()?.data || null;
    if (!disc.data) list.innerHTML = '<li class="sub">Yazılar getiriliyor…</li>';
  }
  drawDiscList();
  try {
    const before = disc.data?.generated;
    await loadFeed();
    if (disc.data?.generated !== before) drawDiscList();
  } catch {
    if (!disc.data) list.innerHTML = '<li class="sub">Yazılar şu an getirilemedi. İnternet bağlantını kontrol edip sonra tekrar dene.</li>';
  }
}

function drawDiscList() {
  const list = $('#discList');
  const data = disc.data;
  if (!data) return;
  const names = Object.fromEntries((data.sources || []).map((s) => [s.id, s.name]));
  const have = new Set(articles.map((a) => a.url));
  const items = discItems();
  $('#discAge').textContent = data.generated ? 'güncellendi: ' + timeAgo(data.generated) : '';
  list.innerHTML = items.length ? items.slice(0, disc.shown).map((it) => {
    const done = have.has(normUrl(it.link));
    const meta = [
      it.cat === 'trend' ? esc(it.site) + ` <span class="via">· ${esc(names[it.src] || '')}</span>` : esc(names[it.src] || it.site),
      timeAgo(it.date),
      it.points ? `🔥 ${it.points} puan` : ''
    ].filter(Boolean).join(' · ');
    return `<li class="disc-item${done ? ' done' : ''}" data-link="${esc(it.link)}" data-title="${esc(it.title)}">
      ${it.image ? `<img src="${esc(it.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
      <div class="disc-txt">
        <div class="disc-meta">${meta}${done ? ' · <b>✓ kütüphanede</b>' : ''}</div>
        <div class="disc-title">${esc(it.title)}</div>
        ${it.summary ? `<div class="disc-sum">${esc(it.summary)}</div>` : ''}
      </div>
    </li>`;
  }).join('') : '<li class="sub">Bu sekmede şu an yazı yok.</li>';
  $('#discMore').hidden = items.length <= disc.shown;
}

function bindDiscover() {
  disc.tab = store.get('discTab', 'all');
  $('#discTabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    disc.tab = b.dataset.tab;
    disc.shown = 15;
    store.set('discTab', disc.tab);
    $$('#discTabs .chip').forEach((x) => x.classList.toggle('on', x === b));
    drawDiscList();
  });
  $('#discList').addEventListener('click', (e) => {
    const it = e.target.closest('[data-link]');
    if (it) importArticle(it.dataset.link, it.dataset.title);
  });
  $('#discMore').addEventListener('click', () => { disc.shown += 15; drawDiscList(); });
  $('#discRefresh').addEventListener('click', async () => {
    $('#discAge').textContent = 'yenileniyor…';
    try { await loadFeed(true); } catch { toast('Yazılar getirilemedi'); }
    drawDiscList();
  });
}

/* ----- Ayarlar: kaynak aç/kapat ----- */
async function renderSourceSettings() {
  const box = $('#srcSettings');
  try { await loadFeed(); } catch {}
  const data = disc.data;
  if (!data) { box.innerHTML = '<div class="sub">Kaynak listesi için internet gerekli.</div>'; return; }
  const off = srcOff();
  const groups = {};
  for (const s of data.sources) (groups[s.cat] = groups[s.cat] || []).push(s);
  box.innerHTML = DISC_TABS.filter(([k]) => groups[k]).map(([k, l]) => `
    <div class="src-group"><div class="sub">${l}</div>
    ${groups[k].map((s) => {
      const usable = s.count > 0 && !(Array.isArray(s.jina) && s.jina[0] === false);
      return `<label class="toggle"><input type="checkbox" data-src="${s.id}" ${off.has(s.id) ? '' : 'checked'} ${usable ? '' : 'disabled'}>
        <span>${esc(s.name)}${usable ? '' : ' <small class="sub">— şu an alınamıyor</small>'}</span></label>`;
    }).join('')}</div>`).join('');
}
function bindSourceSettings() {
  $('#srcSettings').addEventListener('change', (e) => {
    const cb = e.target.closest('[data-src]');
    if (!cb) return;
    const off = srcOff();
    cb.checked ? off.delete(cb.dataset.src) : off.add(cb.dataset.src);
    store.set('srcOff', [...off]);
  });
}
