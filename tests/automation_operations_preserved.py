"""Compare the actual Production-base functions with the generated release UI."""
from pathlib import Path
import importlib.util,json
spec=importlib.util.spec_from_file_location('operations',Path(__file__).with_name('operations_regression.py'));ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)
before=Path('public/legacy.html').read_text();after=Path('dist/client/legacy.html').read_text()
checks={name:ops.function(before,name)==ops.function(after,name).replace('state.vipExcludedMembers?.[m.member_id]!==1&&','') for name in ops.PRODUCTION_FUNCTION_SHA256}
assert after.count('state.vipExcludedMembers?.[m.member_id]!==1&&')==1, 'Only the authorized VIP picker filter may differ'
assert all(checks.values()),checks
assert '/growth-auto.js' in after and '3on-growth-auto-refresh' in after
assert "const SHARED_DB_URL='';" in after
print(json.dumps({'status':'PASS','unchanged_operation_auth_functions':len(checks)-1,'authorized_vip_filter_only':True,'growth_enhancement':True,'same_origin':True}))
