// 행정안전부 주민등록인구통계 API (data.go.kr)
// 월별 업데이트 최신 데이터, 행정동 코드(H-type) 직접 사용
// Base URL: https://apis.data.go.kr/1741000/rsdntrgstatsvc

const SERVICE_KEY = process.env.PUBLIC_DATA_SERVICE_KEY!;
const BASE = "https://apis.data.go.kr/1741000/rsdntrgstatsvc";

export interface AgePopulation {
  adm_cd: string;
  adm_nm: string;
  age0s: number;   // 0-9세
  age10s: number;  // 10-19세
  age20s: number;  // 20-29세
  age30s: number;  // 30-39세
  age40s: number;  // 40-49세
  age50s: number;  // 50-59세
  age60s: number;  // 60-69세
  age70s: number;  // 70+세
  total: number;
  // 약국 분석 핵심 지표
  youngFamily: number;    // 30-40대 (육아세대)
  chronicPatient: number; // 50-60대 (만성질환층)
  youngFamilyRatio: number;   // %
  chronicPatientRatio: number; // %
}

// 전월 연도/월 계산
function getPrevYearMonth(): { year: string; month: string } {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const year = String(prev.getFullYear());
  const month = String(prev.getMonth() + 1).padStart(2, "0");
  return { year, month };
}

// 연령별 인구 조회 (메인 공개 함수)
// admCd: Kakao coord2regioncode H-type의 code 필드 (10자리)
// admNm: region_1depth_name + region_2depth_name + region_3depth_name 조합
export async function getAgePopulationByRegion(
  admCd: string,
  admNm: string
): Promise<AgePopulation | null> {
  if (!SERVICE_KEY || !admCd) return null;

  const { year, month } = getPrevYearMonth();

  try {
    const url = new URL(`${BASE}/getRsdntrgStatAgeListData`);
    url.searchParams.set("serviceKey", SERVICE_KEY);
    url.searchParams.set("numOfRows", "100");
    url.searchParams.set("pageNo", "1");
    url.searchParams.set("format", "json");
    url.searchParams.set("adm_cd", admCd);
    url.searchParams.set("year", year);
    url.searchParams.set("month", month);

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;

    const data = await res.json();
    const items: Array<{ age: string; totalpopulation: string; malePop: string; femalePop: string }> =
      data?.items?.item ?? [];

    if (!items.length) return null;

    // 1세 단위 → 10세 단위 집계
    const buckets = [0, 0, 0, 0, 0, 0, 0, 0]; // 0-9, 10-19, 20-29, 30-39, 40-49, 50-59, 60-69, 70+
    let total = 0;

    for (const item of items) {
      const age = parseInt(item.age, 10);
      const pop = parseInt(item.totalpopulation, 10) || 0;
      if (isNaN(age) || pop < 0) continue;
      total += pop;
      const bucketIdx = Math.min(Math.floor(age / 10), 7);
      buckets[bucketIdx] += pop;
    }

    if (total === 0) return null;

    const [age0s, age10s, age20s, age30s, age40s, age50s, age60s, age70s] = buckets;
    const youngFamily = age30s + age40s;
    const chronicPatient = age50s + age60s;

    return {
      adm_cd: admCd,
      adm_nm: admNm,
      age0s,
      age10s,
      age20s,
      age30s,
      age40s,
      age50s,
      age60s,
      age70s,
      total,
      youngFamily,
      chronicPatient,
      youngFamilyRatio: Math.round((youngFamily / total) * 100),
      chronicPatientRatio: Math.round((chronicPatient / total) * 100),
    };
  } catch {
    return null;
  }
}
