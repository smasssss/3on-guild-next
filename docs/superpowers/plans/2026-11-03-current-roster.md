# Current roster repair Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline with one fresh whole-branch review.

**Goal:** Stop accumulating absent guild members while preserving their histories and every unrelated setting/function.
**Architecture:** Add one complete-roster reader shared by current projections and daily closing. The reader verifies stored complete membership; closing respects strict cutoff times. Existing records are not rewritten to repair the current view.
**Tech Stack:** Existing Workers/D1, TypeScript, SQLite regressions, guarded GitHub Actions deployment.
**Spec:** docs/superpowers/specs/2026-11-03-current-roster-design.md

## Global Constraints
- No destructive history/identity changes, schema/migration, unrelated documents or settings changes.
- Only complete accepted snapshots determine absence; power review/failure/incomplete input cannot manufacture a departure.
- Source polling interval, Cron, staging fixture isolation and all VIP/carriage/canyon/auth behavior stay intact.

## Review Focus
- Roster timing versus individual observations and KST midnight.
- Absent/rejoined IDs retain old observations and exact nicknames.
- Power anomalies do not become departures.
- Manual publication/no-automatic-data fallback remains valid.
- Read-only repair preserves data; future close transactions remain atomic/retryable.

### Task1: Shared roster projection and daily-close selection
- [ ] Add real SQLite/API tests for3→2→3, invalid response, abnormal power, rejoin, daily cutoff and unchanged operations; observe RED.
- [ ] Add lib/growth-roster.ts and use it in lib/growth.ts, legacy route and lib/growth-automation.ts.
- [ ] Keep absent members in archived/history and future membership snapshots; do not mutate existing history.
- [ ] Run regression suite, typecheck/lint/build and restored actual Production read test.

### Task2: Safe promotion and evidence
- [ ] Source-pin af25ab2 runtime, preserve all settings/cron/schema/documents and full backups.
- [ ] Exercise unique temporary Staging published/roster fixtures through real APIs and page, clean exact rows and verify baseline.
- [ ] Whole-branch review, then promote identical tested artifact; verify92 current roster at rollout's latest source and preserved histories/documents/settings.
- [ ] Retain recoverable encrypted backups, actual results and concise completion report.
