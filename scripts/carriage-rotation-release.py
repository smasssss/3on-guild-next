"""Code-only deploy guard; business data, credentials and Cron are read-only."""
import os,sys,json,hashlib,subprocess,tempfile,urllib.request,urllib.parse,urllib.error
from pathlib import Path
ACTION,TARGET=sys.argv[1:3]
assert TARGET in ('staging','production')
WORKER='3on-guild-'+TARGET
ORIGIN='https://'+WORKER+'.295server.workers.dev'
DBS={'staging':'9c3667a6-e510-40a6-b4e6-4852515fdb3a','production':'31e3bbb6-2860-40cb-9390-d989d37f11c2'}
ROOT=Path('/tmp/3on-rotation-'+TARGET);ROOT.mkdir(mode=0o700,exist_ok=True)
def hashv(value):return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
def hashb(value):return hashlib.sha256(value).hexdigest()
def api(method,path,data=None):
 req=urllib.request.Request('https://api.cloudflare.com/client/v4/accounts/'+os.environ['CLOUDFLARE_ACCOUNT_ID']+path,data=None if data is None else json.dumps(data).encode(),method=method,headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN'],'Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=90) as r:body=json.load(r)
 assert body.get('success'),'Cloudflare API failed; details withheld'
 return body['result']
def worker(path):return api('GET','/workers/scripts/'+WORKER+path)
def active():
 versions=worker('/deployments')['deployments'][0]['versions'];assert len(versions)==1 and versions[0]['percentage']==100
 return versions[0]['version_id']
def query(sql):
 assert sql.lstrip().upper().startswith('SELECT ')
 values=api('POST','/d1/database/'+DBS[TARGET]+'/query',{'sql':sql})
 assert all(v.get('success',True) and v.get('meta',{}).get('rows_written',0)==0 for v in values)
 return values[-1].get('results',[])
def public(path,status=200):
 req=urllib.request.Request(urllib.parse.urljoin(ORIGIN,path),headers={'User-Agent':'3ON-rotation-release-verification'})
 try:
  with urllib.request.urlopen(req,timeout=60) as r:body=r.read();actual=r.status
 except urllib.error.HTTPError as e:body=e.read();actual=e.code
 assert actual==status,(path,actual)
 return body
def settings():
 cfg=worker('/settings');bindings=cfg['bindings'];d1=[b for b in bindings if b['type']=='d1']
 assert len(d1)==1 and d1[0]['name']=='DB' and d1[0]['id']==DBS[TARGET]
 assert all(b['type'] in ('d1','assets','plain_text','secret_text') for b in bindings)
 return cfg
def crons():
 rows=worker('/schedules');rows=rows.get('schedules',[]) if isinstance(rows,dict) else rows
 return sorted(r['cron'] for r in rows)
def invariant():
 cfg=settings()
 return {'documents':hashv(query('SELECT kind,revision,payload,updated_at FROM documents ORDER BY kind')),'credentials':hashv(query('SELECT * FROM credentials ORDER BY hash')),'schema':hashv(query("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type,name")),'migrations':query('SELECT name FROM d1_migrations ORDER BY id'),'enabled':query('SELECT enabled FROM growth_auto_control WHERE id=1'),'crons':crons(),'vars':hashv([b for b in cfg['bindings'] if b['type']=='plain_text']),'secrets':sorted(b['name'] for b in cfg['bindings'] if b['type']=='secret_text'),'growth_js':hashb(public('/growth-auto.js')),'date_js':hashb(public('/carriage-date.js'))}
def before():
 cfg=settings();schedule=crons();assert schedule==(['0,10 * * * *'] if TARGET=='production' else [])
 with tempfile.TemporaryDirectory() as tmp:
  path=Path(tmp)/'legacy.html';path.write_bytes(subprocess.check_output(['git','show','bb614a1:public/legacy.html']))
  patch=Path(tmp)/'patch.mjs';patch.write_bytes(subprocess.check_output(['git','show','bb614a1:scripts/growth-auto-ui.mjs']))
  subprocess.run(['node',str(patch),str(path)],check=True)
  assert hashb(public('/legacy'))==hashb(path.read_bytes()),'Live legacy source changed; refusing an outdated deploy'
 version=active();baseline=invariant()
 assert baseline['growth_js']==hashb(Path('public/growth-auto.js').read_bytes())
 assert baseline['date_js']==hashb(Path('public/carriage-date.js').read_bytes())
 (ROOT/'before.json').write_text(json.dumps({'version':version,'invariant':baseline}));(ROOT/'before.json').chmod(0o600)
 variables={b['name']:b['text'] for b in cfg['bindings'] if b['type']=='plain_text'}
 assert variables.get('GROWTH_AUTO_MODE')==('production' if TARGET=='production' else 'fixture')
 generated={'name':WORKER,'main':'dist/server/index.js','no_bundle':True,'compatibility_date':cfg['compatibility_date'],'compatibility_flags':cfg.get('compatibility_flags',[]),'rules':[{'type':'ESModule','globs':['**/*.js','**/*.mjs']}],'assets':{'directory':'dist/client'},'d1_databases':[{'binding':'DB','database_id':DBS[TARGET]}],'vars':variables,'observability':cfg.get('observability') or {'enabled':True},'triggers':{'crons':schedule}}
 Path('wrangler.rotation.generated.json').write_text(json.dumps(generated));Path('wrangler.rotation.generated.json').chmod(0o600)
 print(json.dumps({'status':'ROTATION_PREDEPLOY_PASS','target':TARGET,'old_version':version,'cron':schedule,'migrations':0,'d1_writes':0}))
def verify():
 baseline=json.loads((ROOT/'before.json').read_text());assert invariant()==baseline['invariant'],'Business data/auth/schema/Cron changed during deploy'
 for path in ['/legacy.html','/carriage-rotation.js']:
  assert hashb(public(path))==hashb(Path('dist/client'+path).read_bytes()),'Deployed asset mismatch: '+path
 auto=json.loads(public('/api/growth/automation'));assert auto['mode']==('production' if TARGET=='production' else 'fixture') and auto['ai_calls']==0
 assert json.loads(public('/api/session'))=={'admin':False};public('/api/growth/automation?admin=1',401)
 version=active();assert version!=baseline['version']
 print(json.dumps({'status':'ROTATION_DEPLOY_VERIFIED','target':TARGET,'version':version,'source_sha':os.environ['GITHUB_SHA'],'documents_auth_schema_preserved':True,'mode':auto['mode'],'cron':crons(),'ai_calls':auto['ai_calls'],'external_calls_by_verification':0,'migrations':0,'d1_writes':0}))
def rollback():
 if not (ROOT/'before.json').exists():return
 old=json.loads((ROOT/'before.json').read_text())['version']
 subprocess.run(['npx','wrangler','rollback',old,'--name',WORKER,'--yes'],check=True)
 assert active()==old
 print(json.dumps({'status':'CODE_ROLLBACK_VERIFIED','target':TARGET,'version':old,'database_restore':False}))
{'before':before,'verify':verify,'rollback':rollback}[ACTION]()
