# Resmi Oxford PDF'lerinden oxford.json üretir.
# Kullanım: pdftotext -layout ... değil, düz: pdftotext The_Oxford_3000_by_CEFR_level.pdf 3000r.txt
#           pdftotext The_Oxford_5000_by_CEFR_level.pdf 5000r.txt && python3 oxford_parse.py
#
# Çıktı: { "h": {başlık: seviye}, "f": {çekimli biçim: başlık} }   seviye 1=A1 … 5=C1
# Çekimli biçimler, Oxford Text Checker gibi, YALNIZCA dilbilgisel çekimlerdir ve kelime türüne göre üretilir:
#   isim → çoğul (s/es/ies)            fiil → s/es/ies, ed/d/ied, ing (+ düzensiz biçimler)
#   sıfat (ve sıfat olarak da geçen zarflar) → er/est
# Türetme ekleri (-ly, -ness, -er "yapan" …) asla köke indirilmez: "stably" listede değil, "stab" değil.
import re, json, collections, sys, os

POS = r"(?:n\.|noun\.|v\.|adj\.|adv\.|prep\.|conj\.|pron\.|det\.|number|exclam\.|modal v\.|auxiliary v\.|indefinite article|definite article|infinitive marker|ordinal number|linking v\.)"
ENT = re.compile(r"^(.+?)\s+(" + POS + r"(?:\s*[,/]\s*" + POS + r")*)\s*$")
RANK = {'A1': 1, 'A2': 2, 'B1': 3, 'B2': 4, 'C1': 5}

# düzensiz çekimler: biçim(ler):temel
IRREG = 'am is are was were been being:be|has had having:have|does did done doing:do|said says:say|went gone goes:go|got gotten:get|made:make|took taken:take|saw seen:see|came:come|knew known:know|thought:think|gave given:give|found:find|told:tell|became:become|left:leave|felt:feel|brought:bring|began begun:begin|kept:keep|held:hold|wrote written:write|stood:stand|heard:hear|meant:mean|met:meet|ran:run|paid:pay|sat:sit|spoke spoken:speak|led:lead|grew grown:grow|lost:lose|fell fallen:fall|sent:send|built:build|understood:understand|drew drawn:draw|broke broken:break|spent:spend|rose risen:rise|drove driven:drive|bought:buy|wore worn:wear|chose chosen:choose|sought:seek|threw thrown:throw|caught:catch|dealt:deal|won:win|forgot forgotten:forget|sold:sell|fought:fight|taught:teach|ate eaten:eat|sang sung:sing|drank drunk:drink|slept:sleep|flew flown:fly|hid hidden:hide|shot:shoot|fed:feed|rode ridden:ride|shook shaken:shake|stole stolen:steal|woke woken:wake|bore born borne:bear|beaten:beat|bit bitten:bite|blew blown:blow|dug:dig|hung:hang|laid:lay|lent:lend|lit:light|shone:shine|sank sunk:sink|stuck:stick|struck:strike|swam swum:swim|swung:swing|tore torn:tear|froze frozen:freeze|forgave forgiven:forgive|arose arisen:arise|fled:flee|bent:bend|bound:bind|sped:speed|swore sworn:swear|wept:weep|withdrew withdrawn:withdraw|undertook undertaken:undertake|overcame overcome:overcome|lay lain:lie|fit:fit|hurt:hurt|cut:cut|put:put|set:set|let:let|hit:hit|cost:cost|shut:shut|spread:spread|quit:quit|split:split|burst:burst|cast:cast|bet:bet|read:read|learnt:learn|burnt:burn|dreamt:dream|spelt:spell|smelt:smell|spilt:spill|leapt:leap|knelt:kneel|dove:dive|lied lying:lie|forbade forbidden:forbid|forecast:forecast|mistook mistaken:mistake|upset:upset|sewn:sew|shown:show|sawn:saw|proved proven:prove|stung:sting|swept:sweep|wound:wind|slid:slide|crept:creep|hung:hang|ground:grind|spun:spin|strove striven:strive|thrust:thrust|underwent undergone:undergo|outgrew:outgrow|oversaw overseen:oversee|overtook overtaken:overtake|overheard:overhear|overthrew overthrown:overthrow|rebuilt:rebuild|retold:retell|withheld:withhold|withstood:withstand|upheld:uphold|misled:mislead|misunderstood:misunderstand|foresaw foreseen:foresee'
IRREG_N = 'men:man|women:woman|children:child|feet:foot|teeth:tooth|mice:mouse|geese:goose|people:person|lives:life|wives:wife|knives:knife|leaves:leaf|halves:half|selves:self|shelves:shelf|thieves:thief|wolves:wolf|loaves:loaf|calves:calf|analyses:analysis|crises:crisis|bases:basis|hypotheses:hypothesis|theses:thesis|emphases:emphasis|diagnoses:diagnosis|criteria:criterion|phenomena:phenomenon|data:datum|media:medium|indices:index|appendices:appendix|nuclei:nucleus|stimuli:stimulus|fungi:fungus|cacti:cactus|bacteria:bacterium|curricula:curriculum|potatoes:potato|tomatoes:tomato|heroes:hero|echoes:echo|vetoes:veto'
IRREG_A = 'better best:good|better best:well|worse worst:bad|further furthest farther farthest:far|more most:many|more most:much|less least:little|elder eldest:old'


def parse(files):
    heads, pos = {}, collections.defaultdict(set)
    bad = []
    for fn in files:
        lvl, carry = None, ''
        for raw in open(fn, encoding='utf-8'):
            l = raw.strip().replace('­', '')
            if not l: continue
            if l in RANK: lvl = l; continue
            if l.startswith(('The Oxford', '©')) or re.fullmatch(r"\d+\s*/\s*\d+", l) or 'is the list of' in l or 'expanded core word list' in l or l.startswith('3000, it includes'): continue
            if carry: l = carry + ' ' + l; carry = ''
            if l.endswith((',', '/')): carry = l; continue
            m = ENT.match(l)
            if not m or not lvl: bad.append((fn, l)); continue
            head = re.sub(r"\s*\(.*?\)", "", m.group(1))
            tags = set(re.findall(r"modal v\.|auxiliary v\.|linking v\.|n\.|v\.|adj\.|adv\.|prep\.|conj\.|pron\.|det\.|number|exclam\.|article|marker", m.group(2)))
            for w in [x.strip() for x in head.split(',')]:
                w = re.sub(r"\d+$", "", w).strip().lower()
                if not w: continue
                if w not in heads or RANK[lvl] < heads[w]: heads[w] = RANK[lvl]
                pos[w] |= tags
    return heads, pos, bad


VOW = set('aeiou')


# düzensiz olduğu halde düzenli -ed biçimi de kullanılan fiiller (burned/burnt, showed/shown …)
REG_TOO = set('burn learn dream spell spill smell dive show prove leap kneel sew saw hang light fit bet quit wake knit broadcast mow swell strive dwell speed forecast lie wind'.split())


def cvc(w):  # stop → stopp-, plan → plann-, equip → equipp- (son hece vurgusu bilinmediğinden ikisi de üretilir)
    v = w.replace('qu', 'qw')
    return len(v) >= 3 and v[-1] not in VOW and v[-1] not in 'wxy' and v[-2] in VOW and v[-3] not in VOW


def plural(w):
    if re.search(r"(s|x|z|ch|sh)$", w): return [w + 'es']
    if re.search(r"[^aeiou]y$", w): return [w[:-1] + 'ies']
    if re.search(r"[^aeiou]o$", w): return [w + 's', w + 'es']
    return [w + 's']


def verb_forms(w, irregular):
    f = plural(w)  # 3. tekil şahıs aynı kurala uyar
    # -ing
    if w.endswith('ie'): f.append(w[:-2] + 'ying')
    elif w.endswith('ee') or w.endswith('ye') or w.endswith('oe'): f.append(w + 'ing')
    elif w.endswith('e') and len(w) > 2: f.append(w[:-1] + 'ing')
    else: f.append(w + 'ing')
    if cvc(w): f.append(w + w[-1] + 'ing')
    if w.endswith('c'): f.append(w + 'king')  # panic → panicking
    # -ed (düzensiz fiillerde yok: see → "seed" olmasın)
    if not irregular:
        if w.endswith('e'): f.append(w + 'd')
        elif re.search(r"[^aeiou]y$", w): f.append(w[:-1] + 'ied')
        else: f.append(w + 'ed')
        if cvc(w): f.append(w + w[-1] + 'ed')
        if w.endswith('c'): f.append(w + 'ked')
    return f


def adj_forms(w):
    f = []
    if w.endswith('e'): f += [w + 'r', w + 'st']
    elif re.search(r"[^aeiou]y$", w): f += [w[:-1] + 'ier', w[:-1] + 'iest']
    else: f += [w + 'er', w + 'est']
    if cvc(w): f += [w + w[-1] + 'er', w + w[-1] + 'est']
    return f


def build(heads, pos):
    irr = collections.defaultdict(list)
    for g in IRREG.split('|'):
        forms, base = g.split(':'); irr[base] += forms.split()
    irr_n = {}
    for g in IRREG_N.split('|'):
        forms, base = g.split(':'); irr_n[forms] = base
    irr_a = collections.defaultdict(list)
    for g in IRREG_A.split('|'):
        forms, base = g.split(':'); irr_a[base] += forms.split()

    forms = {}

    def add(form, base):
        if form == base or form in heads: return  # listede kendi başlığı olan biçim kendini temsil eder
        # birden çok başlığa çıkan biçimde en düşük seviyeli (en temel) kazanır
        if form not in forms or heads[base] < heads[forms[form]]: forms[form] = base

    for w, tags in pos.items():
        isv = bool(tags & {'v.', 'modal v.', 'auxiliary v.', 'linking v.'})
        # çoğul: isimler, sayılar (thousands, fifties) ve çoğul alabilen birkaç zamir (others, ones, lots)
        if 'n.' in tags or 'number' in tags or w in ('other', 'one', 'lot'):
            for x in plural(w): add(x, w)
        if isv and tags & {'v.', 'linking v.'}:
            for x in verb_forms(w, w in irr and w not in REG_TOO): add(x, w)
        if isv:
            for x in irr.get(w, []): add(x, w)
        if 'adj.' in tags:
            for x in adj_forms(w): add(x, w)
        # zarflar yalnız sıfat olarak da geçiyorsa karşılaştırılır (fast, hard, late, early …)
        if w in irr_a and tags & {'adj.', 'adv.', 'det.', 'pron.'}:
            for x in irr_a[w]: add(x, w)
    # Amerikan yazımı fiil biçimleri: practise (v.) ↔ practicing/practiced; licence ↔ licensing
    for us, base in (('practice', 'practise'), ('license', 'licence')):
        if base in heads:
            for x in verb_forms(us, False): add(x, base)
    for form, base in irr_n.items():
        if base in heads: add(form, base)
    # ad öbekleri ("climate change") tek kelime değildir; okuyucu tek kelimeye baktığından biçim üretilmez
    return forms


CSV_POS = {'noun': 'n.', 'verb': 'v.', 'adjective': 'adj.', 'adverb': 'adv.', 'pronoun': 'pron.', 'preposition': 'prep.',
           'determiner': 'det.', 'number': 'number', 'ordinal number': 'number', 'conjunction': 'conj.', 'exclamation': 'exclam.',
           'modal verb': 'modal v.', 'auxiliary verb': 'auxiliary v.', 'linking verb': 'linking v.'}


def parse_csv(f3, f5):
    """oxfordlearnersdictionaries.com kelime listesi sayfalarının dökümü (Text Checker'ın kullandığı liste)."""
    import csv
    heads, pos, in3 = {}, collections.defaultdict(set), set()
    for fn in (f3, f5):
        for r in csv.DictReader(open(fn, encoding='utf-8')):
            w, lvl = r['word'].strip().lower().replace('’', "'"), r['cefr'].upper()
            if not w or lvl not in RANK: continue
            if fn == f3: in3.add(w)
            if w not in heads or RANK[lvl] < heads[w]: heads[w] = RANK[lvl]
            if r['type'] in CSV_POS: pos[w].add(CSV_POS[r['type']])
    return heads, pos, in3


if __name__ == '__main__':
    # SRC=web: sitedeki eski liste (Text Checker) — oxford_3000.csv + oxford_5000.csv gerekir.
    # SRC=pdf (varsayılan, Lens'in kullandığı): indirilebilir PDF'ler (daha yeni sürüm; AI, podcast, brake … eklenmiş, bazı eski kelimeler çıkarılmış).
    src = os.environ.get('SRC', 'pdf')
    if src == 'pdf':
        heads, pos, bad = parse(['3000r.txt'])
        in3 = set(heads)
        heads, pos, bad = parse(['3000r.txt', '5000r.txt'])
    else:
        heads, pos, in3 = parse_csv('oxford_3000.csv', 'oxford_5000.csv')
        bad = []
    forms = build(heads, pos)
    only5 = sorted(w for w in heads if w not in in3)
    print(src, 'heads', len(heads), '3000', len(in3), '5000-only', len(only5), 'forms', len(forms), 'unparsed', len(bad), bad[:10])
    out = os.environ.get('OUT', 'oxford.json')
    # x: yalnız Oxford 5000'de olan başlıklar (geri kalanı Oxford 3000)
    json.dump({'h': heads, 'f': forms, 'x': only5}, open(out, 'w'), separators=(',', ':'), sort_keys=True)
