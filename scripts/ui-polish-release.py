"""UI-only release guard. All D1 requests are SELECTs; never restore a live DB."""
import sys,os,json,hashlib,urllib.request,urllib.error,urllib.parse,subprocess,re
from pathlib import Path

ACTION,TARGET=sys.argv[1:3]
assert TARGET in ('staging','production')
WORKER='3on-guild-'+TARGET
DBS={'staging':'9c3667a6-e510-40a6-b4e6-4852515fdb3a','production':'31e3bbb6-2860-40cb-9390-d989d37f11c2'}
VERSIONS={'staging':'f8e4f477-5444-4648-b4b6-3bf712a98840','production':'6a95b797-7be3-45fc-a8be-d5e7c69061f9'}
ROOT=Path('/tmp/3on-ui-release-'+TARGET);ROOT.mkdir(mode=0o700,exist_ok=True)
ORIGIN='https://'+WORKER+'.295server.workers.dev'
def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
def api(method,path,data=None):
 req=urllib.request.Request('https://api.cloudflare.com/client/v4/accounts/'+os.environ['CLOUDFLARE_ACCOUNT_ID']+path,data=None if data is None else json.dumps(data).encode(),method=method,headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN'],'Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=90) as r:value=json.load(r)
 assert value.get('success'),'Cloudflare API failed; details withheld'
 return value['result']
def get(path):return api('GET','/workers/scripts/'+WORKER+path)
def active():
 deployments=get('/deployments')['deployments'];assert deployments
 versions=deployments[0]['versions'];assert len(versions)==1 and versions[0]['percentage']==100
 return versions[0]['version_id']
def query(sql):
 assert sql.lstrip().upper().startswith('SELECT '),'Only SELECT statements permitted'
 rows=api('POST','/d1/database/'+DBS[TARGET]+'/query',{'sql':sql})
 assert all(r.get('success',True) and r.get('meta',{}).get('rows_written',0)==0 for r in rows)
 return rows[-1].get('results',[])
def public(path,status=200):
 req=urllib.request.Request(urllib.parse.urljoin(ORIGIN,path),headers={'User-Agent':'3ON-UI-read-only-verification'})
 try:
  with urllib.request.urlopen(req,timeout=60) as r:raw=r.read();actual=r.status
 except urllib.error.HTTPError as exc:raw=exc.read();actual=exc.code
 assert actual==status,('Unexpected public response',path,actual)
 return raw
def settings():
 value=get('/settings');bindings=value['bindings'];d1=[b for b in bindings if b['type']=='d1']
 assert len(d1)==1 and d1[0]['name']=='DB' and d1[0]['id']==DBS[TARGET]
 assert all(b['type'] in ('d1','assets','plain_text','secret_text') for b in bindings)
 return value
def schedules():
 value=get('/schedules');rows=value.get('schedules',[]) if isinstance(value,dict) else value
 return sorted(s['cron'] for s in rows)
def invariant():
 public_hashes={p:hashlib.sha256(public(p)).hexdigest() for p in ['/api/state','/api/growth/current','/api/growth/legacy','/legacy.html','/growth-auto.js','/carriage-date.js']}
 config=settings()
 return {'public':public_hashes,'credentials':digest(query('SELECT * FROM credentials ORDER BY hash')),'schema':digest(query("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type,name")),'migrations':query('SELECT name FROM d1_migrations ORDER BY id'),'enabled':query('SELECT enabled FROM growth_auto_control WHERE id=1'),'schedules':schedules(),'vars':digest([b for b in config['bindings'] if b['type']=='plain_text']),'secret_names':sorted(b['name'] for b in config['bindings'] if b['type']=='secret_text'),'binding':DBS[TARGET],'compatibility_date':config['compatibility_date'],'compatibility_flags':config.get('compatibility_flags',[])}
def before():
 assert active()==VERSIONS[TARGET],'Live Worker changed since verified backup'
 config=settings();crons=schedules()
 assert crons==(['0,10 * * * *'] if TARGET=='production' else [])
 baseline=invariant();(ROOT/'baseline.json').write_text(json.dumps(baseline))
 (ROOT/'rollback.json').write_text(json.dumps({'version':VERSIONS[TARGET]}))
 variables={b['name']:b['text'] for b in config['bindings'] if b['type']=='plain_text'}
 assert variables.get('GROWTH_AUTO_MODE')==('production' if TARGET=='production' else 'fixture')
 cfg={'name':WORKER,'main':'dist/server/index.js','compatibility_date':config['compatibility_date'],'compatibility_flags':config.get('compatibility_flags',[]),'no_bundle':True,'rules':[{'type':'ESModule','globs':['**/*.js','**/*.mjs']}],'assets':{'directory':'dist/client'},'d1_databases':[{'binding':'DB','database_id':DBS[TARGET]}],'vars':variables,'observability':config.get('observability') or {'enabled':True},'triggers':{'crons':crons}}
 Path('wrangler.ui-polish.generated.json').write_text(json.dumps(cfg));Path('wrangler.ui-polish.generated.json').chmod(0o600)
 local_names={p.name for p in Path('drizzle').glob('*.sql')};applied={r['name'] for r in baseline['migrations']}
 print(json.dumps({'status':'READ_ONLY_PREDEPLOY_PASS','target':TARGET,'old_version':VERSIONS[TARGET],'database':DBS[TARGET],'crons':crons,'pending_migration_names':sorted(local_names-applied),'migration_action':'NONE','auto_enabled':baseline['enabled'],'backup_cipher_sha256':'f13437f5e872423a14a76236b744c3cb5a54d42f1083571d31e6af8f2a401324','backup_permanent_file':'3ON-D1-encrypted-backup-20261022.zip'}))
def verify():
 baseline=json.loads((ROOT/'baseline.json').read_text());after=invariant()
 assert baseline==after,'Saved data, credentials, assets, schema, or automation config changed'
 assert active()!=VERSIONS[TARGET],'New UI version did not activate'
 auto=json.loads(public('/api/growth/automation'));assert auto['mode']==('production' if TARGET=='production' else 'fixture')
 assert json.loads(public('/api/session'))=={'admin':False}
 public('/api/growth/batches',401);public('/api/growth/automation?admin=1',401)
 html=public('/growth-admin').decode();hrefs=re.findall(r'href="([^\"]+\.css[^\"]*)"',html)
 assert hrefs,'No admin CSS reference found'
 css='\n'.join(public(path).decode() for path in hrefs)
 assert all(t in css for t in ['b6e3ff','136px','focus-visible','prefers-reduced-motion']),'New CSS safeguards missing'
 (ROOT/'verified.json').write_text(json.dumps({'version':active(),'source_sha':os.environ['GITHUB_SHA']}))
 print(json.dumps({'status':'UI_ONLY_DEPLOYMENT_VERIFIED','target':TARGET,'version':active(),'source_sha':os.environ['GITHUB_SHA'],'data_schema_credentials_preserved':True,'automation_mode':auto['mode'],'auto_enabled':after['enabled'],'crons':after['schedules'],'d1_writes_by_verification':0,'migrations_applied':0}))
def rollback():
 if not (ROOT/'rollback.json').exists():return
 old=json.loads((ROOT/'rollback.json').read_text())['version']
 subprocess.run(['npx','wrangler','rollback',old,'--name',WORKER,'--yes'],check=True)
 assert active()==old,'Code rollback not verified'
 print(json.dumps({'status':'CODE_ROLLBACK_VERIFIED','target':TARGET,'version':old,'database_restore':False}))
{'before':before,'verify':verify,'rollback':rollback}[ACTION]()
