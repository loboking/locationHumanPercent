import { NextResponse } from "next/server";
import { PYEONGTAEK_STATIONS } from "@/infrastructure/api/bus-client";

const REST_KEY = process.env.KAKAO_REST_API_KEY!;
const BASE = "https://dapi.kakao.com";

// 정류장명으로 Kakao 키워드 검색 → 실제 좌표 반환
async function resolveStationCoords(name: string): Promise<{ lat: number; lng: number } | null> {
  const params = new URLSearchParams({
    query: `평택 ${name}`,
    size: "1",
  });
  const res = await fetch(`${BASE}/v2/local/search/keyword.json?${params}`, {
    headers: { Authorization: `KakaoAK ${REST_KEY}` },
    next: { revalidate: 86400 },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const doc = data.documents?.[0];
  if (!doc) return null;
  return { lat: parseFloat(doc.y), lng: parseFloat(doc.x) };
}

export async function GET() {
  const results = await Promise.allSettled(
    PYEONGTAEK_STATIONS.map(async (station) => {
      const coords = await resolveStationCoords(station.name);
      return { ...station, lat: coords?.lat ?? null, lng: coords?.lng ?? null };
    })
  );

  type StationWithCoords = (typeof PYEONGTAEK_STATIONS)[0] & { lat: number | null; lng: number | null };
  const stations = results
    .filter((r): r is PromiseFulfilledResult<StationWithCoords> => r.status === "fulfilled")
    .map((r) => r.value);

  return NextResponse.json({ stations });
}
