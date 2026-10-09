#!/usr/bin/env python3
"""Compare the migrated baseline with the exact legacy Production growth payload."""

from __future__ import annotations

import hashlib
import json
import os
import urllib.request
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get("STAGING_BASE", "http://127.0.0.1:8790").rstrip("/")


def load_api(path: str):
    with urllib.request.urlopen(BASE + path, timeout=20) as response:
        return json.load(response)


def derived(data: dict) -> dict:
    rows = []
    for member in data["members"] + data["archivedMembers"]:
        history = member["history"]
        daily = {}
        for observation in history:  # Deliberately reproduce JS Map last-write semantics.
            daily[observation["date"]] = observation
        ordered_daily = [daily[key] for key in sorted(daily)]
        first = history[0]["power"] if history else None
        last = history[-1]["power"] if history else None
        cumulative = None if first is None else last - first
        average = None if len(history) < 2 else cumulative / (len(history) - 1)
        recent = ordered_daily[-7:]
        recent7 = None if len(recent) < 2 else recent[-1]["power"] - recent[0]["power"]
        weeks = defaultdict(list)
        for item in ordered_daily:
            d = date.fromisoformat(item["date"])
            monday = (d - timedelta(days=d.weekday())).isoformat()
            weeks[monday].append(item)
        weekly = [(key, values[-1]["power"] - values[0]["power"]) for key, values in sorted(weeks.items())]
        rows.append({
            "name": member["name"], "rank": member["rank"], "level": member["level"], "power": member["power"],
            "first": first, "last": last, "cumulative": cumulative, "average": average, "recent7": recent7,
            "weekly": weekly, "daily": [(x["date"], x["slot"], x["power"]) for x in ordered_daily],
            "graph_source": [(x["label"], x["date"], x["slot"], x["power"]) for x in history],
        })
    return {"order": [m["name"] for m in data["members"]], "rows": rows}


def digest(value) -> str:
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def main() -> None:
    legacy = json.loads((ROOT / "legacy/growth_2026-10-08.json").read_text())
    migrated_response = load_api("/api/growth/legacy")
    migrated = migrated_response["data"]
    current = load_api("/api/growth/current")
    all_members = legacy["members"] + legacy["archivedMembers"]
    duplicate_groups = 0
    duplicate_entries = 0
    for member in all_members:
        counts = Counter((x["date"], x["slot"]) for x in member["history"])
        duplicate_groups += sum(v > 1 for v in counts.values())
        duplicate_entries += sum(v for v in counts.values() if v > 1)
    legacy_derived = derived(legacy)
    migrated_derived = derived(migrated)
    current_by_canonical = {m["canonical"]: m for m in current["members"]}
    checks = {
        "exact_legacy_payload": migrated == legacy,
        "current_count": len(migrated["members"]) == 87 == len(current["members"]),
        "archived_count": len(migrated["archivedMembers"]) == 13,
        "history_count": sum(len(m["history"]) for m in all_members) == 4027,
        "missing_count": len(migrated["missing"]) == 53,
        "nickname_changes": migrated["nicknameChanges"] == legacy["nicknameChanges"],
        "profile_history": len(next(m for m in migrated["members"] if m["name"] == "HyunE")["profileHistory"]) == 51,
        "duplicate_groups": duplicate_groups == 71 and duplicate_entries == 142,
        "derived_current_prev_cumulative_average_recent7_weekly_graph_sort": legacy_derived == migrated_derived,
        "identity_duri": current_by_canonical["내가두려운가"]["display_name"] == "꧁ᬊ두리ᬊ꧂",
        "identity_fire": current_by_canonical["핵불잡"]["display_name"] == "핵불잙",
        "identity_cream": current_by_canonical["크림쿡"]["display_name"] == "크림쿜",
        "identity_yong_distinct": current_by_canonical["용팝이"]["member_id"] != current_by_canonical["용퍕이"]["member_id"],
    }
    result = {
        "status": "PASS" if all(checks.values()) else "FAIL",
        "api_revision": migrated_response["revision"],
        "identity_revision": migrated_response["identity_revision"],
        "counts": {"current": 87, "archived": 13, "total": 100, "history": 4027, "missing": 53, "duplicate_groups": duplicate_groups, "duplicate_entries": duplicate_entries, "hyune_profile": 51},
        "rank_distribution": dict(sorted(Counter(m["rank"] for m in migrated["members"]).items())),
        "legacy_payload_sha256": digest(legacy),
        "migrated_payload_sha256": digest(migrated),
        "derived_metrics_sha256": digest(migrated_derived),
        "checks": checks,
    }
    output = ROOT / "test-results/shadow.json"
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if result["status"] != "PASS":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
