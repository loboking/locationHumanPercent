import { NextRequest, NextResponse } from "next/server";
import {
  addressToCoords,
  searchNearbyCount,
  searchBusStopsCount,
  calcFootTrafficEstimate,
} from "@/infrastructure/api/kakao-client";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const address = searchParams.get("address");
  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");

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
    resolvedAddress = `${lat}, ${lng}`;
  } else {
    return NextResponse.json({ error: "address 또는 lat/lng 파라미터 필요" }, { status: 400 });
  }

  // 반경 500m 내 데이터 병렬 조회 - total_count 사용
  const [busResult, restaurantResult, cafeResult, convResult] = await Promise.all([
    searchBusStopsCount(lat, lng, 500),
    searchNearbyCount(lat, lng, "FD6", 500), // 음식점
    searchNearbyCount(lat, lng, "CE7", 500), // 카페
    searchNearbyCount(lat, lng, "CS2", 500), // 편의점
  ]);

  const estimate = calcFootTrafficEstimate(
    busResult.totalCount,
    restaurantResult.totalCount,
    cafeResult.totalCount,
    convResult.totalCount
  );

  return NextResponse.json({
    address: resolvedAddress,
    coordinates: { lat, lng },
    estimate,
    nearby: {
      busStops: busResult.places.slice(0, 5).map((s) => ({ name: s.placeName, distance: s.distance })),
      restaurants: restaurantResult.totalCount,
      cafes: cafeResult.totalCount,
      convStores: convResult.totalCount,
    },
  });
}
