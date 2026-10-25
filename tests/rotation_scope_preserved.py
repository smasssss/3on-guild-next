"""Pin changes to rotation behavior and preserve unrelated deployed functions."""
import importlib.util,re,subprocess,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('ops',Path(__file__).with_name('operations_regression.py'))
ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)
BASE='bb614a1'
old=subprocess.check_output(['git','show',BASE+':public/legacy.html'],text=True)
new=Path('public/legacy.html').read_text()
allowed={'nextBase','nextBaseAfter','renderForm','renderRoutes','renderSettings','validateState','rebuildPointer','bindProduction','pointerFromRecords','mergeOperations','sharedDraftOpen'}
def functions(source):
 matches=list(re.finditer(r'^(?:async )?function (\w+)\(',source,re.M))
 return {m.group(1):source[m.start():matches[i+1].start() if i+1<len(matches) else len(source)] for i,m in enumerate(matches)}
a,b=functions(old),functions(new)
names=set(a)
changed={n for n in names if a[n]!=b[n]}
assert changed==allowed,(changed,allowed)
for name in names-allowed:assert a[name]==b[name],name
assert re.search(r'const baseRotation=([^;]+)',old).group(1)==re.search(r'const baseRotation=([^;]+)',new).group(1)
assert re.search(r'id="growthPayload">([^<]+)',old).group(1)==re.search(r'id="growthPayload">([^<]+)',new).group(1)
for path in ['lib/growth-automation.ts','lib/growth.ts','lib/store.ts','public/growth-auto.js','public/carriage-date.js','app/globals.css','app/api/state/route.ts','build/sites-worker.ts']:
 assert subprocess.check_output(['git','show',BASE+':'+path])==Path(path).read_bytes(),path
print(json.dumps({'status':'PASS','unrelated_functions_exact':len(names-allowed),'rotation_functions_changed':sorted(changed),'growth_cron_auth_vip_canyon_unchanged':True}))
