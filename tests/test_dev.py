import os as _os
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))  # repo kökü
OUT = _os.path.join(ROOT, 'tests', 'out'); _os.makedirs(OUT, exist_ok=True)  # ekran görüntüleri (git'e girmez)
FIX = _os.path.join(ROOT, 'tests', 'fixtures')
# test kopyası: /dev/ altında ayrı depolama, asıl Lens'e dokunmaz
import subprocess, sys, time, os, shutil
from playwright.sync_api import sync_playwright
S=OUT
import tempfile; root=tempfile.mkdtemp(prefix='lens-site-')  # repo dışında: tests/out repo içinde, kopyalarken döngü olur
os.symlink(ROOT, root+'/lens')
d=root+'/lensdev'; shutil.copytree(ROOT, d, ignore=shutil.ignore_patterns('.git','android','tools','tests'))
os.makedirs(root+'/lens_real'); 
# /lens/ = asıl, /lens/dev/ = kopya → http.server üzerinden: kök klasörde lens/ ve lens/dev/ yapısı
shutil.rmtree(root); os.makedirs(root+'/lens')
for f in os.listdir(ROOT):
    if f in ('.git','android','tools','.github','dev','tests'): continue
    src=ROOT+'/'+f
    (shutil.copytree if os.path.isdir(src) else shutil.copy)(src, root+'/lens/'+f)
shutil.copytree(root+'/lens', root+'/lens/dev', ignore=shutil.ignore_patterns('dev'))
srv=subprocess.Popen([sys.executable,'-m','http.server','8795','-d',root],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); c=b.new_context(viewport={'width':393,'height':852})
    pg=c.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8795/lens/'); pg.wait_for_timeout(1500)
    pg.evaluate("store.set('apiKey','REALKEY'); store.set('marker','live')")
    pg.goto('http://localhost:8795/lens/dev/'); pg.wait_for_timeout(2000)
    print('dev:', pg.evaluate("[IS_DEV, store.get('apiKey',''), store.get('marker','yok'), getComputedStyle(document.body,'::after').content]"))
    pg.evaluate("store.set('marker','dev')")
    pg.goto('http://localhost:8795/lens/'); pg.wait_for_timeout(1500)
    print('live:', pg.evaluate("[IS_DEV, store.get('marker',''), getComputedStyle(document.body,'::after').content]"))
    print('caches:', pg.evaluate("caches.keys()"))
    b.close()
srv.terminate(); print('errs',errs)
