import os as _os
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))  # repo kökü
OUT = _os.path.join(ROOT, 'tests', 'out'); _os.makedirs(OUT, exist_ok=True)  # ekran görüntüleri (git'e girmez)
FIX = _os.path.join(ROOT, 'tests', 'fixtures')
import subprocess, sys, time, json, urllib.parse
from playwright.sync_api import sync_playwright
S=OUT
srv=subprocess.Popen([sys.executable,'-m','http.server','8808','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
AI={"type":"word","term":"x","ipa":"","pos":"isim","meaning_tr":"anlam","explanation_tr":"açıklama","context_tr":"","examples":[],"synonyms":[],"key_phrases":[]}
TW={"tweet":{"text":"Once you put the brakes on your agent - to constrain it and increase its output quality - you can start to trust it.\n\nThe best brakes? Good ol' software fundamentals. Firms evolve their structures stably.","author":{"name":"Matt Pocock","screen_name":"mattpocockuk","avatar_url":""},"created_timestamp":1761598000,"url":"https://x.com/mattpocockuk/status/1"}}
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); c=b.new_context(viewport={'width':393,'height':852},device_scale_factor=2,is_mobile=True,has_touch=True,color_scheme='light')
    c.route('https://api.fxtwitter.com/**', lambda r: r.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin':'*'}, body=json.dumps(TW)))
    c.route('https://generativelanguage.googleapis.com/**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps({"candidates":[{"content":{"parts":[{"text":json.dumps(AI)}]}}]})))
    pg=c.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8808/'); pg.wait_for_timeout(600); pg.evaluate("store.set('apiKey','K')")
    pg.goto('http://localhost:8808/?text='+urllib.parse.quote('https://x.com/mattpocockuk/status/1'))
    pg.wait_for_selector('.r-tweet .w', timeout=15000)
    print('altı çizili:', pg.eval_on_selector_all('.r-tweet .w.ox','e=>e.map(x=>x.textContent)'))
    for w in ['brakes','agent','evolve','structures','software']:
        pg.click(f'.r-tweet .w:text-is("{w}")'); pg.wait_for_timeout(500)
        print(w, '→', pg.inner_text('.sh-ox').replace('\n',' '))
        if w in ('brakes','agent','evolve','structures'): pg.screenshot(path=f'{S}/oxb_{w}.png')
        pg.click('#shClose'); pg.wait_for_timeout(200)
    b.close()
srv.terminate(); print('errs',errs)
