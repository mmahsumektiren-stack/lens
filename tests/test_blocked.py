import os as _os
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))  # repo kökü
OUT = _os.path.join(ROOT, 'tests', 'out'); _os.makedirs(OUT, exist_ok=True)  # ekran görüntüleri (git'e girmez)
FIX = _os.path.join(ROOT, 'tests', 'fixtures')
import json, subprocess, sys, time, urllib.parse
from playwright.sync_api import sync_playwright
S=OUT
srv=subprocess.Popen([sys.executable,'-m','http.server','8782','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
URL='https://www.reuters.com/technology/microsoft-is-offering-buyouts-around-60000-employees-business-insider-reports-2026-10-26/'
SELECT_ALL="""Skip to main content
Exclusive news, data and analytics for financial market professionals
Reuters
World
Business
Markets
Technology
Microsoft is offering buyouts to around 60,000 employees, Business Insider reports
By Reuters
October 26, 2026 4:12 PM GMT+3
Updated 2 hours ago
Microsoft logo is seen in this illustration taken March 25, 2026. REUTERS/Dado Ruvic/Illustration Purchase Licensing Rights
Oct 26 (Reuters) - Microsoft is offering voluntary buyouts to around 60,000 employees, Business Insider reported on Sunday, citing an internal memo, as the software giant reshapes its workforce around artificial intelligence.
The offer applies to staff in several divisions, including sales and engineering, the report said, adding that employees who accept would receive severance based on their years of service.
Microsoft did not immediately respond to a Reuters request for comment outside regular business hours.
The company has cut thousands of jobs over the past two years while pouring tens of billions of dollars into data centers to support its AI ambitions.
Reporting by Someone in Bengaluru; Editing by Someone Else
Our Standards: The Thomson Reuters Trust Principles.
Share
X
Facebook
Linkedin
Email
Link"""
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); c=b.new_context(viewport={'width':393,'height':852},device_scale_factor=2,is_mobile=True,has_touch=True)
    c.route('https://r.jina.ai/**',lambda r:r.fulfill(status=200,content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body=json.dumps({"data":{"title":"reuters.com","url":URL,"content":"Please enable JS and disable any ad blocker"}})))
    c.route('https://api.allorigins.win/**',lambda r:r.abort()); c.route('https://corsproxy.io/**',lambda r:r.abort())
    c.route('https://api.fxtwitter.com/**',lambda r:r.fulfill(status=200,content_type='application/json',headers={'Access-Control-Allow-Origin':'*'},body='{"tweet":{"text":"hi"}}'))
    pg=c.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    # 1) link paylaşımı → anlaşılır hata
    pg.goto('http://localhost:8782/?text='+urllib.parse.quote(URL)); pg.wait_for_selector('.r-loading .fail',timeout=60000)
    t=pg.inner_text('#readerBody'); print('fail screen bot:', 'bot koruması' in t); pg.screenshot(path=S+'/blocked-fail.png')
    # 2) Tümünü seç → paylaş (Chrome metin gönderir)
    pg.goto('http://localhost:8782/?text='+urllib.parse.quote(SELECT_ALL)); pg.wait_for_selector('.r-title',timeout=20000)
    title=pg.inner_text('.r-title'); body=pg.inner_text('.r-text')
    print('title:', title)
    print('junk kept:', [j for j in ['Skip to main','Purchase Licensing','\nShare','Linkedin','World\n'] if j in body])
    print('first para ok:', body.startswith('Oct 26 (Reuters)') or body.split('\n')[0][:60])
    pg.screenshot(path=S+'/blocked-reader.png')
    # 3) Ekle ekranına uzun metin yapıştır → okuyucu düğmesi
    pg.goto('http://localhost:8782/?view=add'); pg.fill('#addText', SELECT_ALL); pg.dispatch_event('#addText','input')
    print('reader btn visible:', pg.is_visible('#toReaderBtn'))
    pg.click('#toReaderBtn'); pg.wait_for_selector('.r-title'); print('dedupe count:', pg.evaluate("articles.length"))
    # 4) bağlantı testi
    pg.goto('http://localhost:8782/?view=settings'); pg.click('#netTest'); pg.wait_for_function("!document.querySelector('#netResult').innerText.includes('⏳')", timeout=30000)
    print(pg.inner_text('#netResult'))
    b.close()
srv.terminate(); print('errs', errs)
# link olmadan başlık sezgisi
with sync_playwright() as p:
    srv=subprocess.Popen([sys.executable,'-m','http.server','8783','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
    b=p.chromium.launch(); pg=b.new_page(); pg.goto('http://localhost:8783/'); pg.wait_for_timeout(300)
    print('heuristic title:', pg.evaluate("t => pickTitle(t.split('\\n'), '')", SELECT_ALL))
    b.close(); srv.terminate()
