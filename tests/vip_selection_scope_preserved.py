"""VIP selection (2026-11-05) changes only its runtime allowlist relative to the deployed release."""
import subprocess
from pathlib import Path
base='82daba8f3032198bdec65c2e9dda7057d7da6309'
allowed={'lib/race.ts','app/api/race/route.ts','public/race-game.js','lib/lotto.ts','app/api/lotto/route.ts','public/lotto-draw.js','lib/treadmill.ts','app/api/treadmill/route.ts','public/treadmill-race.js','lib/kvk.ts','app/api/kvk/route.ts','public/kvk.js','build/sites-worker.ts','lib/vip-weekly.ts','lib/validate.ts','app/api/carriage/vip/route.ts','public/carriage-vip.js','public/ops-theme.css','public/ops-theme-growth.css','public/fonts/cafe24-syongsyong.woff','public/ops-select.js','public/legacy.html','lib/growth-roster.ts','lib/growth-automation.ts','app/api/growth/legacy/route.ts','public/growth-auto.js','app/api/state/route.ts','lib/pinball.ts','app/api/pinball/route.ts','public/pinball.js','public/arena.js','public/treadmill.js'}
# 2026-11-23: 엉뚱 경주 (user request; third game in the 추첨 게임 tab): lib/race.ts, app/api/race/route.ts, public/race-game.js
# (its own record kind 'race'), plus static game files under public/race/ (maths, drawing, player, pictures, voice lines, music).
# 2026-11-23: 로또 추첨기 (user request; another game in the 추첨 게임 tab): lib/lotto.ts, app/api/lotto/route.ts, public/lotto-draw.js
# (its own record kind 'lotto'), plus static game files under public/lotto3d/.
# 2026-11-22: 런닝머신 레이스 (user request; second game in the renamed '추첨 게임' tab): lib/treadmill.ts, app/api/treadmill/route.ts,
# public/treadmill-race.js (its own record kind 'treadmill3d'), plus static game files under public/treadmill3d/ (page, physics, pictures, libraries).
# 2026-11-20: 국가원정 tab (user request): lib/kvk.ts, app/api/kvk/route.ts, public/kvk.js, and build/sites-worker.ts runs it after the hourly collection.
# 2026-11-15: public/treadmill.js is the 러닝머신 경주 draw (tournament on a treadmill belt; same record kind).
# 2026-11-15: public/arena.js is the 배틀로얄 draw (new game in the 핀볼 추첨 menu; same record kind).
# 2026-11-09: 핀볼 추첨 sound: CC0 chiptunes under public/pinball-music/ (static files only; sources in its CREDITS.md).
# 2026-11-09: the new 핀볼 추첨 menu (its own record kind 'pinball'; no change to operation documents).
# 2026-11-08: app/api/state/route.ts reports a carriage save D1 already committed as saved (reply failed while busy).
roots=['app','lib','public','build','drizzle']
tracked=subprocess.check_output(['git','ls-tree','-r','--name-only',base,'--',*roots,'package.json','package-lock.json','vite.config.ts'],text=True).splitlines()
for name in tracked:
 if name not in allowed:assert Path(name).read_bytes()==subprocess.check_output(['git','show',base+':'+name]),name
extra={str(p) for r in roots for p in Path(r).rglob('*') if p.is_file()}-set(tracked)
extra={x for x in extra if not x.startswith('public/pinball-music/') and not x.startswith('public/treadmill3d/') and not x.startswith('public/lotto3d/') and not x.startswith('public/race/')}
assert extra<=allowed,extra-allowed
print('PASS: only VIP selection files changed; roster sync, growth, carriage dates/rotation, canyon, auth, schema unchanged')
