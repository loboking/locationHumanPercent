import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/bus-history?period=day|week|month&stationId=233000375
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const period = searchParams.get("period") ?? "week";
  const stationId = searchParams.get("stationId");

  const since = new Date();
  if (period === "day")   since.setDate(since.getDate() - 1);
  if (period === "week")  since.setDate(since.getDate() - 7);
  if (period === "month") since.setMonth(since.getMonth() - 1);

  const where = {
    recordedAt: { gte: since },
    ...(stationId ? { stationId: parseInt(stationId) } : {}),
  };

  const snapshots = await prisma.busTrafficSnapshot.findMany({
    where,
    orderBy: { recordedAt: "asc" },
  });

  // 정류장별 그룹
  const grouped: Record<string, typeof snapshots> = {};
  for (const s of snapshots) {
    if (!grouped[s.stationName]) grouped[s.stationName] = [];
    grouped[s.stationName].push(s);
  }

  // 정류장별 시간대 평균
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

    return { name, avgScore, maxScore, dataCount: data.length, hourlyAvg, raw: data };
  });

  return NextResponse.json({ period, since, stations });
}
