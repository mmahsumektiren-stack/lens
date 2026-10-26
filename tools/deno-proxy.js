// Lens vekili — Deno Deploy sürümü (Cloudflare workers.dev erişilemeyen ağlar için)
// Lens'in sitelerden yazı tipi, CSS ve HTML almasını sağlar (CORS izni ekler).
// Sadece Lens'in adresinden gelen isteklere yanıt verir.

const ALLOWED_ORIGINS = ['https://mmahsumektiren-stack.github.io'];
const UA = 'Mozilla/5.0 (Linux; Android 14; 23127PN0CG) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

let cachePromise = null;
async function getCache() {
  try { return await (cachePromise ||= caches.open('lens-vekil')); } catch { return null; }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') || '';
  const okOrigin = ALLOWED_ORIGINS.includes(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: okOrigin ? 204 : 403, headers: cors(origin) });
  if (!okOrigin) return new Response('Bu vekil sadece Lens için.', { status: 403 });
  if (req.method !== 'GET') return new Response('Sadece GET', { status: 405, headers: cors(origin) });

  const target = new URL(req.url).searchParams.get('url') || '';
  let t;
  try { t = new URL(target); } catch { return new Response('url gerekli', { status: 400, headers: cors(origin) }); }
  if (!/^https?:$/.test(t.protocol) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(t.hostname)) {
    return new Response('izin verilmeyen adres', { status: 403, headers: cors(origin) });
  }

  const cache = await getCache();
  const key = new Request(t.href);
  let res = cache ? await cache.match(key).catch(() => undefined) : undefined;
  if (!res) {
    let up;
    try {
      up = await fetch(t.href, {
        headers: { 'User-Agent': UA, Accept: '*/*', 'Accept-Language': 'en-US,en;q=0.9', Referer: t.origin + '/' },
        redirect: 'follow'
      });
    } catch (e) {
      return new Response('Kaynak siteye ulaşılamadı: ' + (e && e.message), { status: 502, headers: cors(origin) });
    }
    const body = await up.arrayBuffer();
    const h = new Headers(up.headers);
    h.delete('Set-Cookie');
    h.delete('Content-Encoding');
    h.delete('Content-Length');
    if (up.ok) h.set('Cache-Control', 'public, max-age=86400');
    res = new Response(body, { status: up.status, headers: h });
    if (up.ok && cache) cache.put(key, res.clone()).catch(() => {});
  }
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(cors(origin))) out.headers.set(k, v);
  return out;
});
