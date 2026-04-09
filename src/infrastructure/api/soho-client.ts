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

// 소상공인 상가정보 API 업종 코드
// 대분류(indsLclsCd): I2=음식, I3=음료/주류(카페), D=소매, L=의료/건강, G=생활서비스, N=금융
// 중분류(indsMclsCd): D09=편의점/슈퍼, D10=대형마트, L2=의원/병원, L3=약국
type SohoCategory =
  | { lclsCd: string; mclsCd?: never }
  | { lclsCd?: never; mclsCd: string };

const SOHO_CODES: Record<string, SohoCategory> = {
  restaurant:  { lclsCd: "I2"  }, // 음식점 (확인된 코드)
  cafe:        { lclsCd: "I3"  }, // 카페/음료/주류점
  convenience: { mclsCd: "D09" }, // 편의점/슈퍼마켓
  pharmacy:    { mclsCd: "L3"  }, // 약국/의약품
  hospital:    { mclsCd: "L2"  }, // 의원/병원
  mart:        { mclsCd: "D10" }, // 대형마트/종합소매
  bank:        { lclsCd: "N"   }, // 금융/은행
};

// 반경 내 영업 중인 사업체 수 조회 (총수는 totalCount 사용, 최대 100건 sample)
async function fetchSohoInRadius(
  lat: number,
  lng: number,
  codes: SohoCategory,
  radius: number
): Promise<SohoCountResult> {
  const params = new URLSearchParams({
    serviceKey: SERVICE_KEY,
    pageNo:     "1",
    numOfRows:  "100",
    radius:     String(radius),
    cx:         String(lng),
    cy:         String(lat),
    type:       "json",
  });
  if ("lclsCd" in codes && codes.lclsCd) params.set("indsLclsCd", codes.lclsCd);
  if ("mclsCd" in codes && codes.mclsCd) params.set("indsMclsCd", codes.mclsCd);

  try {
    const res = await fetch(`${BASE}/storeListInRadius/v1?${params}`, {
      signal: AbortSignal.timeout(6000),
    });
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

    return { totalCount: body.totalCount ?? stores.length, stores };
  } catch {
    return { totalCount: 0, stores: [] };
  }
}

// 업종별 단건 조회 (공개 인터페이스)
export async function searchSohoCount(
  lat: number,
  lng: number,
  category: keyof typeof SOHO_CODES,
  radius = 500
): Promise<SohoCountResult> {
  return fetchSohoInRadius(lat, lng, SOHO_CODES[category], radius);
}

// 음식점 조회 (기존 인터페이스 유지)
export async function searchSohoRestaurantCount(
  lat: number,
  lng: number,
  radius = 500
): Promise<SohoCountResult> {
  return fetchSohoInRadius(lat, lng, SOHO_CODES.restaurant, radius);
}

// 상권분석용 전업종 병렬 조회
// 반환: 업종별 totalCount 맵 + 각 source("soho_db" | "unavailable")
export async function searchSohoAllCategories(
  lat: number,
  lng: number,
  radius = 1000
): Promise<Record<string, { count: number; source: "soho_db" | "unavailable" }>> {
  const categories = Object.keys(SOHO_CODES) as (keyof typeof SOHO_CODES)[];
  const results = await Promise.all(
    categories.map((cat) => fetchSohoInRadius(lat, lng, SOHO_CODES[cat], radius))
  );

  return Object.fromEntries(
    categories.map((cat, i) => [
      cat,
      {
        count:  results[i].totalCount,
        source: (results[i].totalCount > 0 ? "soho_db" : "unavailable") as "soho_db" | "unavailable",
      },
    ])
  );
}
