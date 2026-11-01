import os as _os
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))  # repo kökü
OUT = _os.path.join(ROOT, 'tests', 'out'); _os.makedirs(OUT, exist_ok=True)  # ekran görüntüleri (git'e girmez)
FIX = _os.path.join(ROOT, 'tests', 'fixtures')
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
S=OUT
srv=subprocess.Popen([sys.executable,'-m','http.server','8813','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
AI={"type":"word","term":"x","ipa":"/kənˈdʌktɪd/","pos":"fiil","meaning_tr":"yürütmek","explanation_tr":"açıklama","context_tr":"","examples":[],"synonyms":[],"key_phrases":[]}
def gem(r):
    body=r.request.post_data or ''
    out={"phrases":[]} if 'ONLY these two kinds' in body else AI
    r.fulfill(status=200, content_type='application/json', body=json.dumps({"candidates":[{"content":{"parts":[{"text":json.dumps(out)}]}}]}))
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); c=b.new_context(viewport={'width':393,'height':852},device_scale_factor=2,is_mobile=True,has_touch=True,color_scheme='light')
    c.route('https://generativelanguage.googleapis.com/**', gem)
    pg=c.new_page(); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto('http://localhost:8813/'); pg.wait_for_timeout(700); pg.evaluate("store.set('apiKey','K')")
    pg.evaluate("""async()=>{const n=Date.now(),D=864e5;
      const art=(id,url,title,site,text)=>({id,url,title,site,byline:'',published:'',image:'',blocks:text.split('\\n').map(t=>({t:'p',text:t})),words:50,minutes:1,createdAt:n,progress:0,scrollY:0,trans:{}});
      await DB.put(art('A1','https://bbc.com/a','Security audit','bbc.com','The firm is conducting a security audit of all systems.'),'articles');
      await DB.put(art('A2','https://breakingnewsenglish.com/p','Pilot Fatigue','breakingnewsenglish.com','A new report has raised serious concerns. The ECA conducted a survey of nearly 7,200 pilots across 32 countries.'),'articles');
      await DB.put({id:'k1',term:'conducting',context:'The firm is conducting a security audit of all systems.',source:'https://bbc.com/a',article:{id:'A1',title:'Security audit',site:'bbc.com'},status:'ready',createdAt:n-3*D,srs:{due:n+9e8,ease:2.5,interval:3,reps:2},ai:{meaning_tr:'yürütmek',pos:'fiil',explanation_tr:'x',examples:[],synonyms:[]},
        sightings:[{s:'Police conducted a search of the house.',w:'conducted',aid:'',url:'https://reuters.com/x',title:'Search',site:'reuters.com',at:n-D}]});
      cards=await DB.all(); await loadArticles(); }""")
    pg.evaluate("openArticle('A2')"); pg.wait_for_selector('.r-text .w')
    pg.click('.r-text .w:text-is("conducted")'); pg.wait_for_timeout(600)
    print('ekle düğmesi:', pg.inner_text('#shAdd'), '| görüldü düğmesi:', pg.inner_text('#shSeen').replace('\n',' ') if pg.locator('#shSeen').count() else None)
    pg.click('#shSeen'); pg.wait_for_timeout(300)
    print('liste:', pg.inner_text('#shSeenList').replace('\n',' | '))
    pg.screenshot(path=S+'/seen_sheet.png')
    pg.click('#shSeenList [data-open-art="A1"]'); pg.wait_for_timeout(800)
    print('açılan:', pg.evaluate('rd.art.id'), pg.evaluate('currentView'))
    b.close()
srv.terminate(); print('errs',errs)
