# 중계 목소리 조각 만들기(개발용, 유료: OpenAI API 크레딧 필요. 열쇠는 환경 설정의 네트워크 비밀로 들어가므로 여기에는 적지 않습니다).
# public/race/voice/lines.json 의 문장과 "N번 선수이름" 110개를 세 가지 세기(c 차분, e 흥분, s 고함)로 녹음해
# public/race/voice/이름_세기.mp3 와 index.json(조각별 길이)을 만듭니다. 이미 있는 조각은 건너뜁니다.
# 쓰는 법: python3 prototypes/race/voice_gen.py [확인만 할 조각 수]
import subprocess, json, sys, os, base64, re, tempfile, numpy as np
from concurrent.futures import ThreadPoolExecutor
ROOT=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))));DIR=ROOT+'/public/race/voice/'
MODEL=os.environ.get('VOICE_MODEL','gpt-audio-1.5');VOICE=os.environ.get('VOICE_NAME','verse')
NAMES={'horse':'경주마','biped':'두 발 말','cheetah':'치타','panda':'판다','ostrich':'타조','costume':'인형탈 말','giraffe':'기린','elephant':'코끼리','cow':'소','zebra':'얼룩말','turtle':'거북이'}
HEAD="You are a voice actor recording a comedy sports broadcast. Speak ONLY the exact Korean line the user gives, word for word, nothing before or after. Performance: "
STYLE={
 'c':HEAD+"a seasoned Korean sports announcer calmly opening or wrapping up a broadcast. Composed, warm and professional, relaxed unhurried pace, clear diction, friendly low-key tone. No shouting, no rush.",
 'e':HEAD+"a Korean horse-racing play-by-play announcer getting really excited as the race heats up. Loud, energetic, raised voice, fast pace, rising pitch on exclamations — clearly worked up, but not yet screaming.",
 's':HEAD+"a famous Korean sports caster losing his mind at the wildest moment of the match. He is SCREAMING the whole line — full-throated, roaring at maximum volume, voice hoarse and cracking from yelling, pitch shooting up. Deliver it FAST, machine-gun pace, in one breath, like frantic live play-by-play. Do NOT drag syllables out; only the very last syllable may ring out briefly. No calm or normal speaking voice anywhere.",
}
LOUD={'c':-25.0,'e':-22.0,'s':-19.5}   # 세기마다 다른 소리 크기(차분할수록 작게)
plain=lambda t:re.sub(r'[^0-9A-Za-z가-힣]','',t.replace('유에프오','UFO'))
def measure(path):
    pcm=subprocess.run(['ffmpeg','-loglevel','error','-i',path,'-ac','1','-ar','16000','-f','s16le','-'],capture_output=True).stdout
    x=np.frombuffer(pcm,dtype=np.int16).astype(np.float32)/32768;n=640;f0=[];es=[]
    for i in range(0,max(0,len(x)-n),320):
        w=x[i:i+n];e=float(np.sqrt((w*w).mean()))
        if e<0.02:continue
        es.append(e);w=w-w.mean();ac=np.correlate(w,w,'full')[n-1:];ac/=ac[0]+1e-9;a,b=16000//600,16000//70;k=a+int(np.argmax(ac[a:b]))
        if ac[k]>0.45:f0.append(16000/k)
    return dict(sec=len(x)/16000,f0=float(np.median(f0)) if f0 else 0.0,rms=float(20*np.log10(np.mean(es))) if es else -60.0)
def take(text,lv,out):
    body=json.dumps({"model":MODEL,"modalities":["text","audio"],"audio":{"voice":VOICE,"format":"mp3"},"messages":[{"role":"system","content":STYLE[lv]},{"role":"user","content":text}]})
    r=subprocess.run(['curl','-s','-m','180','https://api.openai.com/v1/chat/completions','-H','Authorization: Bearer dummy','-H','Content-Type: application/json','-d',body],capture_output=True,text=True).stdout
    try:d=json.loads(r)
    except Exception:return 'net'
    if 'error' in d:return 'api '+str(d['error'].get('code') or d['error'].get('message'))[:80]
    a=d['choices'][0]['message'].get('audio')
    said=plain((a or {}).get('transcript',''))
    if not a or (said!=plain(text) and re.sub(r'[아어으이오우에애]+$','',said)!=plain(text)):return 'text '+(a or {}).get('transcript','')[:40]   # 말끝을 조금 끄는 것까지는 허용
    open(out,'wb').write(base64.b64decode(a['data']));return None
def good(m,text,lv):
    limit=0.9+len(text)*(0.2 if lv=='c' else 0.15)
    if m['sec']>limit or m['sec']<0.25:return False
    return m['f0']>=255 if lv=='s' else m['f0']>=200 if lv=='e' else m['f0']<=215
def make(job):
    key,text,lv=job;out=DIR+key+'.mp3'
    if os.path.exists(out):return key,None
    best=None;why=''
    for k in range(4 if lv=='s' else 3):
        raw=tempfile.mktemp(suffix='.mp3');err=take(text,lv,raw)
        if err:
            why=err
            if err.startswith('api') and re.search('quota|credit|key|billing',err):return key,err
            continue
        m=measure(raw);score=m['f0'] if lv!='c' else -m['f0']
        if m['sec']>1.2+len(text)*0.3:score-=1000          # 말끝을 너무 끄는 녹음은 뒤로
        if best is None or score>best[0]:best=(score,raw,m)
        if good(m,text,lv):break
    if best is None:return key,why or 'fail'
    _,raw,m=best;gain=LOUD[lv]-m['rms']
    subprocess.run(['ffmpeg','-y','-loglevel','error','-i',raw,'-af','silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,volume=%.1fdB,alimiter=limit=0.95'%gain,'-ac','1','-ar','24000','-b:a','48k',out],check=True)
    return key,None
lines=json.load(open(DIR+'lines.json',encoding='utf8'));jobs=[]
for k,t in lines.items():
    for lv in (['c'] if re.match(r'^(i_|w_|r\d)',k) else ['c','e','s']):jobs.append((k+'_'+lv,t,lv))
for ty,nm in NAMES.items():
    for no in range(1,11):
        for lv in 'ces':jobs.append(('n%d_%s_%s'%(no,ty,lv),'%d번 %s%s'%(no,nm,'.' if lv=='c' else '!'),lv))
if len(sys.argv)>1:jobs=jobs[:int(sys.argv[1])]
fails=[]
with ThreadPoolExecutor(6) as ex:
    for i,(key,err) in enumerate(ex.map(make,jobs)):
        if err:fails.append((key,err));print('실패',key,err,flush=True)
        elif i%40==0:print('진행',i,'/',len(jobs),flush=True)
index={}
for key,_,_ in jobs:
    if os.path.exists(DIR+key+'.mp3'):index[key]=round(measure(DIR+key+'.mp3')['sec'],2)
if len(index)==len(jobs) and len(sys.argv)<2:
    json.dump(index,open(DIR+'index.json','w'),separators=(',',':'));print('끝: 조각',len(index),'개')
else:print('아직 다 만들지 못했습니다:',len(index),'/',len(jobs),'실패',len(fails),'(index.json 은 다 만들어진 뒤에만 채웁니다)')
