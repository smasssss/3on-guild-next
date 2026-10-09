#!/usr/bin/env python3
"""End-to-end checks against an isolated local Staging D1 instance."""

from __future__ import annotations

import hashlib
import json
import os
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path


BASE = os.environ.get("STAGING_BASE", "http://127.0.0.1:8790").rstrip("/")
ORIGIN = "https://smasssss.github.io"
ADMIN_PASSWORD = os.environ.get("STAGING_ADMIN_PASSWORD", "")
SERVICE_TOKEN = ""
ROOT = Path(__file__).resolve().parents[1]
RESULTS: list[dict[str, object]] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    RESULTS.append({"name": name, "status": "PASS" if condition else "FAIL", "detail": detail})
    if not condition:
        raise AssertionError(f"{name}: {detail}")


def call(path: str, method: str = "GET", body=None, token: str | None = None, expected=200):
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode()
    headers = {"Origin": ORIGIN}
    if SERVICE_TOKEN:
        headers["OAI-Sites-Authorization"] = f"Bearer {SERVICE_TOKEN}"
    if data is not None:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            status = res.status
            raw = res.read()
    except urllib.error.HTTPError as exc:
        status = exc.code
        raw = exc.read()
    parsed = json.loads(raw or b"{}")
    allowed = {expected} if isinstance(expected, int) else set(expected)
    if status not in allowed:
        raise AssertionError(f"{method} {path}: expected {allowed}, got {status}: {parsed}")
    return status, parsed


def mutation() -> str:
    return uuid.uuid4().hex


def source_hash(label: str) -> str:
    return hashlib.sha256(label.encode()).hexdigest()


def package(date: str, slot: str, rows: list[dict], label: str, expected: int | None = None, **extra):
    value = {
        "schema": "3on-growth-package-v1",
        "observed_date": date,
        "slot": slot,
        "expected_member_count": len(rows) if expected is None else expected,
        "source_hashes": [source_hash(label)],
        "operation_id": mutation(),
        "rows": rows,
    }
    value.update(extra)
    return value


def run() -> None:
    _, current0 = call("/api/growth/current")
    check("legacy current count", len(current0["members"]) == 87, str(len(current0["members"])))
    check("legacy growth revision", current0["revision"] == 1 and current0["identity_revision"] == 1)
    check("legacy observed date", current0["observed_date"] == "2026-10-08")
    ranks = {r: sum(m["rank"] == r for m in current0["members"]) for r in ["R1", "R2", "R3", "R4", "R5"]}
    check("rank distribution", ranks == {"R1": 17, "R2": 30, "R3": 33, "R4": 6, "R5": 1}, str(ranks))

    _, state0 = call("/api/state")
    docs = {d["kind"]: d for d in state0["documents"]}
    check("state remains three documents", set(docs) == {"carriage", "power", "memos"})
    check("seed document revisions", {k: docs[k]["revision"] for k in docs} == {"carriage": 14, "power": 1, "memos": 7})

    _, legacy_api = call("/api/growth/legacy")
    legacy_src = json.loads((ROOT / "legacy/growth_2026-10-08.json").read_text())
    data = legacy_api["data"]
    check("legacy envelope current/archived", len(data["members"]) == 87 and len(data["archivedMembers"]) == 13)
    check("legacy history count", sum(len(m["history"]) for m in data["members"] + data["archivedMembers"]) == 4027)
    check("missing preserved", data["missing"] == legacy_src["missing"])
    check("nickname changes preserved", data["nicknameChanges"] == legacy_src["nicknameChanges"])
    check("HyunE profile history", len(next(m for m in data["members"] if m["name"] == "HyunE")["profileHistory"]) == 51)

    _, bad_login = call("/api/session", "POST", {"password": "wrong-password"}, expected=401)
    check("wrong password rejected", "error" in bad_login)
    if not ADMIN_PASSWORD:
        raise AssertionError("STAGING_ADMIN_PASSWORD is required")
    _, login = call("/api/session", "POST", {"password": ADMIN_PASSWORD})
    token = login["token"]
    _, session = call("/api/session", token=token)
    check("login/session", session == {"admin": True})

    small = package("2026-10-09", "daily", [{"raw_name": "HyunE", "power": 1, "level": 29, "rank": "R5"}], "unauthorized")
    _, unauth = call("/api/growth/upload", "POST", small, expected=401)
    check("unauthorized growth write rejected", "error" in unauth)

    full_rows = [
        {
            "raw_name": m["display_name"] or m["canonical"],
            "normalized_candidate": m["display_name"] or m["canonical"],
            "power": m["power"], "level": m["level"], "rank": m["rank"],
            "source_position": {"row": index},
        }
        for index, m in enumerate(current0["members"])
    ]
    full_pkg = package("2026-10-09", "daily", full_rows, "full-2026-10-09")
    _, uploaded = call("/api/growth/upload", "POST", full_pkg, token, expected=201)
    batch1 = uploaded["batch"]
    check("full package ready", uploaded["review_count"] == 0 and batch1["state"] == "ready")
    _, duplicate = call("/api/growth/upload", "POST", full_pkg, token)
    check("duplicate package idempotent", duplicate["duplicate"] and duplicate["batch"]["batch_id"] == batch1["batch_id"])

    publish_mut = mutation()
    publish_req = {"batch_id": batch1["batch_id"], "growth_revision": 1, "identity_revision": 1, "draft_revision": 1, "mutation": publish_mut}
    _, published = call("/api/growth/publish", "POST", publish_req, token)
    check("atomic publish revision", published["growth_revision"] == 2 and published["identity_revision"] == 1)
    _, publish_retry = call("/api/growth/publish", "POST", publish_req, token)
    check("publish response-loss retry", publish_retry["duplicate"] and publish_retry["publication_id"] == published["publication_id"])
    _, current1 = call("/api/growth/current")
    check("published current revision", current1["revision"] == 2 and current1["observed_date"] == "2026-10-09" and len(current1["members"]) == 87)

    hyune = next(m for m in current1["members"] if m["canonical"] == "HyunE")
    corrected_rows = [dict(row) for row in full_rows]
    corrected_hyune = next(row for row in corrected_rows if row["normalized_candidate"] == "HyunE")
    corrected_hyune["power"] += 1
    correction_pkg = package("2026-10-09", "daily", corrected_rows, "correction-2026-10-09", supersedes_batch_id=batch1["batch_id"])
    _, correction_up = call("/api/growth/upload", "POST", correction_pkg, token, expected=201)
    correction_batch = correction_up["batch"]
    _, correction_pub = call("/api/growth/publish", "POST", {"batch_id": correction_batch["batch_id"], "growth_revision": 2, "identity_revision": 1, "draft_revision": 1, "mutation": mutation()}, token)
    _, corrected_current = call("/api/growth/current")
    check("correction supersedes atomically", correction_pub["growth_revision"] == 3 and next(m for m in corrected_current["members"] if m["canonical"] == "HyunE")["power"] == hyune["power"] + 1)
    correction_withdraw = {"batch_id": correction_batch["batch_id"], "growth_revision": 3, "identity_revision": 1, "mutation": mutation()}
    _, correction_removed = call("/api/growth/withdraw", "POST", correction_withdraw, token)
    _, restored_current = call("/api/growth/current")
    check("correction withdrawal restores target", correction_removed["restored_batch_id"] == batch1["batch_id"] and restored_current["revision"] == 4 and restored_current["batch_id"] == batch1["batch_id"] and next(m for m in restored_current["members"] if m["canonical"] == "HyunE")["power"] == hyune["power"])

    review_pkg = package(
        "2026-10-10", "daily",
        [
            {"raw_name": "HyunE?", "power": hyune["power"] + 10, "level": hyune["level"], "rank": hyune["rank"], "uncertain": True, "uncertainty_reason": "OCR"},
            {"raw_name": "새길드원?", "power": 12345678, "level": 20, "rank": "R2", "uncertain": True, "uncertainty_reason": "신규 후보"},
        ], "review-2026-10-10")
    _, review_up = call("/api/growth/upload", "POST", review_pkg, token, expected=201)
    batch2 = review_up["batch"]
    check("review queue created", batch2["state"] == "needs_review" and review_up["review_count"] == 2)
    _, review_view = call(f"/api/growth/review?batch_id={batch2['batch_id']}", token=token)
    rows = review_view["rows"]
    _, review1 = call("/api/growth/review", "POST", {"batch_id": batch2["batch_id"], "draft_revision": 1, "mutation": mutation(), "row_id": rows[0]["row_id"], "action": "connect", "member_id": hyune["member_id"]}, token)
    _, review2 = call("/api/growth/review", "POST", {"batch_id": batch2["batch_id"], "draft_revision": 2, "mutation": mutation(), "row_id": rows[1]["row_id"], "action": "direct_new", "display_name": "새길드원", "power": 12345678, "level": 20, "rank": "R2"}, token)
    check("connect/new/direct review", review2["batch"]["state"] == "ready" and review2["batch"]["draft_revision"] == 3)
    _, published2 = call("/api/growth/publish", "POST", {"batch_id": batch2["batch_id"], "growth_revision": 4, "identity_revision": 1, "draft_revision": 3, "mutation": mutation()}, token)
    check("identity revision on new member", published2["growth_revision"] == 5 and published2["identity_revision"] == 2)
    _, current2 = call("/api/growth/current")
    check("new member published with carry-forward", len(current2["members"]) == 88 and any(m["display_name"] == "새길드원" for m in current2["members"]))

    withdraw_mut = mutation()
    withdraw_req = {"batch_id": batch2["batch_id"], "growth_revision": 5, "identity_revision": 2, "mutation": withdraw_mut}
    _, withdrawn = call("/api/growth/withdraw", "POST", withdraw_req, token)
    _, withdraw_retry = call("/api/growth/withdraw", "POST", withdraw_req, token)
    check("withdraw idempotency", withdrawn["growth_revision"] == 6 and withdrawn["identity_revision"] == 3 and withdraw_retry["duplicate"])
    _, current3 = call("/api/growth/current")
    check("withdraw restores previous publication", current3["revision"] == 6 and current3["identity_revision"] == 3 and current3["observed_date"] == "2026-10-09" and len(current3["members"]) == 87)

    concurrency_pkg = package("2026-10-11", "daily", [{"raw_name": "HyunE?", "power": hyune["power"], "level": hyune["level"], "rank": hyune["rank"], "uncertain": True}], "concurrency")
    _, c_up = call("/api/growth/upload", "POST", concurrency_pkg, token, expected=201)
    c_batch = c_up["batch"]
    _, c_view = call(f"/api/growth/review?batch_id={c_batch['batch_id']}", token=token)
    c_row = c_view["rows"][0]
    first_mut = mutation()
    first_body = {"batch_id": c_batch["batch_id"], "draft_revision": 1, "mutation": first_mut, "row_id": c_row["row_id"], "action": "hold"}
    call("/api/growth/review", "POST", first_body, token)
    _, retry_review = call("/api/growth/review", "POST", first_body, token)
    check("review mutation idempotency", retry_review["duplicate"])
    stale_body = {"batch_id": c_batch["batch_id"], "draft_revision": 1, "mutation": mutation(), "row_id": c_row["row_id"], "action": "connect", "member_id": hyune["member_id"]}
    call("/api/growth/review", "POST", stale_body, token, expected=409)
    _, current_after_stale = call("/api/growth/current")
    check("stale review leaves publication unchanged", current_after_stale["revision"] == 6 and current_after_stale["batch_id"] == batch1["batch_id"])

    partial = package("2026-10-12", "daily", [{"raw_name": "HyunE", "power": hyune["power"], "level": hyune["level"], "rank": hyune["rank"]}], "partial", expected=87)
    _, partial_up = call("/api/growth/upload", "POST", partial, token, expected=201)
    check("partial package blocking warning", partial_up["batch"]["state"] == "needs_review" and "member_count" in partial_up["batch"]["validation"]["blocking"])
    same_source_other = package("2026-10-13", "daily", [{"raw_name": "HyunE", "power": hyune["power"], "level": hyune["level"], "rank": hyune["rank"]}], "partial")
    call("/api/growth/upload", "POST", same_source_other, token, expected=409)
    malformed = dict(partial)
    malformed["executable"] = "alert(1)"
    call("/api/growth/upload", "POST", malformed, token, expected=400)
    check("schema/source/partial validation", True)

    _, logout = call("/api/session", "POST", {"action": "logout"}, token)
    check("logout", logout == {"admin": False})
    _, expired = call("/api/session", token=token)
    check("logged-out token rejected", expired == {"admin": False})

    _, state1 = call("/api/state")
    docs1 = {d["kind"]: d for d in state1["documents"]}
    check("growth operations preserve operation documents", {k: docs1[k]["revision"] for k in docs1} == {"carriage": 14, "power": 1, "memos": 7})


if __name__ == "__main__":
    if "--config-stdin" in sys.argv:
        config = json.loads(sys.stdin.readline())
        BASE = str(config["base"]).rstrip("/")
        ADMIN_PASSWORD = str(config["admin_password"])
        SERVICE_TOKEN = str(config.get("service_token") or "")
    out_path = ROOT / "test-results/integration.json"
    try:
        run()
    except Exception as exc:
        RESULTS.append({"name": "uncaught", "status": "FAIL", "detail": repr(exc)})
        out_path.parent.mkdir(exist_ok=True)
        out_path.write_text(json.dumps({"base": BASE, "results": RESULTS}, ensure_ascii=False, indent=2) + "\n")
        print(f"FAIL: {exc}", file=sys.stderr)
        raise
    out_path.parent.mkdir(exist_ok=True)
    out_path.write_text(json.dumps({"base": BASE, "results": RESULTS}, ensure_ascii=False, indent=2) + "\n")
    print(f"PASS: {sum(r['status'] == 'PASS' for r in RESULTS)} checks")
