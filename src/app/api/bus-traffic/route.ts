import { NextResponse } from "next/server";
import { fetchBusArrivals, calcTrafficIndex, PYEONGTAEK_STATIONS } from "@/infrastructure/api/bus-client";

export async function GET() {
  const results = await Promise.allSettled(
    PYEONGTAEK_STATIONS.map(async (station) => {
      const arrivals = await fetchBusArrivals(station.id);
      const index = calcTrafficIndex(arrivals);
      return { ...station, ...index, arrivals: arrivals.slice(0, 3) };
    })
  );

  // 실패한 정류장도 0점으로 포함 (5개 전체 표시)
  const data = results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return { ...PYEONGTAEK_STATIONS[i], score: 0, routeCount: 0, activeCount: 0, avgCrowded: 0, grade: "낮음", arrivals: [], _error: String((r as PromiseRejectedResult).reason) };
  });

  return NextResponse.json({ stations: data, queriedAt: new Date().toISOString() });
}
