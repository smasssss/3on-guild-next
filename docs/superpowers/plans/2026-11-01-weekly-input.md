# Weekly input correction Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation, with a final code review.

**Goal:** Register the approved 99-member result without falsifying dates or roster membership.
**Architecture:** Separate score-reference identity data from the existing selection roster. Extend weekend input and evidence validation, preserving all existing transaction guards. Keep data import in the existing authenticated UI.
**Tech Stack:** Existing Workers/D1, TypeScript, browser JavaScript, Node SQLite tests.
**Spec:** docs/superpowers/specs/2026-11-01-weekly-input-design.md

## Global Constraints

- No changes to growth/identity/observations/Cron, rides, VIP counts, permanent exclusions, rotation or authentication.
- Unknown identities and noncurrent positive points remain invalid. User-confirmed nonparticipation is zero with explicit evidence.
- Actual providedOn=2026-11-01; appliesOn=2026-11-02. Staging has zero external collection.

## Review Focus

- Historical member references never become selectable current members.
- Member departure, renaming or mapping changes between validation and commit roll back the whole score mutation.
- Both weekend days map to the immediately following Monday; future/other dates remain rejected.
- Legacy snapshots and pending/current rollover remain compatible and idempotent.
- Result display escapes nicknames and identifies administrator-confirmed nonparticipation.

### Task 1: Weekend import and reference validation

Files: lib/vip-weekly.ts, app/api/carriage/vip/route.ts, public/carriage-vip.js, tests/weekly_input_regression.cjs.

- [ ] Add real SQLite/API and renderer tests; run and observe Sunday/reference failures.
- [ ] Implement scoreMembers, narrow reference guards, evidence preservation and weekend validation; update upload preview/result display.
- [ ] Run all VIP, data preservation, date, rotation, automation and growth regressions, typecheck, lint and build.

### Task 2: Verified promotion and actual result

Files: a new workflow and a release subclass scoped to this release, docs/vip-weekly.md.

- [ ] Reuse encrypted full backup/isolated restore/code-only deployment, pinned baseline 0cb547c, settings preservation and rollback guards.
- [ ] Staging live import test covers actual storage/reload/cleanup without external API calls; preserve its prior weekly document.
- [ ] Promote identical tested artifact to Production; verify code/data invariants.
- [ ] Through the authenticated UI back up, upload all 99 rows, confirm exact stored results and Monday activation logic, and retain recovery evidence.
