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
  if (!res.ok) throw new Error(`카카오 주소검색 API 오류: ${res.status}`);
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
// 경기도는 "버스정류소", 서울/기타는 "버스정류장" 혼용 → 두 쿼리 합산
export async function searchBusStopsCount(
  lat: number,
  lng: number,
  radius = 500
): Promise<{ totalCount: number; places: KakaoPlace[] }> {
  const commonParams = {
    x: String(lng),
    y: String(lat),
    radius: String(radius),
    size: "15",
  };

  const [res1, res2] = await Promise.all([
    fetch(`${BASE}/v2/local/search/keyword.json?${new URLSearchParams({ ...commonParams, query: "버스정류소" })}`, {
      headers: { Authorization: `KakaoAK ${REST_KEY}` },
    }),
    fetch(`${BASE}/v2/local/search/keyword.json?${new URLSearchParams({ ...commonParams, query: "버스정류장" })}`, {
      headers: { Authorization: `KakaoAK ${REST_KEY}` },
    }),
  ]);

  const [d1, d2] = await Promise.all([res1.json(), res2.json()]);

  const toPlace = (d: any): KakaoPlace => ({
    id: d.id,
    placeName: d.place_name,
    categoryName: d.category_name,
    lat: parseFloat(d.y),
    lng: parseFloat(d.x),
    distance: parseInt(d.distance),
  });

  const places1: KakaoPlace[] = (d1.documents ?? []).map(toPlace);
  const places2: KakaoPlace[] = (d2.documents ?? []).map(toPlace);

  // 중복 제거 (같은 id)
  const seen = new Set(places1.map((p) => p.id));
  const merged = [...places1, ...places2.filter((p) => !seen.has(p.id))];
  merged.sort((a, b) => a.distance - b.distance);

  const totalCount = (d1.meta?.total_count ?? 0) + (d2.meta?.total_count ?? 0);

  return { totalCount, places: merged };
}

// 좌표 → 법정동코드 변환
export async function getRegionCode(lat: number, lng: number): Promise<string | null> {
  const params = new URLSearchParams({ x: String(lng), y: String(lat) });
  const res = await fetch(`${BASE}/v2/local/geo/coord2regioncode.json?${params}`, {
    headers: { Authorization: `KakaoAK ${REST_KEY}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const bCode = (data.documents ?? []).find((d: any) => d.region_type === "B");
  return bCode?.code ?? null;
}

// 반경 내 아파트 단지 검색 (주거 밀도 추정용)
// 국토교통부 API는 단건조회 전용이라 Kakao 키워드 검색으로 대체
export async function searchApartmentCount(
  lat: number,
  lng: number,
  radius = 500
): Promise<{ totalCount: number; complexes: { name: string; distance: number }[] }> {
  const params = new URLSearchParams({
    query: "아파트",
    x: String(lng),
    y: String(lat),
    radius: String(radius),
    size: "15",
  });
  const res = await fetch(`${BASE}/v2/local/search/keyword.json?${params}`, {
    headers: { Authorization: `KakaoAK ${REST_KEY}` },
  });
  if (!res.ok) return { totalCount: 0, complexes: [] };
  const data = await res.json();
  const complexes = (data.documents ?? [])
    .filter((d: any) => d.category_name?.includes("아파트"))
    .map((d: any) => ({ name: d.place_name as string, distance: parseInt(d.distance) }));
  return {
    totalCount: data.meta?.total_count ?? 0,
    complexes,
  };
}

// 유동인구 추정 점수 계산
// 교통(25점) + 상권(45점) + 주거(30점) = 100점
export interface FootTrafficEstimate {
  score: number;
  grade: "매우높음" | "높음" | "보통" | "낮음";
  busStopCount: number;
  restaurantCount: number;
  cafeCount: number;
  convStoreCount: number;
  totalHouseholds: number;
  detail: {
    transitScore: number;
    commerceScore: number;
    residentialScore: number;
  };
}

export function calcFootTrafficEstimate(
  busStops: number,
  restaurants: number,
  cafes: number,
  convStores: number,
  aptComplexCount = 0,  // 아파트 단지 수
  radius = 500          // 분석 반경 (m)
): FootTrafficEstimate {
  // 반경 면적 비율 (500m 기준, π×r² 비례)
  const areaFactor = (radius / 500) ** 2;

  // 교통 접근성 (25점): 반경 무관 고정 — 버스정류장은 밀도가 아닌 접근성 개념
  // 1개=5점, 5개 이상=만점 (반경을 넓혀도 같은 정류장이면 동일 점수 유지)
  const transitScore = Math.min(busStops * 5, 25);

  // 상권 활성도 (45점) — 반경 면적에 비례한 만점 기준
  const rMax = Math.max(1, Math.round(30 * areaFactor));  // 500m=30개
  const cMax = Math.max(1, Math.round(20 * areaFactor));  // 500m=20개
  const sMax = Math.max(1, Math.round(7  * areaFactor));  // 500m=7개
  const rScore = Math.min((restaurants / rMax) * 20, 20);
  const cScore = Math.min((cafes      / cMax) * 15, 15);
  const sScore = Math.min((convStores / sMax) * 10, 10);
  const commerceScore = Math.round(rScore + cScore + sScore);

  // 주거 밀도 (30점): 반경 면적에 비례
  const aptMax = Math.max(1, Math.round(10 * areaFactor)); // 500m=10단지
  const residentialScore = Math.min(Math.round((aptComplexCount / aptMax) * 30), 30);
  // 세대수 추정 (단지당 평균 700세대)
  const totalHouseholds = aptComplexCount * 700;

  const score = Math.min(Math.round(transitScore + commerceScore + residentialScore), 100);

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
    totalHouseholds,
    detail: { transitScore, commerceScore, residentialScore },
  };
}
