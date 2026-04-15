import { NextRequest, NextResponse } from "next/server";

export interface DongCandidate {
  addressName: string;   // 전체 주소 (도로명)
  bunjiAddress: string;  // 지번 주소
  sido: string;
  sigungu: string;
  dongName: string;      // 행정동명 (3depth)
  admCd: string;         // 행안부 행정동 코드 (H-type)
  bjdCd: string;         // 법정동 코드 (B-type)
  centerLat: number;
  centerLng: number;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q || q.trim().length < 2) {
    return NextResponse.json({ candidates: [] });
  }

  const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;
  if (!KAKAO_KEY) {
    return NextResponse.json({ error: "KAKAO_REST_API_KEY 미설정" }, { status: 500 });
  }

  try {
    // 1. Kakao 주소 검색 (여러 결과)
    const kakaoRes = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(q.trim())}&size=15`,
      { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } }
    );
    if (!kakaoRes.ok) {
      return NextResponse.json({ candidates: [], error: `Kakao API ${kakaoRes.status}` });
    }
    const kakaoData = await kakaoRes.json();
    const docs: Array<Record<string, unknown>> = kakaoData.documents ?? [];

    // 2. 각 결과에서 행정동 코드 조회 → 후보 리스트 생성
    const candidateMap = new Map<string, DongCandidate>();

    for (const doc of docs) {
      const x = (doc.x ?? (doc.address as Record<string, unknown>)?.x) as string | undefined;
      const y = (doc.y ?? (doc.address as Record<string, unknown>)?.y) as string | undefined;
      if (!x || !y) continue;

      const lng = parseFloat(x);
      const lat = parseFloat(y);

      try {
        const codeRes = await fetch(
          `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`,
          { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } }
        );
        if (!codeRes.ok) continue;
        const codeData = await codeRes.json();

        const hDoc = (codeData.documents ?? []).find((d: Record<string, string>) => d.region_type === "H");
        const bDoc = (codeData.documents ?? []).find((d: Record<string, string>) => d.region_type === "B");

        if (!hDoc) continue;

        const admCd = hDoc.code ?? "";
        const sido = hDoc.region_1depth_name ?? "";
        const sigungu = hDoc.region_2depth_name ?? "";
        const dongName = hDoc.region_3depth_name ?? "";

        // 중복 제거 (같은 행정동 코드)
        if (candidateMap.has(admCd)) continue;

        // 지번 주소
        const addr = doc.address as Record<string, unknown> | undefined;
        const roadAddr = doc.road_address as Record<string, unknown> | undefined;
        const bunjiAddr = String(addr?.address_name ?? "") || "";

        candidateMap.set(admCd, {
          addressName: String(roadAddr?.address_name ?? ""),
          bunjiAddress: bunjiAddr,
          sido,
          sigungu,
          dongName,
          admCd,
          bjdCd: bDoc?.code ?? "",
          centerLat: lat,
          centerLng: lng,
        });
      } catch {
        continue;
      }
    }

    // 3. 동 이름이 쿼리와 매칭되는 결과 우선 정렬
    const queryBase = q.trim().replace(/[0-9]/g, "").replace(/동$|로$|길$/, "");
    const candidates = [...candidateMap.values()].sort((a, b) => {
      const aMatch = a.dongName.includes(queryBase) ? 0 : 1;
      const bMatch = b.dongName.includes(queryBase) ? 0 : 1;
      return aMatch - bMatch;
    });

    return NextResponse.json({ candidates });
  } catch (error) {
    console.error("[dong-search] Error:", error);
    return NextResponse.json({ candidates: [], error: "검색 오류" }, { status: 500 });
  }
}
