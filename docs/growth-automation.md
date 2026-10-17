# Growth automation

The existing Cloudflare Worker owns collection and closing. No OpenAI/AI service,
connector session, browser, GitHub job, or ChatGPT session is required at runtime.

* `0 * * * *`: one authorized alliance request per UTC hour; persisted reservation,
  at least 59 minutes between requests, no automatic HTTP retries.
* `10 15 * * *`: at 00:10 Asia/Seoul, close the previous KST date. This code path
  never fetches the external API. Hourly invocations also retry missed closes.
* Staging: `GROWTH_AUTO_MODE=fixture`, `crons=[]`; live collection is disabled in
  code and configuration. Fixtures contain synthetic IDs and names only.

## Data and identity

Additive migration `drizzle/0005_growth_automation.sql` separates collection runs,
raw responses, validated hourly snapshots, external game ID mappings, review
events, daily close locks, and per-member daily provenance. Existing tables are
not reseeded. SHA-256 and unique `(asOf, content hash)` prevent duplicate snapshots.
Each hourly row retains source asOf, received time and validation acceptance time.
The source asOf is the alliance API's timestamp; do not describe it as each
player's exact in-game measurement time.

Collection starts paused. An authenticated administrator uploads the privately
held, reviewed ID mapping with the initial mapping control. It does not belong
in the public Git repository. Upload requires unique existing member IDs and
unique game IDs, and enables collection atomically. Subsequent unambiguous new
game IDs create distinct identities. A name collision requires review.

Rename detection compares the same external ID's previous source name, preserving
established display names when an initial raw name differs. Old aliases and raw
events survive changes. Absence generates candidates, never automatic departure.
Power changes above +100% or below -65% with an absolute difference over 5 million,
and castle-level decreases, are held for review. No source value is adjusted.

## Closing and UI

Closing selects the last valid per-ID row with source, receipt and acceptance
timestamps all strictly before the next KST midnight. A joined timestamp after
the cutoff is excluded. Last valid older rows remain explicit stale observations
after two hours; absent members remain unobserved. A daily primary key, revision
guards and a single D1 batch prevent duplicate/partial publication. Existing
manual dates are preserved. Failed closes can be retried without fetching.

Daily batches extend the existing approved lineage and original member IDs. Old
growth records, manual upload and the existing graphs remain. The growth iframe
loads `/growth-auto.js` for latest observations and hourly history; daily graphs
continue to use confirmed daily data. `/api/growth/automation?date=YYYY-MM-DD`
returns the close's provenance and deltas. Admin status, raw review, mapping
correction, pause and retry use the existing authenticated administrator session.

## Deployment and recovery

Base this release on the actual Production branch, not the older main branch.
The Staging workflow backs up business data, rehearses SQLite restoration,
compares saved tables and credential digests, deploys without live schedules,
and exercises real Worker/D1 behavior using synthetic fixtures before restoring
the exact Staging baseline. The existing authentication secret is preserved.

Backups and evidence are encrypted with AES-256-GCM before Actions artifact upload.
The archive key is derived from the existing Cloudflare CI API token with scrypt
and a random stored salt. Retain that secret until rotating the corresponding
backups. The authentication tables are never exported. D1 Time Travel bookmark
and previous Worker version metadata are recorded inside the encrypted evidence.
No plaintext operational backup should enter the public repository or logs.

For a code rollback, disable both schedules first, then restore the recorded
previous Worker version; leave additive tables in place. A whole-D1 Time Travel
restore affects all records written after the bookmark, so do it only when
specifically intended. Prefer restoring/reviewing growth data separately when
carriage or VIP records have subsequently changed.

All hourly history is retained. At 89 players, 24 changed snapshots/day means
779,640 hourly rows/year, plus raw responses and indexes. Monitor D1 storage and
row metrics; do not delete historical records silently to stay within a free plan.
