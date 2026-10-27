# VIP 개편 개발·검증 보고

상태: **로컬 구현·fixture 검증 완료. 원격 Staging·Production 미반영.**

## 1. 기존 구조

실제 운영 기준은 `smasssss/3on-guild-next`의
`8caefa5c8b0259f847ab72180016d045d8566f60`이며, `main b82f6ed`가 아니다.
원격 브랜치를 가져와 tree `33e268bb165d0c3f7eb0c41db32a85eddfdd9b90`를 확인했다.
원래 `/workspace/3on-guild-next`의 work 브랜치는 변경하지 않았다.

작업 위치: `/workspace/3on-guild-vip`, 브랜치 `feat/vip-management-v2`.
운영 소스와 마지막 배포 관계는 사용자 인계보고서를 기준으로 삼았고,
현재 active Worker UUID를 새로 검증했다고 주장하지 않는다.

## 2. 실제 구현

- 기존 자동수집이 저장한 최신 완전 로스터·게임 ID·확정 회원 연결로 마차 명단을 구성한다.
- 미관측 인원은 선택 대상에서 제외하고 기록은 보존한다. 재가입·동일인 검토는 기존 절차를 따른다.
- 이번 주 지정 16명 제한과 영구 제외를 분리했다. 둘 다 있는 경우 영구 제외가 우선한다.
- 토요일 자료와 다음 월요일 적용을 분리했다. 11/2 이후 해당 주 자료·개인 점수가 없으면 선택 불가다.
- 점수는 매주 대체한다. 21,720,000점 경계, KST 월요일 전환, 다음 주 미제공을 서버에서 판정한다.
- 화면은 주간 점수·주차·갱신시각을 표시한다. 성장용 투력과 기존 과거 snapshot은 유지했다.
- JSON 양식 다운로드, 파일 검토, 누락 수 표시, 업로드, 최소 복구 사본 다운로드를 추가했다.
- 실제 VIP 저장 API도 자격을 검사한다. UI 비활성화를 우회한 요청은 422로 거부한다.
- 기존 기록의 메모 수정은 현재 점수 없이 가능하며, 새 VIP 선택이 없으면 기존 VIP를 유지한다.

## 3. 수정 파일·커밋

| 역할 | 파일 |
|---|---|
| 정책·시간·명단·검증 | `lib/vip-weekly.ts` |
| 주간 조회·인증 업로드·복구 사본 | `app/api/carriage/vip/route.ts` |
| 실제 VIP 저장 검증·기존 ID/제외 보존 | `app/api/state/route.ts`, `lib/validate.ts` |
| 화면·JSON 검토·실시간 명단 | `public/carriage-vip.js`, `public/legacy.html` |
| 로테이션 편집의 명단 공급 | `public/carriage-rotation.js` |
| 빌드 후처리 안전검사 | `scripts/growth-auto-ui.mjs` |
| 검증 | `tests/vip_*`, `tests/vip-fixture.cjs`, 기존 빌드/VIP 회귀시험 |
| 운영 문서 | `docs/vip-weekly.md`, `docs/superpowers/*` |

로컬 구현 커밋:

- `0e1e65b` — KST 주간 정책과 저장 명단 조회.
- `fbd889b` — 주간 업로드·서버 차단·원자적 백업.
- `e52300c` — UI·파일 검토 연결.
- `a8b6f7c` — 리뷰 반영: 과거 VIP 수정 보존, 현재 소속 트랜잭션 검사.

GitHub push·PR·워크플로 실행은 하지 않았다.

## 4. D1 변경

테이블·컬럼·migration 변경 없음. 기존 documents/backups의 독립 `vip-weekly`
문서에 current/pending을 저장한다. 점수 백업은 최소 두 사본만 보관한다.
기존 `/api/state` 세 문서 응답 계약은 유지한다. 점수 갱신은 carriage를 쓰지 않는다.
실제 운영 D1에는 접근·변경·초기 migration 재적용을 하지 않았다.

## 5~6. VIP 횟수·영구 제외 보존

VIP_IMPORT, effectiveCarry, vipTotalCount, 기존 carry/resolution 집계 코드는
운영 기준 소스와 동일함을 검사했다. 999 기초값·공주 1회·기존 기록·제외를
로컬 fixture에서 검증했다. 구버전 클라이언트가 제외 목록이나 회원 ID를 누락해도 보존한다.
기존 Production 제외 9명의 현재 실DB 상태는 이번 세션에서 다시 읽지 못했다.

## 7. 주간 교체 검증

Node 실제 정책과 SQLite route fixture에서 다음을 통과했다.

- KST 11/1 23:59:59 → 11/2 00:00:00 전환.
- 11/2 첫 점수, 11/9 다음 점수 교체, 이전 점수 합산·이월 금지.
- 21,719,999 불가 / 21,720,000 가능.
- 21,720,000 → 15,000,000 → 23,000,000의 주간 대체, 부분 누락 unknown.
- 16명 제한, 월요일 해제 후 점수 재판정, 영구 제외는 계속 차단.
- 중복 파일·mutation no-op, 수정 자료 대체, revision 충돌 409.
- 점수 변경·탈퇴/매핑/관측 변경과 저장 경합 시 전체 트랜잭션·백업 취소.

실제 미래 날짜의 원격 Cron이나 실제 운영 월요일 적용을 기다려 확인한 것은 아니다.
월요일 정책은 시간을 고정한 테스트로 검증했다.

## 8. 자동수집 유지

`lib/growth-automation.ts`, Worker scheduled handler, growth API, 기존 인덱스/마감
코드를 변경하지 않았다. 기존 collector 회귀와 D1 lookup query-plan 시험이 통과했다.
로컬 Worker mode는 fixture이고 외부 호출 집계 0을 유지했다.
Production의 INCOMPLETE_ROSTER·delayed는 사용자 인계 시 알려진 상태로 남겨 두었다.
현재 실제 Production 수집 성공 여부는 이번 세션에서 검증하지 않았다.

## 9. 로컬 검증과 Staging 상태

통과:

- 신규 weekly/API/UI/save 회귀 네 종류.
- date/rotation, growth automation, D1 latest lookup.
- growth changes, canyon latest, production growth의 로컬 SQLite 회귀.
- `vip_scope_preserved.py`, 빌드 후처리 보존, built VIP 제외 회귀.
- 실제 로컬 Worker+D1의 legacy lineage 회귀 **17 checks**.
- TypeScript `tsc --noEmit`, 실제 build, 변경 파일 ESLint, diff whitespace 검사.
- 독립 코드 리뷰. 중요 발견 3건 모두 실패 재현 테스트 후 수정·검증.

Playwright + 로컬 Worker/D1에서 확인:

- 관리자 로그인, 16명 버튼 모두 비활성화, 공주 누적 1회 표시.
- 실제 저장으로 기존 fixture 운행 4건을 유지한 채 1건 추가, 회원 ID 저장.
- 실제 API의 제한 대상 거부 422, 수정 전 백업 4건 재조회.
- 메모 수정 후 VIP·회원 ID와 총 기록 5건 유지.
- 모바일 날짜 선택 UI, 주간 JSON 파일 검토와 쉼표 점수 표시.
- 미래 제공일의 업로드를 서버가 400으로 거부.
- 성장·협곡·마차·운영이력·관리설정 메뉴 진입.

전체 `npm run lint`는 수정 전 기준 소스에서도 **45 errors / 2 warnings**로 실패한다.
기존 CommonJS 테스트의 require/module 규칙 문제이며 이번 변경 파일의 lint는 통과했다.
과거 전체 해시 고정 운영/로테이션 scope 테스트는 더 오래된 작업 기준이므로,
이번에는 실제 운영 소스 기준의 `vip_scope_preserved.py`로 보존을 확인했다.

원격 Staging에는 배포·쓰기 시험을 하지 않았다. 로컬 fixture와 원격 Staging 검증을 구분한다.
스크린샷·로컬 로그·복구용 소스 bundle 등은 `/workspace/3on-vip-evidence`에 보관한다.

## 10~11. Production과 남은 문제

Cloudflare `/user/tokens/verify`를 읽기 전용으로 재조회한 결과
`success=true`, **`status=expired`**였다. 비밀값은 출력하지 않았다.

따라서 현재 active version/설정 확인, 그 시점의 전체 D1 백업·격리 복구 검증,
원격 Staging 시험, Production 배포 및 실제 데이터 검증은 **미실행**이다.
토큰을 채팅에 전달할 필요는 없으며 개발환경의 정상 Cloudflare 연결을 갱신하면 된다.
갱신 후 수행할 구체적인 안전 절차는 `docs/vip-weekly.md`의 배포 경계에 적었다.

사용자가 제공한 실제 주간 점수는 아직 없다. 임의 점수를 운영에 입력하지 않았다.
실제 스크린샷의 OCR·누락 여부와 ID 매칭은 해당 자료 제공 시 검토해야 한다.

## 운영 판단

- 신규 VIP는 운행일과 별개로 현재 서버 KST 주차로 판정한다. 날짜로 제한을 우회하지 않는다.
- 11/2 전에는 기존 규칙 + 16명 제한, 11/2부터 필수 주간 점수를 적용한다.
- 읽기 시 월요일 전환을 계산하고 다음 업로드 때 슬롯을 정리한다. Cron/전원 쓰기를 추가하지 않는다.
- 점수는 기존 세 문서 백업과 분리된 전용 문서·복구 사본으로 보관한다.
- 과거 기록의 동일 VIP는 재선정으로 취급하지 않는다. 실제로 새 사람을 지정할 때만 자격을 검사한다.
- 기존 전체 lint 문제는 이번 VIP 범위에서 무관한 설정 수정으로 해결하지 않았다.

위 판단은 미래 운행의 사전 VIP 확정이나 별도의 운행일별 자격 규칙을 요구할 경우
다시 검토해야 한다. 현재 사양은 선택 시점의 주간 자격으로 해석했다.
