import os as _os
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))  # repo kökü
OUT = _os.path.join(ROOT, 'tests', 'out'); _os.makedirs(OUT, exist_ok=True)  # ekran görüntüleri (git'e girmez)
FIX = _os.path.join(ROOT, 'tests', 'fixtures')
import subprocess, sys, time, urllib.parse, json
from playwright.sync_api import sync_playwright
S=OUT
srv=subprocess.Popen([sys.executable,'-m','http.server','8792','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
post={"title":"What's a skill everyone should learn?","selftext":"Genuinely curious what people think is **underrated**.","is_self":True,"author":"op","subreddit_name_prefixed":"r/AskReddit","created_iso":"2026-10-25T09:12:00.000000+0000","url":"x","score":330,"num_comments":687,"link_flair_text":"Random Question"}
cm=[{"kind":"t1","data":{"author":"a1","score":900,"body":"Cooking a few basic meals from scratch. It saves money and it's oddly calming.","stickied":False,"replies":{"data":{"children":[{"kind":"t1","data":{"author":"r1","score":50,"body":"Seconded, especially rice."}}]}}}}]
d={"via":"page","diag":"www: HTTP 403 · ","path":"/r/AskReddit/comments/q1w2e3/whats_a_skill","j":[{"data":{"children":[{"kind":"t3","data":post}]}},{"data":{"children":cm}}]}
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); c=b.new_context(viewport={'width':393,'height':852},device_scale_factor=2)
    c.route(lambda u: 'reddit' in (urllib.parse.urlparse(u).hostname or '') or 'jina' in u, lambda r: r.abort())
    pg=c.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8792/?'+urllib.parse.urlencode({'url':'https://www.reddit.com'+d['path'],'reddit':json.dumps(d)}))
    pg.wait_for_selector('.r-title',timeout=20000)
    print(pg.inner_text('.r-head'),'|',pg.inner_text('.r-text').replace('\n',' | ')[:600])
    # fail screen button for normal reddit link
    pg.goto('http://localhost:8792/?text='+urllib.parse.quote('https://www.reddit.com/r/x/comments/zz9/y/'))
    pg.wait_for_selector('.fail',timeout=60000); print(pg.inner_text('.fail a.primary'))
    pg.screenshot(path=S+'/rfail.png'); b.close()
srv.terminate(); print('errs',errs)
