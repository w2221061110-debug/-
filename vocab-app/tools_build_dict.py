# 生成 data/dict.txt：python3 tools_build_dict.py ecdict.csv
# ECDICT (MIT) 子集：常用单词 + 常用短语（含介/副词的动词短语等）+ 人工校对的常用短语释义 tools_overrides.tsv
import csv, re, gzip, sys, os
SRC = sys.argv[1] if len(sys.argv) > 1 else 'ecdict.csv'
HERE = os.path.dirname(os.path.abspath(__file__))
POS = r'(?:n|v|vt|vi|a|adj|adv|ad|prep|conj|pron|num|art|int|interj|aux|abbr|pl|phr)'
RARE = re.compile(r'古|废|方言|俚|罕|诗|旧时|苏格兰|美俚|英俚|［|\[')
def clean(tr, multi):
    lines = [l.strip() for l in tr.replace('\\n', '\n').split('\n') if l.strip()]
    main = [l for l in lines if not l.startswith('[') and not re.search(r'的(过去式|过去分词|复数|现在分词|第三人称|比较级|最高级)', l)]
    if not main: main = [re.sub(r'^\[[^\]]*\]\s*', '', l) for l in lines[:1]]
    # ECDICT 按词性排列，不按常用度：义项明显更多的词性通常更常用（如 give 的 vt. 比 n. 常用）→ 排前
    cnt = lambda l: len(re.split(r'[,;，；]', l))
    main = sorted(main[:4], key=lambda l: -cnt(l) if cnt(l) >= 2 * cnt(main[0]) else -cnt(main[0]))
    out = []
    for l in main[:3]:
        m = re.match(r'^(' + POS + r')\.\s*', l)
        pos = m.group(1) if m else ''
        if pos == 'a': pos = 'adj'
        if pos == 'ad': pos = 'adv'
        body = l[m.end():] if m else l
        body = re.sub(r'\([^)]*\)|（[^）]*）', lambda x: x.group(0) if len(x.group(0)) <= 8 else '', body)
        senses = []
        for s in re.split(r'[,;，；、]', body):
            s = re.sub(r'\s+', '', s).replace('...', '…').replace('..', '…')
            s = re.sub(r'^[\-–—]+|[\-–—]+$', '', s)
            if not s or RARE.search(s) or s in senses: continue
            if not re.search(r'[\u4e00-\u9fff]', s): continue
            senses.append(s)
        if multi: senses = [s for s in senses if len(s) > 1] or senses
        if not senses: continue
        out.append((pos, senses[:3 if not out else 2]))
        if len(out) == 2: break
    return '；'.join((p + '. ' if p else '') + '，'.join(s) for p, s in out)

rows = list(csv.DictReader(open(SRC, encoding='utf-8')))
fr = {r['word']: int(r['frq'] or 0) for r in rows if ' ' not in r['word']}
PART = set('to of up in on off out for with about at down away back over into from through by after around across along'.split())
FILL = {'sb', 'sth', "one's", 'oneself', 'a', 'the'}
def common_phrase(w):
    t = w.split()
    return 2 <= len(t) <= 4 and t[0] not in ('a', 'an', 'the') and any(x in PART for x in t[1:]) and 0 < fr.get(t[0], 0) <= 3000 \
        and all(x in PART or x in FILL or 0 < fr.get(x, 0) <= 6000 for x in t)
over = {}
for line in open(os.path.join(HERE, 'tools_overrides.tsv'), encoding='utf-8'):
    if '\t' in line: k, v = line.rstrip('\n').split('\t', 1); over[k.strip().lower()] = v.strip()
out = {}; lem = {}
for r in rows:
    w = r['word']
    if not re.fullmatch(r"[a-z][a-z'\- ]*", w): continue
    frq = int(r['frq'] or 0); bnc = int(r['bnc'] or 0); tag = r['tag']; multi = ' ' in w
    keep = (not multi and (tag or 0 < frq <= 25000 or 0 < bnc <= 25000)) or (multi and (tag or 0 < int(r['collins'] or 0) or r['oxford'] == '1' or common_phrase(w))) or w in over
    if not keep: continue
    t = over.get(w) or clean(r['translation'], multi)
    if not t: continue
    out[w] = f"{w}\t{r['phonetic'].strip()}\t{t}"
    for p in r['exchange'].split('/'):
        if p[:2] in ('p:', 'd:', 'i:', '3:', 's:', 'r:', 't:'):
            f = p[2:]
            if f and f != w and re.fullmatch(r"[a-z'\-]+", f): lem.setdefault(f, w)
for k, v in over.items():
    if k not in out: out[k] = f"{k}\t\t{v}"
lem = {k: v for k, v in lem.items() if k not in out}
txt = '\n'.join(out.values()) + '\n#LEMMA\n' + '\n'.join(f'{k}\t{v}' for k, v in lem.items())
os.makedirs(os.path.join(HERE, 'data'), exist_ok=True)
open(os.path.join(HERE, 'data', 'dict.txt'), 'w', encoding='utf-8').write(txt)
print(len(out), len(lem), len(txt.encode()), len(gzip.compress(txt.encode())))
