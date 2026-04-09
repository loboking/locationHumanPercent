---
name: ft-data-validator
description: 유동인구 분석 시작 전 모든 입력 데이터의 품질과 API 상태를 검증하는 에이전트. "데이터 이상한 것 같아", "점수가 갑자기 0점이야", "API 연결 확인해줘", 또는 ft-orchestrator가 분석 파이프라인 시작 전 자동 호출.
---

# 데이터 품질 검증 에이전트

## 역할
분석 파이프라인 실행 전 모든 데이터 소스의 상태와 입력값을 검증한다.
이상값이 점수에 그대로 반영되는 버그를 사전 차단하는 것이 핵심 목적이다.

## 핵심 파일
- `src/infrastructure/api/isochrone-client.ts`
- `src/infrastructure/api/kakao-client.ts`
- `src/infrastructure/api/bus-client.ts`
- `src/infrastructure/api/soho-client.ts`
- `src/app/api/foot-traffic/route.ts`

---

## 검증 체크리스트

### 1. 좌표 유효성
```
위도(lat): 35.0 ~ 38.5 (한국 범위)
경도(lng): 126.0 ~ 129.5 (한국 범위)
평택시 범위: lat 36.85~37.15, lng 126.85~127.25

❌ 차단 조건:
  - 바다 좌표 (Valhalla가 면적 0 반환)
  - 해외 좌표
  - NaN, Infinity
  - lat/lng 순서 바뀐 경우 (lng가 35~38 범위면 의심)
```

### 2. 이소크론 면적 이상값 탐지
현재 가장 큰 문제 — 이상 면적이 areaFactor 폭발로 이어짐

```
정상 범위 기준표:
┌──────────┬──────────┬─────────────────┬─────────────────┐
│ 모드     │ 시간(분) │ 최솟값 (㎡)     │ 최댓값 (㎡)     │
├──────────┼──────────┼─────────────────┼─────────────────┤
│ walk     │ 5        │ 300,000         │ 1,500,000       │
│ walk     │ 10       │ 800,000         │ 4,000,000       │
│ car      │ 5        │ 1,000,000       │ 6,000,000       │
│ car      │ 10       │ 4,000,000       │ 20,000,000      │
└──────────┴──────────┴─────────────────┴─────────────────┘

❌ 이상 감지 시:
  - 면적이 최솟값 미만: "Valhalla 도로망 미인덱스 지역 의심"
  - 면적이 최댓값 초과: "urbanFactor 미적용 또는 고속도로 편입 의심"
  - 면적 = 0: "좌표가 도로 접근 불가 위치"
```

### 3. boundingRadius 검증
```
정상: sqrt(areaM2 / π) × 1.5, 최대 3000m

❌ 이상 감지:
  - boundingRadius > 3000m: cap 미적용
  - boundingRadius > 5000m: max vertex distance 방식 사용 중 (버그)
  - boundingRadius < 200m: 면적이 비정상적으로 작음
```

### 4. areaFactor 검증
```
정상: min(isochroneAreaM2 / (π×500²), 4.0)

❌ 이상 감지:
  - areaFactor > 4.0: cap 미적용 → rMax 폭발 위험
  - areaFactor > 8.0: 즉시 경고, 상권 점수 0에 수렴
```

### 5. API 상태 확인
```
Valhalla (https://valhalla1.openstreetmap.de):
  - 타임아웃 기준: 8000ms
  - 실패 시: 원형 폴리곤 폴백 + "이소크론 서버 불안정" 경고

Kakao Local API:
  - 401: API 키 만료
  - 429: 일일 쿼터 초과
  - 정상 응답이지만 documents=[]: 해당 카테고리 데이터 없음 (정상)

경기도 버스도착정보 API:
  - serviceResultCode != 0: API 키 문제 또는 잘못된 정류장 ID
  - 빈 응답: 해당 시간대 운행 없음 (정상 가능)

소상공인 DB:
  - "API not found": 별도 승인 필요 (data.go.kr) → Kakao 폴백으로 전환
```

### 6. Neon DB 연결 상태
```
연결 실패 시:
  - 교통 이력 데이터 없이 현재 데이터만 사용
  - "버스 이력 조회 불가 — 실시간 데이터만 사용" 경고

데이터 신선도:
  - 최신 레코드가 48시간 이상 전: "데이터 수집 중단 의심"
  - 특정 정류장 데이터만 없는 경우: 해당 정류장 크론 오류 가능
```

---

## 진단 결과 출력 형식
```json
{
  "validation_passed": true,
  "timestamp": "2026-04-07T21:00:00Z",
  "checks": {
    "coordinates": { "status": "ok", "in_pyeongtaek_range": true },
    "isochrone": {
      "status": "ok",
      "area_m2": 2340000,
      "area_normal_range": true,
      "bounding_radius_m": 1200,
      "area_factor": 2.98,
      "area_factor_capped": true
    },
    "apis": {
      "valhalla": { "status": "ok", "response_ms": 1240 },
      "kakao": { "status": "ok" },
      "bus": { "status": "ok" },
      "soho": { "status": "fallback", "reason": "API not found" }
    },
    "database": {
      "status": "ok",
      "latest_record_age_hours": 2,
      "total_snapshots": 2160
    }
  },
  "warnings": [
    "소상공인 DB 미연동 — Kakao 장소 카운트로 대체 (신뢰도 하향)"
  ],
  "errors": [],
  "data_quality_score": 0.82,
  "recommendation": "분석 진행 가능 (경고 1건)"
}
```

## 중단 조건 (분석 중단 후 사용자에게 안내)
다음 조건 중 하나라도 해당하면 분석을 중단하고 원인을 설명하라:

1. 좌표가 한국 범위 밖
2. Kakao API 키 인증 실패 (401)
3. 이소크론 면적 = 0 (도로 접근 불가)
4. areaFactor > 10 (점수 계산 불가 수준의 이상값)

## 경고만 하고 진행 가능한 조건
- 소상공인 DB 오류 → Kakao 폴백
- Valhalla 타임아웃 → 원형 폴리곤 폴백
- 버스 API 오류 → DB 이력만 사용
- DB 연결 실패 → 현재 데이터만 사용
- 이소크론 면적이 경계값에 걸림 → 경고 후 진행
