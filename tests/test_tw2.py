import os as _os
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))  # repo kökü
OUT = _os.path.join(ROOT, 'tests', 'out'); _os.makedirs(OUT, exist_ok=True)  # ekran görüntüleri (git'e girmez)
FIX = _os.path.join(ROOT, 'tests', 'fixtures')
import subprocess, sys, time, json, urllib.parse
from playwright.sync_api import sync_playwright
S=OUT
srv=subprocess.Popen([sys.executable,'-m','http.server','8809','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
TW={"tweet":{"text":"Once you put the brakes on your agent - to constrain it you can start to trust it.","author":{"name":"Matt Pocock","screen_name":"mattpocockuk","avatar_url":""},"created_timestamp":1761598000,"url":"https://x.com/mattpocockuk/status/1"}}
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); c=b.new_context(viewport={'width':393,'height':852},device_scale_factor=2,is_mobile=True,has_touch=True,color_scheme='light')
    c.route('https://api.fxtwitter.com/**', lambda r: r.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin':'*'}, body=json.dumps(TW)))
    pg=c.new_page(); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto('http://localhost:8809/'); pg.wait_for_timeout(600)
    pg.goto('http://localhost:8809/?text='+urllib.parse.quote('https://x.com/mattpocockuk/status/1'))
    pg.wait_for_selector('.r-tweet .w', timeout=15000)
    pg.click('#rBack'); pg.wait_for_timeout(800)
    print('ekran', pg.evaluate('currentView'), '| kütüphane:', pg.eval_on_selector_all('#libList .lib-title','e=>e.map(x=>x.textContent)'))
    # kartlar: farklı tarihler
    pg.evaluate("""async()=>{const D=86400000,n=Date.now();const mk=(id,t,ago)=>({id,term:t,context:'',status:'ready',createdAt:n-ago,srs:{due:n-1000,ease:2.5,interval:1,reps:1},ai:{meaning_tr:'anlam '+t,pos_tr:'isim',explanation_tr:'x',examples:[],synonyms:[]}});
      for(const c of [mk('a1','constrain',60000),mk('a2','brakes',D),mk('a3','compromised',9*D),mk('a4','weaves',400*D)]){await DB.put(c);} cards=await DB.all(); }""")
    pg.click('.tabs [data-view=list]'); pg.wait_for_timeout(400)
    pg.screenshot(path=S+'/cards_new.png')
    n0=pg.locator('#cardList .item').count()
    pg.click('#cardList .item:nth-child(2) .del-btn'); pg.wait_for_timeout(400)
    print('silme:', n0,'→',pg.locator('#cardList .item').count())
    pg.click('#cardList .item .head'); pg.wait_for_timeout(200); pg.screenshot(path=S+'/cards_open.png')
    b.close()
srv.terminate(); print('errs',errs)
