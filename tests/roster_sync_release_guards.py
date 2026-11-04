"""Roster-sync Staging fixtures: 3-collection setup/rejoin/cleanup restore every row; Production refuses writes."""
import importlib.util,os,tempfile,unittest
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
if __name__=='__main__':unittest.main()
