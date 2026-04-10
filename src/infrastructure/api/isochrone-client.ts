// Valhalla 공개 서버 기반 이소크론 분석 (완전 무료, OpenStreetMap 도로망)
// 직선 거리가 아닌 실제 도로로 이동 가능한 구역 폴리곤 반환

const VALHALLA_URL = "https://valhalla1.openstreetmap.de/isochrone";

export type IsochroneMode = "car" | "walk";

export interface IsochroneResult {
  polygon: [number, number][]; // GeoJSON [lng, lat] 순서
  areaM2: number;              // 실제 커버 면적 (㎡)
  mode: IsochroneMode;
  minutes: number;
  boundingRadius: number;      // 바운딩박스 외접 반경 (m) - Kakao 검색용
}

export async function getIsochrone(
  lat: number,
  lng: number,
  mode: IsochroneMode = "car",
  minutes = 5
): Promise<IsochroneResult | null> {
  const costing = mode === "car" ? "auto" : "pedestrian";

  // 도심 보정: Valhalla 자유주행/자유보행 속도 → 실제 도심 속도 보정
  // 차로: 제한속도 대비 실제 주행 ≈ 73%
  //   예) 차로 5분 → 3.65분 요청
  // 도보: walking_speed 3.5km/h 단독 보정 (urbanFactor + speed 이중보정 방지)
  const urbanFactor = mode === "car" ? 0.73 : 1.0;
  const adjustedMinutes = Math.max(1, Math.round(minutes * urbanFactor * 10) / 10);

  const costingOptions = mode === "car"
    ? { auto: { use_highways: 0.1 } }
    : { pedestrian: { walking_speed: 3.5 } };

  try {
    const res = await fetch(VALHALLA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locations: [{ lon: lng, lat }],
        costing,
        costing_options: costingOptions,
        contours: [{ time: adjustedMinutes }],
        polygons: true,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const feature = data.features?.[0];
    if (!feature) return null;

    const polygon: [number, number][] = feature.geometry.coordinates[0];
    const areaM2 = calcPolygonAreaM2(polygon);
    const boundingRadius = calcBoundingRadius(areaM2);

    return { polygon, areaM2, mode, minutes, boundingRadius };
  } catch {
    return null;
  }
}

// 폴리곤 면적 계산 (신발끈 공식 → ㎡ 변환)
function calcPolygonAreaM2(coords: [number, number][]): number {
  let area = 0;
  const n = coords.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += coords[i][0] * coords[j][1];
    area -= coords[j][0] * coords[i][1];
  }
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos((37 * Math.PI) / 180);
  return Math.abs(area / 2) * mPerDegLat * mPerDegLng;
}

// 이소크론 면적 기반 등가 반경 × 1.5 (Kakao 검색 반경용)
// max vertex distance 대신 면적 기반으로 계산해 과대 산출 방지
// 차로 5분 (~2km²) → ~1200m, 차로 10분 (~8km²) → ~2400m
function calcBoundingRadius(areaM2: number): number {
  const equivalentRadius = Math.sqrt(areaM2 / Math.PI);
  return Math.min(Math.ceil(equivalentRadius * 1.5), 3000);
}

// 점 → 선분 최단거리 (미터)
function distanceToSegmentM(
  px: number, py: number,  // 점 [lng, lat]
  ax: number, ay: number,  // 선분 시작 [lng, lat]
  bx: number, by: number   // 선분 끝 [lng, lat]
): number {
  const mPerLat = 111320;
  const mPerLng = 111320 * Math.cos((py * Math.PI) / 180);
  const dx = (bx - ax) * mPerLng;
  const dy = (by - ay) * mPerLat;
  const len2 = dx * dx + dy * dy;
  const ex = (px - ax) * mPerLng;
  const ey = (py - ay) * mPerLat;
  if (len2 === 0) return Math.sqrt(ex * ex + ey * ey);
  const t = Math.max(0, Math.min(1, (ex * dx + ey * dy) / len2));
  return Math.sqrt((ex - t * dx) ** 2 + (ey - t * dy) ** 2);
}

// 점이 폴리곤 안에 있는지 (Ray Casting + 경계 버퍼)
// bufferM: 폴리곤 경계로부터 이 거리(미터) 이내면 포함으로 처리
// → 도로가 경계선이 될 때 길 건너 장소가 잘리는 문제 완화
export function isPointInPolygon(
  lng: number,
  lat: number,
  polygon: [number, number][],
  bufferM = 60
): boolean {
  const n = polygon.length;
  // 1. Ray Casting — 폴리곤 내부 판정
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  if (inside) return true;
  // 2. 경계 버퍼 — 폴리곤 경계 60m 이내면 포함
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (distanceToSegmentM(lng, lat, xi, yi, xj, yj) <= bufferM) return true;
  }
  return false;
}
