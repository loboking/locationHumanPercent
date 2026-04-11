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
import { searchSohoRestaurantCount, searchSohoCount, getAreaCodeByLocation } from "@/infrastructure/api/soho-client";
import { fetchFootTraffic } from "@/infrastructure/api/semas-client";
import { getAgePopulationByRegion, getWorkersByRegion } from "@/infrastructure/api/sgis-client";
import { getIsochrone, isPointInPolygon } from "@/infrastructure/api/isochrone-client";
import { PYEONGTAEK_STATIONS, getBusStationsByPos } from "@/infrastructure/api/bus-client";
import { fetchAptsByBjdCode } from "@/infrastructure/api/apt-client";
import { getTmapTrafficScore, getTmapRouteMatrix } from "@/infrastructure/api/tmap-client";
import { prisma } from "@/lib/prisma";

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
  let moisAdmCd = "", moisAdmNm = "", bjdCode = "";
  try {
    const rgCodeRes = await fetch(
      `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`,
      { headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` } }
    );
    const rgCodeData = await rgCodeRes.json();
    const hDoc = (rgCodeData.documents ?? []).find((d: Record<string, string>) => d.region_type === "H");
    if (hDoc) {
      moisAdmCd = hDoc.code ?? "";
      moisAdmNm = [hDoc.region_1depth_name, hDoc.region_2depth_name, hDoc.region_3depth_name]
        .filter(Boolean).join(" ");
    }
    const bDoc = (rgCodeData.documents ?? []).find((d: Record<string, string>) => d.region_type === "B");
    if (bDoc) bjdCode = bDoc.code ?? "";
  } catch { /* 무시 */ }

  // 이소크론 + 행안부 연령별 인구 + T맵 교통정보 + GBIS 버스정류소 + 국토부 아파트 + 상권코드 병렬 조회
  const [isochrone, agePopulation, workerStats, tmapTraffic, gbisStations, aptOfficialData, areaInfo] = await Promise.all([
    getIsochrone(lat, lng, isoMode, isoMinutes),
    moisAdmCd ? getAgePopulationByRegion(moisAdmCd, moisAdmNm) : Promise.resolve(null),
    moisAdmCd ? getWorkersByRegion(moisAdmCd, moisAdmNm) : Promise.resolve(null),
    getTmapTrafficScore(lat, lng, 1),
    getBusStationsByPos(lat, lng),
    bjdCode ? fetchAptsByBjdCode(bjdCode) : Promise.resolve(null),
    getAreaCodeByLocation(lat, lng, radius),
  ]);

  // 상권코드 → 소상공인 유동인구 실측치 조회
  // semas 데이터는 약 6개월 지연 공개 → 최근 6분기까지 역순 탐색
  let semasTraffic = null;
  let semasDataPeriod = "";
  if (areaInfo?.trarNo) {
    try {
      const now = new Date();
      let y = now.getFullYear();
      let q = Math.ceil((now.getMonth() + 1) / 3);
      for (let i = 0; i < 6; i++) {
        // 1분기씩 거슬러 올라가기
        q--;
        if (q === 0) { q = 4; y--; }
        const res = await fetchFootTraffic(areaInfo.trarNo, String(y), String(q));
        if (res.data?.[0]) {
          semasTraffic = res.data[0];
          semasDataPeriod = `${y}년 ${q}분기`;
          break;
        }
      }
    } catch { /* 미지원 상권 → null 유지 */ }
  }
  // 검색 반경은 항상 고정 (이소크론 크기와 무관)
  // 이소크론은 mobilityScore(이동 편의성 측정)에만 사용 → 구도심/신도시 공정 비교
  const searchRadius = radius;

  // 병렬 조회: 버스정류장 + 상권(카카오) + 소상공인DB + 아파트 + 주차장 + 병원 + 경쟁약국
  const [busResult, restaurantData, cafeData, convData, aptResult, sohoResult, parkingData, hospitalResult, pharmacyCompResult] = await Promise.all([
    searchBusStopsCount(lat, lng, Math.min(searchRadius, 2000)),
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
  const aptFiltered        = filterByIsochrone(aptResult.complexes);

  // 고정 반경으로 검색했으므로 별도 스케일 보정 불필요
  const restaurantResult = { totalCount: restaurantData.totalCount, places: restaurantFiltered };
  const cafeResult       = { totalCount: cafeData.totalCount,       places: cafeFiltered };
  const convResult       = { totalCount: convData.totalCount,       places: convFiltered };

  // T맵 경로 매트릭스: 이소크론 내 아파트 단지 → 분석 위치 차량 소요 시간
  const aptForMatrix = isochrone ? aptFiltered : aptResult.complexes;
  const tmapMatrix = aptForMatrix.length > 0
    ? await getTmapRouteMatrix(aptForMatrix, lat, lng)
    : null;

  // 버스정류장 폴백: Kakao 미인덱스 지역은 PYEONGTAEK_STATIONS 거리 계산
  const kakaoHasBusData = busResult.totalCount > 0;
  let busStopCount = busResult.totalCount;
  const stationsInRadius = PYEONGTAEK_STATIONS.filter((s) =>
    haversineKm(lat, lng, s.lat, s.lng) <= searchRadius / 1000
  );
  if (busStopCount === 0 && stationsInRadius.length > 0) {
    busStopCount = stationsInRadius.length;
  }

  // GBIS와 Kakao 버스정류장 병합 (중복은 거리 기준 제거)
  const gbisCount = gbisStations.length;
  const kakaoCount = busResult.totalCount;
  busStopCount = Math.max(kakaoCount, gbisCount, busStopCount);

  // 공식 세대수: 국토부 아파트 API (없으면 카카오 추정치 유지)
  const officialHouseholds = aptOfficialData?.totalHouseholds ?? 0;

  // 가장 가까운 모니터링 정류장
  let nearestStation = PYEONGTAEK_STATIONS[0];
  let minDist = Infinity;
  for (const station of PYEONGTAEK_STATIONS) {
    const dist = haversineKm(lat, lng, station.lat, station.lng);
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

  // 고정 반경 검색 결과를 그대로 사용 (스케일 보정 없음)
  const scaledSohoCount    = sohoResult.totalCount;
  const scaledParkingCount = parkingData.totalCount;
  const scaledHospitalCount = hospitalResult.totalCount;
  const scaledPharmacyCompCount = pharmacyCompResult.totalCount;
  const scaledAptCount = aptResult.totalCount;  // 고정 반경 내 단지 수

  const activeRestaurantCount = scaledSohoCount > 0
    ? scaledSohoCount
    : restaurantResult.totalCount;

  const estimate = calcFootTrafficEstimate(
    busStopCount,
    activeRestaurantCount,
    cafeResult.totalCount,
    convResult.totalCount,
    scaledAptCount,
    radius,                   // 항상 고정 반경 (밀도 계산 기준)
    isochrone?.areaM2,
    scaledParkingCount,
    isoMode,
    agePopulation?.total      ?? 0,   // 실거주 인구 수
    workerStats?.workerCnt    ?? 0,   // 직장인구 수
    tmapMatrix?.within10min   ?? 0,   // 차량 10분권 단지 수
    semasTraffic?.["총_유동인구_수"] ?? 0,  // 소상공인 유동인구 실측치
  );

  // 약국 전용 점수
  const pharmacyEstimate = calcPharmacyScore(
    busStopCount,
    scaledParkingCount,
    scaledHospitalCount,
    scaledPharmacyCompCount,
    convResult.totalCount,
    scaledAptCount,
    isochrone?.areaM2,
    isoMode,
    agePopulation?.chronicPatientRatio ?? 0,
    agePopulation?.youngFamilyRatio   ?? 0,
    agePopulation?.total              ?? 0,
    workerStats?.workerCnt            ?? 0,
    radius,
    tmapMatrix?.within10min           ?? 0,
    semasTraffic?.["총_유동인구_수"] ?? 0,  // 소상공인 유동인구 실측치
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
    workerStats: workerStats ? {
      adm_nm: workerStats.adm_nm,
      companyCnt: workerStats.companyCnt,
      workerCnt: workerStats.workerCnt,
    } : null,
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
        busStop: kakaoHasBusData ? "kakao" : gbisCount > 0 ? "gbis" : "fallback",
        gbisStations: gbisCount,
        trafficHistory: trafficHistory.length >= 24 ? "db" : trafficHistory.length > 0 ? "db_partial" : "none",
        isochrone: isochrone ? "valhalla" : "circle_fallback",
        floatingPop: semasTraffic ? "semas" : "none",
      },
    },
    semasFootTraffic: semasTraffic ? {
      areaCode: areaInfo?.trarNo,
      areaName: areaInfo?.mainTrarNm,
      period: semasDataPeriod,
      total: semasTraffic["총_유동인구_수"],
      male: semasTraffic["남성_유동인구_수"],
      female: semasTraffic["여성_유동인구_수"],
      age20s: semasTraffic["연령대_20_유동인구_수"],
      age30s: semasTraffic["연령대_30_유동인구_수"],
      age40s: semasTraffic["연령대_40_유동인구_수"],
      age50s: semasTraffic["연령대_50_유동인구_수"],
      age60s: semasTraffic["연령대_60_이상_유동인구_수"],
    } : null,
    nearby: {
      busStops: [
        ...busResult.places.slice(0, 3).map((s) => ({ name: s.placeName, distance: s.distance, lat: s.lat, lng: s.lng })),
        ...stationsInRadius.map((s) => {
          const distM = Math.round(haversineKm(lat, lng, s.lat, s.lng) * 1000);
          return { name: s.name, distance: distM, lat: s.lat, lng: s.lng };
        }),
        ...gbisStations.slice(0, 3).map((s) => ({ name: s.stationName, distance: s.distanceM, lat: s.lat, lng: s.lng })),
      ].sort((a, b) => a.distance - b.distance).slice(0, 5),
      restaurants: activeRestaurantCount,
      restaurantSource: sohoResult.totalCount > 0 ? "soho" : "kakao",
      cafes: cafeResult.totalCount,
      convStores: convResult.totalCount,
    },
    apartments: {
      totalCount: scaledAptCount,
      totalHouseholds: estimate.totalHouseholds,
      complexes: (isochrone ? aptFiltered : aptResult.complexes).slice(0, 5),
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
