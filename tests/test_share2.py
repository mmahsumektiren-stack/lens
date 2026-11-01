import os as _os
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))  # repo kökü
OUT = _os.path.join(ROOT, 'tests', 'out'); _os.makedirs(OUT, exist_ok=True)  # ekran görüntüleri (git'e girmez)
FIX = _os.path.join(ROOT, 'tests', 'fixtures')
import subprocess, sys, time, json, urllib.parse
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,'-m','http.server','8804','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
B='http://localhost:8804/'
MD="# UN: Large-scale return\n\n"+"\n\n".join(f"Paragraph {i}: The United Nations said the return of Afghans has added pressure on jobs, essential services and infrastructure across the country." for i in range(6))
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); c=b.new_context(viewport={'width':393,'height':852}, permissions=['clipboard-read','clipboard-write'])
    c.route('https://r.jina.ai/**', lambda r: r.fulfill(status=200,content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body=json.dumps({"data":{"title":"UN: Large-scale return","url":"https://www.voanews.com/a/x.html","content":MD}})))
    c.route('https://generativelanguage.googleapis.com/**', lambda r: r.abort())
    pg=c.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    u='https://www.voanews.com/a/un-large-scale-return/8215803.html'
    txt='The United Nations Development Program in Afghanistan said Tuesday in a post on X that the large-scale return of Afghans has added pressure on jobs.'
    # 1) sitenin Paylaş düğmesi: kısa metin + bağlantı → okuyucu
    pg.goto(B+'?'+urllib.parse.urlencode({'text':txt+' '+u})); pg.wait_for_selector('.r-title',timeout=20000)
    print('1) site paylaşımı →', pg.evaluate('currentView'), '|', pg.inner_text('.r-title'))
    # 2) Chrome'da seçilip paylaşılan metin (#:~:text=) → Ekle
    pg.goto(B+'?'+urllib.parse.urlencode({'text':'"foregone conclusion"\n'+u+'#:~:text=foregone%20conclusion'})); pg.wait_for_timeout(800)
    print('2) seçim paylaşımı →', pg.evaluate('currentView'))
    # 3) yalnız metin → Ekle (değişmedi)
    pg.goto(B+'?'+urllib.parse.urlencode({'text':'a foregone conclusion'})); pg.wait_for_timeout(800)
    print('3) düz metin →', pg.evaluate('currentView'))
    # 4) pano: kartlarında olan metin önerilmez; diğer metin bir kez önerilir; ekran değişince kaybolur
    pg.goto(B); pg.wait_for_timeout(800)
    pg.evaluate("async()=>{ await saveCard({id:'k1',term:'with the envs',context:'run it with the envs',createdAt:Date.now(),status:'ready',ai:{meaning_tr:'x'},srs:SRS.fresh()}); }")
    pg.evaluate("navigator.clipboard.writeText('with the envs')"); pg.evaluate("checkClipboard()"); pg.wait_for_timeout(400)
    print('4a) kartta olan metin önerildi mi:', not pg.evaluate("document.querySelector('#clipBanner').hidden"))
    pg.evaluate("navigator.clipboard.writeText('a brand new phrase')"); pg.evaluate("checkClipboard()"); pg.wait_for_timeout(400)
    print('4b) yeni metin önerildi mi:', not pg.evaluate("document.querySelector('#clipBanner').hidden"))
    pg.evaluate("show('list')"); pg.wait_for_timeout(200)
    print('4c) ekran değişince görünüyor mu:', not pg.evaluate("document.querySelector('#clipBanner').hidden"))
    pg.evaluate("checkClipboard()"); pg.wait_for_timeout(400)
    print('4d) aynı metin ikinci kez önerildi mi:', not pg.evaluate("document.querySelector('#clipBanner').hidden"))
    b.close()
srv.terminate(); print('errs',errs)
