"""Download the chosen CC0 tracks for 핀볼 추첨, re-checking each page's license, and write CREDITS.md."""
import re,urllib.request,urllib.parse,subprocess,pathlib,html,json
UA={'User-Agent':'3on-guild-music-finder'}
def get(u,binary=False):
    d=urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=60).read();return d if binary else d.decode('utf-8','replace')
CHOSEN=[('5-chiptunes-action','title%20screen.mp3','bgm01','music'),('5-chiptunes-action','level1.mp3','bgm02','music'),('5-chiptunes-action','level2.mp3','bgm03','music'),('5-chiptunes-action','level3.mp3','bgm04','music'),
 ('we-are-prophet-happy-energetic-tune','bu-offensive-birds.mp3','bgm05','music'),('nes-shooter-music-5-tracks-3-jingles','Mars.ogg','bgm06','music'),('nes-shooter-music-5-tracks-3-jingles','Mercury.ogg','bgm07','music'),
 ('nes-shooter-music-5-tracks-3-jingles','Venus.ogg','bgm08','music'),('free-fall','Free%20Fall.mp3','bgm09','music'),('insert-coin','Insert%20Coin_2.mp3','bgm10','music'),
 ('10-8bit-coin-sounds','coin.mp3','goal','sfx'),('victorious','29%20Victorious%208-bit.ogg','win','sfx')]
out=pathlib.Path('public/pinball-music');out.mkdir(parents=True,exist_ok=True);tmp=pathlib.Path('/tmp/music');tmp.mkdir(exist_ok=True)
credits=['# 핀볼 추첨 음악·효과음 출처','','모두 OpenGameArt.org에서 CC0(공개 저작물, 누구나 자유롭게 사용 가능)로 배포된 파일입니다. 받을 때 각 페이지의 라이선스를 다시 확인했습니다.','']
meta=[]
for slug,name,key,kind in CHOSEN:
    page=get('https://opengameart.org/content/'+slug)
    lic=re.search(r'License\(s\):(.*?)</div>\s*</div>',page,re.S)
    licenses=re.findall(r'>([^<>]*(?:CC0|CC-BY[^<>]*|GPL[^<>]*|OGA-BY[^<>]*))<',lic.group(1)) if lic else []
    assert licenses and all('CC0' in l for l in licenses),(slug,licenses)
    title=html.unescape(re.search(r'<title>(.*?)</title>',page,re.S).group(1)).split('|')[0].strip()
    author=html.unescape((re.search(r'Author:.*?<a[^>]*>([^<]+)</a>',page,re.S) or [None,'?'])[1]).strip()
    src=tmp/urllib.parse.unquote(name);src.write_bytes(get('https://opengameart.org/sites/default/files/'+name,True))
    dst=out/(key+'.mp3')
    args=['ffmpeg','-v','error','-y','-i',str(src)]+(['-t','120','-af','loudnorm=I=-16:TP=-1.5,afade=t=out:st=117:d=3','-ac','1','-b:a','96k'] if kind=='music' else ['-af','loudnorm=I=-14:TP=-1','-ac','1','-b:a','96k'])+[str(dst)]
    subprocess.run(args,check=True)
    dur=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(dst)]).decode().strip())
    print(key,title,'|',author,'|',' '.join(licenses),'|',round(dur,1),'s',dst.stat().st_size//1024,'KB')
    credits.append('- `'+key+'.mp3` — "'+title+'" by '+author+' — CC0 — https://opengameart.org/content/'+slug+' (원본 파일: '+urllib.parse.unquote(name)+')')
    meta.append({'key':key,'kind':kind,'title':title,'author':author,'seconds':round(dur,1)})
(out/'CREDITS.md').write_text('\n'.join(credits)+'\n',encoding='utf-8')
(out/'tracks.json').write_text(json.dumps(meta,ensure_ascii=False,indent=1)+'\n',encoding='utf-8')
