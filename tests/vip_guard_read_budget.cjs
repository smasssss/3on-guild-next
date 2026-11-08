/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS regression harness, matching existing tests. */
// 2026-11-08: the roster check run on every weekly-points save and every VIP carriage save read
// ~16M D1 rows (D1 scanned all valid hourly rows and re-read each member's history per row).
// It must visit only the listed members, one rowid lookup each, without a sort.
const assert=require('node:assert/strict');
const f=require('./vip-fixture.cjs')(),v=f.load('lib/vip-weekly.ts');
const plan=f.sql.prepare('EXPLAIN QUERY PLAN SELECT '+v.ROSTER_GUARD_SQL).all('[]','x',0).map(r=>r.detail).join('\n');
assert.match(plan,/SCAN j VIRTUAL TABLE/,'listed members drive the check');
assert.match(plan,/SEARCH o USING INTEGER PRIMARY KEY \(rowid=\?\)/,'one direct lookup per member');
assert.match(plan,/SEARCH x USING INDEX growth_hourly_player_time \(game_id=\?\)/,'latest row found through the player-time index');
assert.doesNotMatch(plan,/growth_hourly_cutoff|TEMP B-TREE|SCAN (o|x|e|m)\b/,'no scan of all hourly rows and no sort');
assert(plan.indexOf('SCAN j')<plan.indexOf('SEARCH e')&&plan.indexOf('SEARCH e')<plan.indexOf('SEARCH o'),'join order is fixed');
console.log('PASS: VIP roster check reads one row per listed member (no full hourly scan)');
