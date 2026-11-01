import os as _os
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))  # repo kökü
OUT = _os.path.join(ROOT, 'tests', 'out'); _os.makedirs(OUT, exist_ok=True)  # ekran görüntüleri (git'e girmez)
FIX = _os.path.join(ROOT, 'tests', 'fixtures')
import subprocess, sys, time, urllib.parse, json
from playwright.sync_api import sync_playwright
S=OUT
srv=subprocess.Popen([sys.executable,'-m','http.server','8791','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); c=b.new_context(viewport={'width':393,'height':852},device_scale_factor=2,is_mobile=True,has_touch=True)
    c.route('https://r.jina.ai/**', lambda r: r.fulfill(status=200,content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body=json.dumps({"data":{"title":"reddit.com","url":"https://www.reddit.com/","content":"You've been blocked by network security. log in to your Reddit account"}})))
    c.route(lambda u: (urllib.parse.urlparse(u).hostname or '').endswith('reddit.com'), lambda r: r.abort())
    pg=c.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8791/?text='+urllib.parse.quote('https://www.reddit.com/r/AskReddit/s/AbC123xyz'))
    pg.wait_for_selector('.fail',timeout=40000)
    href=pg.get_attribute('.fail a.primary','href'); print(href)
    assert href.startswith('intent://open?u=https%3A%2F%2Fwww.reddit.com%2Fr%2FAskReddit%2Fs%2FAbC123xyz#Intent;scheme=lensresolve;package=io.github.mmahsumektiren.lens;')
    pg.screenshot(path=S+'/resolve.png')
    b.close()
srv.terminate(); print('errors',errs)
