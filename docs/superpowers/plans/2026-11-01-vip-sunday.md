# Sunday VIP activation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline and final fresh review.

**Goal:** Apply the stored weekly VIP restrictions from Sunday and place restricted picker entries last.
**Architecture:** Compute an effective Sunday from the existing Monday cycle key. Keep all stored data and operational weeks unchanged. Add one sorting priority before existing tie-breakers.
**Tech Stack:** Existing Workers/D1/TypeScript/browser JS and SQLite/VM regression harnesses.
**Spec:** docs/superpowers/specs/2026-11-01-vip-sunday-design.md

## Global Constraints
- No schema, Cron, growth, identity, auth, rides, VIP totals, exclusions or rotation changes.
- No production D1 writes; existing99 rows activate through read-time policy only.
- Staging uses only fixtures with zero external game API calls.

## Review Focus
- Sunday KST starts independently of operational Monday week keys.
- Existing pending and current snapshots activate without mutating their timestamps or payloads.
- Newly supplied Sunday data supersede prior scores, but absent weeks retain prior data.
- Restricted-first historical tie-breakers cannot interleave enabled entries below disabled ones.
- Server-side assignment and visible button policy must agree.

### Task1: Policy and picker
- [ ] Add Sunday boundary/API and actual-renderer sort tests, observe RED.
- [ ] Update lib/vip-weekly.ts effectiveOn/weeklyView/eligibility and public/carriage-vip.js sort/date copy; retain the upload cycle contract.
- [ ] Update only intentionally obsolete Monday expectations, then run all existing regression commands, lint/typecheck/build.

### Task2: Verified deployment
- [ ] Source-pin a new release wrapper/workflow to current7e67349 runtime; retain full encrypted backup, settings, docs invariants and rollback.
- [ ] Exercise actual Staging Sunday stored snapshot and sorted picker; clean exact temporary fixture rows.
- [ ] Review whole branch, then promote identical tested artifact; verify all stored data unchanged.
- [ ] Verify Production active99 rows and restricted-last picker; retain encrypted backup and concise completion evidence.
