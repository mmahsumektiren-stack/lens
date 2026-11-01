import os as _os
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))  # repo kökü
OUT = _os.path.join(ROOT, 'tests', 'out'); _os.makedirs(OUT, exist_ok=True)  # ekran görüntüleri (git'e girmez)
FIX = _os.path.join(ROOT, 'tests', 'fixtures')
import json, subprocess, time, sys, urllib.parse
from playwright.sync_api import sync_playwright

SP = OUT
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8766', '-d', ROOT],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
TWEET = "These stat lines are getting pretty wild.\n\nThanks for 300K stars and nearly 30m installs.\n\nBig plans for 2027 too. Onwards and upwards!"
errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 393, 'height': 852}, device_scale_factor=2, is_mobile=True, has_touch=True)
    # 1) fxtwitter başarısız, vxtwitter başarılı → yedek zinciri çalışıyor mu
    ctx.route('https://api.fxtwitter.com/**', lambda r: r.fulfill(status=500, body='x'))
    ctx.route('https://api.vxtwitter.com/**', lambda r: r.fulfill(status=200, content_type='application/json',
              headers={'Access-Control-Allow-Origin': '*'}, body=json.dumps({"text": TWEET + " https://t.co/abc"})))
    ctx.route('https://generativelanguage.googleapis.com/**', lambda r: r.abort())
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errors.append(str(e)))
    link = 'https://x.com/mattpocockuk/status/1981234567890?s=46'
    pg.goto('http://localhost:8766/?text=' + urllib.parse.quote(link))
    # tweet artık okuyucuda açılıyor (fxtwitter başarısız → vxtwitter yedeği)
    pg.wait_for_selector('.r-tweet .w:text-is("Onwards")', timeout=20000)
    v = pg.inner_text('.r-tweet .tw-text')
    assert 't.co' not in v and 'Onwards' in v and pg.evaluate('currentView') == 'reader', v
    pg.screenshot(path=SP + '/x1-tweet.png')

    # 2) Pano önerisi (izin verilmiş durumda)
    ctx2 = b.new_context(viewport={'width': 393, 'height': 852}, permissions=['clipboard-read', 'clipboard-write'])
    pg2 = ctx2.new_page()
    pg2.on('pageerror', lambda e: errors.append(str(e)))
    pg2.goto('http://localhost:8766/')
    pg2.wait_for_timeout(1000)  # açılıştaki pano kontrolü bitsin (her metin bir kez önerilir)
    pg2.evaluate("navigator.clipboard.writeText('getting pretty wild')")
    pg2.reload()
    pg2.wait_for_selector('#clipBanner:not([hidden])')
    pg2.screenshot(path=SP + '/x2-clip.png')
    pg2.click('#clipAdd')
    assert pg2.input_value('#addText') == 'getting pretty wild'
    pg2.reload(); pg2.wait_for_timeout(600)
    assert pg2.is_hidden('#clipBanner'), 'aynı pano tekrar önerildi'
    b.close()
srv.terminate()
print('errors:', errors); print('ALL OK' if not errors else 'HAS ERRORS')
