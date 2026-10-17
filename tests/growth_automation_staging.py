"""Real Staging D1 test; use authorized management API, never blocked website login."""
import os,json,importlib.util,subprocess,tempfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('release',Path('scripts/growth-automation-release.py'));r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
assert r.TARGET=='staging';db=r.Remote();before=r.tables(db);auth_before=r.baseline(db)['credentials_hash']
try:
 data=json.loads(Path('tests/fixtures/lastasylum-50373046.json').read_text());current=r.public('/api/growth/current')['members'];assert len(current)==89
 links=[{'game_id':row['id'],'member_id':member['member_id'],'source_name':row['name']} for row,member in zip(data['roster'],current)]
 for row,member in zip(data['roster'],current):row['power']=member['power'];row['castle']=max(25,member['level'])
 with tempfile.TemporaryDirectory() as temp:
  fixture=Path(temp)/'fixture.json';fixture.write_text(json.dumps({'worker':'3on-guild-staging','links':links,'data':data},ensure_ascii=False))
  subprocess.run(['node','tests/growth_automation_remote.cjs'],check=True,env={**os.environ,'STAGING_D1_ID':db.database,'STAGING_RUNTIME_FIXTURE':str(fixture)})
 result=json.loads((r.E/'staging-tests.json').read_text());legacy=r.public('/api/growth/legacy');current=r.public('/api/growth/current')
 assert current['observed_date']==legacy['data']['date']=='2026-10-18'
 assert next(m for m in legacy['data']['members'] if m['member_id']==result['first_member_id'])['history'][-1]['power']==result['expected_power']
 (r.E/'staging-fixture-legacy.json').write_text(json.dumps(legacy,ensure_ascii=False))
 result['checks'].append('deployed Worker current/legacy APIs expose the real D1 close and original member history')
finally:
 # Restore only fixture-created rows and changed growth fields to the pretest snapshot.
 # Never touch carriage/VIP/canyon/documents or any credentials.
 auto_names=[n for n in before if n.startswith(('growth_auto_','growth_hourly_','growth_external_','growth_daily_'))]
 for name in auto_names:
  db.execute('DELETE FROM '+name+';')
  for row in before[name]:
   cols=list(row);vals=['NULL' if row[c] is None else str(row[c]) if isinstance(row[c],(int,float)) else r.quote(row[c]) for c in cols]
   db.execute('INSERT INTO '+name+'('+','.join(cols)+') VALUES('+','.join(vals)+');')
 for name,key in [('growth_observations','observation_id'),('growth_batch_rows','row_id'),('growth_batch_sources','batch_id'),('growth_membership_snapshots','batch_id'),('growth_publications','publication_id'),('growth_mutations','mutation'),('growth_tx_guards','guard_id'),('growth_identity_decisions','decision_id'),('growth_batches','batch_id')]:
  old={row[key] for row in before[name]};current=db.query('SELECT DISTINCT '+key+' FROM '+name)
  extra=[row[key] for row in current if row[key] not in old]
  if extra:db.execute('DELETE FROM '+name+' WHERE '+key+' IN('+','.join(map(r.quote,extra))+');')
 for name,key,columns in [('growth_members','member_id',['display_name']),('growth_meta','key',['value','updated_at']),('growth_batches','batch_id',['state','updated_at']),('growth_publications','publication_id',['status'])]:
  current={row[key]:row for row in db.query('SELECT * FROM '+name)};updates=[]
  for row in before[name]:
   if any(current[row[key]][c]!=row[c] for c in columns):updates.append('UPDATE '+name+' SET '+','.join(c+'='+('NULL' if row[c] is None else r.quote(row[c])) for c in columns)+' WHERE '+key+'='+r.quote(row[key])+';')
  if updates:db.execute('\n'.join(updates))
after=r.tables(db);assert r.digest(before)==r.digest(after),'Staging test cleanup changed existing business data'
assert r.baseline(db)['credentials_hash']==auth_before,'Existing administrator credentials changed'
result['checks'].append('exact Staging business data and authentication restoration; carriage/VIP preserved')
(r.E/'staging-tests.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps({'status':'PASS','checks':result['checks'],'external_calls':0}))
