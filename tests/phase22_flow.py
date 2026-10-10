#!/usr/bin/env python3
"""Focused 2.2 mirror and simplified growth-flow acceptance checks."""

from __future__ import annotations

import hashlib
import json
import os
import urllib.error
import urllib.request
import uuid
from pathlib import Path

BASE = os.environ.get("STAGING_BASE", "http://127.0.0.1:8794").rstrip("/")
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


def mutate(token: str, view: dict, row_id: str, action: str, **extra):
    return call(
        "/api/growth/review",
        "POST",
        {"batch_id": view["batch"]["batch_id"], "draft_revision": view["batch"]["draft_revision"], "mutation": uuid.uuid4().hex, "row_id": row_id, "action": action, **extra},
        token,
    )


def run() -> None:
    if not PASSWORD:
        raise AssertionError("STAGING_ADMIN_PASSWORD is required")

    root_page = (ROOT / "app/page.tsx").read_text()
    admin_page = (ROOT / "app/growth-admin/page.tsx").read_text()
    legacy = (ROOT / "public/legacy.html").read_text()
    production = (ROOT.parent / "work/index.html").read_bytes()
    check("production baseline blob", hashlib.sha1(b"blob " + str(len(production)).encode() + b"\0" + production).hexdigest() == "45fd61f7008cc9392c0cfc95adc066475efc9a44")
    check("root opens production mirror", "legacy.html" in root_page and "location.replace" in root_page)
    check("five production tabs", all(name in legacy for name in ["성장추적", "협곡대전 1소대", "마차관리", "운영이력", "관리설정"]))
    check("staging environment marker", "STAGING · Production과 분리된 검증 환경" in legacy)
    check("growth update entry", "growthUpdateEntry" in legacy and "./growth-admin" in legacy)
    check("simplified result first flow", all(text in admin_page for text in ["AI 처리 결과", "전체 결과 보기", "이번 변경만 보기", "판독 실패"]))
    check("no general hold action", "action:'hold'" not in admin_page and ">보류<" not in admin_page)
    check("no general unobserved action", "action:'unobserved'" not in admin_page and "이번 관측 미확인" not in admin_page)
    check("direct fields and advanced identity", all(text in admin_page for text in ["닉네임", "등급", "레벨", "전투력", "고급 수정 · 연결 대상 변경"]))

    session = call("/api/session", "POST", {"password": PASSWORD})
    token = session["token"]
    current = call("/api/growth/current")
    members = current["members"]
    target_stat = next(member for member in members if member["rank"] == "R5")
    target_exact = next(member for member in members if member["canonical"] == "핵불잡")
    relink_target = next(member for member in members if member["member_id"] not in {target_stat["member_id"], target_exact["member_id"]})
    state_before = call("/api/state")
    revisions_before = {item["kind"]: item["revision"] for item in state_before["documents"]}

    marker = uuid.uuid4().hex
    package = {
        "schema": "3on-growth-package-v1",
        "observed_date": "2026-10-22",
        "slot": "phase22-" + marker[:8],
        "expected_member_count": 4,
        "source_hashes": [hashlib.sha256(marker.encode()).hexdigest()],
        "operation_id": uuid.uuid4().hex,
        "rows": [
            {"raw_name": "핵불잡", "normalized_candidate": "핵불잡", "power": target_exact["power"], "level": target_exact["level"], "rank": target_exact["rank"], "uncertain": True, "uncertainty_reason": "OCR 획 확인"},
            {"raw_name": "완전히새닉네임", "normalized_candidate": "완전히새닉네임", "power": target_stat["power"], "level": target_stat["level"], "rank": target_stat["rank"], "uncertain": False},
            {"raw_name": "2점2자동신규", "normalized_candidate": "2점2자동신규", "power": 987_654_321, "level": 777, "rank": "R1", "uncertain": False},
            {"raw_name": "판독불가행", "normalized_candidate": "판독불가행", "power": None, "level": 25, "rank": "R2", "uncertain": True, "uncertainty_reason": "전투력 판독 불가"},
        ],
    }
    uploaded = call("/api/growth/upload", "POST", package, token, 201)
    view = call(f"/api/growth/review?batch_id={uploaded['batch']['batch_id']}", token=token)
    by_raw = {row["raw_name"]: row for row in view["rows"]}
    check("exact OCR auto connects", by_raw["핵불잡"]["resolved_member_id"] == target_exact["member_id"] and by_raw["핵불잡"]["resolution_status"] == "resolved")
    check("history based auto connects", by_raw["완전히새닉네임"]["resolved_member_id"] == target_stat["member_id"] and by_raw["완전히새닉네임"]["nickname_change_guess"])
    check("automatic new member", by_raw["2점2자동신규"]["resolution_status"] == "new" and bool(by_raw["2점2자동신규"]["proposed_member_id"]))
    check("unreadable row is explicit failure", view["summary"]["failures"] == 1 and by_raw["판독불가행"]["resolution_status"] == "unresolved")
    blocked = call(
        "/api/growth/publish",
        "POST",
        {"batch_id": view["batch"]["batch_id"], "growth_revision": current["revision"], "identity_revision": current["identity_revision"], "draft_revision": view["batch"]["draft_revision"], "mutation": uuid.uuid4().hex},
        token,
        409,
    )
    check("failure blocks publish", "공개" in blocked["error"])

    view = mutate(token, view, by_raw["판독불가행"]["row_id"], "direct_new", display_name="판독수정신규", power=12_345_678, level=25, rank="R2", nickname_mode="ocr_correction")
    check("direct nickname level power rank edit", view["summary"]["failures"] == 0 and view["batch"]["state"] == "ready")
    exact = next(row for row in view["rows"] if row["raw_name"] == "핵불잡")
    view = mutate(token, view, exact["row_id"], "direct_connect", member_id=target_exact["member_id"], display_name="핵불잙", power=target_exact["power"] + 321, level=target_exact["level"], rank=target_exact["rank"], nickname_mode="ocr_correction")
    exact = next(row for row in view["rows"] if row["raw_name"] == "핵불잡")
    check("OCR correction is not alias", exact["confirm_alias"] == 0 and exact["proposed_display_name"] == "핵불잙" and exact["power"] == target_exact["power"] + 321)

    stat = next(row for row in view["rows"] if row["raw_name"] == "완전히새닉네임")
    before_relink = view
    view = mutate(token, view, stat["row_id"], "direct_connect", member_id=relink_target["member_id"], display_name=relink_target["display_name"], power=stat["power"], level=stat["level"], rank=stat["rank"], nickname_mode="ocr_correction")
    check("advanced identity relink", next(row for row in view["rows"] if row["row_id"] == stat["row_id"])["resolved_member_id"] == relink_target["member_id"])
    view = mutate(token, view, stat["row_id"], "reset")
    check("advanced relink reset", next(row for row in view["rows"] if row["row_id"] == stat["row_id"])["resolved_member_id"] == next(row for row in before_relink["rows"] if row["row_id"] == stat["row_id"])["resolved_member_id"])
    stat = next(row for row in view["rows"] if row["raw_name"] == "완전히새닉네임")
    renamed_display = target_stat["display_name"] + "·2.2테스트"
    view = mutate(token, view, stat["row_id"], "direct_connect", member_id=target_stat["member_id"], display_name=renamed_display, power=stat["power"], level=stat["level"], rank=stat["rank"], nickname_mode="rename")
    check("confirmed nickname change separated from OCR", next(row for row in view["rows"] if row["row_id"] == stat["row_id"])["confirm_alias"] == 1)

    published = call(
        "/api/growth/publish",
        "POST",
        {"batch_id": view["batch"]["batch_id"], "growth_revision": current["revision"], "identity_revision": current["identity_revision"], "draft_revision": view["batch"]["draft_revision"], "mutation": uuid.uuid4().hex},
        token,
    )
    after = call("/api/growth/current")
    check("final atomic publish", after["revision"] == current["revision"] + 1 and after["batch_id"] == view["batch"]["batch_id"])
    check("new members published", len(after["members"]) == len(members) + 2)
    check("confirmed nickname updates display", next(member for member in after["members"] if member["member_id"] == target_stat["member_id"])["display_name"] == renamed_display)
    state_after = call("/api/state")
    check("operations documents unchanged", {item["kind"]: item["revision"] for item in state_after["documents"]} == revisions_before, str(revisions_before))
    withdrawn = call("/api/growth/withdraw", "POST", {"batch_id": view["batch"]["batch_id"], "growth_revision": published["growth_revision"], "identity_revision": published["identity_revision"], "mutation": uuid.uuid4().hex}, token)
    restored = call("/api/growth/current")
    check("test publication withdrawn", withdrawn["restored_batch_id"] == current["batch_id"] and restored["batch_id"] == current["batch_id"])
    check("withdraw restores nickname display", next(member for member in restored["members"] if member["member_id"] == target_stat["member_id"])["display_name"] == target_stat["display_name"])


if __name__ == "__main__":
    output = ROOT / "test-results/phase22-flow.json"
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
