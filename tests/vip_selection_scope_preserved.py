"""VIP selection (2026-11-05) changes only its runtime allowlist relative to the deployed release."""
import subprocess
from pathlib import Path
base='82daba8f3032198bdec65c2e9dda7057d7da6309'
allowed={'lib/vip-weekly.ts','lib/validate.ts','app/api/carriage/vip/route.ts','public/carriage-vip.js','public/ops-theme.css','public/ops-theme-growth.css','public/fonts/cafe24-syongsyong.woff'}
roots=['app','lib','public','build','drizzle']
tracked=subprocess.check_output(['git','ls-tree','-r','--name-only',base,'--',*roots,'package.json','package-lock.json','vite.config.ts'],text=True).splitlines()
for name in tracked:
 if name not in allowed:assert Path(name).read_bytes()==subprocess.check_output(['git','show',base+':'+name]),name
extra={str(p) for r in roots for p in Path(r).rglob('*') if p.is_file()}-set(tracked)
assert extra<=allowed,extra-allowed
print('PASS: only VIP selection files changed; roster sync, growth, carriage dates/rotation, canyon, auth, schema unchanged')
