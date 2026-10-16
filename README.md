# 나비야 나비야

지금 위성 태그로 추적 중인 동물 한 마리를 입양해, 그 태그가 보내는 실제 위치를 따라가는 다마고치예요. 지구본은 지금 이 순간의 실제 태양 위치로 낮과 밤을 그려요.

**바로 보기:** https://kjhoeakjy.github.io/earth-damagochi/

## 어떻게 즐기나요

1. 왼쪽 목록이나 지구본의 점에서 동물을 골라요. 사흘 안에 위치를 보낸 동물만 나와요. 종과 지금 있는 지역으로 거를 수 있어요.
2. 이름을 정해 입양하면 그 동물의 위치를 실제 시간으로 따라가요. 새 위치는 6시간마다 받아 와요.
3. 오늘 · 여정 · 정보 탭에서 그날의 위치와 이동, 지금까지의 기록, 태그와 출처를 봐요.

## 실시간 데이터와 사진

- 위치는 [Movebank](https://www.movebank.org)에서 `.github/workflows/live.yml`이 6시간마다 받아 `live-data` 브랜치에 올려요 (`pipeline/live.py`). 이용 조건에 동의한 연구만 쓰고, 사망·추적 종료·움직임 없음으로 표시된 동물과 위급(CR)·위기(EN) 종, 종까지 확인되지 않은 동물은 빼요.
- 동물 사진은 그 개체가 아니라 같은 종의 사진이에요. 위키데이터의 대표 이미지를 위키미디어 공용에서 받아 작가와 라이선스를 함께 보여 줘요. 개체 사진은 연구 데이터에 공개돼 있지 않아요.

## 화면에 나오는 값은 어디서 오나요

지어낸 내용은 없어요. 모든 값은 아래 세 갈래 중 하나예요.

| 갈래 | 예 |
|---|---|
| **기록 그대로** | 위치를 잰 시각과 좌표, 위치 정확도(GPS 오차 등급, 아르고스 등급, Fastloc 위성 수, 오차 반경), 태그 상태 신호(alive · dead · lost · unknown)와 배터리 전압, 연구자가 붙인 여름·겨울 구분, 개체 정보(성별, 나이대, 무리, 새끼 동반) |
| **기록으로 계산** | 하루 이동 거리, 두 기록 사이 평균 속도, 출발지에서의 거리, 적도·회귀선·극권을 넘은 시각(앞뒤 기록으로 짐작), 머문 곳(사흘 넘게 25km 안), 날마다 받은 기록 수, 가장 오래 끊긴 때, 같은 시각 추적되던 다른 동물 |
| **위치와 시각으로 한 천문 계산** | 그곳의 낮 길이, 해 뜨고 지는 시각(태양시), 한낮 해 높이, 달 모양, 절기, 그 시각 별의 위치 |

- 지구본의 작은 점은 태그가 실제로 잰 위치이고, 선은 그 사이를 지구 표면의 가장 짧은 길로 이은 거예요. 기록과 기록 사이의 동물 표시는 직선으로 이어 짐작한 자리예요.
- 나라·바다·지역·도시 이름은 Natural Earth 지도에서 좌표로 찾았어요.
- 구름은 NOAA 정지 기상위성 합성 적외선 사진(GMGSI)으로 매시간 다시 그려요 (`.github/workflows/clouds.yml`, `pipeline/clouds.py`). 위성이 보지 못하는 북위·남위 72도 너머는 비어 있고, 이 사진을 못 받으면 아래의 NASA 구름 사진을 써요.
- 고도, 수온, 잠수 깊이, 심박·체온, 가속도, 날씨는 이 데이터에 없어서 보여 주지 않아요. 데이터셋마다 실제로 들어 있는 칸은 [docs/data-fields.md](docs/data-fields.md)에 정리돼 있어요.

## 동물과 데이터 출처

| 동물 | 수 | 출처 | 받은 곳 |
|---|---|---|---|
| 뻐꾸기 6 · 꺅도요 2 | 8 | 몽골 야생동물과학보전센터 · MPIAB, ICARUS Mongolia cuckoos Nymba (Movebank study 1542155599, CC0) | github.com/eio/animal-movement |
| 유럽멧비둘기 | 5 | 프랑스 국립자연사박물관 · MPIAB, ICARUS Turtle doves (Movebank study 1542192442, CC BY-NC) | github.com/eio/animal-movement |
| 검은등제비갈매기 8 · 어센션군함조 1 · 푸른얼굴얼가니새 1 | 10 | 어센션섬 정부 · MPIAB, Seabird ecology in the Atlantic (Movebank study 1531481854, CC0) | github.com/eio/animal-movement |
| 줄무늬노랑발갈매기 | 6 | Wikelski et al. 2015, Navigation experiments in lesser black-backed gulls ([doi](https://doi.org/10.1038/srep17061)) | Movebank · movingpandas-examples |
| 나그네알바트로스 | 6 | H. Weimerskirch, CEBC-CNRS | R 패키지 adehabitatLT |
| 갈색사다새 | 1 | Autumn-Lynn Harrison, 스미스소니언 철새센터 | R 패키지 ctmm |
| 남방코끼리물범 | 7 | IMOS · IPEV · SNO-MEMO, 케르겔렌 제도 | R 패키지 aniMotum · foieGras · bsam |
| 북방물개 | 1 | Johnson et al. 2008, NOAA 해양포유류연구소 | R 패키지 crawl |
| 고리무늬물범 | 3 | 캐나다 수산해양부 ([doi](https://doi.org/10.1890/14-2101.1)), 노르웨이 극지연구소 | R 패키지 argosTrack · argosfilter |
| 턱수염물범 | 3 | NOAA 해양포유류연구소 | R 패키지 crawl |
| 북대서양긴수염고래 | 1 | WhaleNet, Wheelock College | R 패키지 adehabitatLT |
| 녹새치 | 1 | Dr. Mike Musyl, Pelagic Research Group | R 패키지 xtractomatic |
| 푸른바다거북 | 1 | Shimada et al. 2016 ([doi](https://doi.org/10.3354/meps11972)) | R 패키지 SDLfilter |
| 산악순록 | 6 | 브리티시컬럼비아주 환경부 ([doi](https://doi.org/10.5441/001/1.p5bn656k)) | Movebank · TidyTuesday 2020-06-23 |

각 데이터의 이용 조건은 원 출처를 따라요. 유럽멧비둘기 데이터는 CC BY-NC라서 이 프로젝트도 비영리로만 써요.

## 함께 쓴 것

- [three.js](https://threejs.org) r147 (MIT) — `vendor/`에 넣어 두었어요.
- 지구 낮 사진, 구름, 지형, 바다·육지 구분: NASA 공개 이미지, npm 패키지 earth-visualization 1.1.0 (MIT)에 들어 있는 것.
- 실시간 구름: [NOAA/NESDIS GMGSI](https://registry.opendata.aws/noaa-gmgsi/) (NOAA Open Data Dissemination, 미국 정부 공개 데이터).
- 밤 불빛: NASA 이미지, three-globe 2.45.6 예제 (MIT)의 `earth-night.jpg`에서 불빛만 뽑아냈어요.
- 별: [d3-celestial](https://github.com/ofrohn/d3-celestial) 0.7.35 (BSD-3)의 Hipparcos 별 목록. 은하수는 그 윤곽으로 그렸어요 (`pipeline/make_sky.py`).
- 장소 이름: [Natural Earth](https://www.naturalearthdata.com) (퍼블릭 도메인).
- 글꼴: Google Fonts의 Diphylleia, IBM Plex Sans KR, IBM Plex Mono (SIL OFL).

## 직접 띄워 보기

빌드 과정이 없는 정적 페이지예요. 아무 정적 서버로 저장소 폴더를 열면 돼요.

```sh
python3 -m http.server 8000
# http://localhost:8000 을 열어요
```

입양 기록은 브라우저(localStorage)에만 저장돼요. 다른 기기로 옮길 때는 정보 탭의 백업 코드를 쓰면 돼요.

## 데이터 다시 만들기

`data/animals.json`은 `pipeline/build_catalog.py`가 원본 파일에서 만들어요. 원본은 저장소에 넣지 않았어요.

```
$NABIYA_RAW/
  dl/          R 패키지 데이터(.rda, .RData), TidyTuesday CSV, 갈매기 gulls.gpkg
  repos/eio/   github.com/eio/animal-movement 의 ICARUS 연구 파일
  ne/          Natural Earth GeoJSON (10m·50m 나라, 주, 바다, 지역, 호수, 도시)
```

`dl/`의 파일 이름은 GitHub 경로를 밑줄로 이은 거예요. 예를 들어 `cran_crawl_master_data_beardedSeals.rda`는 `raw.githubusercontent.com/cran/crawl/master/data/beardedSeals.rda`예요.

```sh
pip install numpy pandas rdata pyproj shapely pillow
NABIYA_RAW=/path/to/raw python3 pipeline/build_catalog.py
python3 pipeline/make_sky.py /path/to/d3-celestial/data data tex
```

## 폴더

```
index.html          화면
css/style.css
js/core.js          좌표·시간·해와 달 계산, 데이터 풀기, 저장
js/globe.js         three.js 지구본, 경로 선, 위치 점, 오차 범위
js/critter.js       동물 그림
js/story.js         하루 관측 일지, 기록 모음, 머문 곳, 신호, 여권, 배지
js/app.js           화면 동작
data/               animals.json (59마리), sky.json (별)
docs/               데이터셋마다 들어 있는 칸 정리
tex/                지구·구름·밤·은하수 텍스처
pipeline/           데이터를 만드는 파이썬 스크립트
```
