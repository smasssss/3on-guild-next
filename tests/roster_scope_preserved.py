"""Current roster repair changes only its explicit runtime allowlist."""
import subprocess
from pathlib import Path
base='af25ab2b8b6ea09c942d4393defa8c479236d62e'
allowed={'lib/growth-roster.ts','lib/growth.ts','lib/growth-automation.ts','app/api/growth/legacy/route.ts'}
roots=['app','lib','public','build','drizzle']
tracked=subprocess.check_output(['git','ls-tree','-r','--name-only',base,'--',*roots,'package.json','package-lock.json','vite.config.ts','wrangler.jsonc'],text=True).splitlines()
for name in tracked:
 if name not in allowed:assert Path(name).read_bytes()==subprocess.check_output(['git','show',base+':'+name]),name
extra={str(p) for r in roots for p in Path(r).rglob('*') if p.is_file()}-set(tracked)
assert extra<=allowed,extra-allowed
print('PASS: VIP rules/ordering/counts/exclusions, carriage dates/rotation, canyon/memos/auth/UI/config/schema and all other runtime files unchanged')
