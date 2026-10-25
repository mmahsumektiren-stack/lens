# Resmi Oxford PDF'lerinden oxford.json üretir.
# Kullanım: pdftotext The_Oxford_3000_by_CEFR_level.pdf 3000r.txt && pdftotext The_Oxford_5000_by_CEFR_level.pdf 5000r.txt && python3 oxford_parse.py
import re, json, collections, sys
POS=r"(?:n\.|noun\.|v\.|adj\.|adv\.|prep\.|conj\.|pron\.|det\.|number|exclam\.|modal v\.|auxiliary v\.|indefinite article|definite article|infinitive marker|ordinal number|linking v\.)"
ENT=re.compile(r"^(.+?)\s+("+POS+r"(?:\s*[,/]\s*"+POS+r")*)\s*$")
RANK={'A1':1,'A2':2,'B1':3,'B2':4,'C1':5}
res={}; entries=[]; bad=[]
for fn in ['3000r.txt','5000r.txt']:
    lvl=None; carry=''
    for raw in open(fn, encoding='utf-8'):
        l=raw.strip().replace('­','')
        if not l: continue
        if l in RANK: lvl=l; continue
        if l.startswith(('The Oxford','©')) or re.fullmatch(r"\d+\s*/\s*\d+",l) or 'is the list of' in l or 'expanded core word list' in l or l.startswith('3000, it includes'): continue
        if carry: l=carry+' '+l; carry=''
        if l.endswith((',','/')): carry=l; continue
        m=ENT.match(l)
        if not m or not lvl: bad.append((fn,l)); continue
        head=re.sub(r"\s*\(.*?\)","",m.group(1))
        for w in [x.strip() for x in head.split(',')]:
            w=re.sub(r"\d+$","",w).strip().lower()
            if not w: continue
            entries.append((fn,lvl,w))
            if w not in res or RANK[lvl]<res[w]: res[w]=RANK[lvl]
print('entries', len(entries), 'unique', len(res))
print('per file', collections.Counter(e[0] for e in entries))
print('per file/level', sorted(collections.Counter((e[0],e[1]) for e in entries).items()))
print('unique per level', sorted(collections.Counter(res.values()).items()))
print('unparsed', len(bad), bad[:20])
json.dump(res, open('oxford.json','w'), separators=(',',':'), sort_keys=True)
