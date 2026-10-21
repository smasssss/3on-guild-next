"""Code-only D1 read optimization release: no schema or business-data mutations."""
import sys,json,importlib.util,subprocess,re
from pathlib import Path
spec=importlib.util.spec_from_file_location('release',Path('scripts/growth-automation-release.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
EXPECTED_DB={'staging':'9c3667a6-e510-40a6-b4e6-4852515fdb3a','production':'31e3bbb6-2860-40cb-9390-d989d37f11c2'}
EXPECTED_VERSION={'staging':'fd2e1076-3cd5-4e7b-a4fd-058582c6fa70','production':'e407142a-0784-4fe0-9309-b7a6d2458e4c'}
def active(value):
 rows=value.get('deployments',[]) if isinstance(value,dict) else value
 assert rows,'Missing deployment history'
 versions=rows[0]['versions'];assert len(versions)==1 and versions[0]['percentage']==100,'Split deployment needs separate review'
 return versions[0]['version_id']
def configure(db):
 assert db.database==EXPECTED_DB[r.TARGET],'Unexpected D1 binding'
 previous=json.loads((r.E/'deployments-before.json').read_text())
 version=active(previous)
 assert version==EXPECTED_VERSION[r.TARGET],('Worker changed since investigation',version)
 assert active(db.api('GET','/workers/scripts/'+r.WORKER+'/deployments')['result'])==version,'Worker changed after backup'
 assert r.baseline(db)==json.loads((r.E/'before.json').read_text()),'Business data changed after backup'
 schedules=db.api('GET','/workers/scripts/'+r.WORKER+'/schedules')['result']
 schedule_rows=schedules.get('schedules',[]) if isinstance(schedules,dict) else schedules
 crons=[s['cron'] for s in schedule_rows]
 assert set(crons)==({'0,10 * * * *'} if r.TARGET=='production' else set()),'Unexpected Cron configuration'
 assert all(b['type'] in ('plain_text','secret_text','d1','assets') for b in db.settings['bindings']),'Unsupported binding'
 cfg={'name':r.WORKER,'main':'dist/server/index.js','compatibility_date':db.settings.get('compatibility_date','2026-05-15'),'compatibility_flags':db.settings.get('compatibility_flags',['nodejs_compat']),'no_bundle':True,'rules':[{'type':'ESModule','globs':['**/*.js','**/*.mjs']}],'assets':{'directory':'dist/client'},'d1_databases':[{'binding':'DB','database_id':db.database}],'observability':db.settings.get('observability') or {'enabled':True},'triggers':{'crons':crons}}
 cfg['vars']={b['name']:b['text'] for b in db.settings['bindings'] if b['type']=='plain_text'}
 assert cfg['vars'].get('GROWTH_AUTO_MODE')==('production' if r.TARGET=='production' else 'fixture'),'Unexpected automation mode'
 Path('wrangler.d1-optimization.generated.json').write_text(json.dumps(cfg,indent=2)+'\n')
 (r.E/'rollback-version.json').write_text(json.dumps({'worker':r.WORKER,'version':version}))
 print(json.dumps({'status':'CODE_ONLY_CONFIGURED','target':r.TARGET,'previous_version':version,'schema_writes':0,'business_writes':0,'schedules':crons}))
def compare(db):
 assert db.database==EXPECTED_DB[r.TARGET]
 old="SELECT o.* FROM growth_external_ids e JOIN growth_hourly_observations o ON o.game_id=e.game_id AND o.snapshot_id=(SELECT x.snapshot_id FROM growth_hourly_observations x WHERE x.game_id=e.game_id AND x.status='valid' ORDER BY x.source_as_of DESC LIMIT 1)"
 source=Path('lib/growth-automation.ts').read_text()
 new=re.search(r'export const LATEST_VALID_HOURLY_SQL = `([^`]+)`;',source).group(1)
 # D1 batch gives both read queries one transactional view, with no writes.
 results=db.api('POST','/d1/database/'+db.database+'/query',{'batch':[{'sql':old,'params':[]},{'sql':new,'params':[]}]})['result']
 assert len(results)==2 and all(x.get('success',True) for x in results)
 canonical=lambda rows:sorted(rows,key=lambda x:x['game_id'])
 assert canonical(results[0]['results'])==canonical(results[1]['results']),'Lookup results differ'
 before,after=[x['meta']['rows_read'] for x in results]
 assert all(x['meta']['rows_written']==0 for x in results)
 assert before+after<250000,'Diagnostic read budget exceeded'
 proof={'status':'READ_ONLY_LOOKUP_COMPARISON_PASS','target':r.TARGET,'members':len(results[0]['results']),'before_rows_read':before,'after_rows_read':after,'reduction_percent':round((1-after/before)*100,2) if before else None,'rows_written':0}
 if r.TARGET=='production':assert after<before,'Production lookup did not improve'
 (r.E/'d1-read-comparison.json').write_text(json.dumps(proof,indent=2))
 print(json.dumps(proof))
def rollback(db):
 version=json.loads((r.E/'rollback-version.json').read_text())['version']
 subprocess.run(['npx','wrangler','rollback',version,'--name',r.WORKER,'--yes'],check=True)
 assert active(db.api('GET','/workers/scripts/'+r.WORKER+'/deployments')['result'])==version
 print(json.dumps({'status':'ROLLBACK_VERIFIED','target':r.TARGET,'version':version}))
if __name__=='__main__':
 db=r.Remote();{'configure':configure,'compare':compare,'rollback':rollback}[sys.argv[1]](db)
