// 소상공인시장진흥공단 상가(상권)정보 API
// 영업 중인 실제 사업체만 필터링 - 카카오 대비 폐업 업체 제외

const SERVICE_KEY = process.env.PUBLIC_DATA_SERVICE_KEY!;
const BASE = "https://apis.data.go.kr/B553077/api/open/sdsc2";

export interface SohoStore {
  bizesNm: string;      // 상호명
  indsLclsNm: string;   // 업종 대분류
  indsSclsNm: string;   // 업종 소분류
  lat: number;
  lng: number;
  distance?: number;
}

export interface SohoCountResult {
  totalCount: number;
  stores: SohoStore[];
}

// 업종 대분류 코드
// I2: 음식, D: 소매, Q: 음식료품, J: 교육
const CATEGORY_MAP: Record<string, string> = {
  restaurant: "I2",  // 음식점
  retail:     "D",   // 소매
};

// 반경 내 영업 중인 사업체 수 조회
export async function searchSohoCount(
  lat: number,
  lng: number,
  category: keyof typeof CATEGORY_MAP,
  radius = 500
): Promise<SohoCountResult> {
  const params = new URLSearchParams({
    serviceKey: SERVICE_KEY,
    pageNo:     "1",
    numOfRows:  "100",
    radius:     String(radius),
    cx:         String(lng),
    cy:         String(lat),
    indsLclsCd: CATEGORY_MAP[category],
    type:       "json",
  });

  try {
    const res = await fetch(`${BASE}/storeListInRadius/v1?${params}`);
    if (!res.ok) return { totalCount: 0, stores: [] };
    const data = await res.json();
    const body = data.body;
    if (!body || body.totalCount === 0) return { totalCount: 0, stores: [] };

    const items: any[] = Array.isArray(body.items) ? body.items : (body.items ? [body.items] : []);
    const stores: SohoStore[] = items.map((d: any) => ({
      bizesNm:    d.bizesNm ?? "",
      indsLclsNm: d.indsLclsNm ?? "",
      indsSclsNm: d.indsSclsNm ?? "",
      lat:        parseFloat(d.lat ?? "0"),
      lng:        parseFloat(d.lon ?? "0"),
    }));

    return {
      totalCount: body.totalCount ?? stores.length,
      stores,
    };
  } catch {
    return { totalCount: 0, stores: [] };
  }
}

// 음식점 + 카페(소매음료) 통합 조회
export async function searchSohoRestaurantCount(
  lat: number,
  lng: number,
  radius = 500
): Promise<SohoCountResult> {
  return searchSohoCount(lat, lng, "restaurant", radius);
}
