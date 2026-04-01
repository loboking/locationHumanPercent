import { NextRequest, NextResponse } from "next/server";
import {
  addressToCoords,
  searchNearbyCount,
  searchBusStopsCount,
  searchApartmentCount,
  calcFootTrafficEstimate,
} from "@/infrastructure/api/kakao-client";
import { PYEONGTAEK_STATIONS } from "@/infrastructure/api/bus-client";
import { prisma } from "@/lib/prisma";

// 정류장별 실제 GPS 좌표 (Kakao 미인덱스 지역 폴백용)
const STATION_COORDS: Record<number, { lat: number; lng: number }> = {
  233000375: { lat: 37.0506, lng: 127.0437 }, // 고덕신도시입구 (고덕동 일대)
  233000510: { lat: 37.0506, lng: 127.0441 }, // 고덕동1896번지 (약 30m 이격)
  233001200: { lat: 36.9919, lng: 127.0858 }, // 평택역
  233001500: { lat: 36.9923, lng: 127.1094 }, // 평택시청
  233002100: { lat: 37.0109, lng: 127.1122 }, // 비전동주민센터
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const address = searchParams.get("address");
  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");
  const radiusParam = parseInt(searchParams.get("radius") ?? "500", 10);
  const radius = [500, 1000].includes(radiusParam) ? radiusParam : 500;

  let lat: number, lng: number, resolvedAddress: string;

  if (address) {
    const coords = await addressToCoords(address);
    if (!coords) return NextResponse.json({ error: "주소를 찾을 수 없습니다" }, { status: 404 });
    lat = coords.lat;
    lng = coords.lng;
    resolvedAddress = coords.roadAddress || coords.address;
  } else if (latParam && lngParam) {
    lat = parseFloat(latParam);
    lng = parseFloat(lngParam);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json({ error: "유효하지 않은 좌표값" }, { status: 400 });
    }
    // 좌표만 있을 경우 도로명주소 역지오코딩
    try {
      const rg = await fetch(
        `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}`,
        { headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` } }
      );
      const rgData = await rg.json();
      const doc = rgData.documents?.[0];
      resolvedAddress = doc?.road_address?.address_name || doc?.address?.address_name || `${lat}, ${lng}`;
    } catch {
      resolvedAddress = `${lat}, ${lng}`;
    }
  } else {
    return NextResponse.json({ error: "address 또는 lat/lng 파라미터 필요" }, { status: 400 });
  }

  // 병렬 조회: 버스정류장 + 상권 + 아파트
  const [busResult, restaurantResult, cafeResult, convResult, aptResult] = await Promise.all([
    searchBusStopsCount(lat, lng, radius),
    searchNearbyCount(lat, lng, "FD6", radius), // 음식점
    searchNearbyCount(lat, lng, "CE7", radius), // 카페
    searchNearbyCount(lat, lng, "CS2", radius), // 편의점
    searchApartmentCount(lat, lng, radius),     // 아파트 단지 (Kakao)
  ]);

  // 버스정류장 폴백: Kakao 미인덱스 지역은 PYEONGTAEK_STATIONS 거리 계산
  let busStopCount = busResult.totalCount;
  const stationsInRadius = PYEONGTAEK_STATIONS.filter((s) => {
    const coord = STATION_COORDS[s.id];
    if (!coord) return false;
    return haversineKm(lat, lng, coord.lat, coord.lng) <= radius / 1000;
  });
  if (busStopCount === 0 && stationsInRadius.length > 0) {
    busStopCount = stationsInRadius.length;
  }

  // 가장 가까운 모니터링 정류장
  let nearestStation = PYEONGTAEK_STATIONS[0];
  let minDist = Infinity;
  for (const station of PYEONGTAEK_STATIONS) {
    const coord = STATION_COORDS[station.id];
    if (!coord) continue;
    const dist = haversineKm(lat, lng, coord.lat, coord.lng);
    if (dist < minDist) { minDist = dist; nearestStation = station; }
  }

  // 교통량 이력 (최근 7일)
  const since7d = new Date();
  since7d.setDate(since7d.getDate() - 7);
  const trafficHistory = await prisma.busTrafficSnapshot.findMany({
    where: { stationId: nearestStation.id, recordedAt: { gte: since7d } },
    orderBy: { recordedAt: "asc" },
    select: { score: true, recordedAt: true },
  });

  const hourlyAvg = Array.from({ length: 24 }, (_, h) => {
    const hourData = trafficHistory.filter((d) => new Date(d.recordedAt).getHours() === h);
    return {
      hour: h,
      label: `${h}시`,
      score: hourData.length > 0 ? Math.round(hourData.reduce((s, d) => s + d.score, 0) / hourData.length) : null,
    };
  }).filter((h) => h.score !== null);

  const avgTrafficScore =
    trafficHistory.length > 0
      ? Math.round(trafficHistory.reduce((s, d) => s + d.score, 0) / trafficHistory.length)
      : null;

  const estimate = calcFootTrafficEstimate(
    busStopCount,
    restaurantResult.totalCount,
    cafeResult.totalCount,
    convResult.totalCount,
    aptResult.totalCount,  // 아파트 단지 수
    radius                 // 반경 전달 → 만점 기준 동적 조정
  );

  return NextResponse.json({
    address: resolvedAddress,
    coordinates: { lat, lng },
    radius,
    estimate,
    nearby: {
      busStops: [
        ...busResult.places.slice(0, 3).map((s) => ({ name: s.placeName, distance: s.distance, lat: s.lat, lng: s.lng })),
        ...stationsInRadius.map((s) => {
          const coord = STATION_COORDS[s.id]!;
          const distM = Math.round(haversineKm(lat, lng, coord.lat, coord.lng) * 1000);
          return { name: s.name, distance: distM, lat: coord.lat, lng: coord.lng };
        }),
      ].sort((a, b) => a.distance - b.distance).slice(0, 5),
      restaurants: restaurantResult.totalCount,
      cafes: cafeResult.totalCount,
      convStores: convResult.totalCount,
    },
    apartments: {
      totalCount: aptResult.totalCount,
      totalHouseholds: estimate.totalHouseholds,
      complexes: aptResult.complexes.slice(0, 5),
    },
    trafficHistory: {
      stationName: nearestStation.name,
      distanceKm: Math.round(minDist * 10) / 10,
      dataPoints: trafficHistory.length,
      avgScore: avgTrafficScore,
      hourlyAvg,
    },
  });
}
