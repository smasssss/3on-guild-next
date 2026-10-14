"""Apply only the user-confirmed October 14 departure; preserve all history."""
import importlib.util,json,os,sqlite3,sys,tempfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('repair_support',Path(__file__).with_name('repair-production-growth.py'))
support=importlib.util.module_from_spec(spec);spec.loader.exec_module(support)
TARGET='gb_0f38371e6be52495cfd8fb5493b7de19'
MUTATION='confirm-oct14-departure-20261015'
NAMES={'happymong'}
ACTIVE="('current','observed','unobserved','new')"
q=support.quote

def apply(db):
 before_docs=support.digest(support.documents(db))
 before_history=support.digest(db.query('SELECT * FROM growth_observations ORDER BY observation_id'))
 meta={r['key']:int(r['value']) for r in db.query("SELECT key,value FROM growth_meta WHERE key IN ('growth_revision','identity_revision')")}
 latest=db.query("SELECT * FROM growth_batches WHERE state='published' ORDER BY observed_date DESC,published_revision DESC LIMIT 1")
 assert len(latest)==1 and latest[0]['batch_id']==TARGET and latest[0]['observed_date']=='2026-10-14','Latest publication changed; no mutation permitted'
 target=q(TARGET)
 members=db.query(f'SELECT s.*,m.display_name FROM growth_membership_snapshots s JOIN growth_members m USING(member_id) WHERE s.batch_id={target}')
 if db.query('SELECT mutation FROM growth_mutations WHERE mutation='+q(MUTATION)):
  assert all(next(s for s in members if s['display_name']==name)['membership_state']=='missing' for name in NAMES)
  return {'status':'already-applied','growth_revision':meta['growth_revision']}
 assert meta=={'growth_revision':11,'identity_revision':6},'Revision changed; no mutation permitted'
 departed=[s for s in members if s['display_name'] in NAMES]
 assert len(departed)==1 and {s['display_name'] for s in departed}==NAMES
 assert {s['member_id'] for s in departed}=={'91a383ea-0311-507d-b783-57138f9395ba'},'Departed identities changed'
 assert all(s['membership_state']=='unobserved' for s in departed),'Only unobserved members can be changed'
 active=[s for s in members if s['membership_state'] in ['current','observed','unobserved','new']]
 assert len(active)==85
 assert {s['display_name'] for s in active if s['membership_state']=='unobserved'}==NAMES
 ids=','.join(q(s['member_id']) for s in departed);now="strftime('%Y-%m-%dT%H:%M:%fZ','now')";guard=q(MUTATION);gate=f'EXISTS(SELECT 1 FROM growth_tx_guards WHERE guard_id={guard})'
 result={'schema':'3on-growth-membership-correction-v1','batch_id':TARGET,'observed_date':'2026-10-14','growth_revision':12,'identity_revision':6,'departed':[{'member_id':s['member_id'],'display_name':s['display_name'],'before':'unobserved','after':'missing'} for s in departed],'reason':'User confirmed happymong departed','active_count':84}
 sql='\n'.join([
  f"INSERT INTO growth_tx_guards(guard_id,ok,created_at) SELECT {guard},CASE WHEN (SELECT value FROM growth_meta WHERE key='growth_revision')='11' AND (SELECT value FROM growth_meta WHERE key='identity_revision')='6' AND EXISTS(SELECT 1 FROM growth_batches WHERE batch_id={target} AND state='published' AND observed_date='2026-10-14') AND (SELECT COUNT(*) FROM growth_membership_snapshots WHERE batch_id={target} AND membership_state IN {ACTIVE})=85 AND (SELECT COUNT(*) FROM growth_membership_snapshots WHERE batch_id={target} AND member_id IN ({ids}) AND membership_state='unobserved')=1 THEN 1 ELSE NULL END,{now};",
  f"UPDATE growth_membership_snapshots SET membership_state='missing' WHERE batch_id={target} AND member_id IN ({ids}) AND membership_state='unobserved' AND {gate};",
  f"UPDATE growth_publications SET status='inactive' WHERE batch_id={target} AND status='active' AND {gate};",
  f"INSERT INTO growth_publications(publication_id,growth_revision,batch_id,identity_revision,status,event_kind,supersedes_publication_id,actor,created_at) SELECT {q('pub_'+MUTATION)},12,{target},6,'active','correction',(SELECT publication_id FROM growth_publications WHERE batch_id={target} ORDER BY growth_revision DESC LIMIT 1),'user-confirmed-departures',{now} WHERE {gate};",
  f"UPDATE growth_batches SET published_revision=12,validation_json=json_set(validation_json,'$.membership_correction',{q(MUTATION)}),updated_at={now} WHERE batch_id={target} AND {gate};",
  f"UPDATE growth_meta SET value='12',updated_at={now} WHERE key='growth_revision' AND {gate};",
  f"INSERT INTO growth_mutations(mutation,operation,result_json,created_at) SELECT {q(MUTATION)},'membership_correction',{q(json.dumps(result,ensure_ascii=False))},{now} WHERE {gate};",
 ])
 support.EVIDENCE.mkdir(exist_ok=True)
 (support.EVIDENCE/'confirmed-departures.sql').write_text(sql+'\n')
 db.execute(sql)
 assert support.digest(support.documents(db))==before_docs,'Other operational data changed'
 assert support.digest(db.query('SELECT * FROM growth_observations ORDER BY observation_id'))==before_history,'Growth history changed'
 assert db.query(f'SELECT COUNT(*) n FROM growth_membership_snapshots WHERE batch_id={target} AND membership_state IN {ACTIVE}')[0]['n']==84
 assert db.query(f"SELECT COUNT(*) n FROM growth_membership_snapshots WHERE batch_id={target} AND member_id IN ({ids}) AND membership_state='missing'")[0]['n']==1
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
  db.execute(f"INSERT INTO growth_meta VALUES('growth_revision','11','before'),('identity_revision','6','before'); INSERT INTO growth_batches VALUES({q(TARGET)},'2026-10-14','published',11,'{{}}','before'); INSERT INTO growth_publications VALUES('old',11,{q(TARGET)},6,'active','publish',NULL,'test','before'); INSERT INTO documents VALUES('carriage',1,'preserve','before'); INSERT INTO growth_observations VALUES('old-history',123);")
  for i in range(85):
   member_id=['91a383ea-0311-507d-b783-57138f9395ba'][i] if i<1 else str(i)
   name=sorted(NAMES)[i] if i<1 else 'observed-'+str(i)
   db.execute(f"INSERT INTO growth_members VALUES({q(member_id)},{q(name)});INSERT INTO growth_membership_snapshots VALUES({q(TARGET)},{q(member_id)},{q('unobserved' if i<1 else 'observed')},{i});")
  for invalid_sql,restore_sql in [
   ("UPDATE growth_meta SET value='99' WHERE key='growth_revision'", "UPDATE growth_meta SET value='11' WHERE key='growth_revision'"),
   ("UPDATE growth_membership_snapshots SET membership_state='observed' WHERE member_id='91a383ea-0311-507d-b783-57138f9395ba'", "UPDATE growth_membership_snapshots SET membership_state='unobserved' WHERE member_id='91a383ea-0311-507d-b783-57138f9395ba'"),
  ]:
   db.execute(invalid_sql+';')
   before=support.digest(db.query('SELECT * FROM growth_membership_snapshots ORDER BY row_order'))
   try: apply(db)
   except AssertionError: pass
   else: raise AssertionError('Invalid baseline must refuse all changes')
   assert support.digest(db.query('SELECT * FROM growth_membership_snapshots ORDER BY row_order'))==before
   assert not db.query('SELECT * FROM growth_mutations')
   db.execute(restore_sql+';')
  assert apply(db)['active_count']==84
  assert apply(db)['status']=='already-applied'
  print('Local departure correction, history preservation and idempotent retry: PASS')

if __name__=='__main__':
 if '--self-test' in sys.argv:self_test()
 else:
  db=support.Remote();support.backup(db);print(json.dumps(apply(db),ensure_ascii=False))
  current=support.public('/api/growth/current');legacy=support.public('/api/growth/legacy')
  assert current['observed_date']==legacy['data']['date']=='2026-10-14'
  assert len(current['members'])==legacy['data']['guildCount']==84
  assert not NAMES.intersection(m['display_name'] for m in current['members'])
  assert not {'볼트트','또때려줘','여우여우','용퍕이','별땀임'}.intersection(m['display_name'] for m in current['members'])
  assert NAMES.issubset({m['displayName'] for m in legacy['data']['archivedMembers']})
  assert next(m for m in current['members'] if m['display_name']=='제시맘')['canonical']=='제시맘'
  assert next(m for m in current['members'] if m['display_name']=='귀여운llllllllii')['canonical']=='lililililil'
  assert next(m for m in current['members'] if m['display_name']=='파츠')['level']==17
  assert any(e['kind']=='departure' and e['displayName']=='happymong' and e['date']=='2026-10-14' for e in legacy['data']['changeHistory'])
  assert len([e for e in legacy['data']['changeHistory'] if e['kind']=='level' and e['date']=='2026-10-14'])==10
  (support.EVIDENCE/'public-current-after.json').write_text(json.dumps(current,ensure_ascii=False,indent=2))
  print('Public date, 84 members, departure archive and Jesimam identity: PASS')
