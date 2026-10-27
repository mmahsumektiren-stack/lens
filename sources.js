/* Lens — özel kaynaklar ve engel sayfası tespiti.
   - Reddit: Jina'yı engelliyor; gönderinin herkese açık JSON'u telefondan doğrudan istenir (gönderi + en iyi yorumlar).
   - Engel sayfaları ("blocked by network security", "verify you are human" …) yazı olarak kaydedilmez. */
'use strict';

/* ---------- engel / doğrulama sayfası ---------- */
const BLOCK_PATTERNS = [
  /you(?:'|’)ve been blocked/i, /blocked by network security/i, /access (?:to this page )?(?:has been )?denied/i,
  /verify (?:that )?you are (?:a )?human/i, /are you a robot/i, /checking (?:if the site connection is secure|your browser)/i,
  /just a moment\.\.\./i, /attention required!? \| cloudflare/i, /enable (?:javascript|cookies) (?:and|to) (?:continue|reload)/i,
  /please enable js and disable any ad blocker/i, /unusual traffic from your computer network/i, /captcha/i,
  /request (?:has been )?blocked/i, /security check (?:required|to access)/i, /log in to (?:your \w+ account )?(?:to )?continue/i,
  /subscribe to (?:continue|read)/i, /this content is (?:only )?available to subscribers/i
];
// kısa ve engel kalıbı içeren sayfa = engel sayfası (uzun yazılarda tek bir "captcha" kelimesi sorun değil)
function looksBlocked(title, blocks) {
  const text = [title || '', ...(blocks || []).filter((b) => b.text).map((b) => b.text)].join('\n');
  const words = (text.match(/[A-Za-z]{2,}/g) || []).length;
  const hits = BLOCK_PATTERNS.filter((re) => re.test(text)).length;
  return hits > 0 && (words < 250 || hits >= 2);
}

/* ---------- Reddit ---------- */
const isReddit = (u) => /^https?:\/\/([a-z0-9-]+\.)?(reddit\.com|redd\.it)\//i.test(u);
// gönderinin JSON adresleri (paylaş bağlantısı /s/… ise önce gerçek adres çözülür)
async function redditPostPath(url) {
  const u = new URL(url);
  if (u.hostname === 'redd.it') return `/comments/${u.pathname.split('/').filter(Boolean)[0]}`;
  let path = u.pathname.replace(/\/+$/, '');
  if (/\/comments\/[a-z0-9]+/i.test(path)) return path;
  if (/\/s\/[A-Za-z0-9]+$/.test(path)) {
    // uygulamanın paylaş bağlantısı: yönlendirmeyi takip et
    for (const tryUrl of ['https://www.reddit.com' + path + '.json', 'https://www.reddit.com' + path, 'https://old.reddit.com' + path]) {
      try {
        const r = await fetchWithTimeout(tryUrl, { redirect: 'follow' }, 10000);
        const m = new URL(r.url).pathname.match(/\/r\/[^/]+\/comments\/[a-z0-9]+[^?#]*/i);
        if (m) return m[0].replace(/\/+$/, '').replace(/\.json$/, '');
      } catch {}
    }
    // son çare: Jina engellense bile yönlendirmeyi çözmüş olabilir
    try {
      const r = await fetchWithTimeout('https://r.jina.ai/' + url, { headers: { Accept: 'application/json' } }, 15000);
      const j = await r.json();
      const m = String((j.data || j).url || '').match(/\/r\/[^/]+\/comments\/[a-z0-9]+[^?#]*/i);
      if (m) return m[0].replace(/\/+$/, '');
    } catch {}
    const err = new Error('paylaş bağlantısı çözülemedi');
    err.shareLink = true;
    throw err;
  }
  throw new Error('gönderi adresi değil');
}
function decodeEntities(s) {
  const t = document.createElement('textarea');
  t.innerHTML = s || '';
  return t.value;
}
async function fetchReddit(url) {
  const path = await redditPostPath(url);
  const qs = '.json?raw_json=1&limit=40&sort=top';
  const errs = [];
  for (const base of ['https://www.reddit.com', 'https://old.reddit.com', 'https://api.reddit.com']) {
    try {
      const r = await fetchWithTimeout(base + path + (base.includes('api.') ? '?raw_json=1&limit=40&sort=top' : qs), { headers: { Accept: 'application/json' } }, 15000);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (!Array.isArray(j) || !j[0]?.data?.children?.[0]) throw new Error('beklenmeyen yanıt');
      return { j, path };
    } catch (e) {
      errs.push(base.replace('https://', '') + ': ' + (e.message || 'erişilemedi'));
    }
  }
  throw new Error(errs.join(' · '));
}
function redditToArticle(j, path) {
  const p = j[0].data.children[0].data;
  const blocks = [];
  const sub = p.subreddit_name_prefixed || ('r/' + (p.subreddit || ''));
  if (p.is_self && p.selftext) blocks.push(...markdownToBlocks(decodeEntities(p.selftext)));
  if (!p.is_self && p.url && !/reddit\.com|redd\.it/.test(p.url)) {
    blocks.push({ t: 'p', text: 'Bu gönderi bir bağlantı paylaşıyor: ' + p.url });
  }
  const img = p.preview?.images?.[0]?.source?.url ? decodeEntities(p.preview.images[0].source.url) : '';
  if (img && /\.(jpe?g|png|webp|gif)/i.test(img)) blocks.unshift({ t: 'img', src: img });
  const comments = (j[1]?.data?.children || [])
    .filter((c) => c.kind === 't1' && c.data && c.data.body && !c.data.stickied && c.data.author !== 'AutoModerator' && !/^\[(deleted|removed)\]$/.test(c.data.body))
    .slice(0, 15);
  if (comments.length) {
    blocks.push({ t: 'h', text: 'En iyi yorumlar' });
    for (const c of comments) {
      const d = c.data;
      blocks.push({ t: 'cap', text: `u/${d.author}` + (d.score != null ? ` · ${d.score} puan` : '') });
      blocks.push(...markdownToBlocks(decodeEntities(d.body)).filter((b) => b.t !== 'img'));
      // en çok beğenilen ilk yanıt
      const rep = (d.replies?.data?.children || []).find((x) => x.kind === 't1' && x.data?.body && x.data.score > 1);
      if (rep) {
        blocks.push({ t: 'cap', text: `↳ u/${rep.data.author}` + (rep.data.score != null ? ` · ${rep.data.score} puan` : '') });
        blocks.push(...markdownToBlocks(decodeEntities(rep.data.body)).filter((b) => b.t !== 'img').map((b) => ({ ...b, t: b.t === 'p' ? 'q' : b.t })));
      }
    }
  }
  // üstte gönderinin puanı, yorum sayısı ve etiketi (Reddit'teki gibi)
  const stats = [
    p.score != null ? `⬆ ${p.score} puan` : '',
    p.num_comments != null ? `💬 ${p.num_comments} yorum` : '',
    p.link_flair_text ? decodeEntities(p.link_flair_text) : ''
  ].filter(Boolean).join(' · ');
  if (stats) blocks.unshift({ t: 'cap', text: stats });
  const iso = String(p.created_iso || '').replace(/\.(\d{3})\d*/, '.$1').replace(/([+-]\d\d)(\d\d)$/, '$1:$2');
  return {
    title: decodeEntities(p.title),
    site: 'reddit.com · ' + sub,
    byline: 'u/' + p.author,
    published: p.created_utc ? new Date(p.created_utc * 1000).toISOString() : (iso && !isNaN(Date.parse(iso)) ? new Date(iso).toISOString() : ''),
    image: img,
    blocks,
    url: 'https://www.reddit.com' + path
  };
}

// Reddit uygulamasının kısa paylaş bağlantısı mı (/r/x/s/…)? Tarayıcı bunları çözemez; Lens Seçim uygulaması çözer.
const isRedditShareLink = (u) => isReddit(u) && /\/s\/[A-Za-z0-9]+\/?$/.test(new URL(u).pathname);
const SECIM_RELEASE = 'https://github.com/mmahsumektiren-stack/lens/releases/tag/secim';
function resolveIntentUrl(u) {
  return 'intent://open?u=' + encodeURIComponent(u) +
    '#Intent;scheme=lensresolve;package=io.github.mmahsumektiren.lens;S.browser_fallback_url=' + encodeURIComponent(SECIM_RELEASE) + ';end';
}
