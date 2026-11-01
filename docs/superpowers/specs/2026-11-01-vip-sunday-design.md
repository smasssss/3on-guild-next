# Sunday VIP activation and restricted-last picker

The user explicitly requests Sunday activation of weekly VIP restrictions and placing restricted people at the bottom of the carriage VIP picker. Existing features must remain unchanged. This is a narrow change to the existing policy and picker, not a new subsystem.

Use the established Monday appliesOn as a stable score-cycle key, with effectiveOn computed as the preceding Sunday KST. Existing99-row data must take effect on Sunday2026-11-01 without a DB rewrite. Saturday remains pre-activation; Sunday's uploaded data applies on receipt. No data are fabricated when an upload is missing; existing carry-forward continues. Expose the actual effective date in the API/display. Keep operational Monday weeks, rides, totals, permanent exclusions, growth, identities, authentication, Cron and schema unchanged.

Picker: eligible members first, restricted members last; preserve all existing tie-breakers within each group. Permanent exclusions remain omitted as before. Search, button restrictions and independent leader selection remain intact.

Approaches considered: shifting the global week start would alter carriage/history grouping; rewriting all appliesOn dates would break the existing upload/storage contract. Compute Sunday eligibility from the existing cycle key instead, as the implementation choice that satisfies the request with no data migration.

Validation: Saturday/Sunday/Monday boundaries, existing pending snapshot read-only activation, later Sunday rollover/carry-forward, future upload rejection, temporary/permanent rules, server-side restricted assignment rejection, mixed picker sorting/search/escaping. Preserve all operational documents and the entire stored weekly document across deployment. Use the established encrypted backup/code-only Staging→Production promotion and rollback guards.
