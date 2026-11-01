# Weekly input release verification — 2026-11-01

The approved weekend/reference correction is deployed. Production source is `7e673497f57dec063ad41fe824bd90b81ffc91c7` on `feat/weekly-input-20261101`, not the old main branch. Worker version is `4205f463-4d45-43aa-81fc-0fcffbc707b3`; prior version is `faf48caa-ae53-45f9-a979-9e36a6cbcb0f`.

Release https://github.com/smasssss/3on-guild-next/actions/runs/41268033263 passed Staging and Production. Staging exercised authenticated18-row input, historical confirmed-zero reference, exact stored rows, duplicate revision1, reload display, auth, restrictions, date selection and existing menus. Fixtures were removed and all protected invariants rechecked. The earlier runs41267557365 and41267819348 failed only at unchanged-file reselection in the duplicate UI test; both cleaned fixtures and rolled back, and neither deployed Production.

After release completion, the authorized administrator UI stored99 approved rows in vip-weekly revision1:89 photographed scores and10 user-confirmed nonparticipation zeros. Actual providedOn is Sunday2026-11-01; appliesOn is2026-11-02. API comparison of every ID/name/score/participation/evidence field and reload display passed. Until Monday, active=null and existing eligibility remains in effect. No future execution is claimed as already observed.

All three operational documents were byte-for-byte equivalent before and after import: carriage47, power3, memos7.24 rides,8 rotation members,9 permanent exclusions and all existing VIP totals were preserved. Schema, mappings, growth and Cron were not changed. Cron remains `0,10 * * * *`; Staging made zero external game API calls.

The17 existing regression commands,4 new weekly regression groups,5 scoped release guards, lint, typecheck and build passed. Read-only review findings were fixed and re-reviewed before promotion.

Full Production D1 backup was restored in isolated SQLite before deployment. The actual retained CMS files were also downloaded and decrypted with the separately retained user-owned recovery key; integrity_check=ok and SQL SHA256 matched. This release uses `weekly-backup-recipient.crt`; no private key is in source, CI or artifacts. Encrypted backup copies and the user import/result evidence were retained privately beyond the14-day Actions artifact expiry. `production-after.cms` is code-verification evidence with the same pre-import SQL backup, not a new post-import DB export.

Code rollback uses the prior Worker version and does not roll back D1. Weekly corrections use the authenticated input path; restoring the initial empty weekly state requires a guarded, separately authorized vip-weekly-only DB restoration from its revision0 backup. Do not restore the entire carriage document for a weekly-points correction. Actual remote DB restoration was not performed.
