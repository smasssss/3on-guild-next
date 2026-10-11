#!/usr/bin/env python3
"""Focused 2.2.1 regression for legacy history across publish/correction/withdrawal."""

from __future__ import annotations

import hashlib
import json
import os
import urllib.error
import urllib.request
import uuid
from pathlib import Path

BASE = os.environ.get("STAGING_BASE", "http://127.0.0.1:8790").rstrip("/")
PASSWORD = os.environ.get("STAGING_ADMIN_PASSWORD", "")
ORIGIN = "https://smasssss.github.io"
ROOT = Path(__file__).resolve().parents[1]
RESULTS: list[dict[str, str]] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    RESULTS.append({"name": name, "status": "PASS" if condition else "FAIL", "detail": detail})
    if not condition:
        raise AssertionError(f"{name}: {detail}")


def call(path: str, method: str = "GET", body=None, token: str | None = None, expected=200):
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode()
    headers = {"Origin": ORIGIN}
    if data is not None:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as exc:
        status, raw = exc.code, exc.read()
    parsed = json.loads(raw or b"{}")
    allowed = {expected} if isinstance(expected, int) else set(expected)
    if status not in allowed:
        raise AssertionError(f"{method} {path}: expected {allowed}, got {status}: {parsed}")
    return parsed


def mutation() -> str:
    return uuid.uuid4().hex


def legacy_member(name: str) -> dict:
    data = call("/api/growth/legacy")["data"]
    return next(member for member in data["members"] if name in {member["name"], member.get("displayName")})


def publish(token: str, date: str, slot: str, rows: list[dict], label: str, supersedes: str | None = None) -> dict:
    current = call("/api/growth/current")
    package = {
        "schema": "3on-growth-package-v1",
        "observed_date": date,
        "slot": slot,
        "expected_member_count": len(rows),
        "source_hashes": [hashlib.sha256(label.encode()).hexdigest()],
        "operation_id": mutation(),
        "rows": rows,
    }
    if supersedes:
        package["supersedes_batch_id"] = supersedes
    uploaded = call("/api/growth/upload", "POST", package, token, 201)
    batch = uploaded["batch"]
    check(f"{label} ready", batch["state"] == "ready", str(batch))
    return call(
        "/api/growth/publish",
        "POST",
        {
            "batch_id": batch["batch_id"],
            "growth_revision": current["revision"],
            "identity_revision": current["identity_revision"],
            "draft_revision": batch["draft_revision"],
            "mutation": mutation(),
        },
        token,
    )


def row(name: str, power: int, level: int, rank: str) -> dict:
    return {"raw_name": name, "normalized_candidate": name, "power": power, "level": level, "rank": rank}


def run() -> None:
    if not PASSWORD:
        raise AssertionError("STAGING_ADMIN_PASSWORD is required")
    token = call("/api/session", "POST", {"password": PASSWORD})["token"]
    baseline_current = call("/api/growth/current")
    existing = next(member for member in baseline_current["members"] if member["canonical"] == "백구김구")
    baseline_legacy = legacy_member("백구김구")
    baseline_power = existing["power"]
    baseline_history = len(baseline_legacy["history"])
    docs_before = {item["kind"]: item["revision"] for item in call("/api/state")["documents"]}

    new_name = "계보회귀신규"
    first = publish(
        token,
        "2026-10-09",
        "lineage",
        [row(existing["display_name"], baseline_power + 100, existing["level"], existing["rank"]), row(new_name, 987_654_321, 777, "R1")],
        "lineage-first",
    )
    after_first_existing = legacy_member("백구김구")
    after_first_new = legacy_member(new_name)
    check("existing first consecutive prev", after_first_existing["prevPower"] == baseline_power, str(after_first_existing["prevPower"]))
    check("existing history retained", len(after_first_existing["history"]) == baseline_history + 1, str(len(after_first_existing["history"])))
    check("new member first record", after_first_new["prevPower"] is None, str(after_first_new["prevPower"]))

    second = publish(
        token,
        "2026-10-10",
        "lineage",
        [row(existing["display_name"], baseline_power + 200, existing["level"], existing["rank"]), row(new_name, 987_654_371, 777, "R1")],
        "lineage-second",
    )
    after_second_existing = legacy_member("백구김구")
    after_second_new = legacy_member(new_name)
    check("existing second consecutive prev", after_second_existing["prevPower"] == baseline_power + 100, str(after_second_existing["prevPower"]))
    check("existing second history retained", len(after_second_existing["history"]) == baseline_history + 2, str(len(after_second_existing["history"])))
    check("new member second record", after_second_new["prevPower"] == 987_654_321, str(after_second_new["prevPower"]))

    correction = publish(
        token,
        "2026-10-10",
        "lineage",
        [row(existing["display_name"], baseline_power + 250, existing["level"], existing["rank"]), row(new_name, 987_654_381, 777, "R1")],
        "lineage-correction",
        second["batch_id"],
    )
    corrected_existing = legacy_member("백구김구")
    corrected_new = legacy_member(new_name)
    check("correction replaces invalid package observation", corrected_existing["power"] == baseline_power + 250 and corrected_existing["prevPower"] == baseline_power + 100, f"power={corrected_existing['power']} prev={corrected_existing['prevPower']}")
    check("correction does not duplicate history", len(corrected_existing["history"]) == baseline_history + 2, str(len(corrected_existing["history"])))
    check("new correction keeps prior publication", corrected_new["power"] == 987_654_381 and corrected_new["prevPower"] == 987_654_321, f"power={corrected_new['power']} prev={corrected_new['prevPower']}")

    current = call("/api/growth/current")
    withdrawn = call(
        "/api/growth/withdraw",
        "POST",
        {"batch_id": correction["batch_id"], "growth_revision": current["revision"], "identity_revision": current["identity_revision"], "mutation": mutation()},
        token,
    )
    restored_existing = legacy_member("백구김구")
    restored_new = legacy_member(new_name)
    check("withdraw restores prior publication", withdrawn["restored_batch_id"] == second["batch_id"] and restored_existing["power"] == baseline_power + 200, str(withdrawn))
    check("withdraw excludes child observation", restored_existing["prevPower"] == baseline_power + 100 and all(item["power"] != baseline_power + 250 for item in restored_existing["history"]), str(restored_existing["history"][-3:]))
    check("withdraw preserves new member lineage", restored_new["power"] == 987_654_371 and restored_new["prevPower"] == 987_654_321, f"power={restored_new['power']} prev={restored_new['prevPower']}")
    docs_after = {item["kind"]: item["revision"] for item in call("/api/state")["documents"]}
    check("operation documents unchanged", docs_after == docs_before, f"before={docs_before} after={docs_after}")
    check("publish identifiers available", first["batch_id"] != second["batch_id"] != correction["batch_id"])


if __name__ == "__main__":
    output = ROOT / "test-results/legacy-lineage-regression.json"
    try:
        run()
    except Exception as exc:
        RESULTS.append({"name": "uncaught", "status": "FAIL", "detail": repr(exc)})
        output.parent.mkdir(exist_ok=True)
        output.write_text(json.dumps({"base": BASE, "results": RESULTS}, ensure_ascii=False, indent=2) + "\n")
        raise
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps({"base": BASE, "results": RESULTS}, ensure_ascii=False, indent=2) + "\n")
    print(f"PASS: {sum(item['status'] == 'PASS' for item in RESULTS)} checks")
