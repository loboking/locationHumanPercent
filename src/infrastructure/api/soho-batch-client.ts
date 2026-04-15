// 소상공인 API: 동 내 상가 POI 일괄 수집 (격자 분석용)
// 기존 soho-client의 radius 기반 검색과 달리 bbox 기반 대량 수집

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) {
    console.warn(`[경고] 환경변수 ${key}가 설정되지 않았습니다.`);
    return "";
  }
  return val;
}

const SERVICE_KEY = requireEnv("PUBLIC_DATA_SERVICE_KEY");
const BASE = "https://apis.data.go.kr/B553077/api/open/sdsc2";

export interface BatchPOI {
  bizesNm: string;
  category: string;
  lat: number;
  lng: number;
  indsLclsNm: string;
  indsSclsNm: string;
}

// bbox 기반 상가 일괄 수집
export async function fetchSohoByBbox(
  swLat: number,
  swLng: number,
  neLat: number,
  neLng: number,
  categories?: string[]
): Promise<BatchPOI[]> {
  if (!SERVICE_KEY) return [];

  const allPois: BatchPOI[] = [];
  const centerLat = (swLat + neLat) / 2;
  const centerLng = (swLng + neLng) / 2;
  const radiusM = Math.max(
    Math.round(Math.sqrt((neLat - swLat) ** 2 + (neLng - swLng) ** 2) * 111320 * 0.5 * 1.5),
    500
  );

  // 카테고리별 수집
  const targetCategories = categories ?? [
    "I2",    // 음식점
    "I3",    // 카페/음료
    "G209",  // 편의점
    "G21501", // 약국
    "Q1",    // 보건의료
  ];

  const categoryMap: Record<string, string> = {
    "I2": "restaurant",
    "I3": "cafe",
    "G209": "convenience",
    "G21501": "pharmacy",
    "Q1": "hospital",
  };

  const fetches = targetCategories.map(async (cat) => {
    const params = new URLSearchParams({
      serviceKey: SERVICE_KEY,
      pageNo: "1",
      numOfRows: "200",
      radius: String(Math.min(radiusM, 2000)),
      cx: String(centerLng),
      cy: String(centerLat),
      type: "json",
    });

    // 카테고리 코드 설정
    if (cat.length <= 2) {
      params.set("indsLclsCd", cat);
    } else if (cat.length <= 4) {
      params.set("indsMclsCd", cat);
    } else {
      params.set("indsSclsCd", cat);
    }

    try {
      const res = await fetch(`${BASE}/storeListInRadius?${params}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return [];
      const data = await res.json();
      const body = data.body;
      if (!body || body.totalCount === 0) return [];

      const items: Record<string, string>[] = Array.isArray(body.items) ? body.items : body.items ? [body.items] : [];

      return items.map((d: Record<string, string>): BatchPOI => ({
        bizesNm: d.bizesNm ?? "",
        category: categoryMap[cat] ?? cat,
        lat: parseFloat(d.lat ?? "0"),
        lng: parseFloat(d.lon ?? "0"),
        indsLclsNm: d.indsLclsNm ?? "",
        indsSclsNm: d.indsSclsNm ?? "",
      })).filter(p => p.lat !== 0 && p.lng !== 0);
    } catch {
      return [];
    }
  });

  const results = await Promise.all(fetches);
  for (const pois of results) {
    allPois.push(...pois);
  }

  // bbox 내부만 필터링
  return allPois.filter(p =>
    p.lat >= swLat && p.lat <= neLat &&
    p.lng >= swLng && p.lng <= neLng
  );
}
