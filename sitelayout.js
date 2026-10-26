/* Lens — sitenin kendi okuma düzenini ölç ve okuyucuda uygula.
   Orijinal HTML, sitenin CSS'iyle (script çalışmadan) görünmez bir pencerede telefon genişliğinde çizilir;
   yazı paragrafının gerçek yazı tipi, boyutu, satır aralığı ve sütun genişliği okunur. */
'use strict';

const siteLayoutOn = () => store.get('siteLayout', true);
const myProxy = () => (store.get('proxyUrl', '') || '').trim().replace(/\/+$/, '');
const viaMyProxy = (u) => myProxy() + '/?url=' + encodeURIComponent(u);

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('zaman aşımı')), ms))]);
}
async function fetchTextVia(url, ms) {
  const tries = [
    url,
    ...(myProxy() ? [viaMyProxy(url)] : []),
    'https://api.allorigins.win/raw?url=' + encodeURIComponent(url),
    'https://corsproxy.io/?url=' + encodeURIComponent(url)
  ].map(async (u) => {
    const r = await fetchWithTimeout(u, {}, ms);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const t = await r.text();
    if (!t) throw new Error('boş');
    return t;
  });
  return Promise.any(tries);
}
// Jina'dan sayfanın HTML'i (JSON yanıt; alan adı sürüme göre html/content olabilir)
async function jinaHTML(url, ms = 20000) {
  const r = await fetchWithTimeout('https://r.jina.ai/' + url, { headers: { Accept: 'application/json', 'X-Return-Format': 'html' } }, ms);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const ct = r.headers.get('content-type') || '';
  if (/json/.test(ct)) {
    const j = await r.json();
    const d = j.data || j;
    const h = d.html || d.content || '';
    if (!/<\w+[\s>]/.test(h)) throw new Error('HTML yok');
    return h;
  }
  return r.text();
}
// sayfanın HTML'i: Jina + (varsa) yedek vekiller yarışır, ilk geçerli yanıt kazanır
// HTML ölçüme uygun mu: sitenin stil dosyası bağlantısı ya da kayda değer satır içi CSS içermeli
function hasStyles(h) {
  if (/<link[^>]+rel=["']?[^"'>]*stylesheet/i.test(h)) return true;
  return (h.match(/<style[\s>][\s\S]*?<\/style>/gi) || []).join('').length > 1500;
}
function okHTML(t, src) {
  if (!/<p[\s>]/i.test(t)) throw new Error(src + ': HTML yok');
  if (!hasStyles(t)) throw new Error(src + ': stil dosyası yok');
  return { html: t, src };
}
const textOk = (r) => (r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status)));
// sayfanın orijinal HTML'i: kaynaklar yarışır, stil içermeyen yanıt elenir
function fetchPageHTML(url) {
  const tries = [];
  if (myProxy()) tries.push(fetchWithTimeout(viaMyProxy(url), {}, 15000).then(textOk).then((t) => okHTML(t, 'vekil')));
  tries.push(jinaHTML(url).then((t) => okHTML(t, 'jina')));
  tries.push(fetchWithTimeout('https://api.allorigins.win/raw?url=' + encodeURIComponent(url), {}, 15000).then(textOk).then((t) => okHTML(t, 'allorigins')));
  tries.push(fetchWithTimeout('https://corsproxy.io/?url=' + encodeURIComponent(url), {}, 15000).then(textOk).then((t) => okHTML(t, 'corsproxy')));
  return Promise.any(tries);
}

const normTxt = (s) => String(s || '').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();
const families = (ff) => String(ff || '').split(',').map((x) => x.trim().replace(/^["']|["']$/g, '').toLowerCase()).filter(Boolean);
const px = (v) => (v && v !== 'normal' ? parseFloat(v) : null);

function parseFontFaces(css, base) {
  const out = [];
  for (const m of css.matchAll(/@font-face\s*{([^}]*)}/gi)) {
    const body = m[1];
    const get = (k) => (body.match(new RegExp(k + '\\s*:\\s*([^;]+)', 'i')) || [])[1]?.trim();
    const family = get('font-family')?.replace(/^["']|["']$/g, '');
    const src = get('src');
    if (!family || !src) continue;
    const urls = [...src.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)(?:\s*format\(\s*["']?([^"')]+)["']?\s*\))?/gi)];
    if (!urls.length) continue;
    const pick = urls.find((u) => /woff2/i.test(u[2] || u[1])) || urls.find((u) => /woff/i.test(u[2] || u[1])) || urls[0];
    if (/^data:/i.test(pick[1])) continue;
    let abs;
    try { abs = new URL(pick[1], base).href; } catch { continue; }
    const range = get('unicode-range');
    if (range && !/U\+0+(?:-|,|\s|$)/i.test(range)) continue; // Latin dışı alt kümeleri atla
    out.push({ family, url: abs, weight: get('font-weight') || 'normal', style: get('font-style') || 'normal', range: range || '' });
  }
  return out;
}

async function tryFace(f) {
  for (const u of [f.url, ...(myProxy() ? [viaMyProxy(f.url)] : []), 'https://corsproxy.io/?url=' + encodeURIComponent(f.url)]) {
    try {
      const desc = { weight: f.weight, style: f.style };
      if (f.range) desc.unicodeRange = f.range;
      const face = new FontFace(f.family, `url("${u}")`, desc);
      await withTimeout(face.load(), 7000);
      document.fonts.add(face);
      return { ...f, url: u };
    } catch {}
  }
  return null;
}

async function measureLayout(html, url, blocks) {
  const W = Math.round(document.documentElement.clientWidth || innerWidth);
  let src = html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<meta[^>]+http-equiv[^>]*>/gi, '');
  const baseTag = `<base href="${url.replace(/"/g, '&quot;')}">`;
  src = /<head[^>]*>/i.test(src) ? src.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`) : baseTag + src;

  const fr = document.createElement('iframe');
  fr.setAttribute('sandbox', 'allow-same-origin'); // script yok, ama DOM'u okuyabiliriz
  fr.setAttribute('aria-hidden', 'true');
  fr.style.cssText = `position:fixed;left:-30000px;top:0;width:${W}px;height:1000px;border:0;visibility:hidden;pointer-events:none`;
  const loaded = new Promise((res) => (fr.onload = res));
  fr.srcdoc = src;
  document.body.appendChild(fr);
  try {
    await withTimeout(loaded, 9000).catch(() => {});
    const doc = fr.contentDocument, win = fr.contentWindow;
    if (!doc || !doc.body) return null;
    await withTimeout(doc.fonts ? doc.fonts.ready : Promise.resolve(), 3000).catch(() => {});

    // bizim metnimizle eşleşen gerçek yazı paragrafını bul
    const probes = blocks.filter((b) => b.t === 'p' && b.text.split(' ').length >= 10).slice(0, 8).map((b) => normTxt(b.text).slice(0, 60));
    if (!probes.length) return null;
    let para = null;
    for (const probe of probes) {
      para = [...doc.querySelectorAll('p')].find((el) => normTxt(el.textContent).includes(probe));
      if (!para) {
        const c = [...doc.querySelectorAll('div,li,section,article,span')].filter((el) => normTxt(el.textContent).includes(probe));
        para = c.sort((a, b) => a.textContent.length - b.textContent.length)[0] || null;
      }
      if (para) break;
    }
    if (!para) return null;
    const cs = win.getComputedStyle(para);
    const rect = para.getBoundingClientRect();
    const pl = px(cs.paddingLeft) || 0, pr = px(cs.paddingRight) || 0;
    const left = Math.round((rect.left + pl) * 10) / 10;
    const width = Math.round((rect.width - pl - pr) * 10) / 10;
    if (!(width > 150 && width <= W + 1 && left >= 0)) return null;
    const size = px(cs.fontSize);
    if (!(size >= 11 && size <= 32)) return null;
    const bodyCs = win.getComputedStyle(doc.body);
    const looksDefault = /times/i.test(cs.fontFamily) && size === 16 && cs.lineHeight === 'normal' && Math.round(px(bodyCs.marginLeft) || 0) === 8;
    if (looksDefault || ![...doc.styleSheets].some((sh) => { try { return sh.href || sh.cssRules.length > 5; } catch { return true; } })) return null;

    const h1 = doc.querySelector('h1');
    const hs = h1 ? win.getComputedStyle(h1) : null;
    const L = {
      W, left, right: Math.max(0, Math.round((W - left - width) * 10) / 10),
      p: { family: cs.fontFamily, size, lh: cs.lineHeight, ls: cs.letterSpacing, ws: cs.wordSpacing, weight: cs.fontWeight, align: cs.textAlign },
      pm: Math.max(px(cs.marginBottom) || 0, px(cs.marginTop) || 0) || Math.round(size),
      h1: hs ? { family: hs.fontFamily, size: px(hs.fontSize), lh: hs.lineHeight, weight: hs.fontWeight, ls: hs.letterSpacing } : null,
      faces: []
    };

    // sitenin yazı tiplerini getir (CSS'leri oku, @font-face kurallarını çıkar, yükle)
    const want = new Set([...families(L.p.family), ...(L.h1 ? families(L.h1.family) : [])]);
    const cssParts = [...doc.querySelectorAll('style')].map((s) => ({ css: s.textContent || '', base: url }));
    const links = [...doc.querySelectorAll('link[rel~="stylesheet"][href]')].map((l) => l.href).filter((h) => /^https?:/.test(h)).slice(0, 6);
    const fetched = await Promise.all(links.map((h) => withTimeout(fetchTextVia(h, 7000), 8000).then((css) => ({ css, base: h })).catch(() => null)));
    const faces = [];
    for (const part of [...cssParts, ...fetched.filter(Boolean)]) {
      for (const f of parseFontFaces(part.css, part.base)) if (want.has(f.family.toLowerCase())) faces.push(f);
    }
    const uniq = [...new Map(faces.map((f) => [f.family + '|' + f.weight + '|' + f.style + '|' + f.range, f])).values()].slice(0, 8);
    L.faces = (await Promise.all(uniq.map(tryFace))).filter(Boolean);
    return L;
  } finally {
    fr.remove();
  }
}

/* ---------- okuyucuda uygula ---------- */
const facesLoaded = new Set();
function ensureFaces(L) {
  for (const f of L?.faces || []) {
    const k = f.family + '|' + f.weight + '|' + f.style + '|' + f.range;
    if (facesLoaded.has(k)) continue;
    facesLoaded.add(k);
    try {
      const desc = { weight: f.weight, style: f.style };
      if (f.range) desc.unicodeRange = f.range;
      const face = new FontFace(f.family, `url("${f.url}")`, desc);
      document.fonts.add(face);
      face.load().catch(() => {});
    } catch {}
  }
}
// eski sürümde stilsiz sayfadan alınmış bozuk ölçüm (tarayıcı varsayılanı) — yok say
function badLayout(L) {
  return !L || !L.p || (/times/i.test(L.p.family) && L.p.size === 16 && L.p.lh === 'normal' && Math.round(L.left) === 8);
}
function siteLayoutActive(a) {
  return !!(a && a.layout && !badLayout(a.layout) && siteLayoutOn() && readPrefs.font === 'auto');
}
function cssLen(v) { return v && v !== 'normal' ? v : 'normal'; }
function applySiteLayout(a) {
  const v = $('#view-reader');
  let st = $('#siteLayoutStyle');
  if (!st) { st = document.createElement('style'); st.id = 'siteLayoutStyle'; document.head.appendChild(st); }
  const on = siteLayoutActive(a);
  v.classList.toggle('site', on);
  if (!on) { st.textContent = ''; return; }
  const L = a.layout;
  ensureFaces(L);
  const fb = ', Roboto, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';
  // telefon genişliği ölçüldüğü andan farklıysa (ör. yatay), sütunu ortala
  const W = Math.round(document.documentElement.clientWidth || innerWidth);
  const width = L.W - L.left - L.right;
  const left = W === L.W ? L.left : Math.max(12, (W - width) / 2);
  const right = W === L.W ? L.right : Math.max(12, W - left - width);
  st.textContent = `
#view-reader.site .r-body { font-family: ${L.p.family}${fb}; font-size: ${L.p.size}px; line-height: ${cssLen(L.p.lh)};
  letter-spacing: ${cssLen(L.p.ls)}; word-spacing: ${L.p.ws && L.p.ws !== '0px' ? L.p.ws : 'normal'}; font-weight: ${L.p.weight || 400};
  padding-left: ${left}px; padding-right: ${right}px; max-width: none; text-align: ${L.p.align === 'justify' ? 'justify' : 'left'}; }
#view-reader.site .r-text p, #view-reader.site .r-text li, #view-reader.site .r-text blockquote { margin: 0 0 ${L.pm}px; }
${L.h1 ? `#view-reader.site .r-title { font-family: ${L.h1.family}${fb}; font-size: ${L.h1.size}px; line-height: ${cssLen(L.h1.lh)}; font-weight: ${L.h1.weight || 700}; letter-spacing: ${cssLen(L.h1.ls)}; }` : ''}`;
}

async function remeasureArticle(a, statusEl) {
  try {
    if (statusEl) statusEl.textContent = 'Sitenin düzeni ölçülüyor…';
    const got = await fetchPageHTML(a.url);
    const L = await withTimeout(measureLayout(got.html, a.url, a.blocks), 25000);
    if (!L) {
      a.layout = null; // bozuk eski ölçümü temizle
      await saveArticle(a);
      throw new Error('sitenin stili okunamadı');
    }
    L.src = got.src;
    a.layout = L;
    await saveArticle(a);
    return true;
  } catch (e) {
    const why = e.errors ? e.errors.map((x) => x.message).join(' · ') : e.message;
    if (statusEl) statusEl.textContent = 'Ölçülemedi: ' + why;
    return false;
  }
}
