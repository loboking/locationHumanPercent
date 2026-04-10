// Infrastructure Layer: 국토교통부 공동주택 기본정보 API

const SERVICE_KEY = process.env.PUBLIC_DATA_SERVICE_KEY!;
const BASE_URL = "https://apis.data.go.kr/1613000/AptBasisInfoServiceV4";

export interface AptBasicInfo {
  kaptCode: string;     // 단지코드
  kaptName: string;     // 단지명
  kaptAddr: string;     // 주소
  doroJuso: string;     // 도로명 주소
  kaptdaCnt: number;    // 동수
  kaptMrAgnt: number;   // 세대수 (총 세대수)
}

export interface AptSearchResult {
  items: AptBasicInfo[];
  totalCount: number;
  totalHouseholds: number;
}

// 법정동코드 기반 공동주택 목록 조회
export async function fetchAptsByBjdCode(bjdCode: string): Promise<AptSearchResult> {
  // bjdCode는 카카오 coord2regioncode "B" 타입의 code (10자리)
  const params = new URLSearchParams({
    serviceKey: SERVICE_KEY,
    pageNo: "1",
    numOfRows: "30",
    bjdCode,
  });

  try {
    const res = await fetch(`${BASE_URL}/getAphusBassInfoV4?${params}`, {
      next: { revalidate: 3600 }, // 1시간 캐시 (세대수는 자주 바뀌지 않음)
    });

    if (!res.ok) {
      console.warn(`공동주택 API HTTP 오류: ${res.status}`);
      return { items: [], totalCount: 0, totalHouseholds: 0 };
    }

    const data = await res.json();
    const body = data.response?.body;
    if (!body) return { items: [], totalCount: 0, totalHouseholds: 0 };

    const rawItems = body.items?.item;
    if (!rawItems) return { items: [], totalCount: parseInt(body.totalCount ?? "0"), totalHouseholds: 0 };

    const itemArray: Record<string, unknown>[] = Array.isArray(rawItems) ? rawItems : [rawItems];

    const items: AptBasicInfo[] = itemArray.map((item) => ({
      kaptCode: String(item.kaptCode ?? ""),
      kaptName: String(item.kaptName ?? ""),
      kaptAddr: String(item.kaptAddr ?? ""),
      doroJuso: String(item.doroJuso ?? ""),
      kaptdaCnt: parseInt(String(item.kaptdaCnt ?? "0")) || 0,
      kaptMrAgnt: parseInt(String(item.kaptMrAgnt ?? "0")) || 0,
    }));

    const totalHouseholds = items.reduce((sum, apt) => sum + apt.kaptMrAgnt, 0);

    return {
      items,
      totalCount: parseInt(body.totalCount ?? "0"),
      totalHouseholds,
    };
  } catch (err) {
    console.warn("공동주택 API 조회 실패:", err);
    return { items: [], totalCount: 0, totalHouseholds: 0 };
  }
}
