#!/usr/bin/env python3
"""Store lookup helper.
  python3 store.py ios "<search term>" [limit]     -> App Store (US) search results via iTunes Search API
  python3 store.py play "<search term>" [limit]    -> Google Play (US) search results with installs/rating
Output: one line per app: title | developer | ratings count / installs | avg rating | released | genre | first 160 chars of description
"""
import sys,json,re,html,urllib.request,urllib.parse,concurrent.futures as cf
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36"
def fetch(u):
    return urllib.request.urlopen(urllib.request.Request(u,headers={"User-Agent":UA,"Accept-Language":"en-US"}),timeout=40).read().decode('utf8','replace')
def ios(term,limit=15):
    d=json.loads(fetch("https://itunes.apple.com/search?"+urllib.parse.urlencode({"term":term,"entity":"software","country":"us","limit":limit})))
    for r in d['results']:
        if 'Games' not in (r.get('genres') or []): continue
        print(f"{r['trackName'][:45]} | {r['sellerName'][:25]} | {r.get('userRatingCount',0)} ratings | {round(r.get('averageUserRating',0),1)} | {r.get('releaseDate','')[:10]} | {','.join(r.get('genres',[])[:3])} | {re.sub(chr(10),' ',r.get('description',''))[:160]}")
def play_detail(i):
    try: h=fetch(f"https://play.google.com/store/apps/details?id={i}&hl=en_US&gl=US")
    except Exception as e: return f"{i} | fetch failed"
    t=re.search(r'<h1[^>]*>(?:<span[^>]*>)?([^<]+)',h); inst=re.search(r'>([\d.,]+[KMB]?\+)</div><div[^>]*>Downloads',h)
    rat=re.search(r'aria-label="Rated ([\d.]+) stars',h); desc=re.search(r'<meta name="description" content="([^"]*)"',h)
    dev=re.search(r'/store/apps/dev(?:eloper)?\?id=[^"]+"[^>]*><span[^>]*>([^<]+)',h)
    return f"{html.unescape(t.group(1)) if t else i} | {html.unescape(dev.group(1)) if dev else '?'} | {inst.group(1) if inst else '?'} installs | {rat.group(1) if rat else '?'} | {i} | {html.unescape(desc.group(1))[:160] if desc else ''}"
def play(term,limit=10):
    h=fetch("https://play.google.com/store/search?"+urllib.parse.urlencode({"q":term,"c":"apps","hl":"en_US","gl":"US"}))
    ids=list(dict.fromkeys(re.findall(r'/store/apps/details\?id=([\w.]+)',h)))[:limit]
    with cf.ThreadPoolExecutor(5) as ex:
        for line in ex.map(play_detail,ids): print(line)
if __name__=="__main__":
    kind,term=sys.argv[1],sys.argv[2]; lim=int(sys.argv[3]) if len(sys.argv)>3 else (15 if kind=='ios' else 10)
    (ios if kind=='ios' else play)(term,lim)
