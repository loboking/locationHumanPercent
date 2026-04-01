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

  const data = results
    .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
    .map((r) => r.value);

  return NextResponse.json({ stations: data, queriedAt: new Date().toISOString() });
}
