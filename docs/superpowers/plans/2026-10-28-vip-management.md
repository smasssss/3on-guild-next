# VIP Management Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 기존 운영자료를 보존하면서 주간 VIP 자격과 자동수집 명단을 연동한다.

**Architecture:** 현재 관측 DB를 읽는 별도 VIP 서비스와 기존 documents/backups 기반 주간 문서.
KST 주차를 읽기 시 계산하여 월요일 전환을 결정한다. 기존 수집·마감은 수정하지 않는다.

**Tech Stack:** Workers/D1, TypeScript, vinext, 기존 legacy UI, Node sqlite fixture.

**Spec:** `docs/superpowers/specs/2026-10-28-vip-management.md`

## Global Constraints

- Source SHA `8caefa5c8b0259f847ab72180016d045d8566f60`.
- VIP 누적·기록·영구 제외, 성장/협곡, 날짜 선택, 7명 로테이션 보존.
- KST Monday, threshold 21,720,000; 점수 대체, 누락 unknown.
- 원격 변경은 관리 인증·버전·백업 확인 후에만 수행.
- 새로운 수집/Cron/외부 호출·DB migration 없음.

## Review Focus

- 토요일 업로드와 월요일 자정 경계, 이후 자료 미제공.
- 같은 자료 재전송·수정·CAS 충돌 및 과거 백업 복원.
- 이름 변경/동명이인/키릴문자/재가입과 회원 ID 유지.
- 구버전 클라이언트가 영구 제외나 새 상태를 누락한 전체 문서를 전송.
- 기존 VIP의 메모 수정과 새로운 VIP 지정 구분, 999·공주 1회 유지.

### Task 1: 주간 자격과 로스터 서비스

Files: `lib/vip-weekly.ts`, `tests/vip_weekly_regression.cjs`.
Interfaces: `weekOf(ms)`, `readRoster(db)`, `weeklyView(data,now)`,
`prepareWeekly(input,roster,now)`, `eligibility(member,carriage,weekly,now)`.

- [x] 정수 경계·KST 11/02·11/09·미제공·부분 누락·16명·영구 제외 테스트를 먼저 작성하고 실패 확인.
- [x] latest snapshot 한 번, 로스터 한 번을 읽고 기존 인덱스를 사용한다. 주간 자료를 순수 함수로 검증한다.
- [x] 실제 SQLite fixture에서 가입·미관측·이름 변경·재가입 검토·영구 제외 유지 검증.
- [x] `node tests/vip_weekly_regression.cjs` 통과 후 커밋.

### Task 2: 인증된 업로드와 서버 저장 차단

Files: `app/api/carriage/vip/route.ts`, `lib/vip-weekly.ts`,
`app/api/state/route.ts`, `lib/validate.ts`, `tests/vip_api_regression.cjs`.
Interfaces: GET returns roster/weekly/eligibility/revision; authenticated POST accepts revision/mutation/snapshot.

- [x] 실제 route+SQLite로 무인증·origin·업로드 중복·CAS·백업·복구·VIP 서버 거부 테스트 RED 확인.
- [x] 기존 문서 자동 백업 트랜잭션을 점수 문서에 적용하고 동일 자료는 no-op 처리한다.
- [x] carriage 수정 시 영구 제외와 주간 문서 보호, 신규/교체 VIP 자격 검사. 기존 기록은 재계산하지 않는다.
- [x] API 회귀와 Task 1 시험 GREEN 후 커밋.

### Task 3: 마차 UI와 스냅샷 입력

Files: `public/carriage-vip.js`, `public/legacy.html`, `scripts/growth-auto-ui.mjs`,
`tests/vip_ui_regression.cjs`, 기존 영향받은 VIP 빌드 시험.

- [x] 실제 생성 UI의 제한 버튼·주간 점수·자료 누락·파일 검증·이름 변경 시험 RED 확인.
- [x] existing canonical을 보존한 hourly projection으로 선택기를 갱신한다.
- [x] 파일 JSON 검토·예정분 표시·업로드·템플릿 다운로드를 관리자 설정에 추가한다.
- [x] 빌드 후처리 중복을 방지하고 기존 날짜·로테이션 스크립트를 유지한다.
- [x] UI, date, rotation, 운영 보존 시험 GREEN 후 커밋.

### Task 4: 로컬 통합·브라우저 검증과 인계

Files: `docs/vip-weekly.md`, local-only evidence under `/workspace/3on-vip-evidence`.

- [x] lint/typecheck/build 및 관련 성장·자동수집·협곡·VIP 회귀 실행.
- [x] 로컬 D1 fixture와 관리자 session으로 업로드·DB 재조회·화면 버튼·서버 차단·모바일 날짜 선택 검증.
- [x] 독립 코드 검토 후 중요한 발견은 회귀시험으로 수정.
- [x] 인증·백업 경계가 해결되지 않으면 배포 미실행으로 명시하고 검증 결과와 커밋을 보고.

검증 상태: 로컬 단계 완료. 원격 검증·배포는 토큰 expired로 미실행. 자세한 범위와 예외는 docs/vip-management-validation.md.
