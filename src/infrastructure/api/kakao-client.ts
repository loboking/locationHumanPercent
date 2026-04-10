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

// 반경 내 카테고리 장소 전체 조회 (페이지네이션, 최대 3페이지=45개)
// totalCount: Kakao meta.total_count (실제 전체 개수, 45개 상한 없음) → 점수 계산용
export async function searchNearbyPlaces(
  lat: number,
  lng: number,
  categoryCode: string,
  radius = 500
): Promise<{ places: KakaoPlace[]; totalCount: number }> {
  let totalCount = 0;
  const all: KakaoPlace[] = [];
  for (let page = 1; page <= 3; page++) {
    const params = new URLSearchParams({
      category_group_code: categoryCode,
      x: String(lng),
      y: String(lat),
      radius: String(radius),
      size: "15",
      page: String(page),
    });
    const res = await fetch(`${BASE}/v2/local/search/category.json?${params}`, {
      headers: { Authorization: `KakaoAK ${REST_KEY}` },
    });
    const data = await res.json();
    if (page === 1) totalCount = data.meta?.total_count ?? 0;
    const places = (data.documents ?? []).map((d: Record<string, string>) => ({
      id: d.id,
      placeName: d.place_name,
      categoryName: d.category_name,
      lat: parseFloat(d.y),
      lng: parseFloat(d.x),
      distance: parseInt(d.distance),
    })) as KakaoPlace[];
    all.push(...places);
    if (data.meta?.is_end) break;
  }
  return { places: all, totalCount };
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
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return { totalCount: 0, places: [] };
  const data = await res.json();
  return {
    totalCount: data.meta?.total_count ?? 0,
    places: (data.documents ?? []).map((d: Record<string, string>) => ({
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

  const toPlace = (d: Record<string, string>): KakaoPlace => ({
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

  // totalCount: 두 쿼리 중 더 큰 값 사용 (단순 합산 시 이중카운트 방지)
  const totalCount = Math.max(d1.meta?.total_count ?? 0, d2.meta?.total_count ?? 0, merged.length);

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
  const bCode = (data.documents ?? []).find((d: Record<string, string>) => d.region_type === "B");
  return bCode?.code ?? null;
}

// 반경 내 아파트 단지 검색 (주거 밀도 추정용)
// 국토교통부 API는 단건조회 전용이라 Kakao 키워드 검색으로 대체
export async function searchApartmentCount(
  lat: number,
  lng: number,
  radius = 500
): Promise<{ totalCount: number; complexes: { name: string; distance: number; lat: number; lng: number }[] }> {
  let totalCount = 0;
  const all: { name: string; distance: number; lat: number; lng: number }[] = [];
  for (let page = 1; page <= 3; page++) {
    const params = new URLSearchParams({
      query: "아파트",
      x: String(lng),
      y: String(lat),
      radius: String(radius),
      size: "15",
      page: String(page),
    });
    const res = await fetch(`${BASE}/v2/local/search/keyword.json?${params}`, {
      headers: { Authorization: `KakaoAK ${REST_KEY}` },
    });
    if (!res.ok) break;
    const data = await res.json();
    if (page === 1) totalCount = data.meta?.total_count ?? 0;
    const docs = (data.documents ?? [])
      .filter((d: Record<string, string>) => d.category_name?.includes("아파트"))
      .map((d: Record<string, string>) => ({
        name: d.place_name as string,
        distance: parseInt(d.distance),
        lat: parseFloat(d.y),
        lng: parseFloat(d.x),
      }));
    all.push(...docs);
    if (data.meta?.is_end) break;
  }
  return { totalCount, complexes: all };
}

// ── 약국 전용 점수 계산 ──────────────────────────────────────────────────────
// 처방수요(40점) + 접근성(30점) + 주거배후(20점) + 경쟁역산(10점) = 100점

export interface PharmacyScoreResult {
  score: number;
  grade: "최적" | "적합" | "보통" | "부적합";
  hospitalCount: number;
  pharmacyCompetitorCount: number;
  detail: {
    prescriptionScore: number;  // /40
    accessScore: number;        // /30
    residentialScore: number;   // /20
    competitionScore: number;   // /10
  };
  insights: string[];
}

export function calcPharmacyScore(
  busStops: number,
  parkingCount: number,
  hospitalCount: number,
  pharmacyCompetitorCount: number,
  convStoreCount: number,
  aptComplexCount: number,
  isochroneAreaM2?: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _isoMode: "car" | "walk" = "car"
): PharmacyScoreResult {
  const areaKm2 = isochroneAreaM2
    ? isochroneAreaM2 / 1_000_000
    : Math.PI * (500 / 1000) ** 2;

  // A. 처방 수요 기반 (40점)
  // 병원 수 기반 (25점): 1개=5점, 5개이상=25점
  const hospitalBaseScore = Math.min(hospitalCount * 5, 25);
  // 병원 밀도 보너스 (15점): 전국 도심 평균 3개/km² 기준
  const hospitalDensity = areaKm2 > 0 ? hospitalCount / areaKm2 : 0;
  const densityScore = Math.min(Math.round((hospitalDensity / 3) * 15), 15);
  const prescriptionScore = Math.min(hospitalBaseScore + densityScore, 40);

  // B. 접근성 (30점)
  // 이동범위 12점 (기존 mobilityScore 재활용)
  let mobilityScore: number;
  if (isochroneAreaM2) {
    mobilityScore = areaKm2 >= 5 ? 12 : areaKm2 >= 2 ? 10 : areaKm2 >= 0.5 ? 7 : 4;
  } else {
    mobilityScore = 7;
  }
  // 주차장 13점 (상향): 6개이상=13점
  const pharmacyParkingScore = parkingCount >= 6 ? 13 : Math.round(parkingCount * 13 / 6);
  // 버스정류장 5점
  const busAccessScore = Math.min(busStops, 5);
  const accessScore = Math.min(mobilityScore + pharmacyParkingScore + busAccessScore, 30);

  // C. 주거 배후 인구 (20점)
  const circleAreaM2 = Math.PI * 500 * 500;
  const areaFactor = Math.min(isochroneAreaM2 ? isochroneAreaM2 / circleAreaM2 : 1, 4);
  const aptMax = Math.max(1, Math.round(10 * areaFactor));
  const aptResScore = Math.min(Math.round((aptComplexCount / aptMax) * 15), 15);
  const convScore = Math.min(convStoreCount, 5);
  const residentialScore = Math.min(aptResScore + convScore, 20);

  // D. 경쟁 강도 역산 (10점): 경쟁 약국이 많을수록 감점
  const competitionScore =
    pharmacyCompetitorCount === 0 ? 10 :
    pharmacyCompetitorCount === 1 ? 7 :
    pharmacyCompetitorCount === 2 ? 4 : 0;

  const score = Math.min(prescriptionScore + accessScore + residentialScore + competitionScore, 100);
  const grade: PharmacyScoreResult["grade"] =
    score >= 75 ? "최적" : score >= 55 ? "적합" : score >= 35 ? "보통" : "부적합";

  // 자동 인사이트
  const insights: string[] = [];
  if (hospitalCount >= 5) {
    insights.push(`병원 ${hospitalCount}개 — 처방 수요 우수 (일 예상 외래 ${hospitalCount * 30}~${hospitalCount * 80}명)`);
  } else if (hospitalCount >= 2) {
    insights.push(`병원 ${hospitalCount}개 — 처방 수요 양호`);
  } else if (hospitalCount === 0) {
    insights.push("병원 없음 — 처방 수요 취약, 일반의약품/건강기능식품 중심 전략 필요");
  }
  if (pharmacyCompetitorCount === 0) {
    insights.push("경쟁 약국 없음 — 독점 입지");
  } else if (pharmacyCompetitorCount >= 3) {
    insights.push(`경쟁 약국 ${pharmacyCompetitorCount}개 — 처방 분산 위험, 차별화 전략 필수`);
  } else {
    insights.push(`경쟁 약국 ${pharmacyCompetitorCount}개 — 경쟁 존재하나 관리 가능 수준`);
  }
  if (parkingCount >= 4) {
    insights.push(`주차장 ${parkingCount}개 — 차량 접근 우수 (여성·육아세대 유입 유리)`);
  } else if (parkingCount === 0) {
    insights.push("주차 시설 없음 — 차량 방문 고객 흡수 불리 (창고형 약국 핵심 약점)");
  }
  if (aptComplexCount >= 5) {
    insights.push(`아파트 단지 ${aptComplexCount}개 — 30-40대 육아세대 배후인구 풍부`);
  }

  return {
    score,
    grade,
    hospitalCount,
    pharmacyCompetitorCount,
    detail: { prescriptionScore, accessScore, residentialScore, competitionScore },
    insights,
  };
}

// ── 유동인구 추정 점수 계산 ──────────────────────────────────────────────────
// 교통(25점) + 상권(45점) + 주거(30점) = 100점
export interface FootTrafficEstimate {
  score: number;          // 100점 만점 (기준치 cap 적용)
  overScore: number;      // 100 초과 원점수 (포화도 지수, 0이면 기준 이하)
  grade: "매우높음" | "높음" | "보통" | "낮음";
  busStopCount: number;
  restaurantCount: number;
  cafeCount: number;
  convStoreCount: number;
  parkingCount: number;
  totalHouseholds: number;
  detail: {
    transitScore: number;
    mobilityScore: number;
    busScore: number;
    parkingScore: number;
    commerceScore: number;
    residentialScore: number;
  };
  density: {
    areaKm2: number;          // 분석 면적 (km²)
    restaurantPer1km2: number; // 음식점 밀도
    cafePer1km2: number;       // 카페 밀도
    convPer1km2: number;       // 편의점 밀도
    restaurantRatio: number;   // 기준 대비 배율 (1.0 = 기준치)
    cafeRatio: number;
    convRatio: number;
  };
}

export function calcFootTrafficEstimate(
  busStops: number,
  restaurants: number,
  cafes: number,
  convStores: number,
  aptComplexCount = 0,
  radius = 500,
  isochroneAreaM2?: number,
  parkingCount = 0,
  isoMode: "car" | "walk" = "car"
): FootTrafficEstimate {
  // 면적(km²) 계산: 이소크론 있으면 실측, 없으면 반경 원
  const areaKm2 = isochroneAreaM2
    ? isochroneAreaM2 / 1_000_000
    : Math.PI * (radius / 1000) ** 2;

  // ── 교통 접근성 (25점) ─────────────────────────────────────
  // 이동 접근성 (12점): 이소크론 면적 기반 — 실제 이동 가능 범위 측정
  // 차로 5분 ≈ 3-5km², 차로 10분 ≈ 6-10km², 도보 10분 ≈ 0.3-0.8km²
  let mobilityScore: number;
  if (isochroneAreaM2) {
    if (isoMode === "walk") {
      // 도보: 0.3-0.5km² 예상 (0.5km² 이상이면 이동성 우수, 0.3km² 이상이면 양호)
      mobilityScore = areaKm2 >= 0.5 ? 7 : areaKm2 >= 0.3 ? 5 : 3;
    } else {
      // 차로 5분 ≈ 2-5km², 차로 10분 ≈ 6-12km²
      // 농촌 평야(대면적)와 도심 구분: 면적 대비 적정 스케일
      mobilityScore = areaKm2 >= 6 ? 10 : areaKm2 >= 3 ? 8 : areaKm2 >= 1.5 ? 6 : 4;
    }
  } else {
    // 원형 폴백: 실도로망 없음 → 최소 점수
    mobilityScore = 4;
  }
  // 버스 접근성 (8점): 1개당 2점, 4개 이상=만점
  const busScore = Math.min(busStops * 2, 8);
  // 주차 접근성 (5점): 주차장 1개당 1점, 5개=만점
  const parkingScore = Math.min(parkingCount, 5);
  const transitScore = mobilityScore + busScore + parkingScore;

  // ── 상권 활성도 (45점) — 밀도(개수/km²) 기반 ────────────────
  // 만점 기준: 음식점 120/km², 카페 40/km², 편의점 14/km² (도심 상업지구 수준)
  // 최소 1km² 적용: 500m 원형(0.785km²) 과밀도 계산 방지
  const effectiveAreaKm2 = Math.max(areaKm2, 1.0);
  const rDensity = restaurants / effectiveAreaKm2;
  const cDensity = cafes / effectiveAreaKm2;
  const sDensity = convStores / effectiveAreaKm2;
  const rRatio = rDensity / 120;
  const cRatio = cDensity / 40;
  const sRatio = sDensity / 16;
  // 원점수 (cap 없음) — 오버 지수 계산용
  const rawRScore = rRatio * 20;
  const rawCScore = cRatio * 15;
  const rawSScore = sRatio * 10;
  // cap 적용 점수 — 메인 점수용
  const rScore = Math.min(rawRScore, 20);
  const cScore = Math.min(rawCScore, 15);
  const sScore = Math.min(rawSScore, 10);
  const commerceScore = Math.round(rScore + cScore + sScore);

  // ── 주거 밀도 (30점) — 단지/km² 밀도 기반 (상권과 동일 방식) ──────────
  // 이제 aptComplexCount = 이소크론 폴리곤 내 실제 단지 수 (추정값 아님)
  // ── 주거 밀도 (30점) — 단지/km² 밀도 기반, 모드별 기준 차등 ──────────
  // 도보: 만점 기준 60단지/km² (좁은 범위, 최고밀도 주거지 기준)
  //   예) 도보10분(0.4km²)에서 24단지 = 60/km² = 만점
  //   → 고덕 신도시(21단지/0.4km²=52.5/km²): 52.5/60*30=26점 (적정)
  //   → 비전동(19단지/0.4km²=47.5/km²): 47.5/60*30=23점
  // 차로: 만점 기준 50단지/km² (넓은 범위, 배후 인구 분산)
  //   예) 차로5분(2km²)에서 100단지 = 50/km² = 만점
  //   → 고덕 차로5분(97단지/2.13km²=45.5/km²): 45.5/50*30=27점 (적정)
  // 최소 0.4km² 적용: 도보 이소크론 과밀도 방지
  const aptEffectiveAreaKm2 = Math.max(areaKm2, 0.4);
  const aptDensity = aptComplexCount / aptEffectiveAreaKm2;
  const aptDensityRef = isoMode === "walk" ? 60 : 50;
  const residentialScore = Math.min(Math.round((aptDensity / aptDensityRef) * 30), 30);
  const totalHouseholds = aptComplexCount * 700;

  const rawTotal = transitScore + commerceScore + residentialScore;
  // 이소크론(실도로망) 없을 때 → 원형 추정 신뢰도 75% 적용
  const confidenceFactor = isochroneAreaM2 ? 1.0 : 0.75;
  const score = Math.min(Math.round(rawTotal * confidenceFactor), 100);
  const overScore = 0;

  const grade =
    score >= 70 ? "매우높음" :
    score >= 45 ? "높음" :
    score >= 25 ? "보통" : "낮음";

  return {
    score,
    overScore,
    grade,
    busStopCount: busStops,
    restaurantCount: restaurants,
    cafeCount: cafes,
    convStoreCount: convStores,
    parkingCount,
    totalHouseholds,
    detail: { transitScore, mobilityScore, busScore, parkingScore, commerceScore, residentialScore },
    density: {
      areaKm2: Math.round(areaKm2 * 100) / 100,
      restaurantPer1km2: Math.round(rDensity),
      cafePer1km2: Math.round(cDensity),
      convPer1km2: Math.round(sDensity * 10) / 10,
      restaurantRatio: Math.round(rRatio * 10) / 10,  // 1.0 = 120/km² 기준
      cafeRatio: Math.round(cRatio * 10) / 10,         // 1.0 = 60/km²
      convRatio: Math.round(sRatio * 10) / 10,         // 1.0 = 20/km²
    },
  };
}
