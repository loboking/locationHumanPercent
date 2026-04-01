// Infrastructure Layer: 카카오 REST API 클라이언트

const REST_KEY = process.env.KAKAO_REST_API_KEY!;
const BASE = "https://dapi.kakao.com";

export interface KakaoCoords {
  lat: number;
  lng: number;
  address: string;
  roadAddress: string;
}

// 주소 → 좌표 변환
export async function addressToCoords(address: string): Promise<KakaoCoords | null> {
  const res = await fetch(
    `${BASE}/v2/local/search/address.json?query=${encodeURIComponent(address)}`,
    { headers: { Authorization: `KakaoAK ${REST_KEY}` } }
  );
  const data = await res.json();
  const doc = data.documents?.[0];
  if (!doc) return null;
  return {
    lat: parseFloat(doc.y),
    lng: parseFloat(doc.x),
    address: doc.address?.address_name ?? address,
    roadAddress: doc.road_address?.address_name ?? "",
  };
}

export interface KakaoPlace {
  id: string;
  placeName: string;
  categoryName: string;
  lat: number;
  lng: number;
  distance: number;
}

// 반경 내 카테고리 장소 검색 - total_count 반환
export async function searchNearbyCount(
  lat: number,
  lng: number,
  categoryCode: string,
  radius = 500
): Promise<{ totalCount: number; places: KakaoPlace[] }> {
  const params = new URLSearchParams({
    category_group_code: categoryCode,
    x: String(lng),
    y: String(lat),
    radius: String(radius),
    size: "15",
  });
  const res = await fetch(`${BASE}/v2/local/search/category.json?${params}`, {
    headers: { Authorization: `KakaoAK ${REST_KEY}` },
  });
  const data = await res.json();
  return {
    totalCount: data.meta?.total_count ?? 0,
    places: (data.documents ?? []).map((d: any) => ({
      id: d.id,
      placeName: d.place_name,
      categoryName: d.category_name,
      lat: parseFloat(d.y),
      lng: parseFloat(d.x),
      distance: parseInt(d.distance),
    })),
  };
}

// 반경 내 버스정류장 검색 - total_count 반환
export async function searchBusStopsCount(
  lat: number,
  lng: number,
  radius = 500
): Promise<{ totalCount: number; places: KakaoPlace[] }> {
  const params = new URLSearchParams({
    query: "버스정류장",
    x: String(lng),
    y: String(lat),
    radius: String(radius),
    size: "15",
  });
  const res = await fetch(`${BASE}/v2/local/search/keyword.json?${params}`, {
    headers: { Authorization: `KakaoAK ${REST_KEY}` },
  });
  const data = await res.json();
  return {
    totalCount: data.meta?.total_count ?? 0,
    places: (data.documents ?? []).map((d: any) => ({
      id: d.id,
      placeName: d.place_name,
      categoryName: d.category_name,
      lat: parseFloat(d.y),
      lng: parseFloat(d.x),
      distance: parseInt(d.distance),
    })),
  };
}

// 유동인구 추정 점수 계산 (total_count 기반)
export interface FootTrafficEstimate {
  score: number;
  grade: "매우높음" | "높음" | "보통" | "낮음";
  busStopCount: number;
  restaurantCount: number;
  cafeCount: number;
  convStoreCount: number;
  detail: {
    transitScore: number;
    commerceScore: number;
  };
}

export function calcFootTrafficEstimate(
  busStops: number,
  restaurants: number,
  cafes: number,
  convStores: number
): FootTrafficEstimate {
  // 교통 접근성 (40점): 버스정류장 1개=8점, 5개 이상이면 만점
  const transitScore = Math.min(busStops * 8, 40);

  // 상권 활성도 (60점): 로그 스케일 적용
  // 음식점 기준: 50개=만점, 카페: 30개=만점, 편의점: 10개=만점
  const rScore = Math.min((restaurants / 50) * 25, 25);
  const cScore = Math.min((cafes / 30) * 20, 20);
  const sScore = Math.min((convStores / 10) * 15, 15);
  const commerceScore = Math.round(rScore + cScore + sScore);

  const score = Math.round(transitScore + commerceScore);

  const grade =
    score >= 70 ? "매우높음" :
    score >= 50 ? "높음" :
    score >= 30 ? "보통" : "낮음";

  return {
    score,
    grade,
    busStopCount: busStops,
    restaurantCount: restaurants,
    cafeCount: cafes,
    convStoreCount: convStores,
    detail: { transitScore, commerceScore },
  };
}
