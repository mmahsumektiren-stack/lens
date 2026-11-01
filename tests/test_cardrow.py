import os as _os
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))  # repo kökü
OUT = _os.path.join(ROOT, 'tests', 'out'); _os.makedirs(OUT, exist_ok=True)  # ekran görüntüleri (git'e girmez)
FIX = _os.path.join(ROOT, 'tests', 'fixtures')
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S=OUT
srv=subprocess.Popen([sys.executable,'-m','http.server','8811','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); c=b.new_context(viewport={'width':393,'height':852},device_scale_factor=2,is_mobile=True,has_touch=True,color_scheme='light')
    pg=c.new_page(); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto('http://localhost:8811/'); pg.wait_for_timeout(800)
    pg.evaluate("""async()=>{const n=Date.now(),D=864e5;
      const mk=(id,t,pos,tr,ctx,ago,extra={})=>Object.assign({id,term:t,context:ctx,source:'https://x.com/a/status/1',status:'ready',createdAt:n-ago,srs:{due:n+9e8,ease:2.5,interval:3,reps:2},ai:{type:'word',pos,meaning_tr:tr,explanation_tr:'Açıklama '+t,examples:[{en:'Example with '+t+'.',tr:'Örnek '+t}],synonyms:['syn']}},extra);
      const tw={text:'Will AI turn humans from creators into selectors? And how can we preserve the ability to create something new?',author:{name:'Zafar Mirzo',screen_name:'zafarmirzo',avatar_url:''},date:1}
      for(const c of [mk('a1','preserve','fiil','Korumak','And how can we preserve the ability.',1e3,{tweet:tw}),mk('a2','bothered','fiil','üşenmek','He never bothered to call.',D),mk('a3','malicious','sıfat','kötü niyetli','A malicious file.',2*D),mk('a4','as soon as','',' hemen','Call me as soon as you can.',3*D),mk('a5','close','sıfat','yakın','The shop is close.',4*D),mk('a6','put the brakes on','',' frenlemek','They put the brakes on the plan.',5*D,{ai:{type:'idiom',pos:'deyim',meaning_tr:'frenlemek',explanation_tr:'x',examples:[],synonyms:[]}}),mk('a7','reportedly','zarf','iddiaya göre','Reportedly, yes.',6*D),mk('a8','concrete','sıfat','somut','Concrete steps.',7*D),mk('a9','brakes','isim','fren','The brakes failed.',8*D)]) await DB.put(c); cards=await DB.all(); }""")
    pg.click('.tabs [data-view=list]'); pg.wait_for_timeout(500)
    print([ (e) for e in pg.eval_on_selector_all('#cardList .item .m','e=>e.map(x=>x.innerText.replace(/\\n/g," "))')])
    pg.screenshot(path=S+'/row_closed.png')
    pg.click('#cardList .item:first-child .head'); pg.wait_for_timeout(300)
    print('açık: reveal-btn', pg.locator('.reveal-btn').count(), '| anlam görünür mü:', pg.locator('.reveal').count(), '| meaning metni sayfada:', 'Korumak' in pg.inner_text('#cardList'))
    pg.screenshot(path=S+'/row_open.png')
    pg.click('.reveal-btn'); pg.wait_for_timeout(300)
    print('gösterildi:', pg.locator('.reveal .meaning').inner_text(), '| buton aria:', pg.get_attribute('.reveal-btn.open','aria-label'))
    pg.screenshot(path=S+'/row_revealed.png')
    pg.click('#cardList .item:first-child .head'); pg.click('#cardList .item:first-child .head'); pg.wait_for_timeout(300)
    print('kapat-aç sonrası gizli:', pg.locator('.reveal').count()==0)
    b.close()
srv.terminate(); print('errs',errs)
