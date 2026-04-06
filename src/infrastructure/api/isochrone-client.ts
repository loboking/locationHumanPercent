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
  try {
    const res = await fetch(VALHALLA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locations: [{ lon: lng, lat }],
        costing,
        contours: [{ time: minutes }],
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
    const boundingRadius = calcBoundingRadius(lat, lng, polygon);

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

// 중심점으로부터 폴리곤 꼭짓점까지 최대 거리 (Kakao 검색 반경용)
function calcBoundingRadius(
  centerLat: number,
  centerLng: number,
  polygon: [number, number][]
): number {
  const R = 6371000;
  let maxDist = 0;
  for (const [pLng, pLat] of polygon) {
    const dLat = ((pLat - centerLat) * Math.PI) / 180;
    const dLng = ((pLng - centerLng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((centerLat * Math.PI) / 180) *
        Math.cos((pLat * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (dist > maxDist) maxDist = dist;
  }
  return Math.min(Math.ceil(maxDist), 5000); // Kakao 최대 5000m
}

// 점이 폴리곤 안에 있는지 (Ray Casting)
export function isPointInPolygon(
  lng: number,
  lat: number,
  polygon: [number, number][]
): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
