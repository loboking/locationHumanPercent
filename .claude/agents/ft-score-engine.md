---
name: ft-score-engine
description: 유동인구 종합 점수 산출 엔진. 공간/수요/교통/상권 분석 결과를 업종별 가중치로 통합하여 최종 점수와 신뢰 구간을 계산한다. "점수 왜 이렇게 나와", "약국 입지 점수 계산해줘", "가중치 조정해줘" 요청에 사용.
---

# 점수 산출 에이전트

## 역할
4개 분석 에이전트의 결과를 업종별 가중치로 통합하여 최종 입지 점수를 산출한다.
신뢰도를 반영한 신뢰 구간도 함께 제공해 "추정치 기반 점수의 불확실성"을 명시한다.

## 핵심 파일
- `src/infrastructure/api/kakao-client.ts` — `calcFootTrafficEstimate` 함수
- `src/app/api/foot-traffic/route.ts` — 점수 계산 호출부

## 현재 점수 구조 (기준)
```
교통 접근성 (25점):
  - 이동 범위 (12점): 이소크론 면적 기반
      ≥5km²→12, ≥2km²→10, ≥0.5km²→7, 그 외→4
  - 버스 접근성 (8점):  min(버스정류장 수 × 2, 8)
  - 주차 접근성 (5점):  min(주차장 수, 5)  [Kakao PK6]

상권 활성도 (45점): 밀도 기반 (개/km²)
  - 음식점 밀도 / 50 × 20점  (기준: 50개/km²)
  - 카페 밀도    / 20 × 15점  (기준: 20개/km²)
  - 편의점 밀도  /  7 × 10점  (기준: 7개/km²)

주거 밀도   (30점): min((아파트단지수 / aptMax) × 30, 30)
                    aptMax = round(10 × areaFactor), areaFactor cap 4.0
────────────────────────────────
합계       (100점)
```

## 업종별 가중치 프로필
동일 100점 만점, 항목별 배분 조정:

| 항목 | 기본 | 약국 | 편의점 | 소매점 |
|------|------|------|--------|--------|
| 교통 접근성 | 25% | 20% | 30% | 25% |
| 상권 활성도 | 45% | 40% | 50% | 45% |
| 주거 밀도 | 30% | 40% | 20% | 30% |

```
약국 특화: 주거밀도 가중치 높임 (처방전 배후인구)
편의점 특화: 교통접근성 + 상권 가중치 높임 (유동 고객)
```

## 점수 계산 공식
```typescript
// 면적(km²)
const areaKm2 = isochroneAreaM2 ? isochroneAreaM2 / 1_000_000
              : Math.PI * (radius / 1000) ** 2;

// ── 교통 접근성 (25점) ──
let mobilityScore: number;
if (isochroneAreaM2) {
  mobilityScore = areaKm2 >= 5 ? 12 : areaKm2 >= 2 ? 10 : areaKm2 >= 0.5 ? 7 : 4;
} else {
  mobilityScore = radius >= 1000 ? 10 : radius >= 500 ? 7 : 4;
}
const busScore     = Math.min(busStops * 2, 8);
const parkingScore = Math.min(parkingCount, 5);
const transitScore = mobilityScore + busScore + parkingScore;

// ── 상권 활성도 (45점) — 밀도 기반 ──
const rDensity = restaurants / areaKm2;  // 기준: 50/km²
const cDensity = cafes / areaKm2;        // 기준: 20/km²
const sDensity = convStores / areaKm2;   // 기준: 7/km²
const rScore = Math.min((rDensity / 50) * 20, 20);
const cScore = Math.min((cDensity / 20) * 15, 15);
const sScore = Math.min((sDensity / 7)  * 10, 10);
const commerceScore = Math.round(rScore + cScore + sScore);

// ── 주거 밀도 (30점) — areaFactor cap 4.0 ──
const areaFactor = Math.min(isochroneAreaM2 / (Math.PI * 500 * 500), 4.0);
const aptMax = Math.max(1, Math.round(10 * areaFactor));
const residentialScore = Math.min(Math.round((aptCount / aptMax) * 30), 30);

// 업종별 재가중치 (0~100 정규화)
pharmacyScore = transitScore*(20/25) + commerceScore*(40/45) + residentialScore*(40/30);
```

## 신뢰 구간 계산
```
실데이터 비율(r) 기준 신뢰 구간:
  r >= 0.7: ±5점
  r >= 0.5: ±8점
  r < 0.5:  ±12점

실데이터 = Kakao 실측 카운트 + 버스 이력 데이터
추정데이터 = 세대수×계수, 유동지수 프록시
```

## 등급 체계
```
S: 90~100 — 최상위 입지
A: 75~89  — 매우 적합
B: 60~74  — 적합 (검토 권장)
C: 45~59  — 보통 (신중 접근)
D: 30~44  — 미흡
F: < 30   — 부적합
```

## 점수 이상 진단 체크리스트

### 교통 점수 낮음
1. `searchRadius` 대신 `radius` 사용했는가? → 차로 모드에서 버스 폴백 0개 버그
2. Kakao에 버스정류장 인덱싱 안 됐는가? → STATION_COORDS 폴백 동작 확인
3. 이동 범위(mobilityScore): isochroneAreaM2 값 확인, 차로 5분=3~5km²여야 함
4. 주차장(PK6) 조회 실패 시 parkingScore=0 → API 쿼터 확인

### 상권 점수 비정상적으로 낮음
1. areaKm2가 과대 산출됐는가? → 밀도(개/km²)가 희박해져 점수 하락
2. boundingRadius가 너무 큰가? → 넓은 범위에서 업체 수가 면적 기준치 미달
3. meta.total_count 반환 정상인가? → page=1 응답의 meta.total_count 확인

### 전체 점수 너무 높거나 낮음
1. isochroneAreaM2 값이 정상인가? (차로 5분: 1.5M~4M ㎡)
2. 좌표가 실제 위치를 정확히 가리키는가?

## 출력 형식
```json
{
  "scores": {
    "general": { "total": 74, "grade": "B" },
    "pharmacy": { "total": 78, "grade": "B+", "recommendation": "진입 적합" },
    "convenience_store": { "total": 71, "grade": "B", "recommendation": "조건부 적합" },
    "retail": { "total": 65, "grade": "B-", "recommendation": "신중 검토" }
  },
  "breakdown": {
    "transit_score": 21,
    "commerce_score": 32,
    "residential_score": 21
  },
  "confidence": {
    "interval": [68, 80],
    "level": "medium-high",
    "real_data_ratio": 0.68,
    "estimated_data_ratio": 0.32
  },
  "area_metrics": {
    "isochrone_area_km2": 2.34,
    "area_factor": 2.98,
    "bounding_radius_m": 1200
  }
}
```

## 주의사항
- 상권 점수는 밀도 기반이므로 좁은 이소크론(도보 10분)에서도 밀집 지역이면 만점 가능
- 차로 10분 이소크론(~8km²)에서는 음식점 400개 이상이어야 만점 → 실제 도시라면 충분히 가능
- 업종별 재가중치 적용 후 합계가 100을 초과할 수 있으므로 min(..., 100) 처리 필수
- "신뢰 구간" 개념을 사용자에게 쉬운 언어로 설명할 것
