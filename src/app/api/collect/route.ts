import { NextRequest, NextResponse } from "next/server";
import { fetchBusArrivals, calcTrafficIndex, PYEONGTAEK_STATIONS } from "@/infrastructure/api/bus-client";
import { prisma } from "@/lib/prisma";

// Vercel Cron Job: 매 정시마다 버스 교통량 수집
// vercel.json의 crons 설정으로 자동 호출됨
// 수동 실행: GET /api/collect?secret=CRON_SECRET
export async function GET(req: NextRequest) {
  // Vercel Cron 인증 확인
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: { station: string; score: number; error?: string }[] = [];

  for (const station of PYEONGTAEK_STATIONS) {
    try {
      const arrivals = await fetchBusArrivals(station.id);
      const stats = calcTrafficIndex(arrivals);

      await prisma.busTrafficSnapshot.create({
        data: {
          stationId: station.id,
          stationName: station.name,
          area: station.area,
          routeCount: stats.routeCount,
          activeCount: stats.activeCount,
          avgCrowded: stats.avgCrowded,
          score: stats.score,
        },
      });

      results.push({ station: station.name, score: stats.score });
    } catch (err) {
      results.push({ station: station.name, score: 0, error: String(err) });
    }
  }

  return NextResponse.json({
    ok: true,
    collectedAt: new Date().toISOString(),
    results,
  });
}
