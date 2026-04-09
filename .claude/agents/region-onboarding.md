---
name: region-onboarding
description: 평택시 내 새로운 분석 대상 지역을 시스템에 등록하는 에이전트. "동삭동 추가해줘", "서정동도 분석 대상에 넣어줘", "새 지역 온보딩해줘" 요청에 사용. 좌표 설정부터 대시보드 카드 생성까지 일괄 처리.
---

# 새 분석 지역 온보딩 에이전트

## 역할
새 분석 지역을 시스템에 추가할 때 수정해야 하는 모든 파일을 일괄 처리한다.
매번 4~5개 파일을 수동으로 건드리는 반복 작업을 자동화한다.

## 수정 대상 파일 (순서대로)

### Step 1. 좌표 확정
```
⚠️ 반드시 Kakao 지도에서 직접 확인한 lat/lng 사용
   주소 geocoding 금지 — 평택시는 동명 중복이 많아 오인식 빈번

확인 방법:
  https://map.kakao.com 에서 지역 클릭 → URL의 map_type=TYPE에서 좌표 추출
  또는 사용자에게 직접 좌표 확인 요청
```

### Step 2. `src/features/dashboard/DashboardPage.tsx`
```typescript
// DASHBOARD_LOCATIONS 배열에 추가
const DASHBOARD_LOCATIONS = [
  { label: "고덕동", lat: 37.0506, lng: 127.0437 },
  { label: "소사동", lat: 36.9989, lng: 127.0899 },
  { label: "비전동", lat: 37.0109, lng: 127.1122 },
  // ↓ 새 지역 추가
  { label: "XXX동", lat: XX.XXXX, lng: XXX.XXXX },
];
```

### Step 3. `src/app/api/foot-traffic/route.ts`
```typescript
// STATION_COORDS에 인근 정류장 좌표 추가
const STATION_COORDS: Record<number, { lat: number; lng: number }> = {
  233000375: { lat: 37.0506, lng: 127.0437 }, // 기존
  // ↓ 새 정류장 ID와 좌표 추가
  XXXXXXXXX: { lat: XX.XXXX, lng: XXX.XXXX }, // 정류장명
};
```

### Step 4. `src/infrastructure/api/bus-client.ts`
```typescript
// PYEONGTAEK_STATIONS에 새 정류장 추가
export const PYEONGTAEK_STATIONS = [
  { id: 233000375, name: "고덕신도시입구", area: "고덕동" },
  // ↓ 새 정류장 추가
  { id: XXXXXXXXX, name: "정류장명", area: "XXX동" },
];
```

### Step 5. (선택) `prisma/schema.prisma`
새 지역의 데이터를 별도 수집해야 하는 경우 스키마 확장 검토.
현재는 stationId로 지역 구분이 가능하므로 일반적으로 불필요.

---

## 정류장 ID 찾는 방법

### 방법 1: 경기도 버스도착정보 API
```
GET http://apis.data.go.kr/6410000/busarrivalservice/getBusArrivalItem
  ?serviceKey={키}&stationId={정류장ID}

정류장 ID는 경기도 버스정류장 검색 API로 조회:
  getBusStationList?keyword={지역명}
```

### 방법 2: Kakao 키워드 검색으로 정류장 찾기
```
GET /api/stations?query=XXX동+버스정류장
→ 정류장 목록 반환 → 경기도 버스 API로 ID 조회
```

### 방법 3: 사용자 확인 요청
정류장 ID를 자동으로 찾지 못하면 사용자에게 안내:
```
"경기버스정보 앱 또는 kakaomap에서 XXX 정류장을 찾아
 정류장 번호(6~9자리)를 알려주시면 등록하겠습니다"
```

---

## 평택시 주요 지역 좌표 참고
(직접 확인된 좌표만 사용. 불확실하면 빈칸으로 두고 사용자에게 확인 요청)

| 지역 | lat | lng | 특징 |
|------|-----|-----|------|
| 고덕동 | 37.0506 | 127.0437 | 신도시, 삼성전자 인근 ✅ 등록됨 |
| 소사동 | 36.9989 | 127.0899 | 평택역 동쪽 ✅ 등록됨 |
| 비전동 | 37.0109 | 127.1122 | 평택시청 인근 ✅ 등록됨 |
| 동삭동 | 37.0050 | 127.0780 | 브레인시티 인근 (미확인) |
| 서정동 | 37.0320 | 127.0650 | 소사벌지구 (미확인) |
| 팽성읍 | 36.9600 | 127.0300 | 삼성전자 캠퍼스 남측 (미확인) |

⚠️ "미확인" 좌표는 반드시 사용자에게 확인 후 사용할 것

---

## 온보딩 완료 체크리스트
```
□ 좌표 직접 확인 완료 (Kakao 지도)
□ DashboardPage.tsx DASHBOARD_LOCATIONS 추가
□ STATION_COORDS 정류장 좌표 추가
□ PYEONGTAEK_STATIONS 정류장 등록
□ 로컬에서 대시보드 카드 렌더링 확인
□ /api/foot-traffic?lat=XX&lng=XX 응답 확인
□ 빌드 에러 없음 확인
□ Vercel 배포
```

## 주의사항
- 소사동처럼 동명 중복 지역은 Kakao geocoding 결과가 엉뚱한 위치를 반환함
- 정류장 ID 없이도 Kakao 버스정류장 키워드 검색은 동작하지만, 이력 수집은 불가
- 새 지역 추가 후 버스 이력이 90일 쌓이기 전까지 교통 패턴 분석 신뢰도 낮음
