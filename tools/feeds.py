#!/usr/bin/env python3
"""Lens Keşfet: kaynakların RSS/Atom akışlarını toplar, tek bir feed.json üretir.

GitHub Actions'ta 3 saatte bir çalışır (.github/workflows/feeds.yml) ve sonucu `feed` dalına yazar.
Lens bu dosyayı raw.githubusercontent.com'dan okur (CORS açık, vekil gerekmez).

- Her kaynak için önce bilinen akış adresleri denenir; olmazsa sitenin ana sayfasından akış otomatik bulunur.
- Her kaynaktan bir yazı Jina Reader ile açılmayı denenir; açılamayan kaynak raporda işaretlenir.
Sadece standart kütüphane kullanır.
"""
import email.utils
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

# kategori: trend (Gündemde), tech, world, ent (Magazin), blogs, read (Okuma)
SOURCES = [
    # öğrenci dostu
    {'id': 'voa-le', 'name': 'VOA Learning English', 'cat': 'world', 'home': 'https://learningenglish.voanews.com/',
     'pick_newest': True,  # onlarca alt akışı var; en güncel yazıları olanı seç
     'feeds': ['https://learningenglish.voanews.com/api/', 'https://learningenglish.voanews.com/api/zmg_pl-vomx-tpeymtm',
               'https://learningenglish.voanews.com/api/z-ptqml-vomx-tper-kqy', 'https://learningenglish.voanews.com/api/z-qvqvl-vomx-tperkuqt',
               'https://learningenglish.voanews.com/api/zt-pq_l-vomx-tpekyyqv', 'https://learningenglish.voanews.com/api/zgptqil-vomx-tpe-jkqm',
               'https://learningenglish.voanews.com/api/zbptq_l-vomx-tpeq-kqv', 'https://learningenglish.voanews.com/api/z-viqql-vomx-tpero_qq',
               'https://learningenglish.voanews.com/api/zj-pqrl-vomx-tpebyyqo', 'https://learningenglish.voanews.com/api/zqmiqol-vomx-tpei-mqp']},
    # gündem
    {'id': 'hn', 'name': 'Hacker News', 'cat': 'trend', 'home': 'https://news.ycombinator.com/',
     'feeds': ['https://hnrss.org/frontpage?points=250&count=50'], 'max_age_days': 4, 'per_source': 25, 'external': True},
    {'id': 'techmeme', 'name': 'Techmeme', 'cat': 'trend', 'home': 'https://www.techmeme.com/',
     'feeds': ['https://www.techmeme.com/feed.xml'], 'max_age_days': 3, 'per_source': 15, 'external': True},
    # teknoloji / yapay zeka
    {'id': 'verge', 'name': 'The Verge', 'cat': 'tech', 'home': 'https://www.theverge.com/',
     'feeds': ['https://www.theverge.com/rss/index.xml']},
    {'id': 'ars', 'name': 'Ars Technica', 'cat': 'tech', 'home': 'https://arstechnica.com/',
     'feeds': ['https://feeds.arstechnica.com/arstechnica/index']},
    {'id': 'mittr', 'name': 'MIT Technology Review', 'cat': 'tech', 'home': 'https://www.technologyreview.com/',
     'feeds': ['https://www.technologyreview.com/feed/']},
    # dünya / ekonomi
    {'id': 'bbc-world', 'name': 'BBC World', 'cat': 'world', 'home': 'https://www.bbc.com/news/world',
     'feeds': ['https://feeds.bbci.co.uk/news/world/rss.xml']},
    {'id': 'bbc-business', 'name': 'BBC Business', 'cat': 'world', 'home': 'https://www.bbc.com/news/business',
     'feeds': ['https://feeds.bbci.co.uk/news/business/rss.xml']},
    {'id': 'npr', 'name': 'NPR', 'cat': 'world', 'home': 'https://www.npr.org/',
     'feeds': ['https://feeds.npr.org/1001/rss.xml']},
    {'id': 'guardian', 'name': 'The Guardian', 'cat': 'world', 'home': 'https://www.theguardian.com/world',
     'feeds': ['https://www.theguardian.com/world/rss']},
    # magazin / eğlence
    {'id': 'polygon', 'name': 'Polygon', 'cat': 'ent', 'home': 'https://www.polygon.com/',
     'feeds': ['https://www.polygon.com/rss/index.xml']},
    {'id': 'avclub', 'name': 'The A.V. Club', 'cat': 'ent', 'home': 'https://www.avclub.com/',
     'feeds': ['https://www.avclub.com/rss']},
    {'id': 'nme', 'name': 'NME', 'cat': 'ent', 'home': 'https://www.nme.com/',
     'feeds': ['https://www.nme.com/feed']},
    {'id': 'bbc-ent', 'name': 'BBC Entertainment', 'cat': 'ent', 'home': 'https://www.bbc.com/news/entertainment_and_arts',
     'feeds': ['https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml']},
    # bloglar
    {'id': 'gates', 'name': 'Gates Notes', 'cat': 'blogs', 'home': 'https://www.gatesnotes.com/',
     'feeds': ['https://www.gatesnotes.com/home/rss', 'https://www.gatesnotes.com/rss'], 'max_age_days': 180},
    {'id': 'pg', 'name': 'Paul Graham', 'cat': 'blogs', 'home': 'https://paulgraham.com/',
     'feeds': ['http://www.aaronsw.com/2002/feeds/pgessays.rss'], 'max_age_days': 3650, 'per_source': 5},
    {'id': 'altman', 'name': 'Sam Altman', 'cat': 'blogs', 'home': 'https://blog.samaltman.com/',
     'feeds': ['https://blog.samaltman.com/posts.atom'], 'max_age_days': 365},
    {'id': 'willison', 'name': 'Simon Willison', 'cat': 'blogs', 'home': 'https://simonwillison.net/',
     'feeds': ['https://simonwillison.net/atom/entries/'], 'max_age_days': 30},
    {'id': 'housel', 'name': 'Collab Fund (Morgan Housel)', 'cat': 'blogs', 'home': 'https://collabfund.com/blog/',
     'feeds': ['http://feeds.feedburner.com/collabfund', 'https://collabfund.com/blog/rss/'], 'max_age_days': 120},
    {'id': 'wbw', 'name': 'Wait But Why', 'cat': 'blogs', 'home': 'https://waitbutwhy.com/',
     'feeds': ['https://waitbutwhy.com/feed'], 'max_age_days': 3650, 'per_source': 5},
    {'id': 'openai', 'name': 'OpenAI', 'cat': 'blogs', 'home': 'https://openai.com/news/',
     'feeds': ['https://openai.com/news/rss.xml', 'https://openai.com/blog/rss.xml'], 'max_age_days': 60},
    {'id': 'anthropic', 'name': 'Anthropic', 'cat': 'blogs', 'home': 'https://www.anthropic.com/news',
     # resmi akış yok; duyuru sayfasından üretilen topluluk akışı (github.com/Olshansk/rss-feeds)
     'feeds': ['https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_news.xml'], 'max_age_days': 60},
    # okuma (haber dışı)
    {'id': 'aeon', 'name': 'Aeon', 'cat': 'read', 'home': 'https://aeon.co/',
     'feeds': ['https://aeon.co/feed.rss'], 'max_age_days': 30},
    {'id': 'smithsonian', 'name': 'Smithsonian', 'cat': 'read', 'home': 'https://www.smithsonianmag.com/',
     'feeds': ['https://www.smithsonianmag.com/rss/latest_articles/'], 'max_age_days': 30},
    {'id': 'atlas', 'name': 'Atlas Obscura', 'cat': 'read', 'home': 'https://www.atlasobscura.com/',
     'feeds': ['https://www.atlasobscura.com/feeds/latest'], 'max_age_days': 30},
]

# Gündem kaynaklarında makale olmayan bağlantıları atla
SKIP_DOMAINS = ('youtube.com', 'youtu.be', 'github.com', 'x.com', 'twitter.com', 'news.ycombinator.com',
                'reddit.com', 'arxiv.org', 'docs.google.com', 'apps.apple.com', 'play.google.com')

DEFAULT_MAX_AGE = 10
DEFAULT_PER_SOURCE = 12
NS = {
    'atom': 'http://www.w3.org/2005/Atom',
    'media': 'http://search.yahoo.com/mrss/',
    'content': 'http://purl.org/rss/1.0/modules/content/',
    'dc': 'http://purl.org/dc/elements/1.1/',
}


def fetch(url, timeout=25, accept='*/*'):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': accept, 'Accept-Language': 'en-US,en;q=0.9'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(), r.geturl(), r.headers.get('Content-Type', '')


def clean_text(s, limit=280):
    s = html.unescape(re.sub(r'<[^>]+>', ' ', s or ''))
    s = re.sub(r'\s+', ' ', s).strip()
    return (s[: limit - 1].rsplit(' ', 1)[0] + '…') if len(s) > limit else s


def parse_date(s):
    if not s:
        return None
    s = s.strip()
    try:
        d = email.utils.parsedate_to_datetime(s)
        if d:
            return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except Exception:
        pass
    try:
        d = datetime.fromisoformat(s.replace('Z', '+00:00'))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def first_img(el, desc_html):
    for path in ('media:content', 'media:thumbnail', 'media:group/media:content'):
        for m in el.findall(path, NS):
            u = m.get('url')
            if u and (m.get('medium') in (None, 'image') or re.search(r'\.(jpe?g|png|webp)', u, re.I)):
                return u
    enc = el.find('enclosure')
    if enc is not None and (enc.get('type') or '').startswith('image'):
        return enc.get('url')
    m = re.search(r'<img[^>]+src=["\']([^"\']+)', desc_html or '')
    return html.unescape(m.group(1)) if m else ''


def parse_feed(data):
    root = ET.fromstring(data)
    items = []
    tag = root.tag.lower()
    if tag.endswith('rss') or root.find('channel') is not None:
        for it in root.iter('item'):
            desc = it.findtext('description') or it.findtext('content:encoded', namespaces=NS) or ''
            items.append({
                'title': clean_text(it.findtext('title'), 200),
                'link': (it.findtext('link') or '').strip(),
                'date': parse_date(it.findtext('pubDate') or it.findtext('dc:date', namespaces=NS)),
                'summary': clean_text(desc),
                'image': first_img(it, desc),
                'comments': (it.findtext('comments') or '').strip(),
                'raw': desc,
            })
    elif tag.endswith('feed'):
        for e in root.findall('atom:entry', NS):
            link = ''
            for l in e.findall('atom:link', NS):
                if l.get('rel') in (None, 'alternate'):
                    link = l.get('href') or ''
                    break
            desc = e.findtext('atom:summary', namespaces=NS) or e.findtext('atom:content', namespaces=NS) or ''
            items.append({
                'title': clean_text(e.findtext('atom:title', namespaces=NS), 200),
                'link': link.strip(),
                'date': parse_date(e.findtext('atom:published', namespaces=NS) or e.findtext('atom:updated', namespaces=NS)),
                'summary': clean_text(desc),
                'image': first_img(e, desc),
                'comments': '',
                'raw': desc,
            })
    elif tag.endswith('rdf'):
        for it in root.iter('{http://purl.org/rss/1.0/}item'):
            ns = '{http://purl.org/rss/1.0/}'
            desc = it.findtext(ns + 'description') or ''
            items.append({
                'title': clean_text(it.findtext(ns + 'title'), 200),
                'link': (it.findtext(ns + 'link') or '').strip(),
                'date': parse_date(it.findtext('dc:date', namespaces=NS)),
                'summary': clean_text(desc), 'image': '', 'comments': '', 'raw': desc,
            })
    return items


def discover(home):
    """Ana sayfadaki <link rel="alternate" type="application/rss+xml"> etiketlerinden akış bul."""
    data, final, _ = fetch(home, accept='text/html,application/xhtml+xml')
    page = data.decode('utf-8', 'replace')
    out = []
    for tag in re.findall(r'<link\b[^>]*>', page, re.I):
        if re.search(r'type=["\']application/(rss|atom)\+xml', tag, re.I):
            m = re.search(r'href=["\']([^"\']+)', tag, re.I)
            if m:
                out.append(urllib.parse.urljoin(final, html.unescape(m.group(1))))
    return out


def feed_candidates(src, errors):
    """Aday akışları sırayla üretir: (öğeler, adres). Önce bilinen adresler, sonra ana sayfadan keşif."""
    tried = []
    for url in src['feeds'] + ['__discover__']:
        urls = [url]
        if url == '__discover__':
            try:
                urls = [u for u in discover(src['home']) if u not in tried]
            except Exception as e:
                errors.append(f'keşif: {e}')
                urls = []
        for u in urls:
            tried.append(u)
            try:
                data, _, _ = fetch(u, accept='application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5')
                items = parse_feed(data)
                if items:
                    yield items, u
                else:
                    errors.append(f'{u}: boş akış')
            except Exception as e:
                errors.append(f'{u}: {type(e).__name__}: {str(e)[:120]}')


def jina_ok(link):
    """Bu yazı Jina Reader ile açılabiliyor mu (Lens'in okuyucusu bunu kullanıyor)."""
    try:
        data, _, _ = fetch('https://r.jina.ai/' + link, timeout=40, accept='application/json')
        d = json.loads(data.decode('utf-8', 'replace'))
        content = (d.get('data') or d).get('content') or ''
        words = len(re.findall(r'[A-Za-z]{2,}', content))
        return words >= 150, words
    except Exception as e:
        return False, f'{type(e).__name__}: {str(e)[:80]}'


def techmeme_link(raw):
    """Techmeme öğesinin açıklamasındaki ilk dış bağlantı = asıl makale."""
    for m in re.finditer(r'href=["\']([^"\']+)', raw or ''):
        u = html.unescape(m.group(1))
        if u.startswith('http') and 'techmeme.com' not in u:
            return u
    return None


def filter_items(src, items, now):
    max_age = src.get('max_age_days', DEFAULT_MAX_AGE)
    kept = []
    for it in sorted(items, key=lambda x: x['date'] or datetime.min.replace(tzinfo=timezone.utc), reverse=True):
        link = it['link']
        if src['id'] == 'techmeme':
            link = techmeme_link(it['raw']) or link
        if not link.startswith('http'):
            continue
        host = urllib.parse.urlparse(link).hostname or ''
        if src.get('external') and any(host == d or host.endswith('.' + d) for d in SKIP_DOMAINS):
            continue
        if link.lower().endswith('.pdf'):
            continue
        d = it['date']
        if d and (now - d).days > max_age:
            continue
        extra = {}
        summary = it['summary']
        if src['id'] == 'hn':
            m = re.search(r'Points:\s*(\d+)', it['raw'] or '')
            if m:
                extra['points'] = int(m.group(1))
            summary = ''  # hnrss özeti sadece puan/yorum bilgisi
        if src['id'] == 'techmeme':
            summary = ''
        kept.append({
            'src': src['id'], 'cat': src['cat'], 'title': it['title'], 'link': link,
            'date': d.isoformat() if d else None, 'summary': summary, 'image': it['image'],
            'site': host.replace('www.', ''), **extra,
        })
        if len(kept) >= src.get('per_source', DEFAULT_PER_SOURCE):
            break
    return kept


def main():
    now = datetime.now(timezone.utc)
    out_items, report = [], []
    for src in SOURCES:
        errors = []
        best, used = [], None
        for items, url in feed_candidates(src, errors):
            kept = filter_items(src, items, now)
            if not kept:
                errors.append(f'{url}: güncel yazı yok')
                continue
            if not src.get('pick_newest'):
                best, used = kept, url
                break
            if not best or (kept[0]['date'] or '') > (best[0]['date'] or ''):
                best, used = kept, url
        kept = best
        jina = None
        if kept:
            # dış bağlantılı gündem kaynaklarında yazılar farklı sitelerden gelir; birini dene yeter
            jina = jina_ok(kept[0]['link'])
            time.sleep(3)
        report.append({
            'id': src['id'], 'name': src['name'], 'cat': src['cat'], 'home': src['home'],
            'feed': used, 'count': len(kept), 'jina': jina, 'errors': errors[-4:],
        })
        out_items.extend(kept)
        print(f"{src['id']:12} {len(kept):3} öğe  feed={used}  jina={jina}  {'; '.join(errors[-2:]) if not used else ''}", flush=True)

    out_items.sort(key=lambda x: x['date'] or '', reverse=True)
    out = {'generated': now.isoformat(), 'sources': report, 'items': out_items[:400]}
    with open(sys.argv[1] if len(sys.argv) > 1 else 'feed.json', 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print(f'toplam {len(out_items)} öğe')


if __name__ == '__main__':
    main()
