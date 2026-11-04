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
if __name__=='__main__':unittest.main()
