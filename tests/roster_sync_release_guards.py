"""Roster-sync Staging fixtures: 3-collection setup/rejoin/cleanup restore every row; Production refuses writes."""
import importlib.util,json,os,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('guards',Path(__file__).with_name('roster_release_guards.py'));guards=importlib.util.module_from_spec(spec);spec.loader.exec_module(guards)
spec=importlib.util.spec_from_file_location('sync',Path(__file__).resolve().parents[1]/'scripts/roster-sync-release.py');sync=importlib.util.module_from_spec(spec);spec.loader.exec_module(sync)
class Local(sync.Release,guards.Local):
 __init__=guards.Local.__init__;invariant=guards.Local.invariant;query=guards.Local.query;api=guards.Local.api
 def public(self,path,**kw):
  # Answers what the deployed API reports at each fixture stage (verified for real on Staging).
  f=self.load('fixture.json');m=f['members'];rejoins=self.query('SELECT COUNT(*) n FROM growth_auto_snapshots WHERE snapshot_id LIKE ?',[f['rejoinSnapshot']+'%'])[0]['n']
  if path=='/api/growth/current':return __import__('json').dumps({'members':m[:3 if rejoins>=3 else 2]})
  pending=[] if rejoins>=3 else [{'game_id':m[2]['gameId'],'member_id':m[2]['memberId'],'name':m[2]['nickname'],'change':'join','confirmations':rejoins,'required':3}]
  return __import__('json').dumps({'rosterPending':pending,'members':[{'memberId':x['memberId'],'current':i<2 or rejoins>=3} for i,x in enumerate(m)]})
class Guards(unittest.TestCase):
 def test_three_collection_fixture_is_fully_removed(self):
  with tempfile.TemporaryDirectory() as d:
   r=Local(d);before=r.invariant();os.environ['GITHUB_RUN_ID']='local_roster_sync_guard'
   r.fixture_setup();f=r.load('fixture.json')
   self.assertEqual(r.query('SELECT COUNT(*) n FROM growth_auto_snapshots')[0]['n'],3)
   r.fixture_rejoin();self.assertEqual(r.load('browser-input.json')['expectedCount'],3)
   self.assertEqual(r.query('SELECT COUNT(*) n FROM growth_auto_snapshots')[0]['n'],6)
   r.fixture_cleanup();self.assertEqual(r.invariant(),before)
 def test_production_refuses_every_fixture_mutation(self):
  with tempfile.TemporaryDirectory() as d:
   r=Local(d,'production')
   for action in [r.fixture_setup,r.fixture_rejoin,r.fixture_cleanup]:
    with self.assertRaises(AssertionError):action()
 def test_reviewed_base_is_the_current_roster_release(self):
  self.assertEqual(sync.base.BASE,'8276206ec1a7061a1e12cc30a68c5c65f1cd9328')
class Exclusions(unittest.TestCase):
 def release(self,d,target='production'):
  r=Local(d,target);ok=lambda *a,**k:None
  def api(method,path,body):
   with r.sql:
    return [{'success':True,'meta':{'changes':r.sql.execute(x['sql'],x['params']).rowcount}} for x in body['batch']]
  r.api=api;r.public=lambda path,**k:json.dumps({'members':[{'memberId':m,'eligibility':{'reason':'permanent'}} for m,_,_ in sync.NEW_EXCLUSIONS]})
  carriage={'pointer':1,'records':[{'id':'r1','vip':'공 주'}],'vipCarry':{'공 주':3},'vipExcludedMembers':{'e657d189-5bb1-5cee-91df-30a0efbfa222':1,'other':1}}
  r.sql.execute("INSERT OR REPLACE INTO documents(kind,revision,payload,updated_at,actor,last_mutation) VALUES('carriage',7,?,'t','a','m')",[json.dumps(carriage)]);r.sql.commit()
  return r,carriage
 def test_adds_only_the_three_exclusions_with_backup_and_is_idempotent(self):
  with tempfile.TemporaryDirectory() as d:
   r,carriage=self.release(d);r.add_exclusions()
   row=r.query("SELECT revision,payload FROM documents WHERE kind='carriage'")[0];saved=json.loads(row['payload'])
   self.assertEqual(row['revision'],8)
   self.assertEqual(saved['vipExcludedMembers'],{**carriage['vipExcludedMembers'],**{m:1 for m,_,_ in sync.NEW_EXCLUSIONS}})
   self.assertEqual({k:v for k,v in saved.items() if k!='vipExcludedMembers'},{k:v for k,v in carriage.items() if k!='vipExcludedMembers'})
   self.assertEqual(json.loads(r.query("SELECT payload FROM backups WHERE kind='carriage' AND revision=7")[0]['payload']),carriage,'previous carriage document backed up')
   r.add_exclusions();self.assertEqual(r.query("SELECT revision FROM documents WHERE kind='carriage'")[0]['revision'],8,'second run changes nothing')
 def test_changed_identity_stops_before_any_write(self):
  with tempfile.TemporaryDirectory() as d:
   r,carriage=self.release(d);r.sql.execute("INSERT INTO growth_external_ids VALUES('481129718055','someone-else','x','confirmed','t',NULL,1,1)");r.sql.commit()
   with self.assertRaises(AssertionError):r.add_exclusions()
   self.assertEqual(r.query("SELECT revision FROM documents WHERE kind='carriage'")[0]['revision'],7)
 def test_staging_target_refuses(self):
  with tempfile.TemporaryDirectory() as d:
   r,_=self.release(d,'staging')
   with self.assertRaises(AssertionError):r.add_exclusions()
class Baseline(unittest.TestCase):
 # One-time VIP baseline (user decision 2026-11-12): only listed current members, only on the given KST day, with backup.
 def release(self,d,targets,current,day=None):
  import datetime
  r,carriage=Exclusions.release(self,d)
  r.public=lambda path,**k:json.dumps({'members':[{'memberId':m,'current':True} for m in current]})
  carriage['rotationMembers']=[{'memberId':'driver','name':'driver'}]
  r.sql.execute("UPDATE documents SET payload=? WHERE kind='carriage'",[json.dumps(carriage)]);r.sql.commit()
  path=os.path.join(d,'targets.json');open(path,'w').write(json.dumps({'targets':targets}))
  os.environ['BASELINE_TARGETS']=path;os.environ['BASELINE_ON']=day or (datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=9)).date().isoformat()
  return r,carriage
 def test_sets_only_targets_to_today_with_backup_and_is_idempotent(self):
  with tempfile.TemporaryDirectory() as d:
   r,carriage=self.release(d,['a','b'],['a','b','c']);r.add_baseline()
   row=r.query("SELECT revision,payload FROM documents WHERE kind='carriage'")[0];saved=json.loads(row['payload'])
   self.assertEqual(row['revision'],8);self.assertEqual(set(saved['vipBaseline']),{'a','b'});self.assertEqual(len(set(saved['vipBaseline'].values())),1)
   self.assertEqual({k:v for k,v in saved.items() if k!='vipBaseline'},carriage,'only the baseline changed')
   self.assertEqual(json.loads(r.query("SELECT payload FROM backups WHERE kind='carriage' AND revision=7")[0]['payload']),carriage,'previous carriage document backed up')
   r.add_baseline();self.assertEqual(r.query("SELECT revision FROM documents WHERE kind='carriage'")[0]['revision'],8,'second run changes nothing')
 def test_refuses_non_members_drivers_and_other_days(self):
  with tempfile.TemporaryDirectory() as d:
   r,_=self.release(d,['gone'],['a'])
   with self.assertRaises(AssertionError):r.add_baseline()
   r,_=self.release(d,['driver'],['driver'])
   with self.assertRaises(AssertionError):r.add_baseline()
   yesterday=(__import__('datetime').datetime.now(__import__('datetime').timezone.utc)+__import__('datetime').timedelta(hours=9)-__import__('datetime').timedelta(days=1)).date().isoformat()
   r,_=self.release(d,['a'],['a'],day=yesterday);r.add_baseline()
   self.assertEqual(json.loads(r.query("SELECT payload FROM documents WHERE kind='carriage'")[0]['payload'])['vipBaseline'],{'a':yesterday},'records the asked day even just after midnight')
   r,_=self.release(d,['a'],['a'],day='2000-01-01');r.add_baseline()
   self.assertEqual(r.query("SELECT revision FROM documents WHERE kind='carriage'")[0]['revision'],7,'skipped on a later day')
class FalseLeave(unittest.TestCase):
 def test_marks_only_that_departure_void_and_keeps_the_row(self):
  with tempfile.TemporaryDirectory() as d:
   r,_=Exclusions.release(self,d)
   def api(method,path,body):
    with r.sql:
     r.sql.execute(body['sql'],body['params'])
    return [{'success':True}]
   r.api=api
   ins="INSERT INTO growth_auto_events(event_id,kind,game_id,member_id,source_as_of,created_at,status) VALUES(?,?,?,?,?,1,'recorded')"
   r.sql.execute(ins,['x1','roster_leave','307460940071','game_50373046_307460940071',1794571227000]);r.sql.execute(ins,['x2','roster_leave','999','other',1794571227000]);r.sql.execute(ins,['x3','departure_candidate','307460940071','m',1794571227000]);r.sql.commit()
   r.void_false_leaves();r.void_false_leaves()
   rows={x['event_id']:x for x in r.query('SELECT event_id,status,reason FROM growth_auto_events')}
   self.assertEqual(rows['x1']['status'],'void');self.assertIn('트래커 길드 목록 누락',rows['x1']['reason']);self.assertEqual(rows['x1']['reason'].count('트래커'),1,'second run changes nothing')
   self.assertEqual(rows['x2']['status'],'recorded');self.assertEqual(rows['x3']['status'],'recorded')
   r2,_=Exclusions.release(self,d,'staging')
   with self.assertRaises(AssertionError):r2.void_false_leaves()
if __name__=='__main__':unittest.main()
