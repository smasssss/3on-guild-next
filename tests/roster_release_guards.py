"""Exercise exact Staging fixture SQL and prove it cannot run on Production."""
import importlib.util,json,os,sqlite3,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('roster_release',Path(__file__).resolve().parents[1]/'scripts/growth-roster-release.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class Local(module.Release):
 def __init__(self,directory,target='staging'):
  self.target=target;self.root=Path(directory);self.database='local';self.origin='http://localhost';self.sql=sqlite3.connect(':memory:');self.sql.row_factory=sqlite3.Row
  for p in sorted(Path('drizzle').glob('*.sql')):self.sql.executescript(p.read_text().replace('--> statement-breakpoint',''))
  self.save('before.json',{'invariant':self.invariant()})
 def invariant(self):return {'all_data':module.base.digest('\n'.join(self.sql.iterdump()))}
 def query(self,sql,params=None):return [dict(r) for r in self.sql.execute(sql,params or [])]
 def api(self,method,path,body):
  assert method=='POST' and self.target=='staging'
  with self.sql:
   result=[]
   for s in body['batch']:
    c=self.sql.execute(s['sql'],s['params']);result.append({'success':True,'meta':{'changes':c.rowcount}})
  return result
class Guards(unittest.TestCase):
 def test_fixture_setup_rejoin_and_cleanup_preserve_every_original_row(self):
  with tempfile.TemporaryDirectory() as d:
   r=Local(d);before=r.invariant();os.environ['GITHUB_RUN_ID']='local_roster_guard'
   r.fixture_setup();f=r.load('fixture.json')
   self.assertEqual(r.query('SELECT COUNT(*) n FROM growth_hourly_observations WHERE snapshot_id=?',[f['snapshot']])[0]['n'],2)
   self.assertEqual(r.query('SELECT COUNT(*) n FROM growth_membership_snapshots WHERE batch_id=?',[f['batch']])[0]['n'],3)
   r.fixture_rejoin();self.assertEqual(r.load('browser-input.json')['expectedCount'],3)
   r.fixture_cleanup();self.assertEqual(r.invariant(),before)
 def test_production_refuses_every_fixture_mutation(self):
  with tempfile.TemporaryDirectory() as d:
   r=Local(d,'production')
   for action in [r.fixture_setup,r.fixture_rejoin,r.fixture_cleanup]:
    with self.assertRaises(AssertionError):action()
   with self.assertRaises(AssertionError):r.fixture_batch([{'sql':'INSERT INTO growth_members VALUES(?)','params':['x']}])
if __name__=='__main__':unittest.main()
