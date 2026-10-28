# VIP 개편 개발·배포 완료 보고

확인일: 2026-10-28, 한국시간.
**Staging 검증 후 동일 빌드의 Production 배포와 실제 화면·API 검증까지 완료했다.**

- 배포 소스: `3e40399b2c7fa4e443e7d6ba384c889c966049a1`.
- 실행: https://github.com/smasssss/3on-guild-next/actions/runs/40637332671
- Production: https://3on-guild-production.295server.workers.dev/
- Staging: https://3on-guild-staging.295server.workers.dev/
- Staging 실제 검증 완료: 2026-10-28 14:21 KST.
- Production 전환 확인: 2026-10-28 14:22 KST; 마지막 화면·API·데이터 검증 14:22:42 KST.
- 독립 읽기 전용 운영 점검: 14:25:45 KST, https://github.com/smasssss/3on-guild-next/actions/runs/40637928936

## 1. 기존 구조 분석

실제 저장소는 `smasssss/3on-guild-next`, 기존 운영 소스는
`8caefa5c8b0259f847ab72180016d045d8566f60`이었다. 오래된 main `b82f6ed`는 배포하지 않았다.
기존 프로젝트와 운영 Worker를 유지했고 원래 작업 트리는 변경하지 않았다.
배포 직전 실제 active UUID, HTML·자산, DB 바인딩, 변수, 관리자 secret 이름,
compatibility 설정, Cron, 로그·개인정보 보호 설정을 확인했다.

자동수집은 기존 Worker의 scheduled handler에서 실행한다. 마차·VIP 기록은
기존 documents/carriage, 기초값·해결값·실제 VIP 기록으로 집계한다.
영구 제외는 기존 회원 ID별 vipExcludedMembers를 그대로 사용한다.

## 2. 수정한 기능

- 저장된 최신 정상 관측과 확정 game/member ID로 마차 명단을 구성한다.
- 닉네임·등급·레벨을 반영하고 확인되지 않은 소속·동일인은 선택하지 않는다.
  기록을 삭제하거나 닉네임만으로 다른 인물과 연결하지 않는다.
- 첫 주간 점수가 실제 적용되기 전에는 기존 자격과 지정 16명 제한·영구 제외를 적용한다.
  일반 길드원은 점수 미제공만으로 차단하지 않는다.
- 토요일 제공 점수는 다음 월요일 KST부터 적용하고 이전 점수를 대체한다.
  새 주 전체 자료가 없으면 마지막 적용 점수·자격과 원래 갱신시각을 유지한다.
- 첫 점수 적용 후 21,720,000점 경계로 판정한다. 영구 제외가 언제나 우선한다.
- 마차 화면의 투력 표시를 주간 포인트로 바꾸고 미확인·주차·원본 기준·갱신시각을 표시한다.
  성장용 투력과 과거 운행 snapshot은 보존한다.
- JSON 양식·자료 검토·인증 업로드·최소 복구 사본을 추가했다.
- 서버가 실제 VIP 저장 자격을 검증한다. 기존 동일 VIP의 메모 수정은 재선정으로 처리하지 않는다.
- 구버전 클라이언트가 ID·제외 플래그를 누락하더라도 기존 정보를 유지한다.

주간 포인트는 LastAsylum의 activity를 임의로 해석하지 않고 사용자 스냅샷을 사용한다.
서버에서 스크린샷을 자동 인식하거나 별도의 외부 수집을 추가하지 않았다.

## 3. 파일·커밋

| 역할 | 파일 |
|---|---|
| KST 주간 정책·명단·자격 | lib/vip-weekly.ts |
| 주간 조회·업로드·최소 백업 | app/api/carriage/vip/route.ts |
| 실제 VIP 저장·영구 제외 보존 | app/api/state/route.ts, lib/validate.ts |
| 명단·점수·입력 UI | public/carriage-vip.js, public/legacy.html |
| 로테이션 명단 공급 | public/carriage-rotation.js |
| 빌드 통합 | scripts/growth-auto-ui.mjs |
| 검증 | tests/vip_*, tests/vip-fixture.cjs, 기존 보존 회귀 |
| 안전 배포 | scripts/vip-management-release.py, scripts/vip-management-browser.mjs, .github/workflows/vip-management-release.yml |
| 운영·설계 | docs/vip-weekly.md, docs/superpowers/* |

애플리케이션 기능 최종 구현은 `8415433`, 원격 배포 절차를 포함한 실제 배포 커밋은 `3e40399`다.
브랜치는 `feat/vip-management-v2`이며 기본 main을 덮어쓰거나 과거 릴리스 workflow를 재실행하지 않았다.

## 4. D1 변경과 복구

**테이블·컬럼·migration 변경 없음. 초기 seed 재적용 없음.**
기존 documents/backups의 독립 vip-weekly 문서에 current/pending을 저장하도록 구현했다.
실제 사용자 점수는 아직 없으므로 운영에 임의 주간 문서를 만들거나 점수를 입력하지 않았다.

각 환경의 배포 직전 전체 SQL을 내보내 격리 in-memory SQLite에서 복구했다.
integrity_check=ok, 보호 테이블 존재, 문서 digest 일치를 확인했다.
실제 원격 D1로 복원하는 파괴적 시험은 하지 않았다.
백업 이후 문서·설정·active version이 바뀌면 전환을 중단하도록 검사했다.

백업·설정·원문 검증은 RSA3072 수신자/AES256-GCM CMS로 암호화해
사용자 승인에 따라 GitHub Actions에 14일 보관한다. 개인키는 GitHub에 올리지 않았다.
배포 전 암호화 artifact 업로드 완료를 배포 전제조건으로 삼았다.

| Artifact | ID | 만료 KST |
|---|---|---|
| vip-staging-before-40637332671 | 12793114617 | 2026-11-11 14:20 |
| vip-staging-after-40637332671 | 12793279055 | 2026-11-11 14:21 |
| vip-production-before-40637332671 | 12794286703 | 2026-11-11 14:21 |
| vip-production-after-40637332671 | 12794256975 | 2026-11-11 14:22 |

Production 배포 작업은 DB 쓰기나 실제 VIP 선정을 수행하지 않았다.
Staging에는 유일한 ID의 검증용 회원·관측 행만 일시 삽입하고 해당 행만 제거했다.
기존 문서·백업·성장 이력·동일인 revision·스키마 불변성을 다시 확인했다.
로그인 과정의 정상적인 세션 발급·만료 정리·로그아웃은 기존 인증 로직을 따랐다.

## 5. VIP 누적 횟수 보존

배포 전 실제 브라우저에서 기존 회원·VIP 기초값·조정값·선정 이력의 모든 canonical에 대한
누적 횟수와 로테이션 ID 순서를 기록하고, 배포 후 실제 브라우저에서 같은 값인지 비교했다.
**Staging·Production 모두 전원 일치했다.**
배포 전후 documents payload/revision/updated_at, backups, 성장 관측 건수·스키마·migration을
비교했다. 주간 점수 입력 자체가 carriage에 쓰지 않는 것은 실제 route+SQLite 회귀에서도 확인했다.
과거 VIP 메모 수정 시 VIP·회원 ID·당시 snapshot 보존 시험도 통과했다.

## 6. 영구 제외 보존

실제 기존 carriage 문서와 제외 플래그가 배포 전후 같음을 확인했다.
현재 명단의 제외 회원은 실제 API에서 permanent로 차단되는 것을 검증했다.
새 점수나 주간 제한 종료로 기존 제외가 해제되지 않으며, 구버전 전송에서도 이전 제외를 보존한다.
영구 제외 고득점 차단과 소속/매핑 변경 경합은 실제 SQL 트랜잭션 회귀로 검증했다.

## 7. 주간 점수 교체 검증

시간을 고정한 실제 정책·route+SQLite 시험에서 다음이 통과했다.

- 11/1 23:59:59 KST → 11/2 00:00:00 KST 전환.
- 11/2 첫 점수, 11/9 다음 점수 대체; 합산 금지.
- 21,719,999 불가 / 21,720,000 가능.
- 여러 주 자료 공백 시 마지막 적용 점수·자격·실제 갱신시각 유지.
- 첫 점수 적용 전 일반 선택 허용·16명 제한·영구 제외 유지.
- 첫 미래 자료 업로드와 월요일 실제 적용 분리.
- 부분 누락 unknown, 중복 업로드 no-op, 수정 자료 대체, revision 충돌409.
- 점수·소속·연결 변경 경합 시 전체 트랜잭션과 mutation/백업 취소.
- VIP 누적·운행 이력 독립 보존.

실제 Staging에서는 제공일이 서버 기준 최소 7일 이후인 토요일 자료가 400으로 거부되고,
주간 revision과 기존 문서가 유지되는 것을 확인했다.
실제 11월의 월요일을 기다려 검증하거나 실제 사용자가 주지 않은 점수를 적용한 것은 아니다.

## 8. 자동수집 유지

collector, scheduled handler, 기존 growth API·인덱스·마감 로직은 변경하지 않았다.
기존 회귀에서 하루24회 수집/1회 마감/23회 idle, 중복 방지·실패·복구와
인덱스를 사용하는 latest lookup을 확인했다.

실제 Production mode, enabled 상태, Cron `0,10 * * * *`가 유지됨을 확인했다.
Staging fixture mode, Cron 없음, 외부 호출0도 유지했다.
배포 후 별도 읽기 전용 점검에서도 enabled·Cron을 재확인했고, 최신 수집 상태에
정상 저장된 자료가 있음을 확인했다. 과거 INCOMPLETE_ROSTER가 계속된다고 단정하지 않는다.
배포 검증을 위해 LastAsylum을 추가 호출하거나 별도 수집 작업을 만들지 않았다.
새 배포 이후 다음 자연 정시 수집의 실제 완료는 아직 확인하지 않았으므로 정상으로 주장하지 않는다.

## 9. Staging 검증 결과

실제 원격 Worker·D1·Playwright에서 다음이 통과했다.

- 배포 전 소스·active version·DB·설정 확인과 전체 백업/격리 복구.
- 실제 배포 자산이 검증한 dist와 byte 단위로 동일함.
- 기존 모든 VIP 횟수와 로테이션 순서의 배포 전후 일치.
- 임시 명단의 지정16명 버튼 비활성화, 일반회원 버튼 활성화.
- 기존 관리자 로그인·점수 관리 패널 진입·로그아웃.
- 직접 제한 VIP 저장 요청422, 미래 자료400, 기존 기록과 점수 revision 유지.
- 날짜 선택·네 기존 공개 메뉴·모바일 날짜 UI.
- 해당 검증 행만 제거 후 기존 문서·백업·성장·설정 재검증.

이미 끝난 초기 구현·로컬 브라우저 검증을 새 프로젝트로 다시 만들지 않았다.
최종 독립 리뷰의 중요한 발견은 모두 수정했고 14개 배포 guard 시험도 통과했다.
기존 전체 lint는 기반 소스에서도 CommonJS 테스트 규칙으로 45 errors/2 warnings가 난다.
이번 변경 파일 lint, 타입 검사, 실제 빌드와 관련 회귀는 통과했다.

## 10. Production 배포·검증

Staging 성공 후 그 실행에서 검증한 정확한 dist artifact를 Production으로 전달했다.
다시 빌드한 다른 산출물을 배포하지 않았다.

API의 읽기 전용 감사 필드 workers/triggered_by는 업로드하지 않았다.
Wrangler4.92의 versions upload와 공식 deployments API로 코드 트래픽만 전환했다.
기존 로그의 redact_query_string 등 비버전 설정을 다시 쓰지 않았다.
secret 값·관리자 인증·DB ID·변수·compatibility·로그 설정·Cron·접근 설정을 보존했다.

Production 실제 검사에서 다음이 통과했다.

- 전환된 active version과 검증한 source tag 확인.
- 배포한 HTML·VIP/로테이션/날짜/성장 자산의 정확한 일치.
- 기존 문서·백업·성장·동일인 상태·스키마·설정 불변성.
- 현재 점수 미등록 초기 모드와 임시/영구 제한.
- 실제 브라우저의 전체 VIP 횟수·로테이션·메뉴·모바일 날짜 선택.
- 공개 인증 상태와 무인증 관리 API 거부.
- 브라우저 확인 후 재차 실제 데이터 검증.

## 11. 남은 사항

- 사용자 실제 주간 점수 자료는 아직 제공되지 않았다. 현재 첫 점수 적용 전 운영 모드다.
  실제 스크린샷이 오면 정확한 닉네임·ID·누락·중복·주차를 검토해 JSON으로 입력한다.
- 신규 배포 후 다음 자연 정시 수집의 실제 실행 결과는 별도 확인이 필요하다.
- 인계 시 제공처 INCOMPLETE_ROSTER/delayed가 알려져 있었다. 이를 해결하려고 검증 기준을
  완화하거나 탈퇴를 확정하거나 외부 호출을 추가하지 않았다. 최종 읽기 전용 점검에서는
  최신 수집에 정상 저장된 자료가 있음을 확인했다.
- 전체 lint의 기존 문제는 범위 밖으로 남겼다.
- GitHub 암호화 백업은14일 만료이므로 필요한 백업과 복구키를 사용자가 별도 보관할 수 있다.

403은 기본 Python 클라이언트의 Cloudflare1010으로 재현됐다. 기존 배포 도구의 정직한
User-Agent와 기본 Playwright Chrome은 정상 응답했다. 봇/접근 보호를 해제하지 않았다.
