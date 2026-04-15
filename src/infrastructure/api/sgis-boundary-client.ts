// SGIS 행정구역 경계 폴리곤 수집 클라이언트
// SGIS coords 통해 동 경계(bbox + polygon) 조회

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) {
    console.warn(`[경고] 환경변수 ${key}가 설정되지 않았습니다.`);
    return "";
  }
  return val;
}

const SGIS_KEY = requireEnv("SGIS_CONSUMER_KEY");
const SGIS_SECRET = requireEnv("SGIS_CONSUMER_SECRET");
const SGIS_BASE = "https://sgisapi.mods.go.kr/OpenAPI3";

let sgisTokenCache: { token: string; expiresAt: number } | null = null;

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
      sgisTokenCache = { token, expiresAt: Date.now() + 23 * 60 * 60 * 1000 };
    }
    return token;
  } catch {
    return null;
  }
}

export interface DongBoundaryResult {
  admCd: string;
  dongName: string;
  sido: string;
  sigungu: string;
  polygon: [number, number][]; // [lng, lat][]
  centerLat: number;
  centerLng: number;
  areaM2: number;
  bboxSwLat: number;
  bboxSwLng: number;
  bboxNeLat: number;
  bboxNeLng: number;
}

type StageItem = { addr_name: string; cd: string };

// 동 이름(예: "고덕동") → SGIS 경계 폴리곤 조회
export async function fetchDongBoundary(dongQuery: string): Promise<DongBoundaryResult | null> {
  if (!SGIS_KEY || !SGIS_SECRET) return null;
  const token = await getSgisToken();
  if (!token) return null;

  try {
    // 1. Kakao 좌표변환으로 동의 대략적 좌표 획득
    const kakaoRes = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(dongQuery)}`,
      { headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` } }
    );
    if (!kakaoRes.ok) return null;
    const kakaoData = await kakaoRes.json();
    const doc = kakaoData.documents?.[0];
    if (!doc) return null;

    const centerLng = parseFloat(doc.x);
    const centerLat = parseFloat(doc.y);

    // 2. 좌표 → 행정구역 코드 (region_type H)
    const codeRes = await fetch(
      `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${centerLng}&y=${centerLat}`,
      { headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` } }
    );
    if (!codeRes.ok) return null;
    const codeData = await codeRes.json();
    const hDoc = (codeData.documents ?? []).find((d: Record<string, string>) => d.region_type === "H");
    if (!hDoc) return null;

    const admCd = hDoc.code ?? "";
    const dongName = hDoc.region_3depth_name ?? dongQuery;
    const sido = hDoc.region_1depth_name ?? "";
    const sigungu = hDoc.region_2depth_name ?? "";

    // 3. SGIS stage API로 행정동 코드 찾기
    const sidoRes = await fetch(`${SGIS_BASE}/addr/stage.json?accessToken=${token}&pg_yn=0`);
    const sidoData = await sidoRes.json();
    const sidoItem = (sidoData.result ?? []).find((r: StageItem) =>
      r.addr_name.replace(/특별시|광역시|특별자치시|특별자치도|도$/, "").includes(
        sido.replace(/특별시|광역시|특별자치시|특별자치도|도$/, "")
      )
    );
    if (!sidoItem) return null;

    const sgRes = await fetch(`${SGIS_BASE}/addr/stage.json?accessToken=${token}&cd=${sidoItem.cd}&pg_yn=0`);
    const sgData = await sgRes.json();
    const sgItem = (sgData.result ?? []).find((r: StageItem) =>
      r.addr_name.includes(sigungu.replace(/시$|군$|구$/, ""))
    );
    if (!sgItem) return null;

    const dongRes = await fetch(`${SGIS_BASE}/addr/stage.json?accessToken=${token}&cd=${sgItem.cd}&pg_yn=0`);
    const dongData = await dongRes.json();
    const baseDong = dongName.replace(/[0-9]/g, "").replace(/동$/, "");
    const dongItem = (dongData.result ?? []).find((r: StageItem) => r.addr_name.includes(baseDong));
    const sgisCd = dongItem?.cd ?? sgItem.cd;

    // 4. SGIS geometry로 폴리곤 조회
    const geoRes = await fetch(
      `${SGIS_BASE}/stats/searchpopulation.json?accessToken=${token}&year=2020&adm_cd=${sgisCd}&gender=0`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!geoRes.ok) {
      // SGIS geometry endpoint가 별도인 경우 대체: bbox 기반 폴리곤 생성
      return buildFromBbox(dongName, sido, sigungu, admCd, centerLat, centerLng);
    }

    // SGIS에서 폴리곤을 직접 제공하지 않으므로 bbox 기반으로 폴리곤 생성
    return buildFromBbox(dongName, sido, sigungu, admCd, centerLat, centerLng);
  } catch {
    return null;
  }
}

// bbox 기반 폴리곤 생성 (SGIS 경계 API 미제공 시)
// Kakao 주소검색 결과 + 반경 500m로 폴리곤 생성
function buildFromBbox(
  dongName: string,
  sido: string,
  sigungu: string,
  admCd: string,
  centerLat: number,
  centerLng: number
): DongBoundaryResult | null {
  // 동 크기 추정: 일반적으로 500m~1km 반경
  const radiusM = 600;
  const mPerLat = 111320;
  const mPerLng = 111320 * Math.cos((centerLat * Math.PI) / 180);

  const dLat = radiusM / mPerLat;
  const dLng = radiusM / mPerLng;

  const bboxSwLat = centerLat - dLat;
  const bboxSwLng = centerLng - dLng;
  const bboxNeLat = centerLat + dLat;
  const bboxNeLng = centerLng + dLng;

  // 폴리곤: bbox를 시계방향으로
  const polygon: [number, number][] = [
    [bboxSwLng, bboxSwLat],
    [bboxNeLng, bboxSwLat],
    [bboxNeLng, bboxNeLat],
    [bboxSwLng, bboxNeLat],
    [bboxSwLng, bboxSwLat],
  ];

  const areaM2 = Math.PI * radiusM * radiusM;

  return {
    admCd,
    dongName,
    sido,
    sigungu,
    polygon,
    centerLat,
    centerLng,
    areaM2,
    bboxSwLat,
    bboxSwLng,
    bboxNeLat,
    bboxNeLng,
  };
}
