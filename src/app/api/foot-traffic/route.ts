import { NextRequest, NextResponse } from "next/server";
import {
  addressToCoords,
  searchNearbyCount,
  searchNearbyPlaces,
  searchBusStopsCount,
  searchApartmentCount,
  calcFootTrafficEstimate,
  calcPharmacyScore,
} from "@/infrastructure/api/kakao-client";
import { searchSohoRestaurantCount, searchSohoCount } from "@/infrastructure/api/soho-client";
import { getAgePopulationByRegion } from "@/infrastructure/api/sgis-client";
import { getIsochrone, isPointInPolygon } from "@/infrastructure/api/isochrone-client";
import { PYEONGTAEK_STATIONS } from "@/infrastructure/api/bus-client";
import { getTmapTrafficScore, getTmapRouteMatrix } from "@/infrastructure/api/tmap-client";
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
  const radius = [300, 500, 1000].includes(radiusParam) ? radiusParam : 500;
  const isoMode = (searchParams.get("mode") ?? "car") as "car" | "walk";
  const isoMinutes = parseInt(searchParams.get("minutes") ?? "5", 10);

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

  // 지역 코드 조회 (행안부 주민등록 인구용)
  let moisAdmCd = "", moisAdmNm = "";
  try {
    const rgCodeRes = await fetch(
      `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`,
      { headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` } }
    );
    const rgCodeData = await rgCodeRes.json();
    const hDoc = (rgCodeData.documents ?? []).find((d: any) => d.region_type === "H");
    if (hDoc) {
      moisAdmCd = hDoc.code ?? "";
      moisAdmNm = [hDoc.region_1depth_name, hDoc.region_2depth_name, hDoc.region_3depth_name]
        .filter(Boolean).join(" ");
    }
  } catch { /* 무시 */ }

  // 이소크론 + 행안부 연령별 인구 + T맵 교통정보 병렬 조회
  const [isochrone, agePopulation, tmapTraffic] = await Promise.all([
    getIsochrone(lat, lng, isoMode, isoMinutes),
    moisAdmCd ? getAgePopulationByRegion(moisAdmCd, moisAdmNm) : Promise.resolve(null),
    getTmapTrafficScore(lat, lng, 1),
  ]);
  const searchRadius = isochrone ? isochrone.boundingRadius : radius;

  // 병렬 조회: 버스정류장 + 상권(카카오) + 소상공인DB + 아파트 + 주차장 + 병원 + 경쟁약국
  const [busResult, restaurantData, cafeData, convData, aptResult, sohoResult, parkingData, hospitalResult, pharmacyCompResult] = await Promise.all([
    searchBusStopsCount(lat, lng, isochrone ? Math.min(searchRadius, 2000) : radius),
    searchNearbyPlaces(lat, lng, "FD6", searchRadius), // 음식점
    searchNearbyPlaces(lat, lng, "CE7", searchRadius), // 카페
    searchNearbyPlaces(lat, lng, "CS2", searchRadius), // 편의점
    searchApartmentCount(lat, lng, searchRadius),
    searchSohoRestaurantCount(lat, lng, searchRadius),
    searchNearbyCount(lat, lng, "PK6", searchRadius),  // 주차장
    searchSohoCount(lat, lng, "hospital", searchRadius), // 병원/의원 (소상공인DB)
    searchSohoCount(lat, lng, "pharmacy", searchRadius), // 경쟁 약국 (소상공인DB)
  ]);

  // 이소크론 폴리곤으로 필터링 (지도 표시용, max 45개 한계 있음)
  const filterByIsochrone = <T extends { lat: number; lng: number }>(places: T[]): T[] =>
    isochrone
      ? places.filter((p) => isPointInPolygon(p.lng, p.lat, isochrone.polygon))
      : places;

  const restaurantFiltered = filterByIsochrone(restaurantData.places);
  const cafeFiltered       = filterByIsochrone(cafeData.places);
  const convFiltered       = filterByIsochrone(convData.places);

  // 점수 계산용 카운트: boundingRadius 과대 산출 보정
  // boundingRadius 원(넓음) 기준 totalCount → 폴리곤 면적 비율로 스케일 다운
  // 이소크론 없을 때는 totalCount 그대로 사용
  const circleAreaM2 = Math.PI * searchRadius * searchRadius;
  const scaleFactor = isochrone
    ? Math.min(1, isochrone.areaM2 / circleAreaM2)
    : 1;
  const scaleCount = (total: number, filtered: number) =>
    isochrone
      ? Math.max(filtered, Math.round(total * scaleFactor))
      : total;

  const restaurantResult = { totalCount: scaleCount(restaurantData.totalCount, restaurantFiltered.length), places: restaurantFiltered };
  const cafeResult       = { totalCount: scaleCount(cafeData.totalCount, cafeFiltered.length),             places: cafeFiltered };
  const convResult       = { totalCount: scaleCount(convData.totalCount, convFiltered.length),             places: convFiltered };

  // T맵 경로 매트릭스: 아파트 단지 → 분석 위치 차량 소요 시간
  const tmapMatrix = aptResult.complexes.length > 0
    ? await getTmapRouteMatrix(aptResult.complexes, lat, lng)
    : null;

  // 버스정류장 폴백: Kakao 미인덱스 지역은 PYEONGTAEK_STATIONS 거리 계산
  const kakaoHasBusData = busResult.totalCount > 0;
  let busStopCount = busResult.totalCount;
  const stationsInRadius = PYEONGTAEK_STATIONS.filter((s) => {
    const coord = STATION_COORDS[s.id];
    if (!coord) return false;
    return haversineKm(lat, lng, coord.lat, coord.lng) <= searchRadius / 1000;
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

  // 음식점 수: 소상공인DB(영업중) 우선, 없으면 카카오 폴백 (소호도 동일 스케일 적용)
  const scaledSohoCount    = Math.round(sohoResult.totalCount * scaleFactor);
  const scaledParkingCount = Math.round(parkingData.totalCount * scaleFactor);
  const scaledHospitalCount = Math.round(hospitalResult.totalCount * scaleFactor);
  const scaledPharmacyCompCount = Math.round(pharmacyCompResult.totalCount * scaleFactor);
  // 아파트 단지수도 동일 스케일 보정 (기존: totalCount 미보정으로 residentialScore 과대 산출)
  const scaledAptCount = Math.max(
    aptResult.complexes.length,
    Math.round(aptResult.totalCount * scaleFactor)
  );

  const activeRestaurantCount = scaledSohoCount > 0
    ? scaledSohoCount
    : restaurantResult.totalCount;

  const estimate = calcFootTrafficEstimate(
    busStopCount,
    activeRestaurantCount,
    cafeResult.totalCount,
    convResult.totalCount,
    scaledAptCount,           // ← 스케일 적용
    radius,
    isochrone?.areaM2,
    scaledParkingCount,
    isoMode
  );

  // 약국 전용 점수
  const pharmacyEstimate = calcPharmacyScore(
    busStopCount,
    scaledParkingCount,
    scaledHospitalCount,
    scaledPharmacyCompCount,
    convResult.totalCount,
    scaledAptCount,           // ← 스케일 적용
    isochrone?.areaM2,
    isoMode
  );

  // 데이터 신뢰도 평가 (Phase 1: 실데이터 비율 산출)
  const realDataSources = [
    busStopCount > 0,                        // 버스정류장: 실측
    sohoResult.totalCount > 0,               // 소상공인 DB: 실측 (영업중)
    trafficHistory.length >= 24,             // 버스 이력: 충분한 실측 데이터
  ].filter(Boolean).length;
  const realDataRatio = realDataSources / 3;
  const confidence =
    realDataRatio >= 0.8 ? "high" :
    realDataRatio >= 0.5 ? "medium" : "low";

  return NextResponse.json({
    address: resolvedAddress,
    coordinates: { lat, lng },
    radius,
    isochrone: isochrone
      ? { polygon: isochrone.polygon, areaM2: Math.round(isochrone.areaM2), mode: isochrone.mode, minutes: isochrone.minutes }
      : null,
    estimate,
    pharmacyEstimate,
    agePopulation: agePopulation ? {
      adm_nm: agePopulation.adm_nm,
      total: agePopulation.total,
      age20s: agePopulation.age20s,
      age30s: agePopulation.age30s,
      age40s: agePopulation.age40s,
      age50s: agePopulation.age50s,
      age60s: agePopulation.age60s,
      youngFamily: agePopulation.youngFamily,
      chronicPatient: agePopulation.chronicPatient,
      youngFamilyRatio: agePopulation.youngFamilyRatio,
      chronicPatientRatio: agePopulation.chronicPatientRatio,
    } : null,
    busStopSource: kakaoHasBusData ? "kakao" : "fallback",
    dataQuality: {
      confidence,
      realDataRatio: Math.round(realDataRatio * 100),
      sources: {
        restaurant: sohoResult.totalCount > 0 ? "soho" : "kakao",
        busStop: kakaoHasBusData ? "kakao" : "fallback",
        trafficHistory: trafficHistory.length >= 24 ? "db" : trafficHistory.length > 0 ? "db_partial" : "none",
        isochrone: isochrone ? "valhalla" : "circle_fallback",
      },
    },
    nearby: {
      busStops: [
        ...busResult.places.slice(0, 3).map((s) => ({ name: s.placeName, distance: s.distance, lat: s.lat, lng: s.lng })),
        ...stationsInRadius.map((s) => {
          const coord = STATION_COORDS[s.id]!;
          const distM = Math.round(haversineKm(lat, lng, coord.lat, coord.lng) * 1000);
          return { name: s.name, distance: distM, lat: coord.lat, lng: coord.lng };
        }),
      ].sort((a, b) => a.distance - b.distance).slice(0, 5),
      restaurants: activeRestaurantCount,
      restaurantSource: sohoResult.totalCount > 0 ? "soho" : "kakao",
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
    roadTraffic: tmapTraffic ? {
      score: tmapTraffic.score,
      avgSpeed: tmapTraffic.avgSpeed,
      majorRoadCount: tmapTraffic.majorRoadCount,
      congestionLevel: tmapTraffic.congestionLevel,
      congestionLabel: tmapTraffic.congestionLabel,
      roadNames: tmapTraffic.roadNames,
    } : null,
    carAccessibility: tmapMatrix ? {
      avgDriveMinutes: tmapMatrix.avgDriveMinutes,
      within10min: tmapMatrix.within10min,
      within15min: tmapMatrix.within15min,
      totalOrigins: tmapMatrix.totalOrigins,
    } : null,
  });
}
