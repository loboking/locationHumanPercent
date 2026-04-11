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
// 거주수요(25) + 처방인프라(20) + 유동·직장(15) + 접근성(20) + 경쟁환경(20) = 100점
// 구도심/신도시 편향 제거: 병원 과다 가중치 낮추고 실거주 인구·직장인구 반영

export interface PharmacyScoreResult {
  score: number;
  grade: "최적" | "적합" | "보통" | "부적합";
  hospitalCount: number;
  pharmacyCompetitorCount: number;
  detail: {
    residentScore: number;      // /25 거주 수요 (인구·단지·연령)
    prescriptionScore: number;  // /20 처방 인프라 (병원)
    workforceScore: number;     // /15 유동·직장인구
    accessScore: number;        // /20 접근성 (이소크론·주차·버스)
    competitionScore: number;   // /20 경쟁 환경 (절대수+인구대비 포화도)
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
  isoMode: "car" | "walk" = "car",
  chronicPatientRatio = 0,   // 50-60대 비중(%)
  youngFamilyRatio = 0,      // 30-40대 비중(%)
  residentTotal = 0,         // 실거주 인구 수 (agePopulation.total)
  workerCount = 0,           // 직장인구 수 (workerStats.workerCnt)
  fixedRadius = 500,         // 밀도 계산용 고정 반경 (m) — 이소크론 면적 대신 사용
  within10minApts = 0,       // 차량 10분권 단지 수 (T맵 경로 매트릭스)
  semasFloatingPop = 0,      // 소상공인 유동인구 실측치
): PharmacyScoreResult {
  // 밀도 계산에는 항상 고정 반경 사용 → 구도심/신도시 공정 비교
  const areaKm2 = Math.PI * (fixedRadius / 1000) ** 2;

  // ── A. 거주 수요 (25점) ────────────────────────────────────────────────────
  // 신도시/구도심 편향 없이 실거주 인구 수와 단지 밀도를 함께 평가

  // A1. 실거주 인구 (10점)
  const residentScore =
    residentTotal >= 30000 ? 10 :
    residentTotal >= 20000 ?  8 :
    residentTotal >= 10000 ?  5 :
    residentTotal >=  5000 ?  3 :
    residentTotal >       0 ?  1 : 0;

  // A2. 아파트 단지 밀도 (10점): 단지/km² 기준
  const aptEffective = Math.max(areaKm2, 0.1);
  const aptDensity = aptComplexCount / aptEffective;
  const aptDensityRef = isoMode === "walk" ? 60 : 50;
  const aptScore = Math.min(Math.round((aptDensity / aptDensityRef) * 10), 10);

  // A3. 연령 프로파일 (5점): 만성질환층(처방약)+육아세대(어린이 의약품) 모두 가산
  const chronicScore = Math.min(Math.round((chronicPatientRatio / 40) * 3), 3);
  const youngScore   = Math.min(Math.round((youngFamilyRatio   / 35) * 2), 2);
  const ageScore = Math.min(chronicScore + youngScore, 5);

  const residentDemandScore = Math.min(residentScore + aptScore + ageScore, 25);

  // ── B. 처방 인프라 (20점) ─────────────────────────────────────────────────
  // 구도심 과대평가 방지: 40점 → 20점으로 축소

  // B1. 병원/의원 수 (12점): 1개=3점, 4개이상=12점
  const hospitalBaseScore = Math.min(hospitalCount * 3, 12);
  // B2. 병원 밀도 보너스 (8점): 전국 평균 3개/km² 기준
  const hospitalDensity = areaKm2 > 0 ? hospitalCount / areaKm2 : 0;
  const hospitalDensityScore = Math.min(Math.round((hospitalDensity / 3) * 8), 8);
  const prescriptionScore = Math.min(hospitalBaseScore + hospitalDensityScore, 20);

  // ── C. 유동·직장인구 (15점) ───────────────────────────────────────────────
  // 신규 항목: 낮 시간대 방문 수요 (구도심 상업지역 + 신도시 직장인 모두 반영)

  // C1. 직장인구 (7점): SGIS 종사자 수 기준
  const workerScore =
    workerCount >= 10000 ? 7 :
    workerCount >=  5000 ? 5 :
    workerCount >=  2000 ? 3 :
    workerCount >=   500 ? 1 : 0;

  // C2. 버스·대중교통 접근 (4점)
  const transitAccessScore = Math.min(busStops * 2, 4);

  // C3. 유동인구 실측 (4점): 소상공인 상권 분기 데이터
  const semasWorkforceScore =
    semasFloatingPop >= 500000 ? 4 :
    semasFloatingPop >= 200000 ? 3 :
    semasFloatingPop >= 100000 ? 2 :
    semasFloatingPop >=  50000 ? 1 : 0;

  const workforceScore = Math.min(workerScore + transitAccessScore + semasWorkforceScore, 15);

  // ── D. 접근성 (20점) ──────────────────────────────────────────────────────
  // D1. 이동 가능 범위 (10점): 이소크론 실측 면적 기준 (밀도 계산과 별도)
  const isoAreaKm2Pharm = isochroneAreaM2 ? isochroneAreaM2 / 1_000_000 : null;
  let mobilityScore: number;
  if (isoAreaKm2Pharm != null) {
    mobilityScore = isoMode === "walk"
      ? (isoAreaKm2Pharm >= 0.5 ? 8 : isoAreaKm2Pharm >= 0.3 ? 6 : 3)
      : (isoAreaKm2Pharm >= 6 ? 10 : isoAreaKm2Pharm >= 3 ? 8 : isoAreaKm2Pharm >= 1.5 ? 6 : 4);
  } else {
    mobilityScore = 5; // 원형 폴백
  }
  // D2. 주차장 (7점)
  const parkingScore = Math.min(Math.round(parkingCount * 7 / 6), 7);
  // D3. 편의시설 (3점): 편의점 인접 → 생활동선 내 위치 지표
  const convAccessScore = Math.min(Math.round(convStoreCount / 3), 3);
  // D4. 차량 10분권 배후 단지 (3점): T맵 경로 매트릭스
  const carCatchmentScore = Math.min(Math.floor(within10minApts / 10), 3);

  const accessScore = Math.min(mobilityScore + parkingScore + convAccessScore + carCatchmentScore, 20);

  // ── E. 경쟁 환경 (20점) ───────────────────────────────────────────────────
  // E1. 경쟁 약국 절대 수 (10점)
  const compAbsScore =
    pharmacyCompetitorCount === 0 ? 10 :
    pharmacyCompetitorCount === 1 ?  7 :
    pharmacyCompetitorCount === 2 ?  4 : 0;

  // E2. 인구 대비 포화도 (10점): 약국/1만명 — 적을수록 성장 여지 있음
  // 전국 평균: 약국 1개당 약 3500명 → 10,000명당 2.9개
  let saturationScore: number;
  if (residentTotal > 0) {
    const pharmaciesPerTenK = (pharmacyCompetitorCount + 1) / (residentTotal / 10000);
    saturationScore =
      pharmaciesPerTenK <  1 ? 10 :  // 10,000명당 1개 미만 → 공급 부족 입지
      pharmaciesPerTenK <  2 ?  7 :
      pharmaciesPerTenK <  3 ?  4 :
      pharmaciesPerTenK <  4 ?  2 : 0;
  } else {
    saturationScore = 5; // 인구 데이터 없을 때 중립값
  }

  const competitionScore = Math.min(compAbsScore + saturationScore, 20);

  // ── 최종 합산 ─────────────────────────────────────────────────────────────
  const score = Math.min(
    residentDemandScore + prescriptionScore + workforceScore + accessScore + competitionScore,
    100
  );
  const grade: PharmacyScoreResult["grade"] =
    score >= 75 ? "최적" : score >= 55 ? "적합" : score >= 35 ? "보통" : "부적합";

  // ── 자동 인사이트 ─────────────────────────────────────────────────────────
  const insights: string[] = [];

  if (residentTotal >= 20000) {
    insights.push(`배후 거주인구 ${residentTotal.toLocaleString()}명 — 안정적인 고객 기반`);
  } else if (residentTotal > 0 && residentTotal < 5000) {
    insights.push(`배후 거주인구 ${residentTotal.toLocaleString()}명 — 유동·직장인구 보완 필요`);
  }
  if (hospitalCount >= 5) {
    insights.push(`병원 ${hospitalCount}개 — 처방 수요 우수 (일 예상 외래 ${hospitalCount * 30}~${hospitalCount * 80}명)`);
  } else if (hospitalCount >= 2) {
    insights.push(`병원 ${hospitalCount}개 — 처방 수요 양호`);
  } else if (hospitalCount === 0) {
    insights.push("병원 없음 — 일반의약품·건강기능식품 중심 전략 필요");
  }
  if (workerCount >= 5000) {
    insights.push(`직장인구 ${workerCount.toLocaleString()}명 — 주간 방문 수요 확보`);
  }
  if (pharmacyCompetitorCount === 0) {
    insights.push("경쟁 약국 없음 — 독점 입지");
  } else if (pharmacyCompetitorCount >= 3) {
    insights.push(`경쟁 약국 ${pharmacyCompetitorCount}개 — 차별화 전략 필수`);
  } else {
    insights.push(`경쟁 약국 ${pharmacyCompetitorCount}개 — 관리 가능 수준`);
  }
  if (parkingCount >= 4) {
    insights.push(`주차장 ${parkingCount}개 — 차량 접근 우수`);
  } else if (parkingCount === 0) {
    insights.push("주차 없음 — 차량 방문 고객 흡수 불리");
  }
  if (aptComplexCount >= 10) {
    insights.push(`아파트 단지 ${aptComplexCount}개 — 풍부한 배후 주거인구`);
  }
  if (chronicPatientRatio >= 35) {
    insights.push(`만성질환층 ${chronicPatientRatio}% — 처방약 수요 높음`);
  }
  if (youngFamilyRatio >= 35) {
    insights.push(`육아세대(30-40대) ${youngFamilyRatio}% — 어린이 의약품·예방접종 수요`);
  }

  return {
    score,
    grade,
    hospitalCount,
    pharmacyCompetitorCount,
    detail: { residentScore: residentDemandScore, prescriptionScore, workforceScore, accessScore, competitionScore },
    insights,
  };
}

// ── 유동인구 추정 점수 계산 ──────────────────────────────────────────────────
// 교통(20점) + 상권(35점) + 주거(25점) + 인구(20점) = 100점
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
    carAccessBonus: number;
    commerceScore: number;
    residentialScore: number;
    populationScore: number;   // /20 실거주+직장인구
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
  isoMode: "car" | "walk" = "car",
  residentTotal = 0,        // 실거주 인구 수
  workerCount = 0,          // 직장인구 수
  within10minApts = 0,      // 차량 10분권 단지 수
  semasFloatingPop = 0,     // 소상공인 유동인구 실측치 (분기 데이터)
): FootTrafficEstimate {
  // 밀도 계산용: 항상 고정 반경 원형 면적 (구도심/신도시 공정 비교)
  const areaKm2 = Math.PI * (radius / 1000) ** 2;
  // mobilityScore용: 실측 이소크론 면적 (이동 편의성 측정)
  const isoAreaKm2 = isochroneAreaM2 ? isochroneAreaM2 / 1_000_000 : null;

  // ── 교통 접근성 (20점) ─────────────────────────────────────
  // 이동 접근성 (10점): 이소크론 실측 면적 기반 — 실제 이동 가능 범위 측정
  let mobilityScore: number;
  if (isoAreaKm2 != null) {
    if (isoMode === "walk") {
      mobilityScore = isoAreaKm2 >= 0.5 ? 7 : isoAreaKm2 >= 0.3 ? 5 : 3;
    } else {
      mobilityScore = isoAreaKm2 >= 6 ? 10 : isoAreaKm2 >= 3 ? 8 : isoAreaKm2 >= 1.5 ? 6 : 4;
    }
  } else {
    mobilityScore = 4;
  }
  // 버스 접근성 (6점): 1개당 2점, 3개 이상=만점
  const busScore = Math.min(busStops * 2, 6);
  // 주차 접근성 (4점): 주차장 1개당 1점, 4개=만점
  const parkingScore = Math.min(parkingCount, 4);
  // 차량 10분 내 아파트 단지 수 보너스 (0~3점): T맵 경로 매트릭스 기반
  const carAccessBonus = Math.min(Math.floor(within10minApts / 5), 3);
  const transitScore = Math.min(mobilityScore + busScore + parkingScore + carAccessBonus, 20);

  // ── 상권 활성도 (35점) — 밀도(개수/km²) 기반 ────────────────
  // 만점 기준: 음식점 120/km², 카페 40/km², 편의점 16/km² (도심 상업지구 수준)
  // 최소 1km² 적용: 500m 원형(0.785km²) 과밀도 계산 방지
  const effectiveAreaKm2 = Math.max(areaKm2, 1.0);
  const rDensity = restaurants / effectiveAreaKm2;
  const cDensity = cafes / effectiveAreaKm2;
  const sDensity = convStores / effectiveAreaKm2;
  const rRatio = rDensity / 120;
  const cRatio = cDensity / 40;
  const sRatio = sDensity / 16;
  // 원점수 (cap 없음) — 오버 지수 계산용
  const rawRScore = rRatio * 15;
  const rawCScore = cRatio * 11;
  const rawSScore = sRatio * 9;
  // cap 적용 점수 — 메인 점수용
  const rScore = Math.min(rawRScore, 15);
  const cScore = Math.min(rawCScore, 11);
  const sScore = Math.min(rawSScore, 9);
  const commerceScore = Math.round(rScore + cScore + sScore);

  // ── 주거 밀도 (25점) — 단지/km² 밀도 기반, 모드별 기준 차등 ──────────
  // 도보: 만점 기준 60단지/km² (좁은 범위, 최고밀도 주거지 기준)
  //   예) 도보10분(0.4km²)에서 24단지 = 60/km² = 만점
  //   → 고덕 신도시(21단지/0.4km²=52.5/km²): 52.5/60*25=21점 (적정)
  //   → 비전동(19단지/0.4km²=47.5/km²): 47.5/60*25=19점
  // 차로: 만점 기준 50단지/km² (넓은 범위, 배후 인구 분산)
  //   예) 차로5분(2km²)에서 100단지 = 50/km² = 만점
  //   → 고덕 차로5분(97단지/2.13km²=45.5/km²): 45.5/50*25=22점 (적정)
  // 최소 0.1km²: 0으로 나누기 방지용 (과도한 하한 제거)
  const aptEffectiveAreaKm2 = Math.max(areaKm2, 0.1);
  const aptDensity = aptComplexCount / aptEffectiveAreaKm2;
  const aptDensityRef = isoMode === "walk" ? 60 : 50;
  const residentialScore = Math.min(Math.round((aptDensity / aptDensityRef) * 25), 25);
  const totalHouseholds = aptComplexCount * 700;

  // ── 유동 인구 (20점) ─────────────────────────────────────────
  // D1. 실거주인구 (8점)
  const residentPopScore =
    residentTotal >= 30000 ? 8 :
    residentTotal >= 20000 ? 6 :
    residentTotal >= 10000 ? 4 :
    residentTotal >=  5000 ? 2 :
    residentTotal >       0 ? 1 : 0;

  // D2. 직장인구 (6점)
  const workerPopScore =
    workerCount >= 10000 ? 6 :
    workerCount >=  5000 ? 4 :
    workerCount >=  2000 ? 2 :
    workerCount >=   500 ? 1 : 0;

  // D3. 유동인구 실측 (6점): 소상공인 상권 분기 데이터 — 가장 직접적인 유동인구 지표
  const semasPopScore =
    semasFloatingPop >= 500000 ? 6 :
    semasFloatingPop >= 200000 ? 4 :
    semasFloatingPop >= 100000 ? 3 :
    semasFloatingPop >=  50000 ? 2 :
    semasFloatingPop >        0 ? 1 : 0;

  const populationScore = Math.min(residentPopScore + workerPopScore + semasPopScore, 20);

  const rawTotal = transitScore + commerceScore + residentialScore + populationScore;
  // 이소크론(실도로망) 없을 때 → 원형 추정 신뢰도 90% 적용 (신도시 과소평가 방지)
  const confidenceFactor = isochroneAreaM2 ? 1.0 : 0.90;
  const adjustedTotal = Math.round(rawTotal * confidenceFactor);
  const score = Math.min(adjustedTotal, 100);
  // 포화도 지수: 100점 초과 원점수 (상권 과밀 지역 표시용)
  const overScore = Math.max(0, adjustedTotal - 100);

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
    detail: { transitScore, mobilityScore, busScore, parkingScore, carAccessBonus, commerceScore, residentialScore, populationScore },
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
