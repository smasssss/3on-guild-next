# 런닝머신 레이스 3D 시험판

사이트에 배포되지 않는 작업용 폴더입니다(`public/` 밖). 실제 게임으로 옮기기 전, 물리 설정과 화면을 시험한 결과를 보존합니다.

## 확정한 설정 (2026-11-22 사용자 결정)

`chosen.txt` 한 줄이 확정 설정입니다.

- 벨트: 길이 2.0m, 폭 0.9m, 속도 초속 3.4m, 덮개 쪽 1도 → 뒤쪽 24도로 휜 바닥
- 가로 턱: 한 바퀴에 4개, 봉우리 3.4cm(턱마다 봉우리 1곳·중간 혹 1곳, 위치가 서로 다름)
- 물건: 오렌지·야구공(살짝 타원형)·미니 수박·참치캔·두루마리 휴지·테이프·자동차 3종(큰 바퀴)·핵불잙 솜인형
- 자동차 세 종류는 합쳐서 한 종류 몫으로 나옴(`carW=0.334`), 인형은 한 판에 최대 1개
- 10초 동안 탈락이 없으면 남은 선수만 제자리에서 재출발
- 떨어진 순서대로 최하위부터 기록, 1명 남으면 끝
- 같은 추첨 번호(seed)면 언제나 같은 결과(물리엔진 Rapier 결정적 판, 240Hz)

## 파일

- `sim.mjs` 물리 계산, `render.mjs` 화면(three.js), `index.html` 보기용 화면
- `batch.mjs`·`scan.mjs`·`kind.mjs`·`kindc.mjs`·`early.mjs`·`wheel.mjs`·`sweep.sh` 설정 비교용 도구
- `shot2.cjs`·`video2.cjs` 화면 사진·영상 뽑기
- `assets/` 그림·입체 자료

## 실행

```bash
npm install
python3 -m http.server 8777 --bind 127.0.0.1
```

브라우저에서 `http://127.0.0.1:8777/index.html?seed=00c51d27&m=<chosen.txt 내용>` 을 엽니다.

## 자료 출처

- `assets/models/`, `assets/tex/`: Poly Haven (CC0, 저작권 없음) — baseball_01, food_lime_01(색을 주황으로 바꿈), medical_tape, rubberized_track, wood_table_001, terry_cloth
- `assets/hdri/lobby.exr`: @pmndrs/assets (CC0)
- `assets/gpt/`: 코덱스 내장 그림 생성으로 만든 그림(참치캔 상표, 수박 껍질, 휴지 무늬, 인형 뒷모습)
- `assets/doll.png`: 사용자가 보내 준 핵불잙 캐릭터 인형 그림
