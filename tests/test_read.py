import os as _os
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))  # repo kökü
OUT = _os.path.join(ROOT, 'tests', 'out'); _os.makedirs(OUT, exist_ok=True)  # ekran görüntüleri (git'e girmez)
FIX = _os.path.join(ROOT, 'tests', 'fixtures')
import json, subprocess, sys, time, urllib.parse
from playwright.sync_api import sync_playwright

SP = OUT
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8771', '-d', ROOT],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
URL = 'https://www.voanews.com/a/mobile-internet-tariffs-in-iran-rise-by-40-/8012345.html'
MD = """[Skip to main content](#main)
Share
# Mobile internet tariffs in Iran rise by 40%

![](https://gdb.voanews.com/photo.jpg)

During the suppression of nationwide protests in January 2026, Iran almost completely shut down internet access across the country for 20 days.

_Editor's note: this story was translated from [the original VOA Persian article](https://ir.voanews.com/a/x.html)._

Iranian mobile operators MCI and Irancell have announced increases of up to 40% in the tariffs for mobile internet packages, a move critics say will deepen the digital divide.

## Users react

Many users said the new prices were unaffordable and accused the government of using pricing as another tool of control.
"""
HTML = "<html><head><title>T</title><meta property='og:image' content='/img.jpg'></head><body><nav>Menu Home</nav><article><h1>Mobile internet tariffs in Iran rise by 40%</h1>" + \
    "".join(f"<p>{p}</p>" for p in [
        "During the suppression of nationwide protests in January 2026, Iran almost completely shut down internet access across the country for 20 days.",
        "Iranian mobile operators MCI and Irancell have announced increases of up to 40% in the tariffs for mobile internet packages, a move critics say will deepen the digital divide.",
        "Many users said the new prices were unaffordable and accused the government of using pricing as another tool of control. Analysts expect further increases next year."]) + \
    "</article><footer>Share Twitter Facebook</footer></body></html>"
AI = {"type": "word", "term": "suppression", "ipa": "/səˈpreʃn/", "pos": "isim", "meaning_tr": "bastırma",
      "explanation_tr": "Bir şeyi zorla durdurma.", "context_tr": "Protestoların bastırılması sırasında…",
      "examples": [{"en": "the suppression of dissent", "tr": "muhalefetin bastırılması"}], "synonyms": ["crackdown"], "key_phrases": []}

errors, calls = [], []
def gemini(route):
    body = json.loads(route.request.post_data)
    txt = body['contents'][0]['parts'][0]['text']
    calls.append(txt[:40])
    out = {"phrases": [{"text": "digital divide", "base": "digital divide", "type": "idiom", "meaning_tr": "dijital uçurum", "level": "B1"}]} if 'ONLY these two kinds' in txt else {"tr": "İranlı mobil operatörler…"} if txt.startswith('Translate') else dict(AI, term=txt.split('TERM (what they want to learn): ')[1].split('\n')[0].strip('"'))
    route.fulfill(status=200, content_type='application/json',
                  body=json.dumps({"candidates": [{"content": {"parts": [{"text": json.dumps(out)}]}}]}))

def run(mode):
    with sync_playwright() as p:
        b = p.chromium.launch()
        c = b.new_context(viewport={'width': 393, 'height': 852}, device_scale_factor=2, is_mobile=True, has_touch=True)
        if mode == 'jina':
            c.route('https://r.jina.ai/**', lambda r: r.fulfill(status=200, content_type='application/json',
                    headers={'Access-Control-Allow-Origin': '*'}, body=json.dumps({"data": {"title": "Mobile internet tariffs in Iran rise by 40%", "url": URL, "content": MD, "publishedTime": "2026-10-23T16:33:00Z"}})))
        else:
            def jh(r):
                if r.request.headers.get('x-return-format') == 'html':
                    return r.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'}, body=json.dumps({"data": {"html": HTML}}))
                r.fulfill(status=451, body='no')
            c.route('https://r.jina.ai/**', jh)
        c.route('https://generativelanguage.googleapis.com/**', gemini)
        c.route('https://gdb.voanews.com/**', lambda r: r.fulfill(status=200, content_type='image/png', body=open(ROOT+'/icon-512.png', 'rb').read()))
        pg = c.new_page()
        pg.on('pageerror', lambda e: errors.append(mode + ': ' + str(e)))
        pg.goto('http://localhost:8771/')
        pg.evaluate("localStorage.setItem('lens.apiKey','\"K\"')")
        # Chrome'un paylaşımı: title = sayfa başlığı, text = link
        pg.goto('http://localhost:8771/?title=' + urllib.parse.quote('Mobile internet tariffs in Iran rise by 40%') + '&text=' + urllib.parse.quote(URL))
        pg.wait_for_selector('.r-title', timeout=15000)
        body = pg.inner_text('#readerBody')
        assert 'Skip to main' not in body and 'Share\n' not in body, body[:300]
        assert 'suppression' in body and 'Analysts' in body if mode == 'html' else 'Users react' in body, body
        assert pg.is_hidden('.tabs')
        # Oxford vurgusu ve dokunma
        ox = pg.eval_on_selector_all('.r-text .w.ox', 'els => els.map(e => e.textContent)')
        print(mode, 'ox sample:', ox[:12])
        pg.click('.r-text .w:text-is("suppression")')
        pg.wait_for_function("document.querySelector('#shBody .meaning')")
        assert 'bastırma' in pg.inner_text('#sheet')
        pg.screenshot(path=f'{SP}/r-{mode}-sheet.png')
        # kalıp: shut down
        pg.click('.r-text .w:text-is("shut")')
        pg.click('#shExt')
        pg.click('.r-text .w:text-is("down")')
        assert pg.inner_text('.sh-term') == 'shut down', pg.inner_text('.sh-term')
        pg.wait_for_function("document.querySelector('#shBody .meaning')")
        pg.click('#shAdd')
        pg.wait_for_function("cards.some(c => c.term === 'shut down')")
        card = pg.evaluate("cards.find(c => c.term === 'shut down')")
        assert card['status'] == 'ready' and card['article']['site'] and 'shut down internet access' in card['context'], card
        # paragraf çevirisi
        pg.click('#shTr')
        pg.wait_for_selector('.r-tr')
        pg.click('#shClose')
        # tek kelimeyi ekle → noktalı işaret
        pg.click('.r-text .w:text-is("tariffs")')
        pg.wait_for_function("document.querySelector('#shBody .meaning')")
        pg.click('#shAdd')
        pg.wait_for_function("document.querySelectorAll('.r-text .w.kn').length > 0")
        pg.click('#shClose')
        # ayarlar
        pg.click('#rAa'); pg.click('[data-theme="sepia"]')
        if pg.is_visible('#view-reader.site'): print(mode, 'site layout active'); pg.click('[data-font="sans"]')
        pg.click('[data-size="20"]')
        assert pg.get_attribute('#view-reader', 'data-theme') == 'sepia'
        pg.screenshot(path=f'{SP}/r-{mode}-prefs.png')
        pg.click('#rAa')
        pg.mouse.wheel(0, 600); pg.wait_for_timeout(1000)
        # geri → kütüphane
        pg.click('#rBack')
        pg.wait_for_selector('#view-read:not([hidden]) .lib-item')
        assert pg.is_visible('.tabs')
        pg.screenshot(path=f'{SP}/r-{mode}-lib.png')
        # aynı link tekrar paylaşılınca kopya oluşmaz
        pg.goto('http://localhost:8771/?text=' + urllib.parse.quote(URL + '?utm_source=x'))
        pg.wait_for_selector('.r-title')
        assert pg.evaluate("articles.length") == 1
        b.close()

run('jina')
run('html')
srv.terminate()
print('gemini calls', len(calls))
print('errors:', errors)
print('ALL OK' if not errors else 'HAS ERRORS')
