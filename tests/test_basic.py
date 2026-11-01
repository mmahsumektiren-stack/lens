import os as _os
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))  # repo kökü
OUT = _os.path.join(ROOT, 'tests', 'out'); _os.makedirs(OUT, exist_ok=True)  # ekran görüntüleri (git'e girmez)
FIX = _os.path.join(ROOT, 'tests', 'fixtures')
import subprocess, sys, time, json
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,'-m','http.server','8797','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
state={'quota':True}; errs=[]
def gem(r):
    if state['quota']:
        return r.fulfill(status=429, content_type='application/json', body=json.dumps({"error":{"code":429,"message":"quota","details":[{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"3600s"}]}}))
    ai={"type":"word","term":"resilient","ipa":"/rɪˈzɪliənt/","pos":"sıfat","meaning_tr":"dayanıklı","explanation_tr":"Zorluklardan çabuk toparlanan.","context_tr":"Ekip dayanıklı çıktı.","examples":[],"synonyms":[],"key_phrases":[]}
    r.fulfill(status=200, content_type='application/json', body=json.dumps({"candidates":[{"content":{"parts":[{"text":json.dumps(ai)}]}}]}))
with sync_playwright() as p:
    b=p.chromium.launch(); c=b.new_context(viewport={'width':393,'height':852})
    c.route('https://generativelanguage.googleapis.com/**', gem)
    c.route('https://api.mymemory.translated.net/**', lambda r: r.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin':'*'}, body=json.dumps({"responseStatus":200,"responseData":{"translatedText":"dirençli" if 'q=resilient' in r.request.url else "Ekip dirençli olduğunu kanıtladı."}})))
    c.route('https://api.dictionaryapi.dev/**', lambda r: r.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin':'*'}, body=json.dumps([{"phonetic":"/rɪˈzɪl.jənt/","meanings":[{"partOfSpeech":"adjective","definitions":[{"definition":"Able to recover quickly from difficult conditions.","example":"Children are remarkably resilient."}],"synonyms":["tough","hardy"]}]}])))
    pg=c.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8797/'); pg.wait_for_timeout(1200)
    pg.evaluate("store.set('apiKey','K')")
    pg.evaluate("""async()=>{ await saveCard({id:'c1',term:'resilient',context:'The team proved resilient.',createdAt:Date.now(),status:'pending',ai:null,error:null,seen:1,srs:SRS.fresh()}); await enrichPending(); }""")
    print('kota dolu :', pg.evaluate("(c=>[c.status,c.ai.basic,c.ai.meaning_tr,c.ai.ipa,c.ai.pos,c.ai.explanation_tr.slice(0,60),c.ai.context_tr,dueCards().length])(cards.find(x=>x.id==='c1'))"))
    pg.click('nav [data-view="list"]') if pg.query_selector('nav [data-view="list"]') else None
    pg.evaluate("show('list')"); pg.wait_for_timeout(300); print('liste:', pg.inner_text('#cardList .m'))
    state['quota']=False
    pg.evaluate("async()=>{ store.set('modelBlocked',{}); await enrichPending(); }")
    print('kota açıldı:', pg.evaluate("(c=>[c.status,!!c.ai.basic,c.ai.meaning_tr])(cards.find(x=>x.id==='c1'))"))
    b.close()
srv.terminate(); print('errs',errs)
# hata kaydı ekranı
with sync_playwright() as p:
    srv=subprocess.Popen([sys.executable,'-m','http.server','8798','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
    b=p.chromium.launch(); c=b.new_context(viewport={'width':393,'height':852},device_scale_factor=2)
    c.route('https://r.jina.ai/**', lambda r: r.fulfill(status=451, body='x'))
    pg=c.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8798/'); pg.wait_for_timeout(1000)
    pg.evaluate("logSvc('gemini',true); logSvc('gemini',false,'gemini-2.5-flash-lite: kota doldu'); logSvc('gemini',true); logSvc('fxtwitter',true)")
    pg.evaluate("importArticle('https://www.reuters.com/x')"); pg.wait_for_selector('.fail',timeout=60000)
    pg.evaluate("show('settings')"); pg.wait_for_timeout(500)
    print(pg.inner_text('#svcLog'))
    pass
    b.close(); srv.terminate()
print('errs',errs)
