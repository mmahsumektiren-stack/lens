import os as _os
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))  # repo kökü
OUT = _os.path.join(ROOT, 'tests', 'out'); _os.makedirs(OUT, exist_ok=True)  # ekran görüntüleri (git'e girmez)
FIX = _os.path.join(ROOT, 'tests', 'fixtures')
import subprocess, sys, time, json, urllib.parse
from playwright.sync_api import sync_playwright
S=OUT
srv=subprocess.Popen([sys.executable,'-m','http.server','8810','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
TXT="Once you put the brakes on your agent - to constrain it and increase its output quality - you can start to trust it.\n\nThe best brakes? Good ol' software fundamentals. So, you need to slow down to speed up. Teams that cut corners will fall short of their goals."
TW={"tweet":{"text":TXT,"author":{"name":"Matt Pocock","screen_name":"mattpocockuk","avatar_url":""},"created_timestamp":1761598000,"url":"https://x.com/mattpocockuk/status/1"}}
PH={"phrases":[{"text":"put the brakes on","base":"put the brakes on","type":"idiom","meaning_tr":"frenlemek, yavaşlatmak","level":"B2"},
 {"text":"slow down to speed up","base":"slow down to speed up","type":"expression","meaning_tr":"hızlanmak için yavaşlamak","level":"B2"},
 {"text":"cut corners","base":"cut corners","type":"idiom","meaning_tr":"işi baştan savma yapmak","level":"C1"},
 {"text":"fall short of","base":"fall short of","type":"phrasal_verb","meaning_tr":"…e ulaşamamak","level":"C1"},
 {"text":"not in the text at all","base":"x","type":"idiom","meaning_tr":"uydurma","level":"B1"}]}
AI={"type":"word","term":"x","ipa":"","pos":"isim","meaning_tr":"anlam","explanation_tr":"açıklama","context_tr":"","examples":[],"synonyms":[],"key_phrases":[]}
calls={'ph':0}
def gem(r):
    body=r.request.post_data or ''
    if 'ONLY these two kinds' in body: calls['ph']+=1; out=PH
    else: out=AI
    r.fulfill(status=200, content_type='application/json', body=json.dumps({"candidates":[{"content":{"parts":[{"text":json.dumps(out)}]}}]}))
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); c=b.new_context(viewport={'width':393,'height':852},device_scale_factor=2,is_mobile=True,has_touch=True,color_scheme='light')
    c.route('https://api.fxtwitter.com/**', lambda r: r.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin':'*'}, body=json.dumps(TW)))
    c.route('https://generativelanguage.googleapis.com/**', gem)
    pg=c.new_page(); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto('http://localhost:8810/'); pg.wait_for_timeout(600); pg.evaluate("store.set('apiKey','K')")
    # önceden kartlar: 'brake' (başka kaynaktan), 'trust', 'constrain' (bu tweet'ten, kaynak aynı)
    pg.evaluate("""async()=>{const n=Date.now();const mk=(id,t,src,ctx)=>({id,term:t,context:ctx,source:src,status:'ready',createdAt:n-86400000*3,srs:{due:n+9e8,ease:2.5,interval:3,reps:2},ai:{meaning_tr:'anlam '+t,pos:'isim',explanation_tr:'x',examples:[],synonyms:[]}});
      for(const c of [mk('k1','brake','https://example.com/cars','Press the brake gently.'),mk('k2','trust','https://example.com/t','I trust you.'),mk('k3','constrain','https://x.com/mattpocockuk/status/1','to constrain it')]) await DB.put(c); cards=await DB.all();}""")
    pg.goto('http://localhost:8810/?text='+urllib.parse.quote('https://x.com/mattpocockuk/status/1'))
    pg.wait_for_selector('.r-tweet .w', timeout=15000)
    pg.wait_for_selector('#rPh .ph-list', timeout=8000)
    print('kalıp listesi:', pg.eval_on_selector_all('#rPh .ph-list b','e=>e.map(x=>x.textContent)'), '| gemini kalıp çağrısı', calls['ph'])
    print('işaretli kelimeler:', pg.eval_on_selector_all('.r-tweet .w.ph','e=>e.map(x=>x.textContent).join(" ")'))
    pg.screenshot(path=S+'/ph_text.png')
    pg.click('.r-tweet .w:text-is("brakes") >> nth=0'); pg.wait_for_timeout(500)
    print('çip:', pg.inner_text('#shPh') if pg.locator('#shPh').count() else None)
    pg.screenshot(path=S+'/ph_chip.png')
    pg.click('#shPh'); pg.wait_for_timeout(500)
    print('seçim →', pg.inner_text('.sh-term'))
    pg.click('#shClose'); pg.wait_for_timeout(200)
    pg.evaluate("document.querySelector('#rPh').scrollIntoView()"); pg.wait_for_timeout(200)
    pg.screenshot(path=S+'/ph_list.png')
    pg.click('[data-ph-add="2"]'); pg.wait_for_timeout(500)
    print('kalıp kartı:', pg.evaluate("(c=>c&&[c.term,c.context])(cards.find(x=>x.term==='cut corners'))"))
    print('rastlamalar:', pg.evaluate("cards.filter(c=>c.sightings?.length).map(c=>[c.term,c.sightings.map(s=>s.w+' | '+s.s.slice(0,40))])"))
    # tekrar açınca Gemini'ye yeniden gitmesin
    pg.click('#rBack'); pg.wait_for_timeout(800)
    print('kütüphane:', pg.inner_text('#libList .lib-diff') if pg.locator('#libList .lib-diff').count() else None)
    pg.screenshot(path=S+'/ph_lib.png')
    pg.click('#libList [data-open]'); pg.wait_for_timeout(1000)
    print('ikinci açılış kalıp çağrısı', calls['ph'], '| sightings tekrar eklenmedi:', pg.evaluate("cards.find(c=>c.term==='brake').sightings.length"))
    pg.click('.tabs [data-view=list]') if pg.locator('.tabs').is_visible() else None
    pg.evaluate("show('list')"); pg.wait_for_timeout(300)
    pg.click('#cardList .item[data-id=k1] .head'); pg.wait_for_timeout(300)
    pg.click('#cardList .item[data-id=k1] .reveal-btn'); pg.wait_for_timeout(300)
    print('kart detay:', pg.inner_text('#cardList .item[data-id=k1] .sights').replace('\n',' | '))
    b.close()
srv.terminate(); print('errs',errs)
