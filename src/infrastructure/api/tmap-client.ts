// T맵 API 클라이언트
// 차량 교통정보 + 경로 매트릭스 기반 대형약국 입지 분석

const TMAP_APP_KEY = process.env.TMAP_APP_KEY!;
const BASE = "https://apis.openapi.sk.com/tmap";

export interface TrafficScoreResult {
  score: number;           // 0~100
  avgSpeed: number;        // 주변 도로 평균 속도 (km/h)
  majorRoadCount: number;  // 주요 도로(국도/지방도) 수
  congestionLevel: 1 | 2 | 3 | 4; // 1=원활, 2=서행, 3=정체, 4=심정체
  congestionLabel: string;
  roadNames: string[];     // 주요 도로명 (최대 3개)
}

export interface RouteMatrixResult {
  avgDriveMinutes: number;   // 평균 차량 이동 시간 (분)
  within10min: number;       // 10분 내 도달 가능 아파트 단지 수
  within15min: number;       // 15분 내
  totalOrigins: number;      // 계산한 아파트 수
  source: "tmap" | "haversine"; // 데이터 출처
}

// 주변 도로 교통 정보 → 차량 접근성 점수
export async function getTmapTrafficScore(
  lat: number,
  lng: number,
  radiusKm = 1
): Promise<TrafficScoreResult | null> {
  if (!TMAP_APP_KEY) return null;

  try {
    const res = await fetch(
      `${BASE}/traffic?version=1&centerLat=${lat}&centerLon=${lng}&trafficType=AUTO&radius=${radiusKm}&zoomLevel=15`,
      {
        headers: { Accept: "application/json", appKey: TMAP_APP_KEY },
        signal: AbortSignal.timeout(6000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();

    const features: any[] = data.features ?? [];
    if (features.length === 0) return null;

    // 도로 세그먼트에서 속도/혼잡도 집계
    const speeds: number[] = [];
    const congestions: number[] = [];
    const majorRoads = new Set<string>();

    for (const f of features) {
      const p = f.properties;
      if (!p || p.speed == null) continue;
      speeds.push(p.speed);
      if (p.congestion) congestions.push(p.congestion);
      // 국도(011), 지방도(012/013), 시도(014) 주요 도로
      if (["011","012","013","014"].includes(p.roadType) && p.name) {
        const roadName = p.name.split("/")[0];
        majorRoads.add(roadName);
      }
    }

    if (speeds.length === 0) return null;

    const avgSpeed = Math.round(speeds.reduce((s, v) => s + v, 0) / speeds.length);
    const avgCongestion = congestions.length > 0
      ? congestions.reduce((s, v) => s + v, 0) / congestions.length
      : 1;

    // congestion: 1=원활, 2=서행, 3=정체, 4=심정체
    const congestionLevel = (
      avgCongestion < 1.5 ? 1 :
      avgCongestion < 2.5 ? 2 :
      avgCongestion < 3.5 ? 3 : 4
    ) as 1 | 2 | 3 | 4;

    const CONGESTION_LABEL = { 1: "원활", 2: "서행", 3: "정체", 4: "심정체" };

    // 점수 계산:
    // - 평균 속도 (최대 50점): 60km/h+ → 50점, 40→35, 20→15
    // - 주요 도로 수 (최대 30점): 3개+ → 30점
    // - 혼잡도 역산 (최대 20점): 원활→20, 서행→12, 정체→5, 심정체→0
    const speedScore = Math.min(50, Math.round((avgSpeed / 60) * 50));
    const roadScore = Math.min(30, majorRoads.size * 10);
    const congestionScore = [20, 12, 5, 0][congestionLevel - 1];
    const score = speedScore + roadScore + congestionScore;

    return {
      score,
      avgSpeed,
      majorRoadCount: majorRoads.size,
      congestionLevel,
      congestionLabel: CONGESTION_LABEL[congestionLevel],
      roadNames: [...majorRoads].slice(0, 3),
    };
  } catch {
    return null;
  }
}

// haversine 기반 근사 이동시간 계산 (T맵 한도 초과 시 폴백)
function haversineMinutes(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
  avgSpeedKmh = 40
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (distKm / avgSpeedKmh) * 60;
}

function calcFromHaversine(
  aptComplexes: { lat: number; lng: number }[],
  destLat: number,
  destLng: number
): RouteMatrixResult {
  const times = aptComplexes.map((a) => haversineMinutes(a.lat, a.lng, destLat, destLng));
  const avgDriveMinutes = Math.round(times.reduce((s, v) => s + v, 0) / times.length);
  return {
    avgDriveMinutes,
    within10min: times.filter((t) => t <= 10).length,
    within15min: times.filter((t) => t <= 15).length,
    totalOrigins: times.length,
    source: "haversine",
  };
}

// 경로 매트릭스: 아파트 단지 → 분석 위치 차량 소요 시간
// Free 한도 20건/일 초과 시 haversine 근사치로 자동 폴백
export async function getTmapRouteMatrix(
  aptComplexes: { lat: number; lng: number; name?: string }[],
  destLat: number,
  destLng: number
): Promise<RouteMatrixResult | null> {
  if (aptComplexes.length === 0) return null;

  if (!TMAP_APP_KEY) return calcFromHaversine(aptComplexes, destLat, destLng);

  // T맵 제한: 출발지 최대 30개
  const origins = aptComplexes.slice(0, 30).map((a) => ({
    lon: String(a.lng),
    lat: String(a.lat),
  }));

  try {
    const res = await fetch(`${BASE}/matrix?version=1`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        appKey: TMAP_APP_KEY,
      },
      body: JSON.stringify({
        origins,
        destinations: [{ lon: String(destLng), lat: String(destLat) }],
      }),
      signal: AbortSignal.timeout(8000),
    });

    // 429 = 일일 한도 초과 → haversine 폴백
    if (res.status === 429 || !res.ok) {
      console.warn(`[TMap] 경로 매트릭스 한도 초과(${res.status}) → haversine 폴백`);
      return calcFromHaversine(aptComplexes.slice(0, 30), destLat, destLng);
    }

    const data = await res.json();
    const rows: any[] = data.rows ?? [];
    const times: number[] = [];

    for (const row of rows) {
      for (const elem of row.elements ?? []) {
        if (elem.duration?.value != null) {
          times.push(elem.duration.value / 60); // 초 → 분
        }
      }
    }

    if (times.length === 0) return calcFromHaversine(aptComplexes.slice(0, 30), destLat, destLng);

    return {
      avgDriveMinutes: Math.round(times.reduce((s, v) => s + v, 0) / times.length),
      within10min: times.filter((t) => t <= 10).length,
      within15min: times.filter((t) => t <= 15).length,
      totalOrigins: times.length,
      source: "tmap",
    };
  } catch {
    return calcFromHaversine(aptComplexes.slice(0, 30), destLat, destLng);
  }
}
