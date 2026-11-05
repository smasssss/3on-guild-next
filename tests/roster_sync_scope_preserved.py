"""Roster sync (2026-11-04) changes only its explicit runtime allowlist and keeps VIP policy text exact."""
import re,subprocess
from pathlib import Path
base='8276206ec1a7061a1e12cc30a68c5c65f1cd9328'
allowed={'lib/growth-roster.ts','lib/growth-automation.ts','lib/vip-weekly.ts','app/api/carriage/vip/route.ts','public/carriage-vip.js','public/growth-auto.js','public/legacy.html','public/ops-theme.css','public/ops-theme-growth.css','public/ops-names.js'}
roots=['app','lib','public','build','drizzle']
show=lambda name:subprocess.check_output(['git','show',base+':'+name])
tracked=subprocess.check_output(['git','ls-tree','-r','--name-only',base,'--',*roots,'package.json','package-lock.json','vite.config.ts','wrangler.jsonc'],text=True).splitlines()
for name in tracked:
 if name not in allowed:assert Path(name).read_bytes()==show(name),name
extra={str(p) for r in roots for p in Path(r).rglob('*') if p.is_file()}-set(tracked)
assert extra<=allowed,extra-allowed
# VIP threshold, temporary list, Sunday activation, eligibility, exclusions and assignment checks are byte-identical.
old,new=show('lib/vip-weekly.ts').decode(),Path('lib/vip-weekly.ts').read_text()
for pattern in [r"export const THRESHOLD = .*?;",r"const TEMPORARY = .*?;",r"export const effectiveOn = .*?\n",r"export function weekOf.*?\n",r"export function weeklyView.*?\n}\n",r"export function eligibility.*?\n}\n",r"export function protectExclusions.*?\n}\n",r"export function validateAssignments.*?\n}\n",r"export function replaceWeekly.*?\n}\n"]:
 a=re.search(pattern,old,re.S).group(0);assert a in new,pattern
# Departure/identity writes and the manual upload/review/publish paths are untouched.
for name in ['app/api/growth/upload/route.ts','app/api/growth/review/route.ts','app/api/growth/publish/route.ts','app/api/state/route.ts','public/carriage-rotation.js','public/carriage-date.js']:assert Path(name).read_bytes()==show(name),name
print('PASS: only roster-sync runtime files changed; VIP threshold/temporary/Sunday/eligibility/exclusions/assignment, rotation, dates, manual upload/review/publish and schema unchanged')
