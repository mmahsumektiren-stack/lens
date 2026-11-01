import os as _os
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))  # repo kökü
OUT = _os.path.join(ROOT, 'tests', 'out'); _os.makedirs(OUT, exist_ok=True)  # ekran görüntüleri (git'e girmez)
FIX = _os.path.join(ROOT, 'tests', 'fixtures')
import json, subprocess, sys, time
from playwright.sync_api import sync_playwright
S=OUT
FEED=open(FIX+'/feed.json').read()
srv=subprocess.Popen([sys.executable,'-m','http.server','8787','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
errs=[]; feed_hits=[]
MD="# T\n\n"+"\n\n".join(["This is a long paragraph about technology and the economy that keeps going for a while so the reader accepts it as a real article. "*2]*4)
with sync_playwright() as p:
    b=p.chromium.launch(); c=b.new_context(viewport={'width':393,'height':852},device_scale_factor=2,is_mobile=True,has_touch=True)
    c.route('https://raw.githubusercontent.com/**', lambda r: (feed_hits.append(1), r.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin':'*'}, body=FEED))[1])
    c.route('https://r.jina.ai/**', lambda r: r.fulfill(status=200,content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body=json.dumps({"data":{"title":"Opened article","url":"x","content":MD}})))
    c.route('**/*.{jpg,jpeg,png,webp}*', lambda r: r.abort())
    pg=c.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8787/?view=read'); pg.wait_for_timeout(600); pg.evaluate("setReadPane('disc')"); pg.wait_for_selector('.disc-item')
    tabs=pg.eval_on_selector_all('#discTabs .chip','e=>e.map(x=>x.textContent)'); print('sekmeler:', tabs)
    print('Tümü ilk 4:'); [print('  ', t.replace('\n',' | ')[:120]) for t in pg.eval_on_selector_all('.disc-item','e=>e.slice(0,4).map(x=>x.innerText)')]
    pg.screenshot(path=S+'/disc-all.png')
    for k in ['trend','blogs','ent','read']:
        pg.click(f'#discTabs [data-tab="{k}"]'); pg.wait_for_timeout(150)
        items=pg.eval_on_selector_all('.disc-item','e=>e.map(x=>x.querySelector(".disc-meta").innerText)')
        print(f'{k}: {len(items)} öğe, ilk:', items[:2])
    pg.click('#discTabs [data-tab="trend"]'); pg.screenshot(path=S+'/disc-trend.png')
    # dokun → içeri al
    title=pg.inner_text('.disc-item .disc-title'); pg.click('.disc-item'); pg.wait_for_selector('.r-title', timeout=20000)
    print('açıldı:', pg.inner_text('.r-title')[:50], '| tıklanan:', title[:50])
    pg.click('#rBack'); pg.wait_for_selector('#paneDisc:not([hidden]) .disc-item'); pg.wait_for_timeout(300)
    print('✓ işareti:', pg.eval_on_selector_all('.disc-item.done','e=>e.length'))
    # ayarlardan kaynak kapat
    pg.goto('http://localhost:8787/?view=settings'); pg.evaluate("document.querySelector('#srcDetails').open=true"); pg.wait_for_selector('#srcSettings [data-src]')
    print('ayarda kaynak:', pg.eval_on_selector_all('#srcSettings [data-src]','e=>e.length'), '| devre dışı (alınamıyor):', pg.eval_on_selector_all('#srcSettings [data-src]:disabled','e=>e.map(x=>x.dataset.src)'))
    pg.uncheck('#srcSettings [data-src="hn"]'); pg.screenshot(path=S+'/disc-settings.png', full_page=True)
    pg.goto('http://localhost:8787/?view=read'); pg.wait_for_timeout(600); pg.evaluate("setReadPane('disc')"); pg.wait_for_selector('.disc-item'); pg.click('#discTabs [data-tab="trend"]'); pg.wait_for_timeout(150)
    print('HN kapalıyken gündem kaynakları:', set(pg.eval_on_selector_all('.disc-item .via','e=>e.map(x=>x.textContent)')))
    print('akış isteği sayısı:', len(feed_hits))
    b.close()
srv.terminate(); print('errs', errs)
