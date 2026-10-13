"""Guarded, audited repair of the two October 9 duplicate identities.

Uses existing GitHub Actions Cloudflare credentials through environment only.
Never exports authentication tables or prints secret values. No schema changes.
"""
import argparse,hashlib,json,os,sqlite3,subprocess,urllib.request
from pathlib import Path

WORKER='3on-guild-production'
ORIGIN='https://3on-guild-production.295server.workers.dev'
TARGET='gb_6f5c42a3fb4095576a9585adb93540b8'
NAMES={'lucky~':(51263986,28,'R3'),'lucky--':(3823636,16,'R1')}
REPAIR='repair-oct9-lucky-20261013'
EVIDENCE=Path(os.environ.get('REPAIR_EVIDENCE','repair-evidence'))

def digest(value):
 return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def quote(x):return "'"+str(x).replace("'","''")+"'"
def public(path):
 result=subprocess.run(['curl','--fail','--silent','--show-error','--max-time','60',ORIGIN+path],check=True,capture_output=True,text=True)
 return json.loads(result.stdout)

class Remote:
 def __init__(self):
  self.account=os.environ['CLOUDFLARE_ACCOUNT_ID'];self.token=os.environ['CLOUDFLARE_API_TOKEN']
  settings=self.api('GET',f'/workers/scripts/{WORKER}/settings')['result']
  bindings=settings['bindings'];d1=[b for b in bindings if b['name']=='DB' and b['type']=='d1'];assert len(d1)==1,'Existing Production D1 binding missing'
  self.database=d1[0]['id']
  config={'name':WORKER,'main':'dist/server/index.js','compatibility_date':settings.get('compatibility_date','2026-05-15'),'compatibility_flags':settings.get('compatibility_flags',['nodejs_compat']),'no_bundle':True,'rules':[{'type':'ESModule','globs':['**/*.js','**/*.mjs']}],'assets':{'directory':'dist/client'},'d1_databases':[{'binding':'DB','database_id':self.database}],'observability':{'enabled':True}}
  values={b['name']:b['text'] for b in bindings if b['type']=='plain_text'}
  if values:config['vars']=values
  Path('wrangler.production-repair.json').write_text(json.dumps(config,indent=2)+'\n')
 def api(self,method,path,data=None):
  req=urllib.request.Request('https://api.cloudflare.com/client/v4/accounts/'+self.account+path,data=None if data is None else json.dumps(data).encode(),method=method,headers={'Authorization':'Bearer '+self.token,'Content-Type':'application/json'})
  with urllib.request.urlopen(req,timeout=120) as r:value=json.load(r)
  if not value.get('success'):raise RuntimeError('Cloudflare operation failed: '+json.dumps(value.get('errors',[])))
  return value
 def query(self,sql):
  result=self.api('POST','/d1/database/'+self.database+'/query',{'sql':sql})['result']
  assert all(x.get('success',True) for x in result),'D1 query failed'
  return result[-1].get('results',[])
 def execute(self,sql):self.query(sql)

class Local:
 def __init__(self,path):self.db=sqlite3.connect(path);self.db.row_factory=sqlite3.Row
 def query(self,sql):return [dict(x) for x in self.db.execute(sql)]
 def execute(self,sql):
  try:self.db.executescript('BEGIN;\n'+sql+'\nCOMMIT;')
  except Exception:self.db.rollback();raise

def documents(db):return db.query('SELECT kind,revision,payload,updated_at FROM documents ORDER BY kind')
def legacy_history(db):return db.query("SELECT * FROM growth_observations WHERE source_type='legacy' ORDER BY observation_id")
def backup(db):
 EVIDENCE.mkdir(exist_ok=True)
 tables=db.query("SELECT name FROM sqlite_master WHERE type='table' AND (name='documents' OR name LIKE 'growth_%') ORDER BY name")
 data={}
 for row in tables:
  name=row['name'];assert name=='documents' or name.startswith('growth_')
  sql='SELECT * FROM '+name
  if name=='growth_review_assets':sql='SELECT asset_id,batch_id,row_id,mime_type,hex(bytes) AS bytes_hex,size_bytes,expires_at,created_at FROM growth_review_assets'
  data[name]=db.query(sql)
 (EVIDENCE/'growth-and-documents-before.json').write_text(json.dumps(data,ensure_ascii=False,indent=2))
 summary={'documents_hash':digest(documents(db)),'legacy_history_hash':digest(legacy_history(db)),'legacy_history_count':len(legacy_history(db)),'observation_count':len(data['growth_observations'])}
 (EVIDENCE/'baseline.json').write_text(json.dumps(summary,indent=2))
 return summary

def repair(db):
 if db.query('SELECT mutation FROM growth_mutations WHERE mutation='+quote(REPAIR)):
  print('Repair already recorded; no further database change.');return
 meta={x['key']:int(x['value']) for x in db.query("SELECT key,value FROM growth_meta WHERE key IN ('growth_revision','identity_revision')")}
 batch=db.query('SELECT * FROM growth_batches WHERE batch_id='+quote(TARGET))
 assert len(batch)==1 and batch[0]['state']=='published' and batch[0]['observed_date']=='2026-10-09' and batch[0]['expected_count']==87,'October 9 published package is not the expected target'
 latest=db.query("SELECT batch_id FROM growth_batches WHERE state='published' ORDER BY observed_date DESC,published_revision DESC LIMIT 1")
 assert latest[0]['batch_id']==TARGET,'Newer growth data exists; refusing to overwrite'
 snapshots=db.query('SELECT s.*,m.legacy_canonical,m.display_name FROM growth_membership_snapshots s JOIN growth_members m ON m.member_id=s.member_id WHERE s.batch_id='+quote(TARGET))
 active=[s for s in snapshots if s['membership_state'] in ['current','observed','unobserved','new']]
 pairs=[]
 for name,stats in NAMES.items():
  original=[s for s in active if s['legacy_canonical']==name]
  duplicates=[s for s in active if s['display_name']==name and s['legacy_canonical'] is None]
  assert len(original)==len(duplicates)==1,'Exact original/duplicate pair missing: '+name
  old,new=original[0]['member_id'],duplicates[0]['member_id']
  rows=db.query('SELECT * FROM growth_batch_rows WHERE batch_id='+quote(TARGET)+' AND proposed_member_id='+quote(new))
  assert len(rows)==1 and rows[0]['resolution_status']=='new' and (rows[0]['power'],rows[0]['level'],rows[0]['rank'])==stats,'Unexpected duplicate observation: '+name
  pairs.append((name,old,new,rows[0]))
 assert len(active)==89,'Unexpected active member count; refusing repair'
 baseline=json.loads((EVIDENCE/'baseline.json').read_text());assert digest(documents(db))==baseline['documents_hash'];assert digest(legacy_history(db))==baseline['legacy_history_hash']
 g=meta['growth_revision'];i=meta['identity_revision'];guard=quote(REPAIR);target=quote(TARGET);now="strftime('%Y-%m-%dT%H:%M:%fZ','now')"
 sql=[f"INSERT INTO growth_tx_guards(guard_id,ok,created_at) SELECT {guard},CASE WHEN (SELECT value FROM growth_meta WHERE key='growth_revision')={quote(g)} AND (SELECT value FROM growth_meta WHERE key='identity_revision')={quote(i)} AND EXISTS(SELECT 1 FROM growth_batches WHERE batch_id={target} AND state='published' AND observed_date='2026-10-09') AND (SELECT COUNT(*) FROM growth_membership_snapshots WHERE batch_id={target} AND membership_state IN ('current','observed','unobserved','new'))=89 THEN 1 ELSE NULL END,{now};"]
 gate=f'EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id={guard})'
 for index,(name,old,new,row) in enumerate(pairs):
  oldq,newq,rowq=quote(old),quote(new),quote(row['row_id'])
  before={k:row[k] for k in ['resolution_status','resolved_member_id','proposed_member_id','proposed_display_name','confirm_alias','power','level','rank','membership_state','uncertainty_reason']}
  after={**before,'resolution_status':'resolved','resolved_member_id':old,'proposed_member_id':None,'proposed_display_name':None,'confirm_alias':0,'membership_state':'observed','uncertainty_reason':None}
  sql.extend([
   f"INSERT INTO growth_review_events(event_id,mutation,batch_id,row_id,action,before_json,after_json,status,draft_revision,actor,created_at) SELECT {quote(REPAIR+'-'+str(index))},{quote(REPAIR+'-'+str(index))},{target},{rowq},'direct_connect',{quote(json.dumps(before,ensure_ascii=False))},{quote(json.dumps(after,ensure_ascii=False))},'active',{batch[0]['draft_revision']+1},'production-repair',{now} WHERE {gate};",
   f"UPDATE growth_batch_rows SET candidate_member_id={oldq},resolution_status='resolved',resolved_member_id={oldq},proposed_member_id=NULL,proposed_display_name=NULL,confirm_alias=0,membership_state='observed',uncertainty_reason=NULL,review_version=review_version+1 WHERE row_id={rowq} AND batch_id={target} AND proposed_member_id={newq} AND {gate};",
   f"UPDATE growth_observations SET member_id={oldq} WHERE batch_id={target} AND member_id={newq} AND {gate};",
   f"UPDATE growth_membership_snapshots SET membership_state='observed',row_order={row['row_index']} WHERE batch_id={target} AND member_id={oldq} AND {gate};",
   f"UPDATE growth_membership_snapshots SET membership_state='archived' WHERE batch_id={target} AND member_id={newq} AND {gate};",
   f"UPDATE growth_identity_decisions SET status='withdrawn' WHERE batch_id={target} AND member_id={newq} AND status='confirmed' AND {gate};",
  ])
 result={'schema':'3on-growth-repair-v1','batch_id':TARGET,'growth_revision':g+1,'identity_revision':i+1,'reconnected':[p[0] for p in pairs]}
 sql.extend([
  f"UPDATE growth_publications SET status='inactive' WHERE batch_id={target} AND status='active' AND {gate};",
  f"INSERT INTO growth_publications(publication_id,growth_revision,batch_id,identity_revision,status,event_kind,supersedes_publication_id,actor,created_at) SELECT {quote('pub_'+REPAIR)},{g+1},{target},{i+1},'active','correction',(SELECT publication_id FROM growth_publications WHERE batch_id={target} ORDER BY growth_revision DESC LIMIT 1),'production-repair',{now} WHERE {gate};",
  f"UPDATE growth_batches SET published_revision={g+1},draft_revision=draft_revision+1,validation_json=json_set(validation_json,'$.repair',{quote(REPAIR)}),updated_at={now} WHERE batch_id={target} AND {gate};",
  f"UPDATE growth_meta SET value={quote(g+1)},updated_at={now} WHERE key='growth_revision' AND {gate};",
  f"UPDATE growth_meta SET value={quote(i+1)},updated_at={now} WHERE key='identity_revision' AND {gate};",
  f"INSERT INTO growth_mutations(mutation,operation,result_json,created_at) SELECT {quote(REPAIR)},'correction',{quote(json.dumps(result))},{now} WHERE {gate};",
 ])
 (EVIDENCE/'applied-repair.sql').write_text('\n'.join(sql)+'\n')
 db.execute('\n'.join(sql))
 assert digest(documents(db))==baseline['documents_hash'],'Operational documents changed'
 assert digest(legacy_history(db))==baseline['legacy_history_hash'],'Legacy observations changed'
 assert len(db.query('SELECT observation_id FROM growth_observations'))==baseline['observation_count'],'Stored observation count changed'
 count=db.query(f"SELECT COUNT(*) n FROM growth_membership_snapshots WHERE batch_id={target} AND membership_state IN ('current','observed','unobserved','new')")[0]['n'];assert count==87
 (EVIDENCE/'repair-result.json').write_text(json.dumps({**result,'active_members':count,'documents_preserved':True,'legacy_history_preserved':True,'all_observations_preserved':True},ensure_ascii=False,indent=2))
 print(json.dumps({'status':'PASS','active_members':count,'growth_revision':g+1,'documents_preserved':True,'legacy_history_preserved':True}))

def verify(db):
 baseline=json.loads((EVIDENCE/'baseline.json').read_text());assert digest(documents(db))==baseline['documents_hash'];assert digest(legacy_history(db))==baseline['legacy_history_hash']
 if isinstance(db,Remote):
  current=public('/api/growth/current');legacy=public('/api/growth/legacy')
  assert current['observed_date']==legacy['data']['date']=='2026-10-09'
  assert len(current['members'])==legacy['data']['guildCount']==87
  assert len(legacy['data']['archivedMembers'])==13
  for name,(power,level,rank) in NAMES.items():
   members=[m for m in current['members'] if m['display_name']==name];assert len(members)==1 and members[0]['canonical']==name and members[0]['power']==power
   m=next(m for m in legacy['data']['members'] if m['name']==name);assert len(m['history'])>1 and m['history'][-1]['date']=='2026-10-09' and m['history'][-1]['power']==power
  (EVIDENCE/'public-current-after.json').write_text(json.dumps(current,ensure_ascii=False,indent=2))
  (EVIDENCE/'public-legacy-after.json').write_text(json.dumps(legacy,ensure_ascii=False,indent=2))
 print('Final state, documents, and legacy history verification: PASS')

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('action',choices=['inspect','repair','verify']);parser.add_argument('--local-db');args=parser.parse_args()
 database=Local(args.local_db) if args.local_db else Remote()
 if args.action=='inspect':summary=backup(database);print(json.dumps({'backup':'complete',**summary}))
 elif args.action=='repair':repair(database)
 else:verify(database)
