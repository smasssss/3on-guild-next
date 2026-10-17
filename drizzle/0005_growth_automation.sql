-- Additive only. Existing growth, credentials and operational documents are untouched.
CREATE TABLE IF NOT EXISTS growth_auto_control (
 id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL DEFAULT 1,
 start_date TEXT NOT NULL, last_call_at INTEGER, last_hour TEXT,
 last_run_id TEXT, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS growth_auto_runs (
 run_id TEXT PRIMARY KEY, trigger_kind TEXT NOT NULL, called_at INTEGER NOT NULL,
 received_at INTEGER, completed_at INTEGER, source_as_of INTEGER,
 raw_hash TEXT, content_hash TEXT, snapshot_id TEXT, status TEXT NOT NULL,
 http_status INTEGER, error TEXT, raw_json TEXT, validation_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS growth_auto_runs_time ON growth_auto_runs(called_at DESC);
CREATE TABLE IF NOT EXISTS growth_auto_snapshots (
 snapshot_id TEXT PRIMARY KEY, source_as_of INTEGER NOT NULL, content_hash TEXT NOT NULL,
 run_id TEXT NOT NULL, received_at INTEGER NOT NULL, accepted_at INTEGER NOT NULL,
 member_count INTEGER NOT NULL, guild_power INTEGER NOT NULL,
 UNIQUE(source_as_of,content_hash)
);
CREATE TABLE IF NOT EXISTS growth_external_ids (
 game_id TEXT PRIMARY KEY, member_id TEXT UNIQUE, source_name TEXT NOT NULL,
 status TEXT NOT NULL, evidence TEXT NOT NULL, departed_at INTEGER,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS growth_hourly_observations (
 snapshot_id TEXT NOT NULL, game_id TEXT NOT NULL, member_id TEXT,
 source_as_of INTEGER NOT NULL, received_at INTEGER NOT NULL, accepted_at INTEGER NOT NULL,
 source_name TEXT NOT NULL, power INTEGER NOT NULL, level INTEGER NOT NULL, rank TEXT NOT NULL,
 activity INTEGER, kills INTEGER, joined_at INTEGER, status TEXT NOT NULL, reason TEXT,
 PRIMARY KEY(snapshot_id,game_id)
);
CREATE INDEX IF NOT EXISTS growth_hourly_player_time ON growth_hourly_observations(game_id,source_as_of DESC);
CREATE INDEX IF NOT EXISTS growth_hourly_valid_player ON growth_hourly_observations(game_id,status,source_as_of DESC);
CREATE INDEX IF NOT EXISTS growth_hourly_cutoff ON growth_hourly_observations(status,source_as_of,accepted_at);
CREATE TABLE IF NOT EXISTS growth_auto_events (
 event_id TEXT PRIMARY KEY, kind TEXT NOT NULL, game_id TEXT, member_id TEXT,
 source_as_of INTEGER NOT NULL, created_at INTEGER NOT NULL, status TEXT NOT NULL,
 before_json TEXT, after_json TEXT, reason TEXT, actor TEXT
);
CREATE INDEX IF NOT EXISTS growth_auto_events_review ON growth_auto_events(status,created_at DESC);
CREATE TABLE IF NOT EXISTS growth_daily_closes (
 date TEXT PRIMARY KEY, cutoff_at INTEGER NOT NULL, batch_id TEXT,
 status TEXT NOT NULL, member_count INTEGER NOT NULL, stale_count INTEGER NOT NULL,
 created_at INTEGER NOT NULL, details_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS growth_daily_sources (
 date TEXT NOT NULL, member_id TEXT NOT NULL, game_id TEXT NOT NULL,
 snapshot_id TEXT NOT NULL, source_as_of INTEGER NOT NULL, received_at INTEGER NOT NULL,
 accepted_at INTEGER NOT NULL, power INTEGER NOT NULL, previous_power INTEGER,
 delta INTEGER, stale INTEGER NOT NULL, PRIMARY KEY(date,member_id)
);
CREATE TABLE IF NOT EXISTS growth_auto_executions (
 execution_id TEXT PRIMARY KEY, cron TEXT NOT NULL, scheduled_at INTEGER NOT NULL,
 started_at INTEGER NOT NULL, completed_at INTEGER, status TEXT NOT NULL,
 result_json TEXT, error TEXT
);
CREATE INDEX IF NOT EXISTS growth_auto_executions_time ON growth_auto_executions(scheduled_at DESC);
