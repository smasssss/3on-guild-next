# 3ON 운영센터 차세대 Staging

이 저장소는 3ON 운영센터 차세대 구조의 **Staging 전용** 구현이다. 현재 운영 중인 Production 저장소 `smasssss/3on-guild`, Pages, Shared DB와 분리되어 있다. 이 저장소나 Staging DB를 Production 위에 덮어쓰지 않는다.

## 환경 구분

| 항목 | Staging |
|---|---|
| GitHub frontend | `smasssss/3on-guild-next` |
| frontend | `https://smasssss.github.io/3on-guild-next/` |
| API/Site | `https://threeon-next-staging.alswlgns2.chatgpt.site` |
| Site project | `appgprj_6ac90bf8dc7c8191846ff5631ba93f5b` |
| DB binding | Staging Site의 독립 `DB` |
| Growth schema | `3on-growth-v1` |
| Growth API | `3on-growth-api-v1` |
| Update package | `3on-growth-package-v1` |

관리자 secret, session, D1, cache/storage key에는 Staging 전용 namespace를 사용한다. 소스에 Production write endpoint나 credential을 넣지 않는다.

## 구조

- `app/api/state`, `app/api/session`, `app/api/backups`: 기존 3-document 계약 유지
- `app/api/growth/*`: growth 조회, package upload, review, publish, correction, withdrawal
- `lib/growth.ts`: package schema 검증, hash, current/history 공급 계층
- `drizzle/0002_growth_v1.sql`: growth schema와 결정적 legacy import
- `public/legacy.html`: 기존 운영 UI를 보존한 Staging 호환 화면
- `scripts/generate-legacy-migration.py`: 동일 legacy 입력에서 동일 ID/SQL 생성
- `tests/`: shadow, API/동시성, 운영 회귀, 5년 규모 시험

성장 공개는 `draft → needs_review/ready → published` 순서다. draft 행을 먼저 저장하고 publish transaction은 CAS guard, growth/identity/draft revision, mutation key를 확인한 뒤 publication reference를 전환한다. 기존 `/api/state` 응답은 carriage, power, memos 세 문서만 반환한다.

## Growth package 업로드

관리자는 AI가 만든 JSON 파일 하나를 화면에서 선택한다. 서버가 schema, 날짜, 타입, 인원수, source/package/semantic hash, 닉네임 충돌, 중복 관측, 수치 범위, identity revision과 비정상 변화를 검사한다. AI raw reading은 confirmed alias로 자동 승격하지 않는다.

불확실한 행은 review queue에서 다음 중 하나로 처리한다.

- 기존 member 연결
- 신규 member 등록
- 수치와 이름 직접 입력
- 이번 관측에서 미확인
- 보류

모든 필수 행이 확정되기 전에는 일부만 공개하지 않는다. 동일 package와 동일 mutation 재시도는 기존 결과를 반환한다.

## Legacy migration

공식 입력은 `legacy/growth_2026-10-08.json`이다. migration은 87명 현재, 13명 보관, 100 member, history 4,027건, missing 53명, nicknameChanges, HyunE profileHistory 51건과 부가 metadata를 보존한다.

legacy observation ID는 source fingerprint, canonical exact bytes, original history index로 결정한다. canonical/date/slot가 같은 71개 그룹 142건을 dedup하지 않는다. legacy에 없던 level, rank, timestamp를 추정해 채우지 않는다.

## Identity 호환

Growth 내부에서는 immutable `member_id`를 사용한다. 기존 운영 키는 canonical을 유지하고 adapter로 연결한다.

- `내가두려운가` → `꧁ᬊ두리ᬊ꧂`
- `핵불잡` → `핵불잙`
- `크림쿡` → `크림쿜`
- `용팝이`와 `용퍕이`는 별도 member

기존 `guild:canonical`, leader/vip canonical, snapshot, baseline, carry, resolution은 재작성하지 않는다.

## 로컬 검증

Node.js 22 이상이 필요하다.

```sh
npm ci
npm run build
npx tsc --noEmit
npm run lint
```

로컬 D1에는 migration을 순서대로 적용한다.

```sh
for f in drizzle/0000_safe_machine_man.sql drizzle/0001_warm_smiling_tiger.sql drizzle/0002_growth_v1.sql; do
  npx wrangler d1 execute DB --local --persist-to .wrangler/state --config dist/server/wrangler.json --file "$f"
done
```

로컬 관리자 hash는 추적되지 않는 `dist/server/.dev.vars`에 설정하고 `npm start -- --port 8790`으로 실행한다. 이후 별도 터미널에서 다음을 실행한다.

```sh
STAGING_BASE=http://127.0.0.1:8790 python tests/shadow_compare.py
STAGING_BASE=http://127.0.0.1:8790 python tests/integration_staging.py
python tests/operations_regression.py
python tests/scale_5y.py
```

쓰기 시험은 로컬 또는 별도 Staging D1에서만 수행한다. Production DB에는 시험 자료를 쓰지 않는다.

## Rollback

잘못 공개한 신규 batch는 withdrawal로 비활성화한다. correction batch를 철회하면 바로 이전 superseded publication을 다시 활성화한다. observation은 물리 삭제하지 않고 status/publication 관계로 효력을 관리한다. 이 과정은 growth revision만 바꾸며 carriage, power, memos, VIP와 기존 운행 snapshot을 수정하지 않는다.

배포 rollback은 검증된 이전 Site artifact와 GitHub frontend commit으로 되돌린다. DB migration은 additive이며, 3차 승격 전에는 Production에 적용하지 않는다.
