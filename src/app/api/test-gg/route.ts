import { NextResponse } from "next/server";

export async function GET() {
  const SERVICE_KEY = process.env.PUBLIC_DATA_SERVICE_KEY!;
  const GG_KEY = process.env.GG_POPULATION_API_KEY!;

  const results: Record<string, unknown> = {};

  // 1. 버스도착정보 테스트
  try {
    const busUrl = `https://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalListv2?serviceKey=${SERVICE_KEY}&stationId=200000177&format=json`;
    const busRes = await fetch(busUrl);
    const busText = await busRes.text();
    results.bus = { status: busRes.status, body: busText.slice(0, 300) };
  } catch (e) {
    results.bus = { error: String(e) };
  }

  // 2. 경기 유동인구 테스트 (다양한 서비스명 시도)
  const services = ["PopulationAgeGender", "FloatingPopulationStatus", "GGFloatingPopulation"];
  for (const svc of services) {
    try {
      const url = `https://openapi.gg.go.kr/${svc}?KEY=${GG_KEY}&Type=json&pIndex=1&pSize=1`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 Chrome/120.0.0.0" },
      });
      const text = await res.text();
      results[`gg_${svc}`] = { status: res.status, body: text.slice(0, 200) };
    } catch (e) {
      results[`gg_${svc}`] = { error: String(e) };
    }
  }

  return NextResponse.json(results);
}
