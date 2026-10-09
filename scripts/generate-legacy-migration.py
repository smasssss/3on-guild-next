#!/usr/bin/env python3
"""Generate deterministic, append-only legacy growth migration SQL."""
from __future__ import annotations

import hashlib
import json
import uuid
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "legacy" / "growth_2026-10-08.json"
DOCS = ROOT / "legacy" / "staging_documents_seed.json"
OUT = ROOT / "drizzle" / "0002_growth_v1.sql"
NAMESPACE = uuid.UUID("82d44d7e-89eb-55b5-aac0-a518e41a8f4b")


def q(value):
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def insert(table: str, columns: list[str], rows: list[list], chunk: int = 40) -> list[str]:
    statements = []
    for start in range(0, len(rows), chunk):
        values = ",\n".join("(" + ",".join(q(v) for v in row) + ")" for row in rows[start:start + chunk])
        statements.append(f"INSERT INTO {table} ({','.join(columns)}) VALUES\n{values};")
    return statements


raw = SOURCE.read_bytes()
data = json.loads(raw)
source_fp = hashlib.sha256(raw).hexdigest()
batch_id = "batch_legacy_" + source_fp[:24]
publication_id = "pub_legacy_" + source_fp[:24]
created = "2026-10-08T15:00:00.000Z"
members = data["members"] + data.get("archivedMembers", [])
member_ids = {m["name"]: str(uuid.uuid5(NAMESPACE, m["name"])) for m in members}

sql = ["""CREATE TABLE growth_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE growth_members (
  member_id TEXT PRIMARY KEY NOT NULL,
  legacy_canonical TEXT UNIQUE,
  display_name TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE growth_identity_decisions (
  decision_id TEXT PRIMARY KEY NOT NULL,
  identity_revision INTEGER NOT NULL,
  raw_value TEXT NOT NULL,
  decision_kind TEXT NOT NULL,
  member_id TEXT,
  display_name TEXT,
  source TEXT NOT NULL,
  batch_id TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX growth_identity_alias_active ON growth_identity_decisions(raw_value) WHERE status='confirmed' AND decision_kind IN ('alias','canonical');
CREATE TABLE growth_batches (
  batch_id TEXT PRIMARY KEY NOT NULL,
  package_hash TEXT UNIQUE NOT NULL,
  semantic_hash TEXT NOT NULL,
  operation_id TEXT,
  observed_date TEXT NOT NULL,
  slot TEXT NOT NULL,
  expected_count INTEGER NOT NULL,
  source_hashes_json TEXT NOT NULL,
  state TEXT NOT NULL,
  identity_revision INTEGER NOT NULL,
  base_growth_revision INTEGER NOT NULL,
  draft_revision INTEGER NOT NULL,
  validation_json TEXT NOT NULL,
  supersedes_batch_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_revision INTEGER
);
CREATE INDEX growth_batches_state_date ON growth_batches(state, observed_date);
CREATE UNIQUE INDEX growth_batches_semantic_scope ON growth_batches(semantic_hash,observed_date,slot);
CREATE TABLE growth_batch_sources (
  batch_id TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  PRIMARY KEY(batch_id,source_hash)
);
CREATE INDEX growth_batch_sources_hash ON growth_batch_sources(source_hash);
CREATE TABLE growth_batch_rows (
  row_id TEXT PRIMARY KEY NOT NULL,
  batch_id TEXT NOT NULL,
  row_index INTEGER NOT NULL,
  raw_name TEXT NOT NULL,
  candidate_name TEXT,
  candidate_member_id TEXT,
  resolution_status TEXT NOT NULL,
  resolved_member_id TEXT,
  proposed_member_id TEXT,
  proposed_display_name TEXT,
  confirm_alias INTEGER NOT NULL DEFAULT 0,
  power INTEGER,
  level INTEGER,
  rank TEXT,
  uncertainty_reason TEXT,
  source_position_json TEXT,
  membership_state TEXT NOT NULL,
  crop_asset_id TEXT,
  review_version INTEGER NOT NULL DEFAULT 0,
  UNIQUE(batch_id,row_index)
);
CREATE INDEX growth_batch_rows_batch ON growth_batch_rows(batch_id,row_index);
CREATE TABLE growth_observations (
  observation_id TEXT PRIMARY KEY NOT NULL,
  member_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  observed_date TEXT NOT NULL,
  slot TEXT NOT NULL,
  power INTEGER NOT NULL,
  level INTEGER,
  rank TEXT,
  label TEXT,
  source_type TEXT NOT NULL,
  legacy_index INTEGER,
  legacy_source_fingerprint TEXT,
  original_order INTEGER NOT NULL,
  supersedes_observation_id TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX growth_observations_member_date ON growth_observations(member_id,observed_date,original_order);
CREATE INDEX growth_observations_batch ON growth_observations(batch_id);
CREATE TABLE growth_membership_snapshots (
  batch_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  membership_state TEXT NOT NULL,
  row_order INTEGER NOT NULL,
  PRIMARY KEY(batch_id,member_id)
);
CREATE TABLE growth_profile_observations (
  profile_observation_id TEXT PRIMARY KEY NOT NULL,
  member_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  label TEXT NOT NULL,
  observed_date TEXT,
  likes INTEGER,
  battle INTEGER,
  tulip INTEGER,
  original_order INTEGER NOT NULL,
  source_type TEXT NOT NULL
);
CREATE TABLE growth_publications (
  publication_id TEXT PRIMARY KEY NOT NULL,
  growth_revision INTEGER UNIQUE NOT NULL,
  batch_id TEXT NOT NULL,
  identity_revision INTEGER NOT NULL,
  status TEXT NOT NULL,
  event_kind TEXT NOT NULL,
  supersedes_publication_id TEXT,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE growth_review_assets (
  asset_id TEXT PRIMARY KEY NOT NULL,
  batch_id TEXT NOT NULL,
  row_id TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  bytes BLOB NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes <= 65536),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX growth_review_assets_expiry ON growth_review_assets(expires_at);
CREATE TABLE growth_legacy_manifests (
  import_version TEXT PRIMARY KEY NOT NULL,
  source_fingerprint TEXT UNIQUE NOT NULL,
  batch_id TEXT NOT NULL,
  counts_json TEXT NOT NULL,
  namespace TEXT NOT NULL,
  imported_at TEXT NOT NULL
);
CREATE TABLE growth_legacy_envelopes (
  member_id TEXT PRIMARY KEY NOT NULL,
  original_order INTEGER NOT NULL,
  current_state TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE growth_legacy_metadata (
  key TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE growth_mutations (
  mutation TEXT PRIMARY KEY NOT NULL,
  operation TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE growth_tx_guards (
  guard_id TEXT PRIMARY KEY NOT NULL,
  ok INTEGER NOT NULL CHECK(ok=1),
  created_at TEXT NOT NULL
);"""]

sql += insert("growth_meta", ["key", "value", "updated_at"], [
    ["schema_version", "3on-growth-v1", created],
    ["api_version", "3on-growth-api-v1", created],
    ["growth_revision", "1", created],
    ["identity_revision", "1", created],
])

member_rows = []
envelope_rows = []
observation_rows = []
snapshot_rows = []
profile_rows = []
duplicate_counter = Counter()
order = 0
for member_order, m in enumerate(members):
    canonical = m["name"]
    member_id = member_ids[canonical]
    current_state = "current" if member_order < len(data["members"]) else "archived"
    member_rows.append([member_id, canonical, m.get("displayName") or canonical, "legacy-import", created])
    envelope_rows.append([member_id, member_order, current_state, json.dumps(m, ensure_ascii=False, separators=(",", ":"))])
    snapshot_rows.append([batch_id, member_id, current_state, member_order])
    for history_index, h in enumerate(m.get("history", [])):
        identity = f"{source_fp}\0{canonical}\0{history_index}".encode()
        observation_id = "lob_" + hashlib.sha256(identity).hexdigest()
        observation_rows.append([
            observation_id, member_id, batch_id, h["date"], h.get("slot") or "unknown", h["power"],
            None, None, h.get("label"), "legacy", history_index, source_fp, order, None, "active", created,
        ])
        duplicate_counter[(canonical, h["date"], h.get("slot"))] += 1
        order += 1
    for profile_index, item in enumerate(m.get("profileHistory", [])):
        profile_id = "lpf_" + hashlib.sha256(f"{source_fp}\0{canonical}\0{profile_index}".encode()).hexdigest()
        profile_rows.append([profile_id, member_id, batch_id, item.get("label", ""), None, item.get("likes"), item.get("battle"), item.get("tulip"), profile_index, "legacy"])

sql += insert("growth_members", ["member_id","legacy_canonical","display_name","source","created_at"], member_rows)
sql += insert("growth_legacy_envelopes", ["member_id","original_order","current_state","payload"], envelope_rows, 10)
sql += insert("growth_observations", ["observation_id","member_id","batch_id","observed_date","slot","power","level","rank","label","source_type","legacy_index","legacy_source_fingerprint","original_order","supersedes_observation_id","status","created_at"], observation_rows, 35)
sql += insert("growth_membership_snapshots", ["batch_id","member_id","membership_state","row_order"], snapshot_rows)
sql += insert("growth_profile_observations", ["profile_observation_id","member_id","batch_id","label","observed_date","likes","battle","tulip","original_order","source_type"], profile_rows)

known = [
    ("내가두려운가", "꧁ᬊ두리ᬊ꧂"),
    ("핵불잡", "핵불잙"),
    ("크림쿡", "크림쿜"),
]
decision_rows = []
for idx, (canonical, display) in enumerate(known):
    decision_rows.append(["legacy-decision-" + str(idx + 1), 1, canonical, "canonical", member_ids[canonical], display, "user-confirmed-legacy", batch_id, "confirmed", created])
    decision_rows.append(["legacy-alias-" + str(idx + 1), 1, display, "alias", member_ids[canonical], display, "user-confirmed-legacy", batch_id, "confirmed", created])
sql += insert("growth_identity_decisions", ["decision_id","identity_revision","raw_value","decision_kind","member_id","display_name","source","batch_id","status","created_at"], decision_rows)

dup_groups = sum(1 for count in duplicate_counter.values() if count > 1)
dup_entries = sum(count for count in duplicate_counter.values() if count > 1)
counts = {
    "current_members": len(data["members"]), "archived_members": len(data.get("archivedMembers", [])),
    "objects": len(members), "history": len(observation_rows), "missing": len(data.get("missing", [])),
    "nickname_changes": len(data.get("nicknameChanges", [])), "profile_history": len(profile_rows),
    "duplicate_groups": dup_groups, "duplicate_entries": dup_entries,
}
package_hash = hashlib.sha256((source_fp + "\0legacy-v1").encode()).hexdigest()
sql += insert("growth_batches", ["batch_id","package_hash","semantic_hash","operation_id","observed_date","slot","expected_count","source_hashes_json","state","identity_revision","base_growth_revision","draft_revision","validation_json","supersedes_batch_id","created_at","updated_at","published_revision"], [[batch_id,package_hash,source_fp,"legacy-import-v1",data["date"],"legacy",len(data["members"]),json.dumps([source_fp]),"published",1,0,1,json.dumps({"status":"pass","counts":counts},ensure_ascii=False,separators=(",",":")),None,created,created,1]])
sql += insert("growth_batch_sources", ["batch_id","source_hash"], [[batch_id,source_fp]])
sql += insert("growth_publications", ["publication_id","growth_revision","batch_id","identity_revision","status","event_kind","supersedes_publication_id","actor","created_at"], [[publication_id,1,batch_id,1,"active","publish",None,"migration",created]])
sql += insert("growth_legacy_manifests", ["import_version","source_fingerprint","batch_id","counts_json","namespace","imported_at"], [["3on-legacy-growth-v1",source_fp,batch_id,json.dumps(counts,separators=(",",":")),str(NAMESPACE),created]])

metadata = {k: v for k, v in data.items() if k not in {"members", "archivedMembers"}}
sql += insert("growth_legacy_metadata", ["key","payload"], [[k,json.dumps(v,ensure_ascii=False,separators=(",",":"))] for k,v in metadata.items()], 10)

seed = json.loads(DOCS.read_text())
for doc in seed["documents"]:
    sql.append("INSERT OR REPLACE INTO documents(kind,revision,payload,updated_at,actor,last_mutation) VALUES(" + ",".join(q(v) for v in [doc["kind"],doc["revision"],json.dumps(doc["data"],ensure_ascii=False,separators=(",",":")),doc.get("updatedAt") or created,"staging-seed","staging-seed-v1"]) + ");")

OUT.write_text("\n--> statement-breakpoint\n".join(sql) + "\n")
print(json.dumps({"output": str(OUT), "source_fingerprint": source_fp, "batch_id": batch_id, **counts}, ensure_ascii=False))
