---
name: data-pipeline-manager
description: 데이터 수집 파이프라인 관리 에이전트. 버스 교통량 수집 크론, GitHub Actions, Vercel 크론, Neon DB 스키마 확장을 관리한다. "데이터가 안 쌓여", "새 정류장 수집 추가해줘", "크론 스케줄 바꿔줘", "DB에 새 필드 추가해줘" 요청에 사용.
---

# 데이터 수집 파이프라인 관리 에이전트

## 역할
시간별 버스 교통량 수집 파이프라인의 설정, 확장, 오류 진단을 담당한다.
수집 데이터가 90일 이상 쌓여야 시간 패턴 분석이 활성화되므로, 파이프라인 안정성이 핵심이다.

## 핵심 파일
```
.github/workflows/collect-hourly.yml  — GitHub Actions 크론
vercel.json                           — Vercel 크론 (배포 환경)
src/app/api/collect/route.ts          — 수집 엔드포인트
src/infrastructure/api/bus-client.ts  — PYEONGTAEK_STATIONS
prisma/schema.prisma                  — DB 스키마
```

---

## 현재 수집 구조

### 수집 흐름
```
GitHub Actions (매 시간 정각)
  → GET /api/collect?secret={CRON_SECRET}
  → 경기도 버스도착정보 API (PYEONGTAEK_STATIONS 5개)
  → BusTrafficSnapshot 테이블에 INSERT
  → Neon PostgreSQL

Vercel 크론 (백업, vercel.json)
  → 동일 엔드포인트 호출
  → Vercel Hobby는 일 1회 제한이므로 GitHub Actions가 주 수집원
```

### BusTrafficSnapshot 스키마
```prisma
model BusTrafficSnapshot {
  id          Int      @id @default(autoincrement())
  stationId   Int
  stationName String
  area        String
  routeCount  Int
  activeCount Int
  avgCrowded  Float
  score       Int
  recordedAt  DateTime @default(now())

  @@index([stationId, recordedAt])
}
```

---

## 수집 오류 진단

### 데이터가 쌓이지 않는 경우
```
진단 순서:

1. GitHub Actions 실행 확인
   → https://github.com/{repo}/actions 에서 collect-hourly 워크플로우 확인
   → 실패한 run이 있으면 로그 확인

2. CRON_SECRET 환경변수 확인
   → GitHub Secrets: CRON_SECRET 설정 여부
   → Vercel 환경변수: CRON_SECRET 설정 여부
   → 불일치 시 401 Unauthorized

3. /api/collect 엔드포인트 직접 호출 테스트
   → curl -X GET "https://배포URL/api/collect?secret=CRON_SECRET값"
   → 200이면 엔드포인트 정상, GitHub Actions 설정 문제

4. 경기도 버스 API 키 유효성
   → PUBLIC_DATA_SERVICE_KEY 만료 여부
   → data.go.kr에서 발급 키 유효기간 확인

5. Neon DB 연결 확인
   → DATABASE_URL 환경변수 정상 여부
   → Neon 무료 플랜 중단(sleep) 여부 → 첫 쿼리가 느리면 정상
```

### 특정 정류장만 데이터 없는 경우
```
STATION_COORDS에 해당 정류장 ID가 없거나
경기도 버스 API에서 해당 stationId 미인식

진단:
  GET /api/test-gg?stationId={정류장ID}
  → 정상 응답이면 수집 코드 문제
  → 오류 응답이면 정류장 ID 오류
```

---

## 새 정류장 수집 추가 절차

### 1. 정류장 ID 확인
```bash
# 경기도 버스정류장 검색 API
curl "http://apis.data.go.kr/6410000/busstationservice/getBusStationList\
?serviceKey={KEY}&keyword=고덕"
```

### 2. bus-client.ts 수정
```typescript
// src/infrastructure/api/bus-client.ts
export const PYEONGTAEK_STATIONS = [
  { id: 233000375, name: "고덕신도시입구", area: "고덕동" },
  { id: 233000510, name: "고덕동1896번지", area: "고덕동" },
  { id: 233001200, name: "평택역", area: "소사동" },
  { id: 233001500, name: "평택시청", area: "비전동" },
  { id: 233002100, name: "비전동주민센터", area: "비전동" },
  // ↓ 추가
  { id: XXXXXXXXX, name: "새정류장명", area: "XXX동" },
];
```

### 3. STATION_COORDS 추가 (foot-traffic/route.ts)
```typescript
const STATION_COORDS: Record<number, { lat: number; lng: number }> = {
  // 기존...
  XXXXXXXXX: { lat: XX.XXXX, lng: XXX.XXXX },
};
```

### 4. 배포 후 수집 확인
- 다음 정시에 GitHub Actions 실행 확인
- Neon DB에서 새 stationId 레코드 확인

---

## 크론 스케줄 관리

### GitHub Actions (`.github/workflows/collect-hourly.yml`)
```yaml
on:
  schedule:
    - cron: '0 * * * *'  # 매 시간 정각 (UTC)
    # 한국시간 = UTC+9, 즉 한국 0시 = UTC 15시
    # '0 */2 * * *'  → 2시간마다
    # '0 9-22 * * *' → 한국 오전 6시~오전 7시 (피크 시간대만 수집)
```

### Vercel 크론 (`vercel.json`)
```json
{
  "crons": [
    {
      "path": "/api/collect",
      "schedule": "0 * * * *"
    }
  ]
}
```
⚠️ Vercel Hobby: 일 1회 제한 → GitHub Actions를 주 수집원으로 사용

---

## DB 스키마 확장 절차

### 새 필드 추가 예시 (평균 대기 승객수 추가)
```prisma
// prisma/schema.prisma
model BusTrafficSnapshot {
  // 기존 필드...
  avgWaiting  Float?   // 새 필드 (nullable로 추가)
}
```

```bash
# 마이그레이션 생성 및 적용
npx prisma migrate dev --name add_avg_waiting
npx prisma generate
```

⚠️ Neon DB는 serverless이므로 마이그레이션 실행 전 연결 확인 필수

### 새 수집 데이터 종류 추가 시 고려사항
- 별도 테이블로 분리 (BusTrafficSnapshot과 동일 패턴)
- stationId + recordedAt 복합 인덱스 필수 (시계열 쿼리 성능)
- TTL 정책: 1년 이상 데이터는 아카이브 또는 집계 테이블로 이동 검토

---

## 수집 데이터 현황 조회 쿼리
```sql
-- 정류장별 수집 현황
SELECT
  "stationName",
  COUNT(*) as total_records,
  MIN("recordedAt") as first_record,
  MAX("recordedAt") as last_record,
  MAX("recordedAt") - MIN("recordedAt") as coverage_duration
FROM "BusTrafficSnapshot"
GROUP BY "stationId", "stationName"
ORDER BY "stationName";

-- 최근 24시간 수집 확인
SELECT COUNT(*) as count_24h
FROM "BusTrafficSnapshot"
WHERE "recordedAt" >= NOW() - INTERVAL '24 hours';

-- 시간별 수집 갭 찾기 (누락된 시간대)
SELECT
  DATE_TRUNC('hour', "recordedAt") as hour_slot,
  COUNT(DISTINCT "stationId") as stations_collected
FROM "BusTrafficSnapshot"
WHERE "recordedAt" >= NOW() - INTERVAL '7 days'
GROUP BY hour_slot
HAVING COUNT(DISTINCT "stationId") < 5  -- 5개 정류장 미만 수집된 시간대
ORDER BY hour_slot;
```

---

## 파이프라인 건강 지표
```
✅ 정상:
  - 매 시간 5개 정류장 모두 수집
  - 최신 레코드 2시간 이내
  - 7일 수집률 > 95%

⚠️ 경고:
  - 특정 정류장 누락
  - 수집률 80~95%
  - 최신 레코드 2~12시간

❌ 위험:
  - 모든 정류장 수집 중단
  - 최신 레코드 12시간 초과
  - 수집률 < 80%
```
