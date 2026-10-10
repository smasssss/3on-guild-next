#!/usr/bin/env python3
"""2.1 mobile admin UX API contract and source acceptance checks."""

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


def decision(token: str, batch: str, revision: int, row: str, action: str, **extra):
    return call(
        "/api/growth/review",
        "POST",
        {"batch_id": batch, "draft_revision": revision, "mutation": mutation(), "row_id": row, "action": action, **extra},
        token,
    )


def run() -> None:
    if not PASSWORD:
        raise AssertionError("STAGING_ADMIN_PASSWORD is required")
    page = (ROOT / "app/page.tsx").read_text()
    css = (ROOT / "app/globals.css").read_text()
    check("four primary admin menus", all(x in page for x in ["성장 현황", "자료 업로드", "확인 대기", "변경 내역"]))
    check("review uses overlay", "className=\"sheet\"" in page and "role=\"dialog\"" in page)
    check("previous next navigation", "이전" in page and "다음" in page and "index+1" in page)
    check("decision confirmation", "변경 내용을 확인해 주세요" in page and "아직 공개 성장자료에는 반영되지 않습니다" in page)
    check("draft undo and changes", "되돌리기" in page and "변경 취소" in page)
    check("two step publish", "최종 반영 전 변경 요약" in page and "이 성장자료를 최종 공개할까요" in page)
    check("draft vs withdrawal wording", "Draft 변경 취소" in page and "공개 후 반영 취소" in page)
    check("staging regression separated", "Staging 관리·검증 도구" in page and "Production에는 반영되지 않습니다" in page)
    check("mobile breakpoints", all(f"@media(max-width:{width}px)" in css.replace(" ", "") for width in [640, 430, 340]))
    check("fixed mobile action bar", ".decisionDock" in css and "position:sticky" in css.replace(" ", ""))
    check("horizontal overflow guarded", "overflow-x:hidden" in css.replace(" ", ""))

    login = call("/api/session", "POST", {"password": PASSWORD})
    token = login["token"]
    current = call("/api/growth/current")
    members = current["members"]
    check("baseline current members", len(members) >= 87, str(len(members)))
    state_before = call("/api/state")
    document_revisions = {d["kind"]: d["revision"] for d in state_before["documents"]}

    marker = uuid.uuid4().hex
    rows = [
        {"raw_name": "HyunE 확인?", "normalized_candidate": "HyunE", "power": members[0]["power"], "level": members[0]["level"], "rank": members[0]["rank"], "uncertain": True, "uncertainty_reason": "OCR 확인"},
        {"raw_name": "UX 신규?", "power": 12_345_678, "level": 25, "rank": "R2", "uncertain": True, "uncertainty_reason": "신규 후보"},
        {"raw_name": "직접수정?", "power": members[1]["power"], "level": members[1]["level"], "rank": members[1]["rank"], "uncertain": True, "uncertainty_reason": "수치 확인"},
        {"raw_name": "보류복원?", "power": members[2]["power"], "level": members[2]["level"], "rank": members[2]["rank"], "uncertain": True, "uncertainty_reason": "부분 화면"},
    ]
    package = {
        "schema": "3on-growth-package-v1",
        "observed_date": "2026-10-20",
        "slot": "ux21-" + marker[:8],
        "expected_member_count": 4,
        "source_hashes": [hashlib.sha256(marker.encode()).hexdigest()],
        "operation_id": mutation(),
        "rows": rows,
    }
    upload = call("/api/growth/upload", "POST", package, token, 201)
    batch = upload["batch"]["batch_id"]
    check("review draft created", upload["review_count"] == 4 and upload["batch"]["state"] == "needs_review")
    view = call(f"/api/growth/review?batch_id={batch}", token=token)
    row_ids = [row["row_id"] for row in view["rows"]]
    check("server batch summary", view["summary"]["total"] == 4 and view["summary"]["review_required"] == 4)

    connect = decision(token, batch, 1, row_ids[0], "connect", member_id=members[0]["member_id"])
    check("connect recorded as draft change", connect["summary"]["connections"] == 1 and len(connect["changes"]) == 1)
    event = connect["result"]["event_id"]
    undo = decision(token, batch, 2, row_ids[0], "undo", event_id=event)
    check("server side undo", undo["summary"]["review_required"] == 4 and len(undo["changes"]) == 0)
    reconnect = decision(token, batch, 3, row_ids[0], "connect", member_id=members[0]["member_id"])
    check("reapply after undo", reconnect["summary"]["connections"] == 1)

    new_result = decision(token, batch, 4, row_ids[1], "direct_new", display_name="UX테스트신규", power=12_345_678, level=25, rank="R2")
    check("new member change", new_result["summary"]["new_members"] == 1)
    reset_new = decision(token, batch, 5, row_ids[1], "reset")
    check("new member cancellation", reset_new["summary"]["new_members"] == 0 and reset_new["summary"]["review_required"] == 3)
    new_again = decision(token, batch, 6, row_ids[1], "direct_new", display_name="UX테스트신규", power=12_345_679, level=25, rank="R2")

    direct = decision(token, batch, 7, row_ids[2], "direct_connect", member_id=members[1]["member_id"], power=members[1]["power"] + 123, level=members[1]["level"], rank=members[1]["rank"])
    check("direct number edit", direct["summary"]["direct_edits"] == 1)
    direct_again = decision(token, batch, 8, row_ids[2], "direct_connect", member_id=members[1]["member_id"], power=members[1]["power"] + 456, level=members[1]["level"], rank=members[1]["rank"])
    latest_event = next(item["decision"]["event_id"] for item in direct_again["changes"] if item["row"]["row_id"] == row_ids[2])
    direct_undo = decision(token, batch, 9, row_ids[2], "undo", event_id=latest_event)
    restored = next(row for row in direct_undo["rows"] if row["row_id"] == row_ids[2])
    check("undo restores previous edit", restored["power"] == members[1]["power"] + 123)

    held = decision(token, batch, 10, row_ids[3], "hold")
    check("hold separated from required", held["summary"]["held"] == 1 and held["summary"]["review_required"] == 0)
    reset_hold = decision(token, batch, 11, row_ids[3], "reset")
    check("hold returns to review", reset_hold["summary"]["held"] == 0 and reset_hold["summary"]["review_required"] == 1)
    ready = decision(token, batch, 12, row_ids[3], "unobserved", member_id=members[2]["member_id"])
    check("all required decisions complete", ready["batch"]["state"] == "ready" and ready["summary"]["review_required"] == 0)
    check("change list consolidated", ready["summary"]["changed_members"] == 4 and len(ready["changes"]) == 4)

    publish_mutation = mutation()
    publish_request = {
        "batch_id": batch,
        "growth_revision": current["revision"],
        "identity_revision": current["identity_revision"],
        "draft_revision": ready["batch"]["draft_revision"],
        "mutation": publish_mutation,
    }
    published = call("/api/growth/publish", "POST", publish_request, token)
    retry = call("/api/growth/publish", "POST", publish_request, token)
    check("atomic publish and retry", published["growth_revision"] == current["revision"] + 1 and retry["duplicate"])
    published_view = call(f"/api/growth/review?batch_id={batch}", token=token)
    check("published changes retained for result", published_view["batch"]["state"] == "published" and len(published_view["changes"]) == 4)

    withdrawn = call(
        "/api/growth/withdraw",
        "POST",
        {"batch_id": batch, "growth_revision": published["growth_revision"], "identity_revision": published["identity_revision"], "mutation": mutation()},
        token,
    )
    after_withdraw = call("/api/growth/current")
    check("published withdrawal restores prior batch", withdrawn["growth_revision"] == published["growth_revision"] + 1 and after_withdraw["batch_id"] == current["batch_id"])
    state_after = call("/api/state")
    check("operational documents unchanged", {d["kind"]: d["revision"] for d in state_after["documents"]} == document_revisions, str(document_revisions))


if __name__ == "__main__":
    output = ROOT / "test-results/mobile-admin-ux.json"
    try:
        run()
    except Exception as exc:
        RESULTS.append({"name": "uncaught", "status": "FAIL", "detail": repr(exc)})
        output.parent.mkdir(exist_ok=True)
        output.write_text(json.dumps({"base": BASE, "results": RESULTS}, ensure_ascii=False, indent=2) + "\n")
        print(f"FAIL: {exc}", file=sys.stderr)
        raise
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps({"base": BASE, "results": RESULTS}, ensure_ascii=False, indent=2) + "\n")
    print(f"PASS: {sum(item['status'] == 'PASS' for item in RESULTS)} checks")
