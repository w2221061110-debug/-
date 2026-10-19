import csv,re,json,gzip
out=[];lem={}
for r in csv.DictReader(open(__import__('sys').argv[1] if len(__import__('sys').argv)>1 else 'ecdict.csv',encoding='utf-8')):
    w=r['word']
    if not re.fullmatch(r"[a-z][a-z'\- ]*",w): continue
    frq=int(r['frq'] or 0); bnc=int(r['bnc'] or 0); tag=r['tag']
    multi=' ' in w
    keep = (tag and not multi) or (0<frq<=25000 and not multi) or (0<bnc<=25000 and not multi) or (multi and (tag or 0<int(r['collins'] or 0) or r['oxford']=='1') )
    if not keep: continue
    lines=[l for l in r['translation'].split('\\n') if l and not l.startswith('[网络]')]
    if not lines: continue
    t='；'.join(lines[:3])
    t=t[:80]
    out.append(f"{w}\t{r['phonetic']}\t{t}")
    for p in r['exchange'].split('/'):
        if p[:2] in ('p:','d:','i:','3:','s:','r:','t:'):
            f=p[2:]
            if f and f!=w and re.fullmatch(r"[a-z'\-]+",f): lem.setdefault(f,w)
words=set(l.split('\t')[0] for l in out)
lem={k:v for k,v in lem.items() if k not in words}
txt='\n'.join(out)+'\n#LEMMA\n'+'\n'.join(f'{k}\t{v}' for k,v in lem.items())
open('data/dict.txt','w').write(txt)
print(len(out),len(lem),len(txt.encode()),len(gzip.compress(txt.encode())))
