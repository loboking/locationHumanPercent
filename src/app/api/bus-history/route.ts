import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VALID_PERIODS = ["day", "week", "month"] as const;
type Period = typeof VALID_PERIODS[number];

// GET /api/bus-history?period=day|week|month&stationId=233000375
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const period = (searchParams.get("period") ?? "week") as Period;
  const stationIdParam = searchParams.get("stationId");

  if (!VALID_PERIODS.includes(period)) {
    return NextResponse.json({ error: "period는 day, week, month 중 하나여야 합니다" }, { status: 400 });
  }

  let stationId: number | null = null;
  if (stationIdParam) {
    stationId = parseInt(stationIdParam, 10);
    if (isNaN(stationId) || stationId <= 0) {
      return NextResponse.json({ error: "유효하지 않은 stationId" }, { status: 400 });
    }
  }

  const since = new Date();
  if (period === "day")   since.setDate(since.getDate() - 1);
  if (period === "week")  since.setDate(since.getDate() - 7);
  if (period === "month") since.setMonth(since.getMonth() - 1);

  const where = {
    recordedAt: { gte: since },
    ...(stationId ? { stationId } : {}),
  };

  const snapshots = await prisma.busTrafficSnapshot.findMany({
    where,
    orderBy: { recordedAt: "asc" },
    select: {
      stationId: true,
      stationName: true,
      area: true,
      score: true,
      routeCount: true,
      activeCount: true,
      avgCrowded: true,
      recordedAt: true,
    },
  });

  // 정류장별 그룹
  const grouped: Record<string, typeof snapshots> = {};
  for (const s of snapshots) {
    if (!grouped[s.stationName]) grouped[s.stationName] = [];
    grouped[s.stationName].push(s);
  }

  // 정류장별 시간대 평균 (raw 제거)
  const stations = Object.entries(grouped).map(([name, data]) => {
    const avgScore = Math.round(data.reduce((s, d) => s + d.score, 0) / data.length);
    const maxScore = Math.max(...data.map((d) => d.score));
    const hourlyAvg = Array.from({ length: 24 }, (_, h) => {
      const hourData = data.filter((d) => new Date(d.recordedAt).getHours() === h);
      return {
        hour: h,
        score: hourData.length > 0
          ? Math.round(hourData.reduce((s, d) => s + d.score, 0) / hourData.length)
          : null,
      };
    }).filter((h) => h.score !== null);

    return { name, avgScore, maxScore, dataCount: data.length, hourlyAvg };
  });

  return NextResponse.json({ period, since, stations }, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
  });
}
