"""Apply only the two user-confirmed October 11 departures; preserve all history."""
import importlib.util,json,os,sqlite3,sys,tempfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('repair_support',Path(__file__).with_name('repair-production-growth.py'))
support=importlib.util.module_from_spec(spec);spec.loader.exec_module(support)
TARGET='gb_6edf5032ae381abbc76b0ffc377a0f83'
MUTATION='confirm-oct11-departures-20261013'
NAMES={'볼트트','또때려줘'}
ACTIVE="('current','observed','unobserved','new')"
q=support.quote

def apply(db):
 before_docs=support.digest(support.documents(db))
 before_history=support.digest(db.query('SELECT * FROM growth_observations ORDER BY observation_id'))
 meta={r['key']:int(r['value']) for r in db.query("SELECT key,value FROM growth_meta WHERE key IN ('growth_revision','identity_revision')")}
 latest=db.query("SELECT * FROM growth_batches WHERE state='published' ORDER BY observed_date DESC,published_revision DESC LIMIT 1")
 assert len(latest)==1 and latest[0]['batch_id']==TARGET and latest[0]['observed_date']=='2026-10-11','Latest publication changed; no mutation permitted'
 target=q(TARGET)
 members=db.query(f'SELECT s.*,m.display_name FROM growth_membership_snapshots s JOIN growth_members m USING(member_id) WHERE s.batch_id={target}')
 if db.query('SELECT mutation FROM growth_mutations WHERE mutation='+q(MUTATION)):
  assert all(next(s for s in members if s['display_name']==name)['membership_state']=='missing' for name in NAMES)
  return {'status':'already-applied','growth_revision':meta['growth_revision']}
 assert meta=={'growth_revision':5,'identity_revision':5},'Revision changed; no mutation permitted'
 departed=[s for s in members if s['display_name'] in NAMES]
 assert len(departed)==2 and {s['display_name'] for s in departed}==NAMES
 assert all(s['membership_state']=='unobserved' for s in departed),'Only unobserved members can be changed'
 active=[s for s in members if s['membership_state'] in ['current','observed','unobserved','new']]
 assert len(active)==89
 assert {s['display_name'] for s in active if s['membership_state']=='unobserved'}==NAMES
 ids=','.join(q(s['member_id']) for s in departed);now="strftime('%Y-%m-%dT%H:%M:%fZ','now')";guard=q(MUTATION);gate=f'EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id={guard})'
 result={'schema':'3on-growth-membership-correction-v1','batch_id':TARGET,'observed_date':'2026-10-11','growth_revision':6,'identity_revision':5,'departed':[{'member_id':s['member_id'],'display_name':s['display_name'],'before':'unobserved','after':'missing'} for s in departed],'reason':'User confirmed these two unobserved members departed','active_count':87}
 sql='\n'.join([
  f"INSERT INTO growth_tx_guards(guard_id,ok,created_at) SELECT {guard},CASE WHEN (SELECT value FROM growth_meta WHERE key='growth_revision')='5' AND (SELECT value FROM growth_meta WHERE key='identity_revision')='5' AND EXISTS(SELECT 1 FROM growth_batches WHERE batch_id={target} AND state='published' AND observed_date='2026-10-11') AND (SELECT COUNT(*) FROM growth_membership_snapshots WHERE batch_id={target} AND membership_state IN {ACTIVE})=89 AND (SELECT COUNT(*) FROM growth_membership_snapshots WHERE batch_id={target} AND member_id IN ({ids}) AND membership_state='unobserved')=2 THEN 1 ELSE NULL END,{now};",
  f"UPDATE growth_membership_snapshots SET membership_state='missing' WHERE batch_id={target} AND member_id IN ({ids}) AND membership_state='unobserved' AND {gate};",
  f"UPDATE growth_publications SET status='inactive' WHERE batch_id={target} AND status='active' AND {gate};",
  f"INSERT INTO growth_publications(publication_id,growth_revision,batch_id,identity_revision,status,event_kind,supersedes_publication_id,actor,created_at) SELECT {q('pub_'+MUTATION)},6,{target},5,'active','correction',(SELECT publication_id FROM growth_publications WHERE batch_id={target} ORDER BY growth_revision DESC LIMIT 1),'user-confirmed-departures',{now} WHERE {gate};",
  f"UPDATE growth_batches SET published_revision=6,validation_json=json_set(validation_json,'$.membership_correction',{q(MUTATION)}),updated_at={now} WHERE batch_id={target} AND {gate};",
  f"UPDATE growth_meta SET value='6',updated_at={now} WHERE key='growth_revision' AND {gate};",
  f"INSERT INTO growth_mutations(mutation,operation,result_json,created_at) SELECT {q(MUTATION)},'membership_correction',{q(json.dumps(result,ensure_ascii=False))},{now} WHERE {gate};",
 ])
 support.EVIDENCE.mkdir(exist_ok=True)
 (support.EVIDENCE/'confirmed-departures.sql').write_text(sql+'\n')
 db.execute(sql)
 assert support.digest(support.documents(db))==before_docs,'Other operational data changed'
 assert support.digest(db.query('SELECT * FROM growth_observations ORDER BY observation_id'))==before_history,'Growth history changed'
 assert db.query(f'SELECT COUNT(*) n FROM growth_membership_snapshots WHERE batch_id={target} AND membership_state IN {ACTIVE}')[0]['n']==87
 assert db.query(f"SELECT COUNT(*) n FROM growth_membership_snapshots WHERE batch_id={target} AND member_id IN ({ids}) AND membership_state='missing'")[0]['n']==2
 (support.EVIDENCE/'confirmed-departures-result.json').write_text(json.dumps({**result,'history_preserved':True,'other_documents_preserved':True},ensure_ascii=False,indent=2))
 return result

def self_test():
 with tempfile.TemporaryDirectory() as temp:
  db=support.Local(str(Path(temp)/'test.sqlite'))
  db.execute('''CREATE TABLE growth_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
CREATE TABLE growth_batches(batch_id TEXT PRIMARY KEY,observed_date TEXT,state TEXT,published_revision INTEGER,validation_json TEXT,updated_at TEXT);
CREATE TABLE growth_members(member_id TEXT PRIMARY KEY,display_name TEXT);
CREATE TABLE growth_membership_snapshots(batch_id TEXT,member_id TEXT,membership_state TEXT,row_order INTEGER);
CREATE TABLE growth_tx_guards(guard_id TEXT PRIMARY KEY,ok INTEGER NOT NULL CHECK(ok=1),created_at TEXT);
CREATE TABLE growth_publications(publication_id TEXT PRIMARY KEY,growth_revision INTEGER,batch_id TEXT,identity_revision INTEGER,status TEXT,event_kind TEXT,supersedes_publication_id TEXT,actor TEXT,created_at TEXT);
CREATE TABLE growth_mutations(mutation TEXT PRIMARY KEY,operation TEXT,result_json TEXT,created_at TEXT);
CREATE TABLE growth_observations(observation_id TEXT PRIMARY KEY,power INTEGER);
CREATE TABLE documents(kind TEXT,revision INTEGER,payload TEXT,updated_at TEXT);''')
  db.execute(f"INSERT INTO growth_meta VALUES('growth_revision','5','before'),('identity_revision','5','before'); INSERT INTO growth_batches VALUES({q(TARGET)},'2026-10-11','published',5,'{{}}','before'); INSERT INTO growth_publications VALUES('old',5,{q(TARGET)},5,'active','publish',NULL,'test','before'); INSERT INTO documents VALUES('carriage',1,'preserve','before'); INSERT INTO growth_observations VALUES('old-history',123);")
  for i in range(89):
   name=sorted(NAMES)[i] if i<2 else 'observed-'+str(i)
   db.execute(f"INSERT INTO growth_members VALUES({q(str(i))},{q(name)});INSERT INTO growth_membership_snapshots VALUES({q(TARGET)},{q(str(i))},{q('unobserved' if i<2 else 'observed')},{i});")
  assert apply(db)['active_count']==87
  assert apply(db)['status']=='already-applied'
  print('Local departure correction, history preservation and idempotent retry: PASS')

if __name__=='__main__':
 if '--self-test' in sys.argv:self_test()
 else:
  db=support.Remote();support.backup(db);print(json.dumps(apply(db),ensure_ascii=False))
  current=support.public('/api/growth/current');legacy=support.public('/api/growth/legacy')
  assert current['observed_date']==legacy['data']['date']=='2026-10-11'
  assert len(current['members'])==legacy['data']['guildCount']==87
  assert not NAMES.intersection(m['display_name'] for m in current['members'])
  assert NAMES.issubset({m['displayName'] for m in legacy['data']['archivedMembers']})
  assert next(m for m in current['members'] if m['display_name']=='홍시')['canonical']=='제시맘'
  (support.EVIDENCE/'public-current-after.json').write_text(json.dumps(current,ensure_ascii=False,indent=2))
  print('Public date, 87 members, departure archive and Hongsi identity: PASS')
