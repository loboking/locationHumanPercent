// 인구 연령 통계
// 1순위: 행안부 주민등록인구통계(data.go.kr) - 월별 업데이트
// 2순위: KOSIS 국가통계포털 - 주민등록인구현황 2024년 (읍면동/5세별)
// 3순위: SGIS 통계청 2020 인구총조사 (최후 폴백)

const SERVICE_KEY = process.env.PUBLIC_DATA_SERVICE_KEY!;
const MOIS_BASE = "https://apis.data.go.kr/1741000/rsdntrgstatsvc";

const KOSIS_KEY = process.env.KOSIS_API_KEY!;
const KOSIS_BASE = "https://kosis.kr/openapi/Param/statisticsParameterData.do";

const SGIS_KEY = process.env.SGIS_CONSUMER_KEY!;
const SGIS_SECRET = process.env.SGIS_CONSUMER_SECRET!;
const SGIS_BASE = "https://sgisapi.mods.go.kr/OpenAPI3";

// 토큰 캐시 (SGIS 토큰 유효시간 약 24h → 23h 캐시)
let sgisTokenCache: { token: string; expiresAt: number } | null = null;

// age_type 코드: 30=0-9세, 31=10-19세, 32=20-29세, 33=30-39세,
// 34=40-49세, 35=50-59세, 36=60-69세, 37=70-79세, 38=80-89세, 39=90세+
const SGIS_AGE_TYPES = [30, 31, 32, 33, 34, 35, 36, 37, 38, 39] as const;

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
  return {
    year: String(prev.getFullYear()),
    month: String(prev.getMonth() + 1).padStart(2, "0"),
  };
}

// ── 1순위: 행안부 주민등록인구통계 ──────────────────────────────
async function fetchMoisPopulation(admCd: string, admNm: string): Promise<AgePopulation | null> {
  if (!SERVICE_KEY) return null;
  const { year, month } = getPrevYearMonth();
  try {
    const url = new URL(`${MOIS_BASE}/getRsdntrgStatAgeListData`);
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
    const items: Array<{ age: string; totalpopulation: string }> = data?.items?.item ?? [];
    if (!items.length) return null;

    const buckets = [0, 0, 0, 0, 0, 0, 0, 0];
    let total = 0;
    for (const item of items) {
      const age = parseInt(item.age, 10);
      const pop = parseInt(item.totalpopulation, 10) || 0;
      if (isNaN(age) || pop < 0) continue;
      total += pop;
      buckets[Math.min(Math.floor(age / 10), 7)] += pop;
    }
    if (total === 0) return null;

    return buildResult(admCd, admNm, buckets, total);
  } catch {
    return null;
  }
}

// ── 2순위: KOSIS 주민등록인구현황 (2024년, 읍면동/5세별) ──────────
// tblId: DT_1B04005N, orgId: 101(통계청)
// objL1: 행정동 코드 10자리 (Kakao H-type 그대로 사용)
async function fetchKosisPopulation(admCd: string, admNm: string): Promise<AgePopulation | null> {
  if (!KOSIS_KEY) return null;

  // KOSIS 행정구역 코드 = Kakao H-type 10자리
  const params = new URLSearchParams({
    method:      "getList",
    apiKey:      KOSIS_KEY,
    itmId:       "T1+",
    objL1:       admCd,
    objL2:       "0",    // 총계 (성별 무관)
    objL3:       "ALL",  // 전 연령
    format:      "json",
    jsonVD:      "Y",
    prdSe:       "Y",
    startPrdDe:  "2024",
    endPrdDe:    "2024",
    orgId:       "101",
    tblId:       "DT_1B04005N",
  });

  try {
    const res = await fetch(`${KOSIS_BASE}?${params}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const buckets = [0, 0, 0, 0, 0, 0, 0, 0];
    let total = 0;

    for (const item of data) {
      const ageNm: string = item.C3_NM ?? "";
      const pop = parseInt(item.DT ?? "0", 10) || 0;
      // "계" (소계) 항목 제외, 유효 인구만
      if (pop <= 0 || ageNm === "계" || ageNm === "합계") continue;

      const match = ageNm.match(/^(\d+)/);
      if (!match) continue;
      const age = parseInt(match[1], 10);
      total += pop;
      buckets[Math.min(Math.floor(age / 10), 7)] += pop;
    }

    if (total === 0) return null;
    return buildResult(admCd, admNm, buckets, total);
  } catch {
    return null;
  }
}

// ── 3순위: SGIS 통계청 인구총조사(2020) ─────────────────────────
async function getSgisToken(): Promise<string | null> {
  if (sgisTokenCache && Date.now() < sgisTokenCache.expiresAt) {
    return sgisTokenCache.token;
  }
  try {
    const res = await fetch(
      `${SGIS_BASE}/auth/authentication.json?consumer_key=${SGIS_KEY}&consumer_secret=${SGIS_SECRET}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const token = data.result?.accessToken ?? null;
    if (token) {
      sgisTokenCache = { token, expiresAt: Date.now() + 23 * 60 * 60 * 1000 }; // 23h
    }
    return token;
  } catch {
    return null;
  }
}

// admNm 예: "경기 평택시 비전동" → { sido:"경기", sigungu:"평택시", dong:"비전동" }
function parseAdmNm(admNm: string): { sido: string; sigungu: string; dong: string } {
  const parts = admNm.trim().split(/\s+/);
  return {
    sido: parts[0] ?? "",
    sigungu: parts[1] ?? "",
    dong: parts[2] ?? "",
  };
}

async function findSgisCodes(token: string, sido: string, sigungu: string, dong: string): Promise<string[]> {
  try {
    // 1단계: 시도 코드
    const sidoRes = await fetch(`${SGIS_BASE}/addr/stage.json?accessToken=${token}&pg_yn=0`);
    const sidoData = await sidoRes.json();
    type StageItem = { addr_name: string; cd: string };
    const sidoItem = (sidoData.result ?? []).find((r: StageItem) =>
      r.addr_name.replace(/특별시|광역시|특별자치시|특별자치도|도$/, "").includes(
        sido.replace(/특별시|광역시|특별자치시|특별자치도|도$/, "")
      )
    );
    if (!sidoItem) return [];

    // 2단계: 시군구 코드
    const sgRes = await fetch(`${SGIS_BASE}/addr/stage.json?accessToken=${token}&cd=${sidoItem.cd}&pg_yn=0`);
    const sgData = await sgRes.json();
    const sgItem = (sgData.result ?? []).find((r: StageItem) => r.addr_name.includes(sigungu.replace(/시$|군$|구$/, "")));
    if (!sgItem) return [];

    // 3단계: 동 코드 (숫자 제거 후 부분 매칭 → 복수 동 지원)
    const dongRes = await fetch(`${SGIS_BASE}/addr/stage.json?accessToken=${token}&cd=${sgItem.cd}&pg_yn=0`);
    const dongData = await dongRes.json();
    const baseDong = dong.replace(/[0-9]/g, "").replace(/동$/, "");
    const matched = (dongData.result ?? []).filter((r: StageItem) => r.addr_name.includes(baseDong));
    return matched.length > 0 ? matched.map((r: StageItem) => r.cd) : [sgItem.cd];
  } catch {
    return [];
  }
}

async function fetchSgisPopulation(admCd: string, admNm: string): Promise<AgePopulation | null> {
  if (!SGIS_KEY || !SGIS_SECRET) return null;

  const token = await getSgisToken();
  if (!token) return null;

  const { sido, sigungu, dong } = parseAdmNm(admNm);
  const codes = await findSgisCodes(token, sido, sigungu, dong);
  if (!codes.length) return null;

  // 연령대별 × 동코드별 병렬 조회 후 합산
  const buckets = [0, 0, 0, 0, 0, 0, 0, 0];
  let total = 0;

  const fetches = codes.flatMap((code) =>
    SGIS_AGE_TYPES.map((ageType) =>
      fetch(
        `${SGIS_BASE}/stats/searchpopulation.json?accessToken=${token}&year=2020&adm_cd=${code}&gender=0&age_type=${ageType}`,
        { signal: AbortSignal.timeout(6000) }
      )
        .then((r) => r.json())
        .then((d) => ({ ageType, pop: parseInt(d.result?.[0]?.population ?? "0", 10) || 0 }))
        .catch(() => ({ ageType, pop: 0 }))
    )
  );

  const results = await Promise.all(fetches);
  for (const { ageType, pop } of results) {
    const idx = ageType - 30; // 30→0, 31→1, ..., 37→7
    const bucketIdx = Math.min(idx, 7); // 38,39 → bucket 7 (70+)
    buckets[bucketIdx] += pop;
    total += pop;
  }

  if (total === 0) return null;

  return buildResult(admCd, admNm, buckets, total);
}

// ── 공통 결과 빌더 ────────────────────────────────────────────────
function buildResult(admCd: string, admNm: string, buckets: number[], total: number): AgePopulation {
  const [age0s, age10s, age20s, age30s, age40s, age50s, age60s, age70s] = buckets;
  const youngFamily = age30s + age40s;
  const chronicPatient = age50s + age60s;
  return {
    adm_cd: admCd,
    adm_nm: admNm,
    age0s, age10s, age20s, age30s, age40s, age50s, age60s, age70s,
    total,
    youngFamily,
    chronicPatient,
    youngFamilyRatio: Math.round((youngFamily / total) * 100),
    chronicPatientRatio: Math.round((chronicPatient / total) * 100),
  };
}

// ── 사업체/종사자 통계 (직장인구 근사치) ─────────────────────────
export interface WorkerStats {
  adm_nm: string;
  companyCnt: number;   // 사업체 수
  workerCnt: number;    // 종사자 수 (낮 시간 유동인구 근사치)
}

export async function getWorkersByRegion(
  admCd: string,
  admNm: string
): Promise<WorkerStats | null> {
  if (!SGIS_KEY || !SGIS_SECRET) return null;
  const token = await getSgisToken();
  if (!token) return null;

  const { sido, sigungu, dong } = parseAdmNm(admNm);
  const codes = await findSgisCodes(token, sido, sigungu, dong);
  if (!codes.length) return null;

  try {
    const results = await Promise.all(
      codes.map((code) =>
        fetch(
          `${SGIS_BASE}/stats/company.json?accessToken=${token}&year=2022&adm_cd=${code}`,
          { signal: AbortSignal.timeout(6000) }
        )
          .then((r) => r.json())
          .then((d) => ({
            companyCnt: parseInt(d.result?.[0]?.company_cnt ?? "0", 10) || 0,
            workerCnt: parseInt(d.result?.[0]?.total_worker_cnt ?? "0", 10) || 0,
          }))
          .catch(() => ({ companyCnt: 0, workerCnt: 0 }))
      )
    );

    const total = results.reduce(
      (acc, r) => ({ companyCnt: acc.companyCnt + r.companyCnt, workerCnt: acc.workerCnt + r.workerCnt }),
      { companyCnt: 0, workerCnt: 0 }
    );

    if (total.workerCnt === 0) return null;
    return { adm_nm: admNm, ...total };
  } catch {
    return null;
  }
}

// ── 메인 공개 함수 ────────────────────────────────────────────────
// admCd: Kakao coord2regioncode H-type code (10자리)
// admNm: "경기 평택시 비전동" 형태
export async function getAgePopulationByRegion(
  admCd: string,
  admNm: string
): Promise<AgePopulation | null> {
  if (!admCd && !admNm) return null;

  // 1순위: 행안부 주민등록인구통계 (매월 최신)
  const moisResult = await fetchMoisPopulation(admCd, admNm);
  if (moisResult) return moisResult;

  // 2순위: KOSIS 주민등록인구현황 (2024년)
  const kosisResult = await fetchKosisPopulation(admCd, admNm);
  if (kosisResult) return kosisResult;

  // 3순위: SGIS 인구총조사 2020 (최후 폴백)
  return fetchSgisPopulation(admCd, admNm);
}
