import os as _os
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))  # repo kökü
OUT = _os.path.join(ROOT, 'tests', 'out'); _os.makedirs(OUT, exist_ok=True)  # ekran görüntüleri (git'e girmez)
FIX = _os.path.join(ROOT, 'tests', 'fixtures')
import json, subprocess, sys, time, urllib.parse
from playwright.sync_api import sync_playwright
S=OUT
srv=subprocess.Popen([sys.executable,'-m','http.server','8785','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
URL='https://www.voanews.com/a/iran-tariffs/123.html'
MD="""# Mobile internet tariffs in Iran rise by 40%

During the suppression of nationwide protests in January 2026, Iran almost completely shut down internet access across the country for 20 days.

Iranian mobile operators MCI and Irancell have announced increases of up to 40% in the tariffs for mobile internet packages, a move critics say will deepen the digital divide.

Many users said the new prices were unaffordable and accused the government of using pricing as another tool of control. Analysts expect further increases next year as the economy struggles with sanctions."""
def g(r):
    body=json.loads(r.request.post_data); txt=body['contents'][0]['parts'][0]['text']
    if 'ONLY these two kinds' in txt:
        return r.fulfill(status=200,content_type='application/json',body=json.dumps({"candidates":[{"content":{"parts":[{"text":json.dumps({"phrases":[]})}]}}]}))
    term=txt.split('TERM (what they want to learn): ')[1].split('\n')[0].strip('"')
    out={"type":"word","term":term,"ipa":"/x/","pos":"","meaning_tr":"anlam:"+term,"explanation_tr":"","context_tr":"","examples":[],"synonyms":[],"key_phrases":[]}
    r.fulfill(status=200,content_type='application/json',body=json.dumps({"candidates":[{"content":{"parts":[{"text":json.dumps(out)}]}}]}))
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); c=b.new_context(viewport={'width':393,'height':852},device_scale_factor=2,is_mobile=True,has_touch=True)
    c.route('https://r.jina.ai/**',lambda r:r.fulfill(status=200,content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body=json.dumps({"data":{"title":"Mobile internet tariffs in Iran rise by 40%","url":URL,"content":MD}})))
    c.route('https://generativelanguage.googleapis.com/**',g)
    pg=c.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8785/'); pg.evaluate("localStorage.setItem('lens.apiKey','\"K\"')")
    pg.goto('http://localhost:8785/?text='+urllib.parse.quote(URL)); pg.wait_for_selector('.r-title')
    print('özet boşken:', pg.inner_text('#rSum')[:60])
    # 1) tek dokunuş + sözlük (kök hali)
    pg.click('.r-text .w:text-is("announced")'); pg.wait_for_selector('#shBody .meaning')
    pg.click('#shDictBtn'); pg.wait_for_selector('.dict-grid')
    links={a.get_attribute('data-dict'):a.get_attribute('href') for a in pg.query_selector_all('.dict')}
    print('sözlük sırası:', list(links)); print('  cambridge:', links['cambridge']); print('  tureng:', links['tureng'])
    pg.screenshot(path=S+'/x-dict.png')
    pg.click('#shClose')
    # 2) sürükleyerek kalıp: "shut" basılı tut → "down"a sürükle
    cdp=c.new_cdp_session(pg)
    def center(sel):
        bb=pg.locator(sel).first.bounding_box(); return bb['x']+bb['width']/2, bb['y']+bb['height']/2
    pg.locator('.r-text .w:text-is("shut")').first.scroll_into_view_if_needed()
    x1,y1=center('.r-text .w:text-is("shut")'); x2,y2=center('.r-text .w:text-is("down")')
    cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x1,'y':y1}]}); pg.wait_for_timeout(450)
    for k in range(1,6):
        cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x1+(x2-x1)*k/5,'y':y1+(y2-y1)*k/5}]}); pg.wait_for_timeout(40)
    cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]}); pg.wait_for_timeout(500)
    print('sürüklenen:', pg.inner_text('.sh-term'))
    pg.wait_for_selector('#shBody .meaning'); pg.screenshot(path=S+'/x-drag.png')
    pg.click('#shDictBtn'); print('  kalıp sözlük:', pg.get_attribute('.dict[data-dict="cambridge"]','href'))
    pg.click('#shClose')
    # 3) kısa dokunuş hâlâ tek kelime
    pg.click('.r-text .w:text-is("suppression")'); pg.wait_for_selector('#shBody .meaning'); print('tek dokunuş:', pg.inner_text('.sh-term')); pg.click('#shClose')
    # 4) yazı sonu özeti
    pg.locator('#rSum').scroll_into_view_if_needed(); print('özet:', pg.inner_text('#rSum').replace('\n',' | ')[:200])
    pg.screenshot(path=S+'/x-sum.png')
    pg.click('#sumAdd'); pg.wait_for_timeout(500)
    print('kart sayısı:', pg.evaluate("cards.length"), [x['term'] for x in pg.evaluate("cards")], '| durum:', set(x['status'] for x in pg.evaluate("cards")))
    print('özet sonra:', pg.inner_text('#rSum').replace('\n',' | ')[:120])
    # 5) kütüphane zorluk
    pg.click('#rBack'); pg.wait_for_selector('.lib-item'); print('kütüphane:', pg.inner_text('.lib-item').replace('\n',' | '))
    pg.screenshot(path=S+'/x-lib.png')
    b.close()
srv.terminate(); print('errs',errs)
