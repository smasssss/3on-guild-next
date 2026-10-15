"""Read-only release verification for growth change-history projection."""
import importlib.util,json,hashlib,sys,subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('support',Path(__file__).with_name('repair-production-growth.py'));support=importlib.util.module_from_spec(spec);spec.loader.exec_module(support)
E=support.EVIDENCE

def live_html():return subprocess.run(['curl','--fail','--silent','--show-error','--max-time','60',support.ORIGIN+'/legacy'],check=True,capture_output=True).stdout

def baseline(db):
 tables=db.query("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'growth_%' ORDER BY name")
 hashes={}
 for table in tables:
  name=table['name'];columns='*' if name!='growth_review_assets' else 'asset_id,batch_id,row_id,mime_type,hex(bytes) bytes_hex,size_bytes,expires_at,created_at'
  hashes[name]=support.digest(db.query('SELECT '+columns+' FROM '+name+' ORDER BY 1'))
 return {'documents_hash':support.digest(support.documents(db)),'growth_tables':hashes,'growth_current':support.public('/api/growth/current')}

db=support.Remote();E.mkdir(exist_ok=True)
if sys.argv[1]=='inspect':
 assert hashlib.sha256(live_html()).hexdigest()=='c1026035b26b3a244b2a862aa671c1b6cec971042e05c708289c46d2604ae4cf','Production source changed; refusing stale release'
 before=baseline(db);assert before['growth_current']['revision']==14 and len(before['growth_current']['members'])==84
 (E/'before.json').write_text(json.dumps(before,ensure_ascii=False,indent=2))
 print('Existing Worker, exact deployed source and 84-member baseline: PASS')
else:
 before=json.loads((E/'before.json').read_text());after=baseline(db);assert before==after,'Saved growth or operational data changed'
 assert live_html()==Path('public/legacy.html').read_bytes(),'Published HTML does not match tested source'
 data=support.public('/api/growth/legacy')['data'];events=data['changeHistory']
 expected={('볼트트','2026-10-11'),('또때려줘','2026-10-11'),('여우여우','2026-10-12'),('용퍕이','2026-10-13'),('별땀임','2026-10-13'),('happymong','2026-10-14'),('순두아빠순두부','2026-10-15')}
 assert expected.issubset({(e['displayName'],e['date']) for e in events if e['kind']=='departure'})
 assert len([e for e in events if e['kind']=='rank' and e['date']=='2026-10-13'])==2
 assert len([e for e in events if e['kind']=='level' and e['date']=='2026-10-13'])==13
 for a,b,date in [('제시맘','홍시','2026-10-11'),('홍시','제시맘','2026-10-12'),('llllllllii','귀여운llllllllii','2026-10-12')]:
  assert any(e['kind']=='nickname' and e['from']==a and e['to']==b and e['date']==date for e in events),(a,b,date)
 assert len([m for m in data['missing'] if m.get('confirmedDeparture')])==7
 assert any(e['kind']=='rejoin' and e['displayName']=='공 주' and e['date']=='2026-10-15' for e in events)
 assert any(e['kind']=='level' and e['displayName']=='lucky--' and e['date']=='2026-10-15' for e in events)
 result={'status':'PASS','date':data['date'],'members':data['guildCount'],'confirmed_departures':sorted(expected),'dated_change_events':len(events),'all_saved_data_preserved':True}
 (E/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False))
