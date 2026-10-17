"""Exercise the deployed Staging Worker with reused responses; never LastAsylum."""
import os,json,sys,importlib.util,urllib.request,urllib.error,datetime
from pathlib import Path
spec=importlib.util.spec_from_file_location('release',Path('scripts/growth-automation-release.py'));r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
assert r.TARGET=='staging';db=r.Remote();before=r.tables(db);base='https://3on-guild-staging.295server.workers.dev';token=''
def call(path,body=None,auth=True,expected=200):
 headers={'Content-Type':'application/json','Origin':base}
 if auth and token:headers['Authorization']='Bearer '+token
 req=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers=headers)
 try:
  with urllib.request.urlopen(req,timeout=60) as res:status=res.status;out=json.load(res)
 except urllib.error.HTTPError as e:status=e.code;out=json.load(e)
 assert status==expected,(path,status,out);return out
def ms(s):return int(datetime.datetime.fromisoformat(s.replace('Z','+00:00')).timestamp()*1000)
checks=[]
try:
 password=os.environ.get('STAGING_ADMIN_PASSWORD','');assert password,'Existing Staging admin secret unavailable'
 token=call('/api/session',{'password':password},False)['token']
 assert call('/api/session')['admin'];call('/api/growth/automation?admin=1',auth=False,expected=401)
 checks.append('existing administrator authentication and unauthenticated write protection')
 synthetic=json.loads(Path('tests/fixtures/lastasylum-50373046.json').read_text())
 current=call('/api/growth/current')['members'];assert len(current)==89
 links=[{'game_id':row['id'],'member_id':member['member_id'],'source_name':row['name'],'evidence':'Staging synthetic fixture only'} for row,member in zip(synthetic['roster'],current)]
 call('/api/growth/automation',{'action':'bootstrap','mappings':links})
 data=json.loads(Path('tests/fixtures/lastasylum-50373046.json').read_text())
 data['asOf']=ms('2026-10-18T14:00:00Z')//1000;data['roster']=data['roster'][:88];data['members']=88
 a=call('/api/growth/automation',{'action':'fixture','data':data,'called_at':ms('2026-10-18T14:01:00Z')})
 n=len(db.query('SELECT * FROM growth_hourly_observations'));assert n==88
 a=call('/api/growth/automation',{'action':'fixture','data':data,'called_at':ms('2026-10-18T14:02:00Z')});assert a['result']['status']=='duplicate';assert len(db.query('SELECT * FROM growth_hourly_observations'))==n
 checks.append('real D1 duplicate raw JSON creates no additional observations')
 data=json.loads(Path('tests/fixtures/lastasylum-50373046.json').read_text());data['asOf']=ms('2026-10-18T14:50:00Z')//1000
 data['roster'][0]['name']='STAGING_닉변시험';data['roster'][0]['rank']=3
 call('/api/growth/automation',{'action':'fixture','data':data,'called_at':ms('2026-10-18T14:51:00Z')})
 last_power=data['roster'][0]['power'];game_id=data['roster'][0]['id']
 state=call('/api/growth/automation?admin=1');assert state['last_good']['member_count']==89;assert state['external_calls']==0
 assert any(e['kind']=='nickname' for e in state['events']);assert any(e['kind']=='rank' for e in state['events'])
 assert len(db.query('SELECT * FROM growth_observations'))==len(before['growth_observations'])
 checks.append('88 to 89 roster, ID-preserving nickname/rank events, hourly/daily separation')
 data['asOf']=ms('2026-10-18T15:00:00Z')//1000;data['roster'][0]['power']+=1234
 call('/api/growth/automation',{'action':'fixture','data':data,'called_at':ms('2026-10-18T15:00:01Z')})
 result=call('/api/growth/automation',{'action':'close','date':'2026-10-18','now':ms('2026-10-18T15:10:00Z')})
 assert result['result']['members']==89
 selected=db.query('SELECT * FROM growth_daily_sources WHERE game_id='+r.quote(game_id))[0];assert selected['power']==last_power;assert selected['source_as_of']<ms('2026-10-18T15:00:00Z')
 count=len(db.query('SELECT * FROM growth_observations'));again=call('/api/growth/automation',{'action':'close','date':'2026-10-18','now':ms('2026-10-18T15:11:00Z')});assert again['result']['duplicate'];assert len(db.query('SELECT * FROM growth_observations'))==count
 assert call('/api/growth/current')['observed_date']=='2026-10-18';legacy=call('/api/growth/legacy');assert legacy['data']['date']=='2026-10-18'
 assert next(m for m in legacy['data']['members'] if m['member_id']==selected['member_id'])['history'][-1]['power']==last_power
 checks.append('deployed Worker midnight exclusion, close idempotence and existing growth API/history')
 assert call('/api/growth/automation')['external_calls']==0
 call('/api/growth/automation',{'action':'collect'});assert call('/api/growth/automation')['external_calls']==0
 checks.append('closing and Staging collection make zero external calls')
 # Preserve evidence without credentials or tokens.
 (r.E/'staging-fixture-state.json').write_text(json.dumps(state,ensure_ascii=False,indent=2));(r.E/'staging-fixture-legacy.json').write_text(json.dumps(legacy,ensure_ascii=False))
finally:
 # Restore only fixture-created rows and changed growth fields to the pretest snapshot.
 # Never touch carriage/VIP/canyon/documents or any credentials.
 auto_names=[n for n in before if n.startswith(('growth_auto_','growth_hourly_','growth_external_','growth_daily_'))]
 for name in auto_names:
  db.execute('DELETE FROM '+name+';')
  for row in before[name]:
   cols=list(row);vals=['NULL' if row[c] is None else str(row[c]) if isinstance(row[c],(int,float)) else r.quote(row[c]) for c in cols]
   db.execute('INSERT INTO '+name+'('+','.join(cols)+') VALUES('+','.join(vals)+');')
 for name,key in [('growth_observations','observation_id'),('growth_batch_rows','row_id'),('growth_membership_snapshots','batch_id'),('growth_publications','publication_id'),('growth_mutations','mutation'),('growth_tx_guards','guard_id'),('growth_batches','batch_id')]:
  old={row[key] for row in before[name]};current=db.query('SELECT DISTINCT '+key+' FROM '+name)
  extra=[row[key] for row in current if row[key] not in old]
  if extra:db.execute('DELETE FROM '+name+' WHERE '+key+' IN('+','.join(map(r.quote,extra))+');')
 for name,key,columns in [('growth_members','member_id',['display_name']),('growth_meta','key',['value','updated_at']),('growth_batches','batch_id',['state','updated_at']),('growth_publications','publication_id',['status'])]:
  current={row[key]:row for row in db.query('SELECT * FROM '+name)};updates=[]
  for row in before[name]:
   if any(current[row[key]][c]!=row[c] for c in columns):updates.append('UPDATE '+name+' SET '+','.join(c+'='+('NULL' if row[c] is None else r.quote(row[c])) for c in columns)+' WHERE '+key+'='+r.quote(row[key])+';')
  if updates:db.execute('\n'.join(updates))
 if token:call('/api/session',{'action':'logout'})
after=r.tables(db);assert r.digest(before)==r.digest(after),'Staging fixture cleanup did not restore existing data'
checks.append('all pretest Staging business data restored exactly; carriage and VIP preserved')
(r.E/'staging-tests.json').write_text(json.dumps({'status':'PASS','checks':checks,'external_calls':0,'real_d1':True},ensure_ascii=False,indent=2));print(json.dumps({'status':'PASS','checks':checks,'external_calls':0}))
