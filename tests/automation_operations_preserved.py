"""Compare the actual Production-base functions with the generated release UI."""
from pathlib import Path
import importlib.util,json
spec=importlib.util.spec_from_file_location('operations',Path(__file__).with_name('operations_regression.py'));ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)
before=Path('public/legacy.html').read_text();after=Path('dist/client/legacy.html').read_text()
checks={name:ops.function(before,name)==ops.function(after,name) for name in ops.PRODUCTION_FUNCTION_SHA256}
assert after.count('src="/carriage-vip.js"')==1, 'Weekly VIP adapter must be included exactly once'
assert 'renderCarriageVipResults();' in ops.function(after,'renderVipResults')
assert all(checks.values()),checks
assert '/growth-auto.js' in after and '3on-growth-auto-refresh' in after
assert "const SHARED_DB_URL='';" in after
print(json.dumps({'status':'PASS','unchanged_operation_auth_functions':len(checks)-1,'weekly_vip_adapter_once':True,'growth_enhancement':True,'same_origin':True}))
