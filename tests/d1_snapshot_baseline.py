"""Verify snapshot reuse without skipping fresh boundary or credential checks."""
import importlib.util,copy
from pathlib import Path
spec=importlib.util.spec_from_file_location('release',Path('scripts/growth-automation-release.py'))
release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)
data={'documents':[{'kind':'carriage','revision':1}], 'growth_meta':[{'key':'identity_revision','value':'2'},{'key':'growth_revision','value':'1'}], 'growth_members':[{'member_id':'m1'}], 'growth_hourly_observations':[]}
class Fake:
 def __init__(self):self.table_reads=0;self.auth_reads=0
 def query(self,sql):
  assert sql=='SELECT * FROM credentials ORDER BY 1',sql
  self.auth_reads+=1;return [{'hash':'test-only-digest-input','expires':999}]
def capture(db):
 db.table_reads+=1;return copy.deepcopy(data)
release.tables=capture
db=Fake();snapshot=release.tables(db);expected=release.baseline(db,snapshot)
assert db.table_reads==1 and db.auth_reads==1
assert expected['growth_meta']==sorted(data['growth_meta'],key=lambda r:r['key'])
assert 'growth_hourly_observations' not in expected['tables']
assert release.baseline(db,snapshot)==expected
assert db.table_reads==1 and db.auth_reads==2,'credentials must always be freshly verified'
assert release.baseline(db)==expected
assert db.table_reads==2 and db.auth_reads==3,'a new boundary must still capture fresh tables'
snapshot['documents'][0]['revision']=2
assert release.baseline(db,snapshot)!=expected,'changed snapshot cannot pass the invariant'
print('SNAPSHOT_BASELINE_PASS: explicit snapshot reuse; fresh boundaries; credential checks; changed data rejected')
