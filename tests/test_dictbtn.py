import os as _os
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))  # repo kökü
OUT = _os.path.join(ROOT, 'tests', 'out'); _os.makedirs(OUT, exist_ok=True)  # ekran görüntüleri (git'e girmez)
FIX = _os.path.join(ROOT, 'tests', 'fixtures')
import subprocess, sys, time
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,'-m','http.server','8807','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':393,'height':852}); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8807/'); pg.wait_for_timeout(800)
    pg.evaluate("""async()=>{await DB.put({id:'c1',term:'compromised',context:'',status:'ready',created:Date.now(),srs:{due:Date.now()+9e7,ease:2.5,interval:1,reps:1},ai:{meaning_tr:'ele geçirilmiş',pos_tr:'sıfat',explanation_tr:'x',examples:[],synonyms:[]}});cards=await DB.all();}""")
    pg.click('.tabs [data-view=list]'); pg.wait_for_timeout(400)
    pg.click('.item .head'); pg.wait_for_timeout(200)
    print('now btn:', pg.locator('[data-act=now]').count(), 'dict btn:', pg.locator('[data-act=dict]').count())
    pg.click('[data-act=dict]'); pg.wait_for_timeout(200)
    print('links:', pg.evaluate("[...document.querySelectorAll('.dict-box a')].map(a=>a.textContent+' '+a.href).slice(0,3)"))
    pg.screenshot(path=OUT+'/dictbtn.png')
    pg.click('[data-act=dict]'); pg.wait_for_timeout(200)
    print('closed:', pg.locator('.dict-box').count())
    b.close()
srv.terminate(); print('errs',errs)
