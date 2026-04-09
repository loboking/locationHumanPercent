---
name: commerce-data-connector
description: 상권 분석 데이터 연동 에이전트. 업종별 실측 점포 수, SEMAS 상권 매출, 개폐업률 등 상권 데이터를 실데이터로 교체하거나 확장할 때 사용. "상권 매출 실데이터 연동해줘", "SEMAS API 연결해줘", "업종 추가해줘" 요청에 사용.
---

# 상권 데이터 연동 에이전트

## 역할
상권 분석 페이지의 데이터 소스를 관리한다.
Mock 데이터 → 실데이터 교체, 새 업종 추가, SEMAS API 연동을 담당한다.

## 핵심 파일
- `src/app/analytics/commerce/page.tsx` — 상권 분석 페이지 (현재 실데이터 기반)
- `src/app/api/commerce/route.ts` — 상권 데이터 API 라우트
- `src/infrastructure/api/semas-client.ts` — SEMAS 상권분석 API
- `src/infrastructure/api/kakao-client.ts` — 카카오 장소 검색
- `src/infrastructure/api/soho-client.ts` — 소상공인 DB

## 현재 데이터 구조

### `/api/commerce` 응답 형식
```json
{
  "region": { "lat": 37.05, "lng": 127.04, "radius": 1000 },
  "population": { "aptComplexes": 8, "estHouseholds": 5600, "estPopulation": 13048 },
  "categories": [
    {
      "code": "FD6",
      "name": "음식점",
      "count": 180,
      "source": "kakao_realtime",
      "per1000": 13.8,
      "nationalAvg": 12,
      "densityRatio": 1.15,
      "evaluation": "밀집"
    }
  ],
  "dataQuality": {
    "restaurantSource": "soho_db | kakao_realtime",
    "lastUpdated": "ISO timestamp"
  }
}
```

## Kakao 카테고리 코드
```
FD6: 음식점       CE7: 카페
CS2: 편의점        PM9: 약국
HP8: 병원/의원     BK9: 은행
MT1: 대형마트      OL7: 주유소
SW8: 지하철역      PK6: 주차장
```

## 전국 평균 기준값 (인구 1000명당, 통계청 2023)
```typescript
const NATIONAL_AVG_PER_1000_PEOPLE = {
  restaurant: 12,
  cafe: 5,
  convenience: 2,
  pharmacy: 1.2,
  hospital: 3,
  bank: 0.8,
  mart: 0.3,
};
```

## SEMAS 상권매출 API 연동 방법 (API 승인 후)

### 필요 조건
1. data.go.kr에서 "소상공인진흥공단 상권분석 서비스" API 신청 및 승인
2. 고덕동/소사동/비전동 상권코드 조회 (별도 API로 조회 가능)

### 상권코드 조회 API
```
GET https://apis.data.go.kr/B553077/api/open/sdsc2/areaList
  ?serviceKey={KEY}
  &type=json
  &numOfRows=100
  &areaCode=4119&  ← 평택시 코드
```

### 매출 API 호출
```typescript
// semas-client.ts의 fetchCommerce() 사용
const commerce = await fetchCommerce(
  "G2210001",  // 고덕동 상권코드 (예시, 실제 조회 필요)
  "2024",
  "3"
);
// 반환: 당월_매출_금액, 당월_매출_건수, 점포_수
```

### route.ts 통합 방법
```typescript
// SEMAS 매출 추가 시 기존 카카오 카운트와 병합
const semasData = await fetchCommerce(areaCode, year, quarter).catch(() => null);
if (semasData) {
  // 실매출 데이터로 교체
  category.monthlyRevenue = semasData.data[0]?.당월_매출_금액;
  category.source = "semas_official";
}
```

## 새 업종 추가 방법
`src/app/api/commerce/route.ts`의 `CATEGORIES` 배열에 추가:
```typescript
{ code: "OL7", name: "주유소", nationalAvgPer1000: 0.4 },
```

## 데이터 신뢰도 레이블
| source | 표시 | 색상 |
|--------|------|------|
| `soho_db` | ✓ 소상공인DB | 🟢 초록 |
| `kakao_realtime` | 카카오 실측 | 🟢 초록 |
| `semas_official` | SEMAS 공식 | 🟢 초록 |
| `national_avg_ref` | 전국 평균 참고 | 🟡 노랑 |

## 개폐업률 추가 (향후)
소상공인 개폐업통계 API 추가 시 `route.ts`에 통합:
```
GET https://apis.data.go.kr/B553077/api/open/sdsc2/storeOpenCloseInAdmi
  ?serviceKey={KEY}&divId=adongCd&key={행정동코드}
```
반환: 개업률, 폐업률 → 상권 활성도 신호로 활용

## 주의사항
- 카카오 `totalCount`는 반경 내 전체 개수 (폴리곤 필터 없음)
- 소상공인 DB는 인허가 기준이라 실제 영업 중 점포와 다를 수 있음
- SEMAS 상권코드와 행정동코드는 1:N 관계 (하나의 행정동에 여러 상권)
- 배후인구 추정: 아파트단지 × 700세대 × 2.33명 (과소 추정 가능성 있음)
