---
name: promote-production
description: 3ON 운영센터 변경을 Staging 검증 후 Production에 올리는 절차. 사용자가 Production 배포를 승인했을 때만 사용한다.
---

# Staging 검증 → Production 승격 절차

전제: 사용자가 이번 변경의 Production 배포를 **명시적으로 승인**했다. 승인 없으면 여기서 멈추고 묻는다.

## 1. 올리기 전 (로컬)
- `npx tsc --noEmit`, 바뀐 파일 `npx eslint`, `npm run build` 통과.
- `tests/`의 회귀 시험 전체 통과(특히 roster_sync_regression, roster_read_budget, vip_*). 실패하면 올리지 않는다.
- 새 화면 파일·스크립트를 추가했다면 `tests/roster_sync_scope_preserved.py`의 허용 목록에 넣는다.
- 변경을 커밋해 `claude/new-session-narazy`에 올린다(이것만으로는 배포되지 않는다).

## 2. 배포 시작
- `.github/workflows/roster-sync-production.yml` 맨 위 주석에 이번 릴리스 한 줄을 추가하고, 새 시험이 있으면 시험 목록에도 넣어 커밋·푸시한다. 이 파일이 바뀐 푸시가 배포를 시작한다.
- 워크플로 순서: Staging 검사 → (매시 12~35분 UTC에만) Production 전체 백업·암호화 → 같은 빌드 업로드·활성화 → 문서·설정·Cron·화면 확인 → 영구 제외 확인 → 실패 시 이번 코드만 자동 되돌림.
- 주의: Production 단계 제한 시간은 25분이다. Staging이 매시 36분 이후 끝나면 기다리다 취소될 수 있다. 그러면 같은 실행을 다시 실행(rerun)한다.

## 3. 올린 뒤 확인 (읽기만, 적은 행만)
- 실행 결과에서 실패·취소 단계가 없는지 본다.
- 다음 정시 수집이 받아졌는지(`growth_auto_runs` 최신 몇 건), 영구 제외 수가 유지되는지 확인한다.
- 명단 변경이 있으면 `growth_auto_events`의 roster_join / roster_leave 근거(수집 3회)를 확인한다.
- 결과를 한국어로 보고한다.
