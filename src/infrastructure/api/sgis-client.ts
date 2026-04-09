// SGIS 통계지리정보서비스 (통계청)
// 인구주택총조사 기반 연령별 거주인구 조회
// 흐름: 좌표 → Kakao 역지오코딩(동명) → SGIS 행정코드 → 연령별 인구

const CONSUMER_KEY = process.env.SGIS_CONSUMER_KEY!;
const CONSUMER_SECRET = process.env.SGIS_CONSUMER_SECRET!;
const BASE = "https://sgisapi.mods.go.kr/OpenAPI3";

// 연령대 10년 단위 코드 (검증 완료)
// age_type=30: 0-9세, 31: 10-19세, 32: 20-29세, 33: 30-39세,
// 34: 40-49세, 35: 50-59세, 36: 60-69세, 37: 70-79세, 38: 80-89세, 39: 90세+
const AGE_TYPE_DECADES = [30, 31, 32, 33, 34, 35, 36, 37, 38, 39] as const;

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

// SGIS 액세스 토큰 (만료 시간 있으므로 요청마다 발급)
async function getAccessToken(): Promise<string | null> {
  try {
    const res = await fetch(
      `${BASE}/auth/authentication.json?consumer_key=${CONSUMER_KEY}&consumer_secret=${CONSUMER_SECRET}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.result?.accessToken ?? null;
  } catch {
    return null;
  }
}

// 지역명으로 SGIS 행정코드 조회 (시도 → 시군구 → 동 순서로 탐색)
async function findAdmCd(
  token: string,
  sido: string,    // 예: "경기"
  sigungu: string, // 예: "평택시"
  dong: string     // 예: "고덕동"
): Promise<string | null> {
  try {
    // 1단계: 시도 목록에서 코드 찾기
    const sidoRes = await fetch(`${BASE}/addr/stage.json?accessToken=${token}&pg_yn=0`);
    const sidoData = await sidoRes.json();
    const sidoItem = (sidoData.result ?? []).find(
      (r: any) => r.addr_name.includes(sido.replace("특별시","").replace("광역시","").replace("특별자치시","").replace("특별자치도",""))
    );
    if (!sidoItem) return null;

    // 2단계: 시군구 목록에서 코드 찾기
    const sgRes = await fetch(`${BASE}/addr/stage.json?accessToken=${token}&cd=${sidoItem.cd}&pg_yn=0`);
    const sgData = await sgRes.json();
    const sgItem = (sgData.result ?? []).find((r: any) => r.addr_name.includes(sigungu));
    if (!sgItem) return null;

    // 3단계: 동 목록에서 코드 찾기
    const dongRes = await fetch(`${BASE}/addr/stage.json?accessToken=${token}&cd=${sgItem.cd}&pg_yn=0`);
    const dongData = await dongRes.json();
    const dongItem = (dongData.result ?? []).find((r: any) => r.addr_name.includes(dong));
    return dongItem?.cd ?? sgItem.cd; // 동 없으면 시군구 코드 반환
  } catch {
    return null;
  }
}

// 연령별 인구 조회 (메인 공개 함수)
export async function getAgePopulationByRegion(
  sido: string,
  sigungu: string,
  dong: string
): Promise<AgePopulation | null> {
  if (!CONSUMER_KEY || !CONSUMER_SECRET) return null;

  const token = await getAccessToken();
  if (!token) return null;

  const admCd = await findAdmCd(token, sido, sigungu, dong);
  if (!admCd) return null;

  // 연령대별 병렬 조회
  const results = await Promise.all(
    AGE_TYPE_DECADES.map((ageType) =>
      fetch(
        `${BASE}/stats/searchpopulation.json?accessToken=${token}&year=2020&adm_cd=${admCd}&gender=0&age_type=${ageType}`,
        { signal: AbortSignal.timeout(5000) }
      )
        .then((r) => r.json())
        .then((d) => {
          const pop = d.result?.[0]?.population;
          return pop && pop !== "N/A" ? parseInt(pop) : 0;
        })
        .catch(() => 0)
    )
  );

  const [age0s, age10s, age20s, age30s, age40s, age50s, age60s, age70s, age80s, age90s] = results;
  const total = results.reduce((s, v) => s + v, 0);
  const youngFamily = age30s + age40s;
  const chronicPatient = age50s + age60s;

  // 이름 조회
  let adm_nm = `${sigungu} ${dong}`;
  try {
    const infoRes = await fetch(`${BASE}/stats/population.json?accessToken=${token}&year=2020&adm_cd=${admCd}`);
    const infoData = await infoRes.json();
    adm_nm = infoData.result?.[0]?.adm_nm ?? adm_nm;
  } catch { /* fallback 사용 */ }

  return {
    adm_cd: admCd,
    adm_nm,
    age0s,
    age10s,
    age20s,
    age30s,
    age40s,
    age50s,
    age60s,
    age70s: age70s + age80s + age90s,
    total: total || 1,
    youngFamily,
    chronicPatient,
    youngFamilyRatio: total > 0 ? Math.round((youngFamily / total) * 100) : 0,
    chronicPatientRatio: total > 0 ? Math.round((chronicPatient / total) * 100) : 0,
  };
}
