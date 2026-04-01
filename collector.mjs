// 버스 교통량 1시간마다 수집 스케줄러
// 실행: node collector.mjs

import cron from "node-cron";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SERVICE_KEY = process.env.PUBLIC_DATA_SERVICE_KEY;
const BASE_URL = "https://apis.data.go.kr/6410000/busarrivalservice/v2";

const STATIONS = [
  { id: 233000375, name: "고덕신도시입구", area: "고덕동" },
  { id: 233000510, name: "고덕면사무소",   area: "고덕동" },
  { id: 233001200, name: "평택역",         area: "평택동" },
  { id: 233001500, name: "평택시청",       area: "평택동" },
  { id: 233002100, name: "비전동주민센터", area: "비전동" },
];

function calcScore(arrivals) {
  const routeCount = arrivals.length;
  const active = arrivals.filter(
    (a) => a.predictTime1 !== "" && Number(a.predictTime1) <= 15
  );
  const crowdedSum = active.reduce((s, a) => s + (Number(a.crowded1) || 0), 0);
  const avgCrowded = active.length > 0 ? crowdedSum / active.length : 0;

  const routeScore   = Math.min(routeCount * 5, 50);
  const activeScore  = Math.min(active.length * 6, 30);
  const crowdedScore = Math.min(avgCrowded * 10, 20);

  return {
    routeCount,
    activeCount: active.length,
    avgCrowded,
    score: Math.round(routeScore + activeScore + crowdedScore),
  };
}

async function collect() {
  const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  console.log(`[${now}] 수집 시작`);

  for (const station of STATIONS) {
    try {
      const url = `${BASE_URL}/getBusArrivalListv2?serviceKey=${SERVICE_KEY}&stationId=${station.id}&format=json`;
      const res = await fetch(url);
      const data = await res.json();
      const arrivals = data.response?.msgBody?.busArrivalList ?? [];
      const stats = calcScore(arrivals);

      await prisma.busTrafficSnapshot.create({
        data: {
          stationId:   station.id,
          stationName: station.name,
          area:        station.area,
          ...stats,
        },
      });

      console.log(`  ✅ ${station.name}: ${stats.score}점 (노선 ${stats.routeCount}개)`);
    } catch (err) {
      console.error(`  ❌ ${station.name}: ${err.message}`);
    }
  }

  console.log(`[${now}] 수집 완료\n`);
}

// 즉시 1회 실행
collect();

// 매 정시마다 실행 (0분 0초)
cron.schedule("0 * * * *", collect, { timezone: "Asia/Seoul" });

const shutdown = async () => {
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("📡 버스 교통량 수집기 시작 - 매 정시마다 실행");
console.log("   종료: Ctrl+C\n");
