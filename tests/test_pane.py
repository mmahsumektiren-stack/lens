import os as _os
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))  # repo kökü
OUT = _os.path.join(ROOT, 'tests', 'out'); _os.makedirs(OUT, exist_ok=True)  # ekran görüntüleri (git'e girmez)
FIX = _os.path.join(ROOT, 'tests', 'fixtures')
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S=OUT
FEED=open(FIX+'/feed.json').read()
srv=subprocess.Popen([sys.executable,'-m','http.server','8803','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); c=b.new_context(viewport={'width':393,'height':852},device_scale_factor=2)
    c.route('https://raw.githubusercontent.com/**', lambda r: r.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin':'*'}, body=FEED))
    pg=c.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8803/'); pg.wait_for_timeout(800)
    pg.evaluate("""async()=>{ const base={blocks:[{t:'p',text:'x'}],words:100,minutes:1,trans:{},scrollY:0};
      await saveArticle({...base,id:'a1',url:'https://a.com/1',title:'Half read story about rates',site:'BBC',progress:0.4,createdAt:Date.now()-5000});
      await saveArticle({...base,id:'a2',url:'https://a.com/2',title:'Unopened story on AI',site:'Verge',progress:0,createdAt:Date.now()});
      store.set('discSeen', Date.parse('2026-10-26T00:00:00Z')); }""")
    pg.evaluate("show('read')"); pg.wait_for_timeout(1200)
    print('açılış:', pg.evaluate("[!document.querySelector('#paneLib').hidden, !document.querySelector('#paneDisc').hidden]"), '| rozet:', pg.inner_text('#paneDiscBtn'))
    print('kütüphane:', pg.inner_text('#libList').replace('\n',' | ')[:200])
    pg.screenshot(path=S+'/pane_lib.png')
    pg.click('#paneDiscBtn'); pg.wait_for_timeout(300); pg.screenshot(path=S+'/pane_disc.png')
    print('keşfet açık, rozet gizli:', pg.evaluate("document.querySelector('#discNew').hidden"))
    pg.evaluate("show('review')"); pg.evaluate("show('read')"); pg.wait_for_timeout(300)
    print('tekrar Oku → kütüphane:', pg.evaluate("!document.querySelector('#paneLib').hidden"))
    b.close()
srv.terminate(); print('errs',errs)
