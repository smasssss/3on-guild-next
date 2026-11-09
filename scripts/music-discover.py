"""Find CC0 (public domain) chiptune tracks on OpenGameArt for 핀볼 추첨: print page, license, audio links."""
import re,urllib.request,html
UA={'User-Agent':'3on-guild-music-finder'}
def get(u):
    return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=30).read().decode('utf-8','replace')
seeds=['starlight-city-loop-included','chiploop','8-bit-epic-space-shooter-music','dizzy-racing','as-fast-as-you-can','chiptune-loop','cc0-upbeat-electronic-music','cc0-chiptunes','cc0-retro-music','audio-cc0-8bit-chiptune','15-melodic-rpg-chiptunes']
pages,seen=[],set()
def lic(t):
    m=re.search(r'License\(s\):(.*?)</div>\s*</div>',t,re.S)
    return ' '.join(re.findall(r'>([^<>]*(?:CC0|CC-BY[^<>]*|GPL[^<>]*|OGA-BY[^<>]*))<',m.group(1))) if m else '?'
def scan(slug,depth):
    if slug in seen or len(seen)>60:return
    seen.add(slug)
    try:t=get('https://opengameart.org/content/'+slug)
    except Exception as e:print('ERR',slug,e);return
    files=sorted(set(re.findall(r'https://opengameart\.org/sites/default/files/[^"\'<> ]+\.(?:mp3|ogg|wav|zip)',t)))
    title=html.unescape((re.search(r'<title>(.*?)</title>',t,re.S) or [None,''])[1]).split('|')[0].strip()
    tags=' '.join(re.findall(r'/art-search-advanced\?field_art_tags_tid=([^"&]+)',t))[:120]
    print('PAGE',slug,'|',title,'|',lic(t),'|',tags);[print('  FILE',f) for f in files]
    if depth>0:
        for s in re.findall(r'href="/content/([a-z0-9-]+)"',t)[:40]:scan(s,depth-1)
for s in seeds:scan(s,1 if s.startswith(('cc0-','audio-cc0')) else 0)
