"""Find CC0 battle chiptunes and short 8-bit hit/explosion sounds on OpenGameArt for the 배틀로얄 draw (read-only listing)."""
import re,urllib.request,urllib.parse,html
UA={'User-Agent':'3on-guild-music-finder'}
def get(u):
    return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=30).read().decode('utf-8','replace')
def lic(t):
    m=re.search(r'License\(s\):(.*?)</div>\s*</div>',t,re.S)
    return ' '.join(re.findall(r'>([^<>]*(?:CC0|CC-BY[^<>]*|GPL[^<>]*|OGA-BY[^<>]*))<',m.group(1))) if m else '?'
seen=set()
def scan(slug):
    if slug in seen or len(seen)>90:return
    seen.add(slug)
    try:t=get('https://opengameart.org/content/'+slug)
    except Exception as e:print('ERR',slug,e);return
    L=lic(t)
    files=sorted(set(re.findall(r'https://opengameart\.org/sites/default/files/[^"\'<> ]+\.(?:mp3|ogg|wav)',t)))
    files=[f for f in files if '/styles/' not in f and '/audio_preview/' not in f]
    title=html.unescape((re.search(r'<title>(.*?)</title>',t,re.S) or [None,''])[1]).split('|')[0].strip()
    if files and L.strip() and all('CC0' in x for x in L.split('  ') if x.strip()) and 'CC-BY' not in L and 'GPL' not in L:
        print('PAGE',slug,'|',title,'|',L);[print('  FILE',f.rsplit('/',1)[1]) for f in files[:14]]
seeds=['boss-battle-2-8-bit-re-upload','boss-battle-3-8-bit-re-upload','boss-battle-4-8-bit-re-upload','boss-battle-6-8-bit','boss-battle-8-bit','4-chiptunes-adventure','battle-theme-a','8-bit-battle-loop',
 'jrpg-battle-theme','retro-battle','chiptune-battle-music','8-bit-boss-battle','boss-fight','battle-in-the-winter','512-sound-effects-8-bit-style','8-bit-sound-effects-library','8bit-explosion','8-bit-explosions-0','explosion-0','retro-explosion','hit-sounds','8-bit-hit']
for s in seeds:scan(s)
for keys,kind in [('boss battle 8-bit',12),('battle chiptune',12),('8bit battle',12),('chiptune fight',12),('8-bit explosion',13),('8bit hit',13),('retro punch',13)]:
    try:
        t=get('https://opengameart.org/art-search-advanced?keys='+urllib.parse.quote(keys)+'&field_art_type_tid%5B%5D='+str(kind)+'&field_art_licenses_tid%5B%5D=4&sort_by=count&sort_order=DESC')
        for s in list(dict.fromkeys(re.findall(r'href="/content/([a-z0-9-]+)"',t)))[:14]:scan(s)
    except Exception as e:print('ERR search',keys,e)
