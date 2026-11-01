"""Lens uçtan uca testleri (Playwright + yerel http.server). Kullanım:
    python3 tests/run_all.py            # hepsi
    python3 tests/run_all.py read ph    # adında bunlar geçenler
Her test kendi portunda sunucu açar, dış servisler (Gemini, Jina, fxtwitter, Reddit…) route ile taklit edilir; internet gerekmez.
Geçti sayılır: çıkış kodu 0 ve son satırda sayfa hatası yok ("errs []", "errors []", "ALL OK")."""
import os, re, subprocess, sys, glob, time
HERE = os.path.dirname(os.path.abspath(__file__))
pick = sys.argv[1:]
tests = sorted(glob.glob(os.path.join(HERE, 'test_*.py')))
if pick: tests = [t for t in tests if any(p in os.path.basename(t) for p in pick)]
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
bad = []
for t in tests:
    name = os.path.basename(t)[5:-3]
    log = os.path.join(HERE, 'out', name + '.log')
    t0 = time.time()
    with open(log, 'w') as f:
        try: rc = subprocess.run([sys.executable, t], stdout=f, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, timeout=240).returncode
        except subprocess.TimeoutExpired: rc = 'timeout'
    last = (open(log).read().strip().splitlines() or [''])[-1]
    ok = rc == 0 and not re.search(r"(errs|errors:?) \[.+\]", last)
    print(f"{'OK  ' if ok else 'FAIL'} {name:12} {time.time() - t0:5.1f}s  {last[:90]}")
    if not ok: bad.append(name)
print(f"\n{len(tests) - len(bad)}/{len(tests)} geçti" + (f" — başarısız: {', '.join(bad)} (ayrıntı: tests/out/<ad>.log)" if bad else ''))
sys.exit(1 if bad else 0)
