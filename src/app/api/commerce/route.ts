// GET /api/commerce?lat=37.05&lng=127.04&radius=1000
// 업종별 실측 점포 수 + 전국 평균 대비 밀도 분석

import { NextRequest, NextResponse } from "next/server";
import { searchNearbyCount, searchApartmentCount } from "@/infrastructure/api/kakao-client";
import { searchSohoAllCategories } from "@/infrastructure/api/soho-client";

// 전국 평균 기준 (통계청 2023년 기준, 인구 1000명당 점포 수)
const NATIONAL_AVG_PER_1000_PEOPLE = {
  restaurant: 12,
  cafe: 5,
  convenience: 2,
  pharmacy: 1.2,
  hospital: 3,
  bank: 0.8,
  mart: 0.3,
};

export interface CommerceIndustry {
  key: keyof typeof NATIONAL_AVG_PER_1000_PEOPLE;
  label: string;
  icon: string;
  categoryCode: string;
  count: number;
  source: "kakao_realtime" | "soho_db" | "soho_fallback_kakao" | "national_avg_ref";
  per1000: number;
  nationalAvg: number;
  densityRatio: number;
  evaluation: "밀집" | "적정" | "부족";
}

export interface CommerceApiResponse {
  lat: number;
  lng: number;
  radius: number;
  aptCount: number;
  estimatedPopulation: number;
  industries: CommerceIndustry[];
  generatedAt: string;
}

const INDUSTRY_META: Array<{
  key: keyof typeof NATIONAL_AVG_PER_1000_PEOPLE;
  label: string;
  icon: string;
  categoryCode: string;
}> = [
  { key: "restaurant",  label: "음식점",   icon: "🍽️",  categoryCode: "FD6" },
  { key: "cafe",        label: "카페",      icon: "☕",   categoryCode: "CE7" },
  { key: "convenience", label: "편의점",   icon: "🏪",  categoryCode: "CS2" },
  { key: "pharmacy",    label: "약국",      icon: "💊",  categoryCode: "PM9" },
  { key: "hospital",    label: "병원",      icon: "🏥",  categoryCode: "HP8" },
  { key: "bank",        label: "은행",      icon: "🏦",  categoryCode: "BK9" },
  { key: "mart",        label: "대형마트", icon: "🛒",  categoryCode: "MT1" },
];

function evaluate(densityRatio: number): CommerceIndustry["evaluation"] {
  if (densityRatio >= 1.2) return "밀집";
  if (densityRatio <= 0.8) return "부족";
  return "적정";
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");
  const radiusParam = parseInt(searchParams.get("radius") ?? "1000", 10);

  if (!latParam || !lngParam) {
    return NextResponse.json({ error: "lat, lng 파라미터가 필요합니다" }, { status: 400 });
  }

  const lat = parseFloat(latParam);
  const lng = parseFloat(lngParam);

  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: "유효하지 않은 좌표값" }, { status: 400 });
  }

  const radius = [300, 500, 1000, 1500, 2000].includes(radiusParam) ? radiusParam : 1000;

  // 소상공인 API(전업종) + 카카오(폴백용) + 아파트 수 — 병렬 조회
  const [sohoAll, kakaoMap, aptResult] = await Promise.all([
    searchSohoAllCategories(lat, lng, radius),
    Promise.all([
      searchNearbyCount(lat, lng, "FD6", radius), // restaurant
      searchNearbyCount(lat, lng, "CE7", radius), // cafe
      searchNearbyCount(lat, lng, "CS2", radius), // convenience
      searchNearbyCount(lat, lng, "PM9", radius), // pharmacy
      searchNearbyCount(lat, lng, "HP8", radius), // hospital
      searchNearbyCount(lat, lng, "BK9", radius), // bank
      searchNearbyCount(lat, lng, "MT1", radius), // mart
    ]),
    searchApartmentCount(lat, lng, radius),
  ]);

  const [kakaoRest, kakaoCafe, kakaoConv, kakaoPharm, kakaoHosp, kakaoBank, kakaoMart] = kakaoMap;

  // 소상공인DB 우선, 0이면 카카오 폴백
  function mergeCount(
    sohoKey: string,
    kakaoCount: number
  ): { count: number; source: CommerceIndustry["source"] } {
    const soho = sohoAll[sohoKey];
    if (soho && soho.count > 0) return { count: soho.count, source: "soho_db" };
    if (kakaoCount > 0) return { count: kakaoCount, source: "soho_fallback_kakao" };
    return { count: 0, source: "soho_fallback_kakao" };
  }

  // 배후인구 추정: 아파트 단지 수 × 700세대 × 2.33명
  const aptCount = aptResult.totalCount;
  const estimatedPopulation = Math.round(aptCount * 700 * 2.33);
  const populationForDensity = Math.max(estimatedPopulation, 1000);

  const countMap: Record<keyof typeof NATIONAL_AVG_PER_1000_PEOPLE, { count: number; source: CommerceIndustry["source"] }> = {
    restaurant:  mergeCount("restaurant",  kakaoRest.totalCount),
    cafe:        mergeCount("cafe",        kakaoCafe.totalCount),
    convenience: mergeCount("convenience", kakaoConv.totalCount),
    pharmacy:    mergeCount("pharmacy",    kakaoPharm.totalCount),
    hospital:    mergeCount("hospital",    kakaoHosp.totalCount),
    bank:        mergeCount("bank",        kakaoBank.totalCount),
    mart:        mergeCount("mart",        kakaoMart.totalCount),
  };

  const industries: CommerceIndustry[] = INDUSTRY_META.map((meta) => {
    const { count, source } = countMap[meta.key];
    const nationalAvg = NATIONAL_AVG_PER_1000_PEOPLE[meta.key];
    const per1000 = (count / populationForDensity) * 1000;
    const densityRatio = nationalAvg > 0 ? per1000 / nationalAvg : 0;

    return {
      key: meta.key,
      label: meta.label,
      icon: meta.icon,
      categoryCode: meta.categoryCode,
      count,
      source,
      per1000: Math.round(per1000 * 10) / 10,
      nationalAvg,
      densityRatio: Math.round(densityRatio * 100) / 100,
      evaluation: evaluate(densityRatio),
    };
  });

  const response: CommerceApiResponse = {
    lat,
    lng,
    radius,
    aptCount,
    estimatedPopulation,
    industries,
    generatedAt: new Date().toISOString(),
  };

  return NextResponse.json(response);
}
