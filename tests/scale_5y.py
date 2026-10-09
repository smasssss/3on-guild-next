#!/usr/bin/env python3
"""Create and query a 100-member × 5-year isolated Growth dataset."""

from __future__ import annotations

import json
import os
import sqlite3
import tempfile
import time
from datetime import date, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "test-results/scale_5y.json"
DAYS = 365 * 5
MEMBERS = 100


def timed(fn):
    start = time.perf_counter()
    value = fn()
    return value, round((time.perf_counter() - start) * 1000, 3)


def main() -> None:
    handle, path = tempfile.mkstemp(prefix="3on-growth-5y-", suffix=".sqlite")
    os.close(handle)
    try:
        con = sqlite3.connect(path)
        con.executescript(
            """
            PRAGMA journal_mode=WAL;
            CREATE TABLE growth_members(member_id TEXT PRIMARY KEY, display_name TEXT NOT NULL);
            CREATE TABLE growth_observations(
              observation_id TEXT PRIMARY KEY, member_id TEXT NOT NULL, batch_id TEXT NOT NULL,
              observed_date TEXT NOT NULL, slot TEXT NOT NULL, power INTEGER, level INTEGER, rank TEXT,
              original_order INTEGER NOT NULL, status TEXT NOT NULL
            );
            CREATE INDEX growth_observation_member_date ON growth_observations(member_id,observed_date,original_order);
            CREATE INDEX growth_observation_batch ON growth_observations(batch_id);
            CREATE INDEX growth_observation_date ON growth_observations(observed_date,status);
            CREATE TABLE growth_membership_snapshots(batch_id TEXT NOT NULL,member_id TEXT NOT NULL,membership_state TEXT NOT NULL,row_order INTEGER NOT NULL,PRIMARY KEY(batch_id,member_id));
            """
        )
        con.executemany("INSERT INTO growth_members VALUES(?,?)", [(f"member_{i:03d}", f"길드원{i:03d}") for i in range(MEMBERS)])
        con.commit()
        start_day = date(2021, 1, 1)

        def insert_all():
            order = 0
            con.execute("BEGIN")
            for day_index in range(DAYS):
                observed = (start_day + timedelta(days=day_index)).isoformat()
                batch = f"batch_{observed}"
                rows = []
                for member in range(MEMBERS):
                    order += 1
                    rows.append((f"obs_{day_index:04d}_{member:03d}", f"member_{member:03d}", batch, observed, "daily", 10_000_000 + member * 100_000 + day_index * 10_000, 20 + day_index // 365, f"R{1 + member % 5}", order, "active"))
                con.executemany("INSERT INTO growth_observations VALUES(?,?,?,?,?,?,?,?,?,?)", rows)
            con.executemany(
                "INSERT INTO growth_membership_snapshots VALUES(?,?,?,?)",
                [(f"batch_{(start_day + timedelta(days=DAYS - 1)).isoformat()}", f"member_{i:03d}", "current", i) for i in range(MEMBERS)],
            )
            con.commit()

        _, insert_ms = timed(insert_all)
        con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        last_day = (start_day + timedelta(days=DAYS - 1)).isoformat()
        seven_start = (start_day + timedelta(days=DAYS - 7)).isoformat()

        current, current_ms = timed(lambda: con.execute(
            """SELECT s.member_id,o.observed_date,o.power,o.level,o.rank
               FROM growth_membership_snapshots s JOIN growth_observations o ON o.observation_id=(
                 SELECT x.observation_id FROM growth_observations x
                 WHERE x.member_id=s.member_id AND x.status='active' AND x.observed_date<=?
                 ORDER BY x.observed_date DESC,x.original_order DESC LIMIT 1)
               WHERE s.batch_id=? ORDER BY s.row_order""",
            (last_day, f"batch_{last_day}"),
        ).fetchall())
        recent, recent_ms = timed(lambda: con.execute(
            "SELECT member_id,observed_date,power FROM growth_observations WHERE observed_date>=? AND status='active' ORDER BY member_id,observed_date",
            (seven_start,),
        ).fetchall())
        period, period_ms = timed(lambda: con.execute(
            "SELECT member_id,observed_date,power FROM growth_observations WHERE observed_date BETWEEN ? AND ? AND status='active' ORDER BY member_id,observed_date",
            ((start_day + timedelta(days=DAYS - 31)).isoformat(), last_day),
        ).fetchall())
        history, history_ms = timed(lambda: con.execute(
            "SELECT observed_date,power,level,rank FROM growth_observations WHERE member_id=? AND status='active' ORDER BY observed_date DESC LIMIT 500",
            ("member_042",),
        ).fetchall())
        publish_start = time.perf_counter()
        con.execute("BEGIN")
        con.execute("CREATE TABLE growth_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)")
        con.execute("INSERT INTO growth_meta VALUES('growth_revision','1')")
        con.execute("UPDATE growth_meta SET value='2' WHERE key='growth_revision' AND value='1'")
        con.execute("CREATE TABLE growth_publications(publication_id TEXT PRIMARY KEY,batch_id TEXT,growth_revision INTEGER)")
        con.execute("INSERT INTO growth_publications VALUES('pub_scale','batch_scale',2)")
        con.commit()
        publish_ms = round((time.perf_counter() - publish_start) * 1000, 3)

        db_bytes = os.path.getsize(path)
        index_bytes = con.execute("SELECT COALESCE(SUM(pgsize),0) FROM dbstat WHERE name IN ('growth_observation_member_date','growth_observation_batch','growth_observation_date','sqlite_autoindex_growth_observations_1')").fetchone()[0]
        api_current_bytes = len(json.dumps(current, ensure_ascii=False, separators=(",", ":")).encode())
        report = {
            "status": "PASS",
            "engine": f"SQLite {sqlite3.sqlite_version} (D1-compatible SQL, isolated Staging scale fixture)",
            "members": MEMBERS,
            "days": DAYS,
            "observations": con.execute("SELECT COUNT(*) FROM growth_observations").fetchone()[0],
            "db_bytes": db_bytes,
            "index_bytes": index_bytes,
            "insert_all_ms": insert_ms,
            "queries": {
                "current_members": {"rows": len(current), "latency_ms": current_ms},
                "recent_7_days": {"rows": len(recent), "latency_ms": recent_ms},
                "period_31_days": {"rows": len(period), "latency_ms": period_ms},
                "member_history_500": {"rows": len(history), "latency_ms": history_ms},
                "publish_reference_transaction": {"writes": 4, "latency_ms": publish_ms},
            },
            "api_current_response_bytes": api_current_bytes,
            "full_history_response_avoided": True,
            "limits": {"largest_query_rows": max(len(current), len(recent), len(period), len(history)), "full_history_rows": MEMBERS * DAYS},
        }
        assert report["observations"] == 182500
        assert len(current) == 100 and len(recent) == 700 and len(history) == 500
        OUT.parent.mkdir(exist_ok=True)
        OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps(report, ensure_ascii=False, indent=2))
    finally:
        try:
            os.unlink(path)
        except FileNotFoundError:
            pass


if __name__ == "__main__":
    main()
