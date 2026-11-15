"""Download the chosen CC0 battle tracks and one explosion sound for the 배틀로얄 draw (license re-checked per page),
and add them to public/pinball-music (tracks.json and CREDITS.md keep their existing entries)."""
import re,urllib.request,urllib.parse,subprocess,pathlib,html,json
UA={'User-Agent':'3on-guild-music-finder'}
def get(u,binary=False):
    d=urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=60).read();return d if binary else d.decode('utf-8','replace')
CHOSEN=[('4-chiptunes-adventure','Juhani%20Junkala%20%5BChiptune%20Adventures%5D%203.%20Boss%20Fight.ogg','battle01','battle','보스전'),
 ('boss-battle-2-8-bit','boss_battle_%232.mp3','battle02','battle','결투'),
 ('8-bit-battle-loop','8BitBattleLoop.ogg','battle03','battle','난투'),
 ('nes-shooter-music-5-tracks-3-jingles','Boss.ogg','battle04','battle','우주 슈팅 · 보스'),
 ('chiptune-battle-music','battle_music_01-loop.ogg','battle05','battle','전투 개시'),
 ('bombexplosion8bit','8bit_bomb_explosion.wav','boom','sfx','충격파 폭발 소리')]
out=pathlib.Path('public/pinball-music');tmp=pathlib.Path('/tmp/music');tmp.mkdir(exist_ok=True)
tracks=json.loads((out/'tracks.json').read_text(encoding='utf-8'));credits=(out/'CREDITS.md').read_text(encoding='utf-8').rstrip('\n').split('\n')
keys={k for _,_,k,_,_ in CHOSEN};tracks=[t for t in tracks if t['key'] not in keys];credits=[c for c in credits if not any('`'+k+'.mp3`' in c for k in keys)]
credits+=['','배틀로얄 추첨용(2026-11-15 추가, 모두 CC0):']
for slug,name,key,kind,label in CHOSEN:
    page=get('https://opengameart.org/content/'+slug)
    lic=re.search(r'License\(s\):(.*?)</div>\s*</div>',page,re.S)
    licenses=re.findall(r'>([^<>]*(?:CC0|CC-BY[^<>]*|GPL[^<>]*|OGA-BY[^<>]*))<',lic.group(1)) if lic else []
    assert licenses and all('CC0' in l for l in licenses),(slug,licenses)
    title=html.unescape(re.search(r'<title>(.*?)</title>',page,re.S).group(1)).split('|')[0].strip()
    author=html.unescape((re.search(r'Author:.*?<a[^>]*>([^<]+)</a>',page,re.S) or [None,'?'])[1]).strip()
    src=tmp/urllib.parse.unquote(name);src.write_bytes(get('https://opengameart.org/sites/default/files/'+name,True))
    dst=out/(key+'.mp3')
    args=['ffmpeg','-v','error','-y','-i',str(src)]+(['-t','120','-af','loudnorm=I=-16:TP=-1.5,afade=t=out:st=117:d=3','-ac','1','-b:a','96k'] if kind=='battle' else ['-t','1.6','-af','loudnorm=I=-14:TP=-1,afade=t=out:st=1.2:d=0.4','-ac','1','-b:a','96k'])+[str(dst)]
    subprocess.run(args,check=True)
    dur=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(dst)]).decode().strip())
    print(key,title,'|',author,'|',' '.join(licenses),'|',round(dur,1),'s',dst.stat().st_size//1024,'KB')
    credits.append('- `'+key+'.mp3` — "'+title+'" by '+author+' — CC0 — https://opengameart.org/content/'+slug+' (원본 파일: '+urllib.parse.unquote(name)+')')
    tracks.append({'key':key,'kind':kind,'title':title,'author':author,'seconds':round(dur,1),'label':label})
(out/'CREDITS.md').write_text('\n'.join(credits)+'\n',encoding='utf-8')
(out/'tracks.json').write_text(json.dumps(tracks,ensure_ascii=False,indent=1)+'\n',encoding='utf-8')
