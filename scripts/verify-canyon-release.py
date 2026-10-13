"""Read-only release checks; no SQL mutations or migrations."""
import importlib.util,json,hashlib,sys,subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('support',Path(__file__).with_name('repair-production-growth.py'));support=importlib.util.module_from_spec(spec);spec.loader.exec_module(support)
E=support.EVIDENCE
def live_html():return subprocess.run(['curl','--fail','--silent','--show-error','--max-time','60',support.ORIGIN+'/legacy'],check=True,capture_output=True).stdout
def baseline(db):
 return {'documents_hash':support.digest(support.documents(db)),'observations_hash':support.digest(db.query('SELECT * FROM growth_observations ORDER BY observation_id')),'growth_current':support.public('/api/growth/current')}
db=support.Remote();E.mkdir(exist_ok=True)
if sys.argv[1]=='inspect':
 html=live_html();assert hashlib.sha256(html).hexdigest()=='8af6b626c5c043ab4be758b932e5915c08faadd7c1695f2b897d1bb7500fed28','Another release changed Production; refusing to deploy stale source'
 (E/'before.json').write_text(json.dumps(baseline(db),ensure_ascii=False,indent=2))
 print('Existing Worker binding and current release baseline: PASS')
else:
 before=json.loads((E/'before.json').read_text());after=baseline(db);assert before==after,'Stored growth or operational data changed during release'
 html=live_html();expected=Path('public/legacy.html').read_bytes();assert html==expected,'Production HTML differs from the tested release'
 state=support.public('/api/state');power=next(d for d in state['documents'] if d['kind']=='power');latest=max(w['date'] for w in power['data']['weeks'])
 result={'status':'PASS','latest_canyon_date':latest,'latest_canyon_members':len(next(w for w in power['data']['weeks'] if w['date']==latest)['members']),'growth_date':after['growth_current']['observed_date'],'growth_members':len(after['growth_current']['members']),'all_saved_data_preserved':True,'tested_source_deployed':True}
 (E/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False))
