// 격자 생성기: 동 경계 bbox → 일정 간격 격자 포인트 생성
// isPointInPolygon으로 경계 내부만 유지

import { isPointInPolygon } from "@/infrastructure/api/isochrone-client";

export interface GridPoint {
  lat: number;
  lng: number;
  id: string; // "lat_lng" 형식
}

export interface DongBounds {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
  polygon?: [number, number][]; // [lng, lat][]
}

// bbox → 격자 포인트 생성
export function generateGrid(
  bounds: DongBounds,
  spacingM = 100
): GridPoint[] {
  const { swLat, swLng, neLat, neLng, polygon } = bounds;

  // 동 크기에 따라 격자 간격 자동 조절
  const areaM2 = estimateAreaM2(swLat, swLng, neLat, neLng);
  let adjustedSpacing = spacingM;
  if (areaM2 > 10_000_000) adjustedSpacing = 150; // 10km²+ → 150m
  if (areaM2 > 20_000_000) adjustedSpacing = 200; // 20km²+ → 200m

  const mPerLat = 111320;
  const avgLat = (swLat + neLat) / 2;
  const mPerLng = 111320 * Math.cos((avgLat * Math.PI) / 180);

  const dLat = adjustedSpacing / mPerLat;
  const dLng = adjustedSpacing / mPerLng;

  const points: GridPoint[] = [];

  for (let lat = swLat; lat <= neLat; lat += dLat) {
    for (let lng = swLng; lng <= neLng; lng += dLng) {
      // 폴리곤이 있으면 내부 포인트만 유지
      if (polygon && !isPointInPolygon(lng, lat, polygon, 30)) {
        continue;
      }
      points.push({
        lat,
        lng,
        id: `${lat.toFixed(6)}_${lng.toFixed(6)}`,
      });
    }
  }

  return points;
}

// Haversine 거리 (km)
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// bbox 면적 추정 (m²)
function estimateAreaM2(swLat: number, swLng: number, neLat: number, neLng: number): number {
  const mPerLat = 111320;
  const avgLat = (swLat + neLat) / 2;
  const mPerLng = 111320 * Math.cos((avgLat * Math.PI) / 180);
  const widthM = (neLng - swLng) * mPerLng;
  const heightM = (neLat - swLat) * mPerLat;
  return widthM * heightM;
}
