#!/usr/bin/env python3
"""Prove the existing carriage/VIP/canyon/memo implementation was preserved."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STAGING = (ROOT / "public/legacy.html").read_text()

PRODUCTION_FUNCTION_SHA256 = {
    "nextBase": "055a7ec588598a9af4222d4a873fa79bf7422512c2ae137214b5d620db0612da", "nextBaseAfter": "d11699629ec8aaaa73a0b944249b7f9dce9ba28653372948eee40bc4ead91452",
    "renderForm": "f2417766861794931fa561da490fb15c9139db96a42526394fd316dc5e7d641b", "renderVipResults": "e6567f7683222f8dea4ce6ef39ad778d2dedddae81bb3f3f151af9830a417a6e",
    "vipTotalCount": "c6cd726734a73f458d457c47d572681287f861e359b83024d7be380eb010ca98", "effectiveCarry": "2fcb8992e1d79811c9b04c32fe00342f668c157d401e602429ab8df82cfed7ac",
    "validateState": "40c2b6d63d32bf8e3cba8bc434833be462ba6c328c18528bc88ab14ce2930c35", "snapshot": "1f9f89c301ba669a93b07f8a6bcc74a7a468bbb39ee9c514cb3d82f88e07489d",
    "canonicalOf": "79582e035e6d36afde740a298c2c583498d22106347d3684839d9fdf5c4bdea0", "rebuildPointer": "60b7d809779c7c312814094e743761e0a88edf15c2867234183973c0153eaf1d",
    "bind": "cd4b8df3e5c8fd2ee0e411e71cc77c22768164ec6c1bea1ba54698a27e95d688", "saveState": "8855cbad465b1fdb9d2bd8a4225c0d324706e1e9e8897ffc72107412ebce17c9",
    "commitOperations": "1ee617a9ccdf0aaa1bfe4332e0c54955434a71e076dc34f25d72c0e9ffea3aa6", "mergeOperations": "0c9a1cce731c4af0516b0d2c9f95db1d0d76268c75002315db56bded878e85a6",
    "parseOperationsBackup": "4343b0179e69b800e5e37530f04a56a511725fa3648f95d08c604e8a7ae4f979", "sharedWrite": "4bc77edb4e4ad9a1a23f7d25dc9839da439c19e8f4a021c87cecf23927653aa2",
    "sharedRestore": "386975426315c6ebfe2e9545db71aace2c19ed35e0c08ebb82423006d08ee30e", "sharedMigrate": "cd9e1be0965b7fe52a6f504a93757f490f1bc2146230b5f73d2190fa89df1a03",
    "canyonIdentity": "f429530a96ba786084637354c09e58f8847899f3190bf345740d33a2bb442801", "canyonValidDate": "f9fb56b97c87c4b766e917f28092b8ee2fa6cf683d644342b6b1bc9d136c43ce",
    "canyonValidate": "a373ec497c82970f39d94ca652a01ff7f8e8132c5129cbd0451492f758f43b0d", "canyonLoad": "030ed798291c2dcaaeef16a52081de454c15e9f61303c2da54b321366265d8da",
    "canyonMemo": "1f1ac01a2b82f9572f7eb9d025998d2a8110736b14049b75d25a01ac0c6278c", "canyonWrite": "46ea55c71016cd11e1d7943bb55e2aa8172e7b6e62a841701543a164a39dcddd",
    "renderCanyon": "29fe9f274313249c82e96bdedb643dc3ca13b201602caa7243b30f4313964ec5", "bindCanyon": "17751eecb5501bcb6906de6fe6c8e5588810e3732b4c3755b8585a2cd2b3f9a4",
    "sharedVerifySession": "201c29a8d675a28aa5655e7a077daeaf09f89a0c8b1e8b558e2b208fcb6e6656", "sharedLogout": "074897e306bded7df454ac64e8498c497d325cacc17a860def5621ba124e3aa6",
    "initLogin": "5de4a52e08acc8f8767adab992769e06937e1f34b7b6dd67dd6b8f5142d43a82",
}


def function(source: str, name: str) -> str:
    start = source.index("function " + name + "(")
    brace = source.index("{", start)
    depth = 0
    quote = None
    escaped = False
    for index in range(brace, len(source)):
        char = source[index]
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            continue
        if char in "'\"`":
            quote = char
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return source[start:index + 1]
    raise ValueError(name)


def main() -> None:
    critical_functions = [
        "nextBase", "nextBaseAfter", "renderForm", "renderVipResults", "vipTotalCount", "effectiveCarry",
        "validateState", "snapshot", "canonicalOf", "rebuildPointer", "bind", "saveState", "commitOperations",
        "mergeOperations", "parseOperationsBackup", "sharedWrite", "sharedRestore", "sharedMigrate",
        "canyonIdentity", "canyonValidDate", "canyonValidate", "canyonLoad", "canyonMemo", "canyonWrite",
        "renderCanyon", "bindCanyon", "sharedVerifySession", "sharedLogout", "initLogin",
    ]
    function_results = {}
    for name in critical_functions:
        staging_source = function(STAGING, name).replace("3on_admin_session_v2_staging", "3on_admin_session_v1")
        function_results[name] = hashlib.sha256(staging_source.encode()).hexdigest() == PRODUCTION_FUNCTION_SHA256[name]
    seed = json.loads((ROOT / "legacy/staging_documents_seed.json").read_text())
    docs = {item["kind"]: item for item in seed["documents"]}
    carriage = docs["carriage"]["data"]
    power = docs["power"]["data"]
    memos = docs["memos"]["data"]
    rotation = json.loads(re.search(r"const baseRotation=(\[[^;]+\]);", STAGING).group(1).replace("'", '"'))
    pointer = carriage["pointer"]
    recommended = rotation[pointer]
    base_pointer = (rotation.index(recommended) + 1) % len(rotation)
    manual_pointer = pointer
    vip_json = re.search(r"const VIP_IMPORT=(\{.*?\});", STAGING, re.S).group(1)
    vip = json.loads(vip_json)
    current_names = [m["name"] for m in json.loads((ROOT / "legacy/growth_2026-10-08.json").read_text())["members"]]
    checks = {
        "critical_function_source_preserved": all(function_results.values()),
        "three_documents": set(docs) == {"carriage", "power", "memos"},
        "document_revisions": {k: docs[k]["revision"] for k in docs} == {"carriage": 14, "power": 1, "memos": 7},
        "record_ids_and_snapshots": len(carriage["records"]) == 4 and all(r.get("id") and r.get("leaderSnapshot") for r in carriage["records"]),
        "base_and_insert_history": [r["type"] for r in carriage["records"]] == ["base", "base", "insert", "base"],
        "pointer_baseline": pointer == 1 and recommended == "어서가세요",
        "base_pointer_plus_one": base_pointer == 2,
        "manual_pointer_unchanged": manual_pointer == 1,
        "manual_same_recommendation_is_insert": "mode='insert';leaderSelectionDirty=true" in function(STAGING, "renderVipResults"),
        "reset_returns_recommendation": "mode='base';leaderSelectionDirty=false;renderForm()" in function(STAGING, "bind"),
        "full_member_search": "GROWTH.members" in function(STAGING, "renderVipResults") and len(current_names) == 87,
        "leader_vip_independent_buttons": 'data-leader=' in function(STAGING, "renderVipResults") and 'data-vip=' in function(STAGING, "renderVipResults"),
        "old_select_button_removed": '>선택<' not in function(STAGING, "renderVipResults"),
        "insert_ui_removed": "insertPool" not in function(STAGING, "renderForm") and "중간 투입" not in function(STAGING, "renderForm"),
        "vip_baseline_999": vip["baseline"]["어서가세요"] == 999 and vip["baseline"]["아일리"] == 999 and vip["baseline"]["용팝이"] == 999,
        "vip_resolution_preserved": "state.vipResolution" in function(STAGING, "effectiveCarry") and "return Number(state.vipResolution[canonical])" in function(STAGING, "effectiveCarry"),
        "vip_sort_preserved": "a.count-b.count" in function(STAGING, "renderVipResults") and "b.m.level-a.m.level" in function(STAGING, "renderVipResults"),
        "canyon_all_weekdays": "getUTCDay" not in function(STAGING, "canyonValidDate") and "^\\d{4}-\\d{2}-\\d{2}$" in function(STAGING, "canyonValidDate"),
        "canyon_seed": len(power["weeks"]) == 1 and power["weeks"][0]["date"] == "2026-10-08" and len(power["weeks"][0]["members"]) == 20,
        "memo_keys_preserved": set(memos["members"]) == {"guild:아일리", "guild:내가두려운가"},
        "storage_namespaced": "3on_carriage_proto_v1_staging" in STAGING and "3on_admin_session_v2_staging" in STAGING,
        "staging_backend_only": "https://threeon-next-staging.alswlgns2.chatgpt.site" in STAGING and ("https://threeon-shared" + "-data.alswlgns2.chatgpt.site") not in STAGING,
    }
    result = {
        "status": "PASS" if all(checks.values()) else "FAIL",
        "checks": checks,
        "critical_functions": function_results,
        "critical_source_sha256": hashlib.sha256("\n".join(function(STAGING, n) for n in critical_functions).encode()).hexdigest(),
        "operation_baseline": {"pointer": pointer, "nextBase": recommended, "records": len(carriage["records"]), "power_weeks": len(power["weeks"]), "memo_keys": list(memos["members"])},
    }
    out = ROOT / "test-results/operations-regression.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if result["status"] != "PASS":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
