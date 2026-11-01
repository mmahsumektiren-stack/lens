import os as _os
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))  # repo kökü
OUT = _os.path.join(ROOT, 'tests', 'out'); _os.makedirs(OUT, exist_ok=True)
FIX = _os.path.join(ROOT, 'tests', 'fixtures')
# "başka yerlerde gördün": kart kendi çekimiyle eşleşmeli (had ↛ having/have; have → had; brake → brakes)
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,'-m','http.server','8831','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
errs=[]
def gem(r):
    r.fulfill(status=200, content_type='application/json', body=json.dumps({"candidates":[{"content":{"parts":[{"text":json.dumps({"phrases":[]})}]}}]}))
with sync_playwright() as p:
    b=p.chromium.launch(); c=b.new_context(viewport={'width':393,'height':852})
    c.route('https://generativelanguage.googleapis.com/**', gem)
    pg=c.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8831/'); pg.wait_for_timeout(700)
    pg.evaluate("""async()=>{const n=Date.now();
      const card=(id,term,extra)=>({id,term,context:'',status:'ready',createdAt:n,srs:{due:n+9e8,ease:2.5,interval:3,reps:2},ai:{meaning_tr:'x',pos:'fiil',examples:[],synonyms:[]},...extra});
      await DB.put(card('k1','had',{sightings:[{s:'adapt without having to be programmed',w:'having',aid:'',url:'https://reuters.com/x',site:'reuters.com',at:n}]}),'cards');
      await DB.put(card('k2','have'),'cards'); await DB.put(card('k3','brake'),'cards');
      await DB.put({id:'A1',url:'https://bbc.com/a',title:'T',site:'bbc.com',byline:'',published:'',image:'',blocks:[{t:'p',text:'Robots adapt without having to be programmed. The car brakes failed.'},{t:'p',text:'She had a plan.'}],words:20,minutes:1,createdAt:n,progress:0,scrollY:0,trans:{}},'articles');
    }""")
    pg.reload(); pg.wait_for_timeout(1000)
    old=pg.evaluate("cards.find(c=>c.term==='had').sightings.length")
    print('eski yanlış rastlama temizlendi:', old==0); assert old==0
    pg.evaluate("loadArticles().then(()=>recordSightings(articles.find(a=>a.id==='A1')))"); pg.wait_for_timeout(500)
    got=pg.evaluate("Object.fromEntries(cards.map(c=>[c.term,(c.sightings||[]).map(s=>s.w)]))")
    print('rastlamalar:', got)
    assert got['had']==['had'], got; assert got['have']==['having'], got; assert got['brake']==['brakes'], got
    kn=pg.evaluate("(()=>{const k=knownSet();return ['had','was','been','is','having','brakes'].filter(w=>lemmaCandidates(w).some(x=>k.has(x)))})()")
    print('bilinen (yeşil):', kn); assert kn==['had','having','brakes'], kn  # kartlar: had, have, brake — "was", "is" değil
    b.close()
srv.terminate(); print('errs',errs)
