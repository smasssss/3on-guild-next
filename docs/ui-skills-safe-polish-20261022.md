# 3ON 운영센터 — UI 안전 개선 검토 및 복원 기준 (2026-10-22)

## 목적/상태
- 스킬 참조: UI UX Pro Max (MIT) 및 Impeccable (Apache-2.0)의 공식 SKILL.md 설계 지침을 읽고 수동으로 적용. 제3자 CLI나 자동 훅은 설치/실행하지 않음.
- 범위: Staging 성장자료 관리자 화면의 `app/globals.css`에 한정한 읽기 편의성, 키보드 포커스, 모바일 필드 배치 개선.
- 제외: Production 배포, `public/legacy.html` 변경, 데이터/API/인증/JS/마차/VIP/협곡/닉네임 처리, D1 schema/data.
- 이 문서와 검토 CI는 운영 화면 동작에 관여하지 않음.

## 코드 백업 기준
- Production 저장소: `smasssss/3on-guild`
  - 원본 커밋: `e842a2d70741a841db34d46ede30c9751c32efbd`
  - 고정 브랜치: `backup/20261022-before-design-skills`
- Staging 저장소: `smasssss/3on-guild-next`
  - 원본 커밋: `b82f6ed763a77ef68e7e1883da268931e54b6a92`
  - 고정 브랜치: `backup/20261022-before-design-skills`
  - 변경 브랜치: `feature/20261022-safe-ui-polish`
- 위 백업 브랜치는 **Git 소스코드** 복원 지점. Cloudflare D1 데이터 백업이 아님.
- 이번 작업은 D1을 읽거나 수정하지 않음. Production/Staging DB 스냅샷이 별도로 필요할 경우 Cloudflare에서 각각 별도 export하고 식별자/체크섬을 검증할 것. 데이터 백업이 없으면 어떠한 DB 변경/배포도 금지.

## 외부 도구 공급망 검토
- UI UX Pro Max: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill — MIT. CLI `uipro init --ai codex`는 스킬 파일 생성, `--force`는 덮어쓰기 가능. 설치 명령은 이 브랜치에서 실행하지 않음.
- Impeccable: https://github.com/pbakaus/impeccable — Apache-2.0. `npx impeccable install` 및 `/impeccable init`은 설치/프로젝트 파일 생성 가능; `.codex/hooks.json`은 편집 후 자동 실행 훅 제공; CLI는 플랫폼별 바이너리 다운로드 가능. 설치 명령은 실행하지 않음.
- 데이터·인증정보를 외부 스킬과 공유하지 말 것. 전용 샌드박스에서 코드 검토 후에만 추후 설치를 별도로 승인할 것.

## 1차 변경사항
- 관리자 화면의 작은 상태/통계 라벨 크기 상향.
- 키보드 `:focus-visible` 강조, 모바일 터치 피드백.
- 모바일 편집 필드 2열/1열 재배치, 결과 행 화살표 위치 안정화.
- 고정 발행 바의 안전영역, 동작 최소화 설정.
- CSS만 추가하며 기존 CSS/TSX/HTML/JSON/SQL/API 소스는 변경하지 않음.

## 검증 및 중단 기준
1. 현재 브랜치와 백업 커밋의 diff 확인. 런타임 변경 파일은 `app/globals.css`만 허용.
2. `npm ci --include=dev --include=optional --no-audit --no-fund`, `npm run lint`, `npm run build`를 Cloudflare 자격증명 없이 격리된 CI에서 실행.
3. 모바일 320/375/390/520px 및 데스크톱 768/1280px에서 실제 UI 화면 육안 확인. 포커스 대비, 라벨 가독성, 44px 버튼, 오버플로 및 모달 조작 검증.
4. 기존 `tests/phase22_flow.py`, `tests/operations_regression.py`, `tests/mobile_admin_ux.py` 회귀 검증은 **격리된 로컬/테스트 D1만** 사용. 기존 PASS JSON은 과거 증거로만 취급.
5. 성장추적/마차장 날짜/VIP/협곡/운영이력/관리자 로그인/저장 및 닉네임 정규화가 그대로인지 확인.
6. 시각·기능 검증이 완료되지 않으면 Merge·Staging 배포 금지. Production에는 어떤 배포도 금지.

## 주의: 기존 Staging 배포 워크플로
`.github/workflows/deploy-cloudflare-staging.yml`의 workflow_dispatch는 D1 검색/생성 및 `wrangler d1 migrations apply DB --remote`를 수행한다. DB 무변경 조건을 지키기 위해 이번 작업에는 **실행하지 않는다**.

## 롤백
- 아직 feature 브랜치에만 변경이 있는 동안에는 PR을 닫고 브랜치를 삭제하면 기존 main/배포는 영향 없음.
- 추후 검증을 거쳐 머지한다면 변경 커밋을 revert하거나 위 Staging 백업 SHA의 UI 파일을 복원. Production 및 D1에는 손대지 않는다.

## 남은 검증
현재 실행 환경에서는 로컬 화면 캡처/실행형 회귀 테스트 및 Cloudflare Workers 배포 버전 검증은 별도 실행 필요. 수행하지 않은 항목을 PASS로 표시하지 말 것.
