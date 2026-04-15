// SGIS 행정구역 경계 폴리곤 수집 클라이언트
// SGIS geoboundary API로 실제 행정동 경계 폴리곤 조회

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

// lat/lng + admCd → SGIS 행정동 실제 경계 폴리곤
export async function fetchDongBoundary(
  dongName: string,
  centerLat: number,
  centerLng: number,
  sido: string,
  sigungu: string,
  admCd: string
): Promise<DongBoundaryResult | null> {
  if (!SGIS_KEY || !SGIS_SECRET) {
    return buildFallbackBbox(dongName, sido, sigungu, admCd, centerLat, centerLng);
  }

  const token = await getSgisToken();
  if (!token) {
    return buildFallbackBbox(dongName, sido, sigungu, admCd, centerLat, centerLng);
  }

  try {
    // 1. SGIS stage API로 행정동 코드 찾기
    const sidoRes = await fetch(`${SGIS_BASE}/addr/stage.json?accessToken=${token}&pg_yn=0`);
    const sidoData = await sidoRes.json();
    const sidoItem = (sidoData.result ?? []).find((r: StageItem) =>
      r.addr_name.replace(/특별시|광역시|특별자치시|특별자치도|도$/, "").includes(
        sido.replace(/특별시|광역시|특별자치시|특별자치도|도$/, "")
      )
    );
    if (!sidoItem) return buildFallbackBbox(dongName, sido, sigungu, admCd, centerLat, centerLng);

    const sgRes = await fetch(`${SGIS_BASE}/addr/stage.json?accessToken=${token}&cd=${sidoItem.cd}&pg_yn=0`);
    const sgData = await sgRes.json();
    const sgItem = (sgData.result ?? []).find((r: StageItem) =>
      r.addr_name.includes(sigungu.replace(/시$|군$|구$/, ""))
    );
    if (!sgItem) return buildFallbackBbox(dongName, sido, sigungu, admCd, centerLat, centerLng);

    const dongRes = await fetch(`${SGIS_BASE}/addr/stage.json?accessToken=${token}&cd=${sgItem.cd}&pg_yn=0`);
    const dongData = await dongRes.json();
    const baseDong = dongName.replace(/[0-9]/g, "").replace(/동$/, "");
    const dongItem = (dongData.result ?? []).find((r: StageItem) => r.addr_name.includes(baseDong));
    const sgisCd = dongItem?.cd;

    if (!sgisCd) return buildFallbackBbox(dongName, sido, sigungu, admCd, centerLat, centerLng);

    // 2. SGIS geoboundary API로 실제 경계 GeoJSON 조회
    const geoRes = await fetch(
      `${SGIS_BASE}/boundary/hadmarea.geojson?accessToken=${token}&year=2023&adm_cd=${sgisCd}&low_search=0`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (geoRes.ok) {
      const geoData = await geoRes.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const features: any[] = geoData.features ?? [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (features.length > 0 && features[0].geometry) {
        const geom = features[0].geometry as { type: string; coordinates: any[] };
        // SGIS Polygon: coordinates[0] = 외곽 링, [x, y] EPSG:5179 (TM 좌표계)
        const rawRing: number[][] = geom.type === "Polygon"
          ? geom.coordinates[0]
          : geom.type === "MultiPolygon"
            ? geom.coordinates[0][0]
            : [];

        if (rawRing.length > 3) {
          // EPSG:5179 (TM) → WGS84 (lat/lng) 변환
          const polygon: [number, number][] = rawRing.map((pt) => {
            const tmX = pt[0], tmY = pt[1];
            const { lat, lng } = tm5179ToWgs84(tmX, tmY);
            return [lng, lat] as [number, number];
          });

          // bbox 계산
          const lats = polygon.map(c => c[1]);
          const lngs = polygon.map(c => c[0]);
          const bboxSwLat = Math.min(...lats);
          const bboxNeLat = Math.max(...lats);
          const bboxSwLng = Math.min(...lngs);
          const bboxNeLng = Math.max(...lngs);

          const areaM2 = calcPolygonAreaM2(polygon);
          const polyCenterLat = (bboxSwLat + bboxNeLat) / 2;
          const polyCenterLng = (bboxSwLng + bboxNeLng) / 2;

          return {
            admCd,
            dongName,
            sido,
            sigungu,
            polygon,
            centerLat: polyCenterLat,
            centerLng: polyCenterLng,
            areaM2,
            bboxSwLat,
            bboxSwLng,
            bboxNeLat,
            bboxNeLng,
          };
        }
      }
    }

    // SGIS geoboundary 실패 → fallback
    return buildFallbackBbox(dongName, sido, sigungu, admCd, centerLat, centerLng);
  } catch (error) {
    console.error("[sgis-boundary] Error:", error);
    return buildFallbackBbox(dongName, sido, sigungu, admCd, centerLat, centerLng);
  }
}

// EPSG:5179 (한국 TM 중부원점) → WGS84 근사 변환
// TM 좌표계: 중부원점(falseEasting=1000000, falseNorthing=2000000), 중앙경선 127°
function tm5179ToWgs84(tmX: number, tmY: number): { lat: number; lng: number } {
  // TM → UTM-K 근사 (Gauss-Kruger 역변환)
  const a = 6378137.0;         // WGS84 장반경
  const f = 1 / 298.257222101; // GRS80 플랫닝
  const e2 = 2 * f - f * f;
  const ePrime2 = e2 / (1 - e2);
  const lon0 = 127 * Math.PI / 180; // 중앙경선
  const k0 = 1.0;                    // 축척 계수
  const falseE = 1000000;
  const falseN = 2000000;

  const M0 = 0; // 중앙경선에서의 자오선 호길이

  const x = tmX - falseE;
  const y = tmY - falseN;

  const mu = y / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256));

  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 = mu
    + (3 * e1 / 2 - 27 * e1 * e1 * e1 / 32) * Math.sin(2 * mu)
    + (21 * e1 * e1 / 16 - 55 * e1 * e1 * e1 * e1 / 32) * Math.sin(4 * mu)
    + (151 * e1 * e1 * e1 / 96) * Math.sin(6 * mu);

  const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) * Math.sin(phi1));
  const T1 = Math.tan(phi1) * Math.tan(phi1);
  const C1 = ePrime2 * Math.cos(phi1) * Math.cos(phi1);
  const R1 = a * (1 - e2) / Math.pow(1 - e2 * Math.sin(phi1) * Math.sin(phi1), 1.5);
  const D = x / (N1 * k0);

  const lat = phi1
    - (N1 * Math.tan(phi1) / R1)
    * (D * D / 2
      - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ePrime2) * D * D * D * D / 24
      + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ePrime2 - 3 * C1 * C1) * D * D * D * D * D * D / 720);

  const lng = lon0
    + (D
      - (1 + 2 * T1 + C1) * D * D * D / 6
      + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ePrime2 + 24 * T1 * T1) * D * D * D * D * D / 120)
    / Math.cos(phi1);

  return { lat: lat * 180 / Math.PI, lng: lng * 180 / Math.PI };
}

// 폴리곤 면적 계산 (㎡)
function calcPolygonAreaM2(coords: [number, number][]): number {
  let area = 0;
  const n = coords.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += coords[i][0] * coords[j][1];
    area -= coords[j][0] * coords[i][1];
  }
  const avgLat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
  const mPerLat = 111320;
  const mPerLng = 111320 * Math.cos((avgLat * Math.PI) / 180);
  return Math.abs(area / 2) * mPerLat * mPerLng;
}

// Fallback: bbox 기반 폴리곤 (SGIS 경계 실패 시)
// 인구 밀도 기반으로 동 크기 추정
function buildFallbackBbox(
  dongName: string,
  sido: string,
  sigungu: string,
  admCd: string,
  centerLat: number,
  centerLng: number
): DongBoundaryResult {
  // 서울/수도권: 작은 동 (~800m), 기타: 큰 동 (~1500m)
  const isSeoul = sido.includes("서울");
  const radiusM = isSeoul ? 800 : 1500;

  const mPerLat = 111320;
  const mPerLng = 111320 * Math.cos((centerLat * Math.PI) / 180);
  const dLat = radiusM / mPerLat;
  const dLng = radiusM / mPerLng;

  const bboxSwLat = centerLat - dLat;
  const bboxSwLng = centerLng - dLng;
  const bboxNeLat = centerLat + dLat;
  const bboxNeLng = centerLng + dLng;

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
