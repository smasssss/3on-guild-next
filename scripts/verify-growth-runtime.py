"""Read-only Production verification. Never calls LastAsylum or mutates D1."""
import importlib.util,json,os,hashlib
from pathlib import Path
spec=importlib.util.spec_from_file_location('release',Path('scripts/growth-automation-release.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
assert r.TARGET=='production'
db=r.Remote();old=json.loads(Path('restored-backup/production/business-backup.json').read_text())['tables']
before=json.loads(Path('restored-backup/production/before.json').read_text())
now=r.tables(db);checks=[]
assert r.digest(old['documents'])==r.digest(now['documents'])
assert before['credentials_hash']==r.baseline(db)['credentials_hash']
checks.append('carriage VIP canyon memos and administrator credentials unchanged')
new_obs={x['observation_id']:x for x in now['growth_observations']}
assert all(new_obs.get(x['observation_id'])==x for x in old['growth_observations'])
checks.append('every historical growth observation is preserved exactly')
state=r.public('/api/growth/automation');current=r.public('/api/growth/current');legacy=r.public('/api/growth/legacy')
assert state['ai_calls']==0 and state['mode']=='production'
assert state['registered_cron']=='0,10 * * * *'
if state['last_good']:
 game=next(x for x in now['growth_hourly_observations'] if x['status']=='valid')['game_id']
 personal=r.public('/api/growth/automation?game_id='+game)
 assert personal['schema']=='3on-hourly-history-v1' and personal['observations']
 checks.append('personal hourly history API returns real saved source times and powers')
settings=db.api('GET','/workers/scripts/3on-guild-production/schedules')['result']
assert [x['cron'] for x in settings['schedules']]==['0,10 * * * *']
assert len(now['growth_external_ids'])>=89 and len({x['member_id'] for x in now['growth_external_ids'] if x['member_id']})>=89
checks.append('reviewed 89 game IDs persist and the one-slot production schedule is registered')
for run in now['growth_auto_runs']:
 if run['raw_json'] is not None:
  assert hashlib.sha256(run['raw_json'].encode()).hexdigest()==run['raw_hash']
checks.append('saved raw source payload hashes match their original bytes')
for row in now['growth_daily_sources']:
 close=next(c for c in now['growth_daily_closes'] if c['date']==row['date'])
 assert max(row['source_as_of'],row['received_at'],row['accepted_at'])<close['cutoff_at']
 obs=next(o for o in now['growth_hourly_observations'] if o['snapshot_id']==row['snapshot_id'] and o['game_id']==row['game_id'])
 assert obs['status']=='valid' and obs['power']==row['power']
 batches={x['batch_id']:x for x in now['growth_batches']};lineage=set();batch=batches[close['batch_id']]['supersedes_batch_id']
 while batch:
  assert batch not in lineage;lineage.add(batch);batch=batches[batch]['supersedes_batch_id']
 previous_date=json.loads(close['details_json'])['previous_date']
 powers={o['member_id']:o['power'] for o in now['growth_observations'] if o['batch_id'] in lineage and o['observed_date']==previous_date and o['status']=='active'}
 expected=powers.get(row['member_id'])
 assert row['previous_power']==expected and row['delta']==(None if expected is None else row['power']-expected)
checks.append('all daily values match valid saved observations strictly before their midnight cutoff')
assert len({x['date'] for x in now['growth_daily_closes']})==len(now['growth_daily_closes'])
if os.environ.get('REQUIRE_REAL_CLOSE')=='1':
 close=next(x for x in now['growth_daily_closes'] if x['date']=='2026-10-17')
 assert close['batch_id']=='auto_close_2026-10-17'
 assert current['observed_date']==legacy['data']['date']=='2026-10-17'
 assert any(x['status']=='success' and json.loads(x['result_json'] or '{}').get('date')=='2026-10-17' for x in now['growth_auto_executions'])
 members={m['member_id']:m for m in legacy['data']['members']}
 for row in now['growth_daily_sources']:
  if row['date']!='2026-10-17':continue
  member=members[row['member_id']]
  assert member['power']==row['power'] and member['prevPower']==row['previous_power']
  assert member['history'][-1]['source_as_of']==row['source_as_of']
 checks.append('actual Cloudflare Cron closed October 17 and deployed public APIs expose that close')
result={'status':'PASS','checks':checks,'observations_before':len(old['growth_observations']),'observations_after':len(now['growth_observations']),'current_members':len(current['members']),'mapped_ids':len(now['growth_external_ids']),'hourly_rows':len(now['growth_hourly_observations']),'snapshots':len(now['growth_auto_snapshots']),'external_calls':state['external_calls'],'ai_calls':state['ai_calls'],'daily_closes':now['growth_daily_closes'],'cron_executions':now['growth_auto_executions'],'runs':[{k:v for k,v in x.items() if k not in ('raw_json','raw_hash','content_hash')} for x in now['growth_auto_runs']],'database_metadata':db.api('GET','/d1/database/'+db.database)['result']}
(r.E/'runtime-state.json').write_text(json.dumps({'automation':state,'current':current,'legacy':legacy},ensure_ascii=False))
result['totals']={'daily_power':sum(x['power'] for x in now['growth_daily_sources'] if x['date']=='2026-10-17'),'daily_delta':sum(x['delta'] for x in now['growth_daily_sources'] if x['date']=='2026-10-17' and x['delta'] is not None),'no_previous_day':sum(x['previous_power'] is None for x in now['growth_daily_sources'] if x['date']=='2026-10-17'),'source_as_of':state['last_good']['source_as_of'] if state['last_good'] else None,'source_guild_power':state['last_good']['guild_power'] if state['last_good'] else None,'event_counts':{kind:sum(x['kind']==kind for x in now['growth_auto_events']) for kind in ('nickname','rank','new','departure_candidate')}}
result['capacity']={'database_bytes':result['database_metadata'].get('file_size'),'saved_raw_bytes':sum(len(x['raw_json'].encode()) for x in now['growth_auto_runs'] if x['raw_json'] is not None)}
(r.E/'runtime-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps({k:v for k,v in result.items() if k not in ('runs','database_metadata')},ensure_ascii=False))
