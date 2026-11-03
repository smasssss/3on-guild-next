# Current roster accumulation repair

User requests that members absent from automatically collected guild membership leave the current list, while all unrelated functions/settings stay unchanged. GitHub and Cloudflare authenticated read-only checks passed; no administrator login is needed for code deployment.

Diagnosis: closeDay selects every external ID's last valid observation without restricting to a complete roster, and carries absent prior members as unobserved. Current/legacy APIs count those carried members. Actual Production reported102 current members versus92 in its last accepted complete roster, with10 absent IDs.

Use the latest accepted complete roster as membership evidence, independent of power validation. Invalid/failed/incomplete responses do not create a new roster and cannot remove anyone. Current projections after an automatic close use this complete roster immediately; existing daily power/history remains unchanged. Daily closing uses the last complete roster strictly before the cutoff, selecting individual power only for present game IDs. Absent members are missing/archived from current display, with all original observations, identities and VIP/ride history retained. Reappearing IDs reconnect to their existing history without a destructive departure flag.

Manual publications and deployments with no complete automatic roster retain their current behavior. Membership checks use game IDs/current confirmed mappings, not nickname normalization. No changes to VIP rules/order/totals/exclusions, rotation, carriage dates, canyon, memos, authentication, source call frequency, Cron, configuration or schema.

Do not clamp the count or delete historical observations. Do not infer absence from per-player anomalous power, request failure, or a truncated API response. Validate by SQLite boundary/rejoin/history tests, actual restored Production snapshot, real Staging fixture/read UI, whole-branch review and guarded code-only Production promotion with fresh full backup. Preserve settings, schema, all existing documents and historic rows throughout.
