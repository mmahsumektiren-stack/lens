import os as _os
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))  # repo kökü
OUT = _os.path.join(ROOT, 'tests', 'out'); _os.makedirs(OUT, exist_ok=True)  # ekran görüntüleri (git'e girmez)
FIX = _os.path.join(ROOT, 'tests', 'fixtures')
import subprocess, sys, time
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,'-m','http.server','8806','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':393,'height':852}); pg.on('pageerror',lambda e:errs.append(str(e)))
    for q in ['', '?source=pwa', '?view=review']:
        pg.goto('http://localhost:8806/'+q); pg.wait_for_timeout(900)
        print(q or '(boş)', '→', pg.evaluate("[currentView, document.querySelector('#title').textContent, document.querySelector('.tabs .active').dataset.view, !document.querySelector('#paneLib').hidden]"))
    b.close()
srv.terminate(); print('errs',errs)
