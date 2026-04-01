// Infrastructure Layer: 경기도 버스도착정보 API 클라이언트

const BASE_URL = "https://apis.data.go.kr/6410000/busarrivalservice/v2";
const SERVICE_KEY = process.env.PUBLIC_DATA_SERVICE_KEY!;

export interface BusArrival {
  routeId: number;
  routeName: string | number;
  routeTypeCd: number;
  stationId: number;
  stationNm1: string;
  predictTime1: number | string;
  predictTime2: number | string;
  crowded1: number | string;
  remainSeatCnt1: number | string;
  lowPlate1: number | string;
  flag: string;
}

export interface BusArrivalResponse {
  response: {
    msgHeader: {
      resultCode: number;
      resultMessage: string;
      queryTime: string;
    };
    msgBody: {
      busArrivalList: BusArrival[];
    };
  };
}

// 정류장별 버스 도착 정보 조회
export async function fetchBusArrivals(stationId: number): Promise<BusArrival[]> {
  const params = new URLSearchParams({
    serviceKey: SERVICE_KEY,
    stationId: String(stationId),
    format: "json",
  });

  const res = await fetch(`${BASE_URL}/getBusArrivalListv2?${params}`, {
    next: { revalidate: 60 }, // 1분 캐시 (실시간)
  });

  if (!res.ok) throw new Error(`버스 API 오류: ${res.status}`);
  const data: BusArrivalResponse = await res.json();
  return data.response.msgBody.busArrivalList ?? [];
}

// 교통량 지수 계산 (버스 배차 수 + 혼잡도 기반)
export function calcTrafficIndex(arrivals: BusArrival[]): {
  score: number;
  routeCount: number;
  activeCount: number;
  avgCrowded: number;
  grade: "매우높음" | "높음" | "보통" | "낮음";
} {
  const routeCount = arrivals.length;
  const active = arrivals.filter((a) => a.predictTime1 !== "" && Number(a.predictTime1) <= 15);
  const activeCount = active.length;

  const crowdedSum = active.reduce((sum, a) => sum + (Number(a.crowded1) || 0), 0);
  const avgCrowded = activeCount > 0 ? crowdedSum / activeCount : 0;

  // 점수 계산: 노선 수(50%) + 활성 버스(30%) + 혼잡도(20%)
  const routeScore = Math.min(routeCount * 5, 50);
  const activeScore = Math.min(activeCount * 6, 30);
  const crowdedScore = Math.min(avgCrowded * 10, 20);
  const score = Math.round(routeScore + activeScore + crowdedScore);

  const grade =
    score >= 70 ? "매우높음" :
    score >= 50 ? "높음" :
    score >= 30 ? "보통" : "낮음";

  return { score, routeCount, activeCount, avgCrowded, grade };
}

// 평택시 주요 정류장 목록
export const PYEONGTAEK_STATIONS = [
  { id: 233000375, name: "고덕신도시입구", area: "고덕동" },
  { id: 233000510, name: "고덕면사무소", area: "고덕동" },
  { id: 233001200, name: "평택역", area: "평택동" },
  { id: 233001500, name: "평택시청", area: "평택동" },
  { id: 233002100, name: "비전동주민센터", area: "비전동" },
];
