import os as _os
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))  # repo kökü
OUT = _os.path.join(ROOT, 'tests', 'out'); _os.makedirs(OUT, exist_ok=True)  # ekran görüntüleri (git'e girmez)
FIX = _os.path.join(ROOT, 'tests', 'fixtures')
import subprocess, sys, time, json, urllib.parse
from playwright.sync_api import sync_playwright
S=OUT
srv=subprocess.Popen([sys.executable,'-m','http.server','8796','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
page={"title":"Markets rally as rates fall | Reuters","site":"Reuters","byline":"By Jane Doe","published":"2026-10-27T10:00:00Z","image":"","blocks":[{"t":"p","text":f"Paragraph {i}: stocks climbed on Monday as investors weighed the latest inflation figures and central bank signals."} for i in range(10)]}
errs=[]; hits=[]
with sync_playwright() as p:
    b=p.chromium.launch(); c=b.new_context(viewport={'width':393,'height':852})
    c.route('https://r.jina.ai/**', lambda r: (hits.append(r.request.url), r.fulfill(status=451, body='blocked')))
    pg=c.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    u='https://www.reuters.com/markets/rally-2026-10-27/'
    pg.goto('http://localhost:8796/?'+urllib.parse.urlencode({'url':u})+'#page='+urllib.parse.quote(json.dumps(page)))
    pg.wait_for_selector('.r-title',timeout=20000)
    print('1)', pg.inner_text('.r-head').replace('\n',' | '), '| jina çağrısı:', len(hits), '| adres:', pg.evaluate('location.href'))
    # 2) telefon da başaramadı → Jina da engelli → hata ekranı, nedeni ayrıntıda, Telefonla aç düğmesi var
    pg.goto('http://localhost:8796/?'+urllib.parse.urlencode({'url':'https://www.hims.com/blog/x'})+'#perr='+urllib.parse.quote('telefon: sayfa 30 sn\'de açılmadı'))
    pg.wait_for_selector('.fail',timeout=60000)
    print('2)', pg.eval_on_selector('.fail details','e=>e.textContent'), '|', pg.get_attribute('.fail a.primary','href')[:90])
    # 3) Keşfet/kütüphaneden açılan normal hata: Telefonla aç düğmesi
    pg.screenshot(path=S+'/phone_fail.png')
    b.close()
srv.terminate(); print('errs',errs)
