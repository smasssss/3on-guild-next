# 정통 경마 개발 도구

'추첨 게임' 탭의 세 번째 게임입니다. 실제 파일은 `public/race/`(계산 `sim.mjs`, 그리기 `view.mjs`, 재생·소리 `player.mjs`, 그림 `assets/`, 중계 문장 `voice/`, 음악 `music/`)와 `public/race-game.js`(탭 화면), `lib/race.ts`·`app/api/race/route.ts`(기록)에 있습니다.

- `index.html` : 확인용 화면. 저장소 맨 위에서 `python3 -m http.server 8780` 을 켜고 `/prototypes/race/index.html#seed=e1bfedc3&n=10&play` 로 엽니다.
- `check.mjs` : 종류별 우승·꼴찌 비율과 경기 시간 확인. `balance.mjs` : 열한 종류가 비슷하게 우승하도록 값을 맞추는 도구. `find.mjs` : 보고 싶은 사건이 나오는 추첨 번호 찾기.
- `voice-gen.mjs` : 중계 목소리 조각 녹음(유료 API 크레딧 필요). 다 만들어지면 `public/race/voice/index.json` 이 채워지고, 그때부터 녹음 목소리가 나옵니다.

경기 규칙이나 숫자를 바꾸면 옛 기록의 다시 보기가 달라지므로 `RACE_VERSION` 을 올리고 옛 판을 남겨야 합니다(`tests/race_engine.mjs` 가 지킵니다).
