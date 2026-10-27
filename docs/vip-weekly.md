# 마차 명단과 주간 VIP 자격

운영 기준 소스: `8caefa5c8b0259f847ab72180016d045d8566f60`.
기존 `main`이나 과거 릴리스 workflow를 그대로 배포하지 않는다.

## 관리자 입력

관리설정 → **길드전 주간 포인트**에서 입력 양식을 내려받는다.
사용자가 제공한 토요일 스크린샷의 정확한 숫자를 JSON에 입력하고 파일을 선택한다.
기존 성장자료 업로드처럼 AI가 파일을 준비하고 관리자가 검토하는 방식이다.
서버가 스크린샷을 자동 인식하거나 LastAsylum에서 길드전 점수를 수집하지 않는다.
현재 API 계약의 `activity`는 길드전 주간 포인트로 해석하지 않는다.

- `providedOn`: 실제 자료 제공 토요일, `YYYY-MM-DD`.
- `appliesOn`: 그 다음 월요일. 첫 적용일은 `2026-11-02`.
- `coverage`: 전체 명단 `full` 또는 일부 `partial`.
- `rows`: `memberId`, 정확한 `nickname`, 숫자 `points`.
- 양식의 `points: null`은 미입력 표시다. 모르는 점수는 추정하지 말고 해당 행을
  제외하여 `partial`로 제출한다. 누락자는 0점이 아니라 미확인으로 남는다.
- 전체 명단은 현재 확인된 선택 대상 명단과 모두 일치해야 한다.
  중복 ID/이름, 다른 문자·대소문자, 미확인 연결·소속은 저장 전에 해결한다.
- 닉네임이 바뀌면 최신 양식을 다시 받는다. 기존 ID를 임의로 다른 사람에게 연결하지 않는다.

검토 목록·누락 수·제공일·적용일을 확인한 뒤 저장한다. 같은 자료 재전송은
점수 문서 revision·백업·마차 운행을 중복 변경하지 않는다. 수정 파일은 같은
적용 주차만 대체한다. 충돌(409)이 나면 최신 명단을 받고 파일을 다시 검토한다.

## 적용과 선택

서버 현재 **KST 월요일 주차**가 자격 기준이다. 운행일을 과거/미래로 바꿔도
현재 VIP 제한을 우회할 수 없다. 운행일 선택·마차장 로테이션은 기존 방식이다.

2026-10-26 주차에는 요청한 16명의 임시 제한을 적용하고 나머지는 기존 규칙을 유지한다.
11월 2일부터 해당 주 점수 21,720,000점 이상만 선택 가능하다. 영구 제외가
항상 우선한다. 명단/연결 확인이 안 되거나 자료/개인 점수가 없으면 선택 불가다.
11월 9일 새 자료가 없을 때 11월 2일 점수를 이월하지 않는다.

월요일 자정부터 서버가 그 주 슬롯을 선택하므로 별도 Cron이나 전원 UPDATE가 없다.
다음 업로드 때 이전 슬롯을 정리한다. 두 슬롯은 저장 방식이며, 지난 주 점수는
자격에 영향을 주지 않는다. 화면에는 적용 주차, 점수 갱신시각, 명단 관측시각을 구분한다.

## 자료 보호와 저장 구조

새 테이블·컬럼·마이그레이션은 없다. 기존 `documents`의 독립 `vip-weekly` 문서에
current/pending만 보관한다. 기존 `/api/state`는 carriage/power/memos 세 문서를 유지한다.
점수 갱신은 이 세 문서와 성장 테이블에 쓰지 않는다. `backups`에 점수 수정 직전
사본 두 개만 유지한다. 관리자 버튼으로 사본을 내려받아 해당 주 자료를 다시 검토·입력한다.
지난 주 사본을 이번 주 점수로 사용하거나 전체 carriage를 과거 사본으로 덮어쓰지 않는다.

기존 VIP_IMPORT·vipCarry·vipResolution 및 실제 탑승기록의 합계는 그대로다.
999 기초값과 공주 과거 1회도 유지한다. 새 실제 VIP 기록만 안정적인 `vipMemberId`를
추가한다. 구버전 클라이언트의 메모 수정은 기존 회원 ID와 영구 제외를 누락해도 보존한다.
과거 운행을 덮어쓸 때 새 VIP를 선택하지 않으면 기존 VIP와 당시 snapshot을 유지한다.

마차 명단은 최신 정상 저장 로스터와 confirmed 게임 ID 연결을 읽는다.
미관측 인원은 선택에서 빠져도 이력/횟수/영구 제외가 삭제되지 않는다.
탈퇴 확정 후 재가입 검토는 기존 관리자 승인 절차를 따른다.
수집 검증 실패 시 원본을 보정하거나 새 외부 호출을 하지 않고 마지막 정상 명단의 시각을 표시한다.

자격 확인 뒤 점수/명단/동일인/탈퇴 상태가 바뀌면 D1 트랜잭션을 취소한다.
실패한 요청의 백업이나 mutation도 남기지 않아 재시도가 잘못 성공 처리되지 않는다.

## 검증과 배포 경계

로컬 검증 명령:

```sh
node tests/vip_weekly_regression.cjs
node tests/vip_api_regression.cjs
node tests/vip_ui_regression.cjs
node tests/vip_save_regression.cjs
python tests/vip_scope_preserved.py
python tests/automation_operations_preserved.py
python tests/vip_exclusions_regression.py
node tests/carriage_date_regression.cjs
node tests/carriage_rotation_regression.cjs
node tests/growth_automation_regression.cjs
node tests/d1_latest_lookup.cjs
npx tsc --noEmit
npm run build
```

전체 lint는 기준 소스에서도 기존 CommonJS 테스트의 require/module 규칙 때문에
45 errors / 2 warnings가 난다. 변경 파일 lint는 별도로 통과를 확인한다.
과거 `operations_regression.py`의 고정 해시와 `rotation_scope_preserved.py`는 각각
더 오래된 작업 범위의 기준이다. 이번 개편 보존 기준은 `vip_scope_preserved.py`다.

원격 Staging/Production 배포는 아직 수행하지 않았다. 다음 순서를 지킨다.

1. 정상 Cloudflare 인증으로 현재 active version, 트래픽, DB ID, mode, Cron, Secrets 이름,
   compatibility 설정을 새로 확인한다. 인계보고서의 UUID를 현재값으로 간주하지 않는다.
2. 각 환경의 그 시점 전체 D1 백업을 생성하고 격리 DB에서 복구 가능성을 확인한다.
   초기 seed migration을 기존 DB에 재적용하지 않는다.
3. 새 소스 SHA와 현재 baseline으로 새 preflight를 검토한다. 과거 릴리스의 고정 SHA/run을
   바꾸지 않고 재실행하거나 `main`을 덮어쓰지 않는다.
4. Staging은 fixture·Cron 없음·외부 호출 0을 유지한 채 검증한다.
5. 검증한 소스 SHA 그대로 Production에 반영하고 실제 문서/VIP/제외 9명/공주1회/기록/
   7명 로테이션/성장/협곡/인증/다음 Cron을 확인한다.
6. 코드 롤백은 배포 직전 active version으로 한다. DB 복구는 코드 롤백과 별도 판단한다.

현재 Production의 INCOMPLETE_ROSTER 및 delayed 마감은 이번 범위에서 수정하지 않는다.
