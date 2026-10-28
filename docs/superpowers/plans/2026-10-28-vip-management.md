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

## 후속 변경: 새 주 자료 미제공

- [x] 이전 적용 점수·자격 유지, 여러 주 공백, 새 자료 월요일 대체, 영구 제외·저점수 유지 테스트 RED→GREEN.
- [x] 실제 점수 기준 주차와 운영 주차·유지 상태 표시 및 UI 회귀.
- [x] 계속 사용하는 과거 원본 수정 시 예정 자료 보존, API 중복·CAS·VIP 횟수 보존 검증.
- [x] 변경 파일 lint·타입·빌드·보존 회귀와 최종 검토.

## 후속 확정: 첫 점수 적용 전

- [x] 초기 점수 미등록 상태에서도 일반 인원 선택 허용, 16명·영구 제외 유지 정책/API/UI 회귀 RED→GREEN.
- [x] 첫 자료 업로드와 실제 월요일 적용 분리, 기존 VIP·운행·횟수 보존 API 검증.
- [x] 초기 모드 문서·타입·lint·빌드·보존 회귀 확인.

## Task 5: 인증된 원격 Staging·Production 배포

사용자가 GitHub 인증 확인용 workflow, 암호화 전체 DB 백업의 Actions 14일 보관,
403 원인 해결 후 Staging 검증을 거친 Production 배포를 승인했다.

- [x] 기존 GitHub Actions 토큰 active 확인. 현재 두 DB 바인딩·mode·Cron 확인.
- [x] 두 DB 전체 SQL 내보내기·격리 SQLite 복구·암호화 보관 완료.
- [x] 기본 urllib 요청의 Cloudflare1010 재현. 기존 배포 도구의 정직한 User-Agent와
  기본 Playwright Chrome은 모두 정상 응답. 접근·보안 설정은 변경하지 않음.
- [x] 같은 설정·문서·버전의 backup/CAS guard, code-only rollback, 동일 artifact 전달 절차 작성.
- [x] 새 배포 절차의 실제 로컬 browser/D1 검증 및 독립 리뷰 완료.
- [x] Staging 현재 소스·설정 확인, 새 전체 백업과 VIP 횟수 브라우저 기준 보관 후 배포.
- [x] 유일한 ID의 검증용 명단으로 16명 버튼·서버422·로그인·미래자료400·날짜·기존 메뉴 검증.
- [x] 삽입한 검증 행만 정리하고 문서·백업·성장 이력·설정 불변성 재확인.
- [x] 검증한 정확한 build artifact를 Production으로 전달, 새 백업·기준값 후 코드 배포.
- [x] 실제 누적 횟수 전체·영구 제외·로테이션·관리자 접근·Cron·화면 검증 및 완료 보고.

기존 `growth_automation_staging.py`는 전체 테이블 복구와 성장 변경을 포함하므로 재사용하지 않는다.
점수 업로드 거부 시험은 실제 serverTime보다 최소 7일 이후 토요일을 사용해, 나중에 재실행해도
임의 점수가 저장되지 않도록 한다. 미래 월요일 성공 전환은 기존 시간을 고정한 회귀 시험으로 검증한다.
