/* Lens — sayfadan yazıyı çıkarma (Readability + Lens blokları).
   İki yerde aynen kullanılır: Lens'in kendisinde (Jina'dan gelen HTML için) ve
   Lens Seçim'in telefonda sayfayı açtığı görünmez tarayıcıda. Bu yüzden başka dosyalara bağımlı değil. */
'use strict';

function peAbsUrl(u, base) { try { return u ? new URL(u, base).href : ''; } catch (e) { return ''; } }
function peHost(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }

// Readability çıktısını Lens bloklarına çevirir: p, h, li, q (alıntı), cap (alt yazı), img
function domToBlocks(root, base) {
  const out = [];
  const els = root.querySelectorAll('p,h1,h2,h3,h4,li,blockquote,img,figcaption,pre');
  for (const el of els) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'img') {
      const src = peAbsUrl(el.getAttribute('src') || el.getAttribute('data-src'), base);
      if (src && !/^data:/.test(src)) out.push({ t: 'img', src });
      continue;
    }
    if ((tag === 'li' || tag === 'blockquote') && el.querySelector('p')) continue;
    if (tag === 'p' && el.closest('li,figcaption')) continue;
    const text = el.textContent.replace(/[ \t\n]+/g, ' ').trim();
    if (!text) continue;
    const t = /^h[1-4]$/.test(tag) ? 'h' : tag === 'li' ? 'li' : tag === 'blockquote' ? 'q' : tag === 'figcaption' ? 'cap' : 'p';
    out.push({ t, text });
  }
  return out;
}

// doc: ayrıştırılmış (ya da kopyalanmış) belge. Readability belgeyi değiştirdiği için kopya verilmeli.
function extractArticle(doc, url) {
  const meta = (n) => (doc.querySelector(`meta[property="${n}"],meta[name="${n}"]`) || {}).content || '';
  const ogImage = meta('og:image');
  const ogTitle = meta('og:title');
  const published = meta('article:published_time');
  const art = new Readability(doc).parse();
  if (!art || !art.content) throw new Error('makale bulunamadı');
  const box = new DOMParser().parseFromString(art.content, 'text/html').body;
  return {
    title: art.title || ogTitle,
    byline: art.byline || '',
    site: art.siteName || peHost(url),
    published: art.publishedTime || published,
    image: peAbsUrl(ogImage, url),
    blocks: domToBlocks(box, url)
  };
}
