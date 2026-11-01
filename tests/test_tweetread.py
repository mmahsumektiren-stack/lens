import os as _os
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))  # repo kökü
OUT = _os.path.join(ROOT, 'tests', 'out'); _os.makedirs(OUT, exist_ok=True)  # ekran görüntüleri (git'e girmez)
FIX = _os.path.join(ROOT, 'tests', 'fixtures')
import subprocess, sys, time, json, urllib.parse
from playwright.sync_api import sync_playwright
S=OUT
srv=subprocess.Popen([sys.executable,'-m','http.server','8805','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
AI={"type":"word","term":"rework","ipa":"/x/","pos":"fiil","meaning_tr":"yeniden düzenlemek","explanation_tr":"x","context_tr":"y","examples":[],"synonyms":[],"key_phrases":[]}
TW={"tweet":{"text":"We're reworking the UI and setup flow for plugins and connectors in Claude.\n\nHow can we make it better for you? All feedback welcome","author":{"name":"Lydia Hallie","screen_name":"lydiahallie","avatar_url":""},"created_timestamp":1761598000,"url":"https://x.com/lydiahallie/status/211518"}}
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); c=b.new_context(viewport={'width':393,'height':852},device_scale_factor=2,is_mobile=True,has_touch=True)
    c.route('https://api.fxtwitter.com/**', lambda r: r.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin':'*'}, body=json.dumps(TW)))
    c.route('https://generativelanguage.googleapis.com/**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps({"candidates":[{"content":{"parts":[{"text":json.dumps(AI)}]}}]})))
    pg=c.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8805/'); pg.wait_for_timeout(600); pg.evaluate("store.set('apiKey','K')")
    pg.goto('http://localhost:8805/?text='+urllib.parse.quote('https://x.com/lydiahallie/status/2115183702376652886?s=09'))
    pg.wait_for_selector('.r-tweet .w', timeout=15000)
    print('ekran:', pg.evaluate('currentView'), '| site:', pg.inner_text('#readerSite'))
    pg.screenshot(path=S+'/tw_reader.png')
    pg.click('.r-tweet .w:text-is("reworking")'); pg.wait_for_selector('#shBody .meaning', timeout=10000)
    print('panel:', pg.inner_text('.sh-term'), '→', pg.inner_text('#shBody .meaning'))
    pg.click('#shAdd'); pg.wait_for_timeout(500)
    print('kart:', pg.evaluate("(c=>[c.term, !!c.tweet, c.article])(cards.find(x=>x.term==='reworking'))"))
    pg.click('#shClose'); pg.click('#rBack'); pg.wait_for_timeout(800)
    print('geri:', pg.evaluate('currentView'), '| kütüphanede tweet:', pg.evaluate("articles.some(a=>a.id.startsWith('tweet:'))"))
    b.close()
srv.terminate(); print('errs',errs)
