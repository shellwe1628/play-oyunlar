import re,json,time,urllib.request,concurrent.futures as cf,html,os
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36"
def get(path,tries=3):
    for i in range(tries):
        try:
            req=urllib.request.Request("https://www.crazygames.com"+path,headers={"User-Agent":UA,"Accept-Language":"en-US"})
            h=urllib.request.urlopen(req,timeout=40).read().decode('utf8','replace')
            m=re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>',h,re.S)
            if m: return json.loads(m.group(1))['props']['pageProps']
        except Exception as e:
            err=e
        time.sleep(1.5*(i+1))
    return None
def strip(s): return re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]+>',' ',s or ''))).strip()
slim=lambda g:{k:g.get(k) for k in('name','slug','isOriginal','mobileFriendly','categoryName','releaseYear','totalLikes','totalPlays','hasIap','gameThumbLabels')}
tags=get('/tags')['tags']
json.dump(tags,open('tags.json','w'))
lists={}; seen={}
def tagpage(t):
    pp=get('/t/'+t['enSlug'])
    if not pp or 'tag' not in pp: return t['enSlug'],None
    return t['enSlug'],{'top':[slim(g) for g in pp.get('topGames',[])],'mobile':[slim(g) for g in pp.get('topMobileGames',[])],
        'related':[r['slug'] for r in (pp['tag'].get('relatedTags') or [])],'isCategory':pp['tag'].get('isCategory')}
with cf.ThreadPoolExecutor(4) as ex:
    for slug,res in ex.map(tagpage,tags):
        lists[slug]=res
        if res:
            for g in res['top']+res['mobile']: seen[g['slug']]=g
for name,path in(('hot','/hot'),('new','/new'),('updated','/updated'),('home','/')):
    pp=get(path)
    if not pp: continue
    items=(pp.get('games') or {}).get('items') or []
    if name=='home': items=pp['featuredGames']['items']+pp['newGames']['items']
    lists['_'+name]={'top':[slim(g) for g in items]}
    for g in items: seen[g['slug']]=slim(g)
json.dump(lists,open('lists.json','w'))
print('tags',len(tags),'unique games',len(seen),flush=True)
def detail(slug):
    pp=get('/game/'+slug)
    if not pp or 'game' not in pp: return None
    g=pp['game']
    return {'slug':slug,'name':g['name'],'rating':g.get('rating'),'up':g.get('upvotes'),'down':g.get('downvotes'),
      'category':(g.get('category') or {}).get('enSlug'),'tags':[t['enSlug'] for t in g.get('tags') or []],
      'desc':strip(g.get('descriptionFirst'))[:600],'controls':strip(g.get('controls'))[:300],'developer':g.get('developer'),
      'play':g.get('playStoreUrl'),'ios':g.get('appStoreUrl'),'steam':g.get('steamStoreUrl'),'tech':g.get('technology'),
      'orientation':g.get('orientation'),'launch':g.get('basicLaunchOn'),'added':g.get('addedOn'),'iosF':g.get('iosFriendly'),
      'andF':g.get('androidFriendly'),'iap':g.get('hasIap'),'mp':(g.get('multiplayerOptions') or {}).get('isMultiplayer'),
      'original':seen.get(slug,{}).get('isOriginal'),'likes':seen.get(slug,{}).get('totalLikes'),'plays':seen.get(slug,{}).get('totalPlays'),
      'labels':g.get('gameThumbLabels'),'collection':g.get('collection'),'series':len(g.get('gamesInSeries') or [])}
n=0
with open('games.jsonl','w') as f, cf.ThreadPoolExecutor(5) as ex:
    for r in ex.map(detail,list(seen)):
        n+=1
        if r: f.write(json.dumps(r)+'\n')
        if n%200==0: print(n,flush=True)
print('done',n)
