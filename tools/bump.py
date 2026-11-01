"""Sürüm artırma: index.html'deki ?v=N, sw.js'deki VERSION ve SHELL listesindeki ?v=N birlikte N+1 olur.
Telefondaki Lens yeni dosyaları ancak bu numara değişince alır. Her yayından önce çalıştır:
    python3 tools/bump.py
oxford.json'un kendi numarası (?v=) ayrıdır: yalnız oxford.json değişince reader.js ve sw.js'de elle artır."""
import re, os
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
idx = open(os.path.join(R, 'index.html')).read()
n = max(int(x) for x in re.findall(r'\?v=(\d+)', idx))
m = n + 1
idx = re.sub(r'(\.(?:css|js)\?v=)\d+', rf'\g<1>{m}', idx)
open(os.path.join(R, 'index.html'), 'w').write(idx)
sw = open(os.path.join(R, 'sw.js')).read()
sw = re.sub(r"(PREFIX \+ 'v)\d+'", rf"\g<1>{m}'", sw)
sw = re.sub(r"(\.(?:css|js)\?v=)\d+", rf"\g<1>{m}", sw)
open(os.path.join(R, 'sw.js'), 'w').write(sw)
print(f'v{n} → v{m}')
