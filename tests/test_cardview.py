import os as _os
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))  # repo kökü
OUT = _os.path.join(ROOT, 'tests', 'out'); _os.makedirs(OUT, exist_ok=True)
FIX = _os.path.join(ROOT, 'tests', 'fixtures')
# açık kart: Kaynak → Başka yerlerde (okuyucuda hiç açılmamış yazılar + diğer kartlar, canlı) → Örnekler (Türkçesi dokununca) → Türkçe anlam (istenince)
import subprocess, sys, time
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,'-m','http.server','8841','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); c=b.new_context(viewport={'width':393,'height':852},device_scale_factor=2,is_mobile=True,has_touch=True,color_scheme='light')
    pg=c.new_page(); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto('http://localhost:8841/'); pg.wait_for_timeout(700)
    pg.evaluate("""async()=>{const n=Date.now(),D=864e5;
      const tw={text:'The #FBI issued a FLASH advisory. It was used in the October ConnectWise supply-chain compromise, which exposed Microsoft 365 customer environments.',name:'FBI Dallas',handle:'FBIDallas',url:'https://x.com/FBIDallas/status/1'};
      await DB.put({id:'c1',term:'compromise',context:'It was used in the October ConnectWise supply-chain compromise, which exposed Microsoft 365 customer environments.',source:tw.url,tweet:tw,status:'ready',createdAt:n-9*D,srs:{due:n+9e8,ease:2.5,interval:3,reps:2},
        ai:{type:'word',pos:'isim',meaning_tr:'Güvenlik ihlali, sızma',explanation_tr:'Bu bağlamda bir sistemin güvenliğinin ihlal edilmesi.',context_tr:'Ekim ayındaki tedarik zinciri ihlalinde kullanıldı.',examples:[{en:'The recent security compromise exposed sensitive customer data.',tr:'Son güvenlik ihlali hassas müşteri verilerini açığa çıkardı.'},{en:'Both sides had to make a compromise to reach an agreement.',tr:'İki taraf da anlaşmak için uzlaşmak zorunda kaldı.'}],synonyms:['breach','hack']}},'cards');
      await DB.put({id:'c2',term:'urging',context:'Officials are urging firms to report any compromise of their accounts.',source:'https://x.com/b/status/2',tweet:{text:'Officials are urging firms to report any compromise of their accounts.',name:'CISA',handle:'CISAgov'},status:'ready',createdAt:n-2*D,srs:{due:n+9e8,ease:2.5,interval:3,reps:2},ai:{type:'word',pos:'fiil',meaning_tr:'teşvik etmek',examples:[],synonyms:[]}},'cards');
      await DB.put({id:'A1',url:'https://bleepingcomputer.com/x',title:'Hackers abuse AI framework',site:'bleepingcomputer.com',byline:'',published:'',image:'',blocks:[{t:'p',text:'Attackers compromised dozens of tenants. Experts say such compromises are rising fast.'},{t:'p',text:'No organization wants to compromise on security. The deal was a fair compromise for both sides.'}],words:30,minutes:1,createdAt:n-D,progress:0,scrollY:0,trans:{}},'articles');
      cards=await DB.all(); }""")
    pg.reload(); pg.wait_for_timeout(900)
    pg.evaluate("show('list')"); pg.wait_for_timeout(500)
    row=pg.inner_text('#cardList .item[data-id=c1] .m'); print('satır:', row.replace('\n',' '))
    pg.click('#cardList .item[data-id=c1] .head'); pg.wait_for_timeout(300)
    it='#cardList .item[data-id=c1] '
    sec=pg.eval_on_selector_all(it+'.detail > *','e=>e.map(x=>x.className)'); print('sıra:', sec)
    sights=pg.inner_text(it+'.sights'); print('yerler:', sights.replace('\n',' | '))
    assert 'compromises are rising' in sights, sights
    txt=pg.inner_text(it+'.detail'); tr_hidden=all(w not in txt for w in ['Güvenlik ihlali','uzlaşmak','tedarik zinciri'])
    print('ilk açılışta Türkçe yok:', tr_hidden); assert tr_hidden
    pg.evaluate("document.querySelector('#cardList .item[data-id=c1]').scrollIntoView()"); pg.wait_for_timeout(200)
    sh=lambda sel,name:(pg.evaluate("s=>{const e=document.querySelector(s);window.scrollTo(0,e.getBoundingClientRect().top+scrollY-110)}",sel),pg.wait_for_timeout(250),pg.screenshot(path=OUT+'/'+name))
    sh(it,'cv_1.png'); sh(it+'.sights','cv_2.png')
    pg.click(it+'[data-act=more]'); pg.wait_for_timeout(200)
    allt=pg.inner_text(it+'.sights'); print('tümü:', pg.locator(it+'.sights .sight').count()); assert 'urging firms' in allt, allt
    pg.click(it+'.ex-en >> nth=1'); pg.wait_for_timeout(200)
    print('örnek Türkçesi:', pg.inner_text(it+'.ex-tr'))
    pg.click(it+'.reveal-btn'); pg.wait_for_timeout(300)
    print('anlam:', pg.inner_text(it+'.reveal .meaning'))
    sh(it+'.sights .more-btn, '+it+'.sights .sight:last-child','cv_3.png')
    pg.click(it+'.head'); pg.click(it+'.head'); pg.wait_for_timeout(200)
    print('kapat-aç sonrası gizli:', pg.locator(it+'.reveal').count()==0 and pg.locator(it+'.ex-tr').count()==0)
    c.close(); b.close()
srv.terminate(); print('errs',errs)
