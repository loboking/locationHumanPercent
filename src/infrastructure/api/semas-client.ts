// Infrastructure Layer: 소상공인시장진흥공단 API 클라이언트

const BASE_URL = "https://api.odcloud.kr/api";
const SERVICE_KEY = process.env.PUBLIC_DATA_SERVICE_KEY!;

export interface SemasFootTrafficResponse {
  currentCount: number;
  data: Array<{
    "기준_년_코드": string;
    "기준_분기_코드": string;
    "상권_구분_코드": string;
    "상권_구분_코드_명": string;
    "상권_코드": string;
    "상권_코드_명": string;
    "총_유동인구_수": number;
    "남성_유동인구_수": number;
    "여성_유동인구_수": number;
    "연령대_10_유동인구_수": number;
    "연령대_20_유동인구_수": number;
    "연령대_30_유동인구_수": number;
    "연령대_40_유동인구_수": number;
    "연령대_50_유동인구_수": number;
    "연령대_60_이상_유동인구_수": number;
  }>;
  matchCount: number;
  page: number;
  perPage: number;
  totalCount: number;
}

export interface SemasCommerceResponse {
  currentCount: number;
  data: Array<{
    "기준_년_코드": string;
    "기준_분기_코드": string;
    "상권_코드": string;
    "상권_코드_명": string;
    "서비스_업종_코드": string;
    "서비스_업종_코드_명": string;
    "당월_매출_금액": number;
    "당월_매출_건수": number;
    "점포_수": number;
  }>;
  totalCount: number;
}

// 유동인구 조회 (상권코드 기준)
export async function fetchFootTraffic(
  areaCode: string,
  year: string = "2024",
  quarter: string = "3"
): Promise<SemasFootTrafficResponse> {
  const params = new URLSearchParams({
    serviceKey: SERVICE_KEY,
    page: "1",
    perPage: "10",
    "cond[상권_코드_eq]": areaCode,
    "cond[기준_년_코드_eq]": year,
    "cond[기준_분기_코드_eq]": quarter,
  });

  const res = await fetch(
    `${BASE_URL}/15083033/v1/uddi:3571f498-87ea-4a9c-8783-8c7ac5c65fb7?${params}`,
    { next: { revalidate: 3600 } } // 1시간 캐시
  );

  if (!res.ok) throw new Error(`유동인구 API 오류: ${res.status}`);
  return res.json();
}

// 상권 매출 조회
export async function fetchCommerce(
  areaCode: string,
  year: string = "2024",
  quarter: string = "3"
): Promise<SemasCommerceResponse> {
  const params = new URLSearchParams({
    serviceKey: SERVICE_KEY,
    page: "1",
    perPage: "20",
    "cond[상권_코드_eq]": areaCode,
    "cond[기준_년_코드_eq]": year,
    "cond[기준_분기_코드_eq]": quarter,
  });

  const res = await fetch(
    `${BASE_URL}/15083033/v1/uddi:85206580-82ec-4ea5-8957-fd26c7d11285?${params}`,
    { next: { revalidate: 3600 } }
  );

  if (!res.ok) throw new Error(`상권매출 API 오류: ${res.status}`);
  return res.json();
}
