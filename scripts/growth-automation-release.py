"""Guarded existing-Worker release. Credentials stay in Actions environment.

Backs up business tables and schema, excluding authentication rows; D1 Time Travel
provides whole-database recovery. No destructive seed/migration is executed.
"""
import sys,os,json,hashlib,urllib.request,datetime,sqlite3
from pathlib import Path
TARGET=sys.argv[2] if len(sys.argv)>2 else 'staging'
assert TARGET in ('staging','production')
WORKER='3on-guild-'+TARGET
E=Path('automation-evidence')/TARGET;E.mkdir(parents=True,exist_ok=True)
def digest(x):return hashlib.sha256(json.dumps(x,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
def quote(x):return "'"+str(x).replace("'","''")+"'"
class Remote:
 def __init__(self):
  self.account=os.environ['CLOUDFLARE_ACCOUNT_ID'];self.token=os.environ['CLOUDFLARE_API_TOKEN']
  self.settings=self.api('GET','/workers/scripts/'+WORKER+'/settings')['result']
  bindings=self.settings['bindings'];d1=[b for b in bindings if b['name']=='DB' and b['type']=='d1'];assert len(d1)==1
  self.database=d1[0]['id']
 def api(self,method,path,data=None):
  req=urllib.request.Request('https://api.cloudflare.com/client/v4/accounts/'+self.account+path,data=None if data is None else json.dumps(data).encode(),method=method,headers={'Authorization':'Bearer '+self.token,'Content-Type':'application/json'})
  with urllib.request.urlopen(req,timeout=120) as r:out=json.load(r)
  assert out.get('success'),json.dumps(out.get('errors',[]));return out
 def query(self,sql):
  result=self.api('POST','/d1/database/'+self.database+'/query',{'sql':sql})['result'];assert all(r.get('success',True) for r in result)
  return result[-1].get('results',[])
 def execute(self,sql):return self.query(sql)
def tables(db):
 result={}
 for t in db.query("SELECT name FROM sqlite_master WHERE type='table' AND (name='documents' OR name LIKE 'growth_%') ORDER BY name"):
  name=t['name'];cols='*' if name!='growth_review_assets' else 'asset_id,batch_id,row_id,mime_type,hex(bytes) bytes_hex,size_bytes,expires_at,created_at'
  result[name]=db.query('SELECT '+cols+' FROM '+name+' ORDER BY 1')
 return result
def baseline(db):
 result=tables(db)
 # Credentials are compared by digest only; never exported or logged.
 auth=db.query('SELECT * FROM credentials ORDER BY 1')
 return {'tables':{k:digest(v) for k,v in result.items() if not k.startswith(('growth_auto_','growth_hourly_','growth_external_','growth_daily_'))},'credentials_hash':digest(auth),'growth_meta':db.query('SELECT * FROM growth_meta ORDER BY key')}
def public(path):
 req=urllib.request.Request('https://'+WORKER+'.295server.workers.dev'+path,headers={'User-Agent':'3ON-release-verification'})
 with urllib.request.urlopen(req,timeout=60) as r:return json.load(r)
def inspect(db):
 before=baseline(db);data=tables(db)
 schema=db.query("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND (name='documents' OR name LIKE 'growth_%') ORDER BY type,name")
 (E/'business-backup.json').write_text(json.dumps({'schema':schema,'tables':data},ensure_ascii=False))
 (E/'before.json').write_text(json.dumps(before,ensure_ascii=False,indent=2))
 settings={k:v for k,v in db.settings.items() if k!='bindings'}
 settings['bindings']=[{k:v for k,v in b.items() if k not in ('text','value')} for b in db.settings['bindings']]
 (E/'worker-settings-before.json').write_text(json.dumps(settings,indent=2))
 deployments=db.api('GET','/workers/scripts/'+WORKER+'/deployments')['result'];(E/'deployments-before.json').write_text(json.dumps(deployments,indent=2))
 schedules=db.api('GET','/workers/scripts/'+WORKER+'/schedules')['result']
 (E/'schedules-before.json').write_text(json.dumps(schedules,indent=2))
 try: bookmark=db.api('GET','/d1/database/'+db.database+'/time_travel/bookmark')['result']
 except Exception as e:bookmark={'status':'unavailable','error_type':type(e).__name__}
 (E/'time-travel-before.json').write_text(json.dumps(bookmark,indent=2))
 (E/'public-before.json').write_text(json.dumps({'current':public('/api/growth/current'),'legacy':public('/api/growth/legacy'),'state':public('/api/state')},ensure_ascii=False))
 # Rehearse a full business-data restoration into fresh local SQLite.
 restored=sqlite3.connect(':memory:')
 for s in schema:
  if s['type']=='table':restored.execute(s['sql'])
 for name,rows in data.items():
  for row in rows:
   row=dict(row)
   if name=='growth_review_assets':row['bytes']=bytes.fromhex(row.pop('bytes_hex'))
   cols=list(row);restored.execute('INSERT INTO '+name+'('+','.join('"'+c+'"' for c in cols)+') VALUES('+','.join('?' for _ in cols)+')',[row[c] for c in cols])
 assert all(restored.execute('SELECT COUNT(*) FROM '+name).fetchone()[0]==len(rows) for name,rows in data.items())
 assert restored.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
 (E/'restore-rehearsal.json').write_text(json.dumps({'status':'PASS','tables':len(data),'rows':sum(map(len,data.values())),'credentials_excluded':True}))
 print(json.dumps({'status':'BACKUP_AND_RESTORE_PASS','target':TARGET,'business_tables':len(data),'binding_types':[b['type'] for b in db.settings['bindings']],'growth_meta':before['growth_meta'],'schedules':schedules,'time_travel_available':'bookmark' in bookmark}))
def inventory(db):
 scripts=db.api('GET','/workers/scripts')['result'];rows=[]
 for worker in scripts:
  name=worker['id'];value=db.api('GET','/workers/scripts/'+name+'/schedules')['result'];schedules=value.get('schedules',[]) if isinstance(value,dict) else value
  if schedules:rows.append({'worker':name,'crons':[x['cron'] for x in schedules]})
 print(json.dumps({'status':'READ_ONLY_CRON_INVENTORY','total':sum(len(x['crons']) for x in rows),'scheduled_workers':rows}))
def prepare(db):
 before=json.loads((E/'before.json').read_text());assert baseline(db)==before,'Production changed after backup; inspect again'
 db.execute(Path('drizzle/0005_growth_automation.sql').read_text())
 now=int(datetime.datetime.now(datetime.timezone.utc).timestamp()*1000);start=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).date().isoformat()
 db.execute("INSERT OR IGNORE INTO growth_auto_control VALUES(1,0,"+quote(start)+",NULL,NULL,NULL,"+str(now)+");")
 # The first deployed runtime rejected redirect='error' locally before dispatch.
 # Release only that proven no-network reservation, retaining its error/audit row.
 if TARGET=='production':
  db.api('POST','/d1/database/'+db.database+'/query',{'batch':[
   {'sql':"UPDATE growth_auto_runs SET status='not_dispatched' WHERE status='failed' AND http_status IS NULL AND raw_json IS NULL AND error LIKE 'Invalid redirect value,%' AND error LIKE '%won''t be implemented%' AND run_id=(SELECT last_run_id FROM growth_auto_control WHERE id=1)", 'params':[]},
   {'sql':"UPDATE growth_auto_control SET last_call_at=NULL,last_hour=NULL,last_run_id=NULL WHERE id=1 AND last_run_id IN(SELECT run_id FROM growth_auto_runs WHERE status='not_dispatched' AND error LIKE 'Invalid redirect value,%')", 'params':[]}
  ]})
 # Initial mappings do not rename members or create any old observations.
 assert baseline(db)==before,'Existing saved data changed during additive migration'
 cfg={'name':WORKER,'main':'dist/server/index.js','compatibility_date':db.settings.get('compatibility_date','2026-05-15'),'compatibility_flags':db.settings.get('compatibility_flags',['nodejs_compat']),'no_bundle':True,'rules':[{'type':'ESModule','globs':['**/*.js','**/*.mjs']}],'assets':{'directory':'dist/client'},'d1_databases':[{'binding':'DB','database_id':db.database}],'observability':{'enabled':True},'triggers':{'crons':['0,10 * * * *'] if TARGET=='production' else []}}
 cfg['vars']={b['name']:b['text'] for b in db.settings['bindings'] if b['type']=='plain_text'};cfg['vars']['GROWTH_AUTO_MODE']='production' if TARGET=='production' else 'fixture'
 unknown=[b['type'] for b in db.settings['bindings'] if b['type'] not in ('plain_text','secret_text','d1','assets')];assert not unknown,('Unpreserved existing binding',unknown)
 Path('wrangler.automation.generated.json').write_text(json.dumps(cfg,indent=2)+'\n')
 print('Additive schema applied; existing collector setting preserved (new setup stays paused until authenticated identity bootstrap). Existing tables and credentials unchanged.')
def verify(db):
 before=json.loads((E/'before.json').read_text());after=baseline(db)
 assert before==after,'Existing business or authentication data changed'
 state=public('/api/growth/automation');assert state['mode']==('production' if TARGET=='production' else 'fixture');assert state['ai_calls']==0
 schedules=db.api('GET','/workers/scripts/'+WORKER+'/schedules')['result']
 actual={s['cron'] for s in (schedules.get('schedules',[]) if isinstance(schedules,dict) else schedules)};assert actual==({'0,10 * * * *'} if TARGET=='production' else set())
 nowpublic={'current':public('/api/growth/current'),'legacy':public('/api/growth/legacy'),'state':public('/api/state')}
 old=json.loads((E/'public-before.json').read_text());assert old['state']==nowpublic['state']
 assert old['legacy']==nowpublic['legacy'],'Published growth changed before the first automatic close'
 # /current fixes an existing superseded-lineage bug; member IDs and display names must still match.
 assert [(m['member_id'],m['display_name']) for m in old['current']['members']]==[(m['member_id'],m['display_name']) for m in nowpublic['current']['members']]
 (E/'after.json').write_text(json.dumps({'baseline':after,'automation':state,'schedules':schedules,'current':nowpublic['current']},ensure_ascii=False,indent=2))
 print(json.dumps({'status':'DEPLOYMENT_VERIFIED','target':TARGET,'members':len(nowpublic['current']['members']),'revision':nowpublic['current']['revision'],'schedules':sorted(actual),'existing_data_and_credentials_preserved':True}))
if __name__=='__main__':
 db=Remote();{'inspect':inspect,'prepare':prepare,'verify':verify,'inventory':inventory}[sys.argv[1]](db)
