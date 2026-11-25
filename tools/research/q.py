#!/usr/bin/env python3
"""Query the CrazyGames dataset (games.jsonl, 1636 games scraped by scrape.py; falls back to the committed snapshot without descriptions).
  python3 q.py tag <tag>[,<tag>...] [minvotes]   -> games having ALL the tags, by votes
  python3 q.py name "<substring>"                 -> full record(s) by name
  python3 q.py tags                               -> every tag with game count and total votes
Columns: name | votes(up+down) | rating/10 | store links P=Play I=iOS S=Steam (as listed by CrazyGames; '-' is NOT proof of absence) | O=CrazyGames original | MP | launch | tags | description
"""
import sys,json,collections
import os,glob
_here=os.path.dirname(os.path.abspath(__file__))
_local=os.path.join(_here,'games.jsonl')  # full scrape (with descriptions), git-ignored
_snap=sorted(glob.glob(os.path.join(_here,'..','..','docs','research','data','crazygames-*.jsonl')))
G=[json.loads(l) for l in open(_local if os.path.exists(_local) else _snap[-1])]
v=lambda g:(g['up'] or 0)+(g['down'] or 0)
def row(g,d=220): return f"{g['name'][:34]} | {v(g)} | {g['rating']} | {'P' if g['play'] else '-'}{'I' if g['ios'] else '-'}{'S' if g['steam'] else '-'} | {'O' if g['original'] else ''} | {'MP' if g['mp'] else ''} | {str(g['launch'])[:7]} | {','.join(g['tags'])} | {(g.get('desc') or '')[:d]}"
c=sys.argv[1]
if c=='tags':
    T=collections.Counter(); V=collections.Counter()
    for g in G:
        for t in set(g['tags']+[g['category'] or '']): T[t]+=1; V[t]+=v(g)
    for t,n in sorted(T.items(),key=lambda x:-V[x[0]]): print(t,n,V[t])
elif c=='tag':
    ts=set(sys.argv[2].split(',')); mv=int(sys.argv[3]) if len(sys.argv)>3 else 0
    for g in sorted([g for g in G if ts<=set(g['tags']+[g['category'] or '']) and v(g)>=mv],key=lambda g:-v(g))[:80]: print(row(g))
elif c=='name':
    for g in G:
        if sys.argv[2].lower() in g['name'].lower(): print(json.dumps(g,indent=1))
