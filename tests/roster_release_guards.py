"""Exercise exact Staging fixture SQL and prove it cannot run on Production."""
import importlib.util,io,json,os,sqlite3,tempfile,unittest,urllib.error
from unittest.mock import patch
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
class Transport(unittest.TestCase):
 def error(self):return urllib.error.HTTPError('https://example.invalid',500,'transient',{},io.BytesIO(b'{}'))
 def release(self):return object.__new__(module.Release)
 def test_transient_read_is_bounded_and_retried(self):
  r=self.release()
  with patch.object(module.base.Release,'api',side_effect=[self.error(),{'ok':True}]) as call,patch.object(module.time,'sleep'):
   self.assertEqual(r.api('GET','/workers/x/settings'),{'ok':True});self.assertEqual(call.call_count,2)
 def test_mutation_is_never_retried(self):
  r=self.release()
  with patch.object(module.base.Release,'api',side_effect=self.error()) as call:
   with self.assertRaises(urllib.error.HTTPError):r.api('POST','/workers/x/deployments',{})
   self.assertEqual(call.call_count,1)
 def test_failed_response_with_observed_version_does_not_repeat_write(self):
  r=self.release();r.active=lambda:'reviewed'
  with patch.object(module.base.Release,'activate',side_effect=self.error()) as call:
   r.activate('reviewed','message');self.assertEqual(call.call_count,1)
 def test_unapplied_failed_write_is_not_treated_as_success(self):
  r=self.release();r.active=lambda:'old'
  with patch.object(module.base.Release,'activate',side_effect=self.error()) as call,patch.object(module.time,'sleep'):
   with self.assertRaises(urllib.error.HTTPError):r.activate('reviewed','message')
   self.assertEqual(call.call_count,1)
 def test_read_failure_stops_after_three_attempts(self):
  r=self.release()
  with patch.object(module.base.Release,'api',side_effect=[self.error(),self.error(),self.error()]) as call,patch.object(module.time,'sleep'):
   with self.assertRaises(urllib.error.HTTPError):r.api('GET','/workers/x/settings')
   self.assertEqual(call.call_count,3)
if __name__=='__main__':unittest.main()
