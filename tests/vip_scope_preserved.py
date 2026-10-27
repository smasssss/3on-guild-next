"""Protect the current operational baseline, rather than the obsolete main branch."""
import importlib.util,json,subprocess,re
from pathlib import Path
spec=importlib.util.spec_from_file_location('ops','tests/operations_regression.py');ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)
base='8caefa5c8b0259f847ab72180016d045d8566f60'
old=subprocess.check_output(['git','show',base+':public/legacy.html'],text=True);new=Path('public/legacy.html').read_text()
for name in ops.PRODUCTION_FUNCTION_SHA256:
 if name not in {'renderForm','renderVipResults'}:assert ops.function(old,name)==ops.function(new,name),name
for path in ['lib/growth-automation.ts','lib/growth.ts','lib/store.ts','lib/growth-changes.ts','public/growth-auto.js','public/carriage-date.js','app/api/growth/legacy/route.ts','app/globals.css','build/sites-worker.ts']:
 assert subprocess.check_output(['git','show',base+':'+path])==Path(path).read_bytes(),path
for pattern in [r'const VIP_IMPORT=(\{.*?\});',r'const baseRotation=(\[[^;]+\]);',r'id="growthPayload">([^<]+)']:
 assert re.search(pattern,old,re.S).group(1)==re.search(pattern,new,re.S).group(1),pattern
assert not subprocess.check_output(['git','diff',base,'--','drizzle']), 'No schema or initial seed migration change'
print(json.dumps({'status':'PASS','source':base,'vip_baseline_growth_cron_canyon_auth_dates_preserved':True,'migration_changes':0}))
