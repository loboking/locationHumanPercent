"use client";

import { useEffect, useState } from "react";
import { Bus, Clock } from "lucide-react";
import clsx from "clsx";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface StationData {
  id: number;
  name: string;
  area: string;
  score: number;
  routeCount: number;
  activeCount: number;
  avgCrowded: number;
  grade: "매우높음" | "높음" | "보통" | "낮음";
  arrivals: Array<{
    routeName: string | number;
    predictTime1: number | string;
    crowded1: number | string;
    routeDestName: string;
  }>;
}

const GRADE_COLOR: Record<string, string> = {
  매우높음: "bg-red-100 text-red-700",
  높음: "bg-orange-100 text-orange-700",
  보통: "bg-yellow-100 text-yellow-700",
  낮음: "bg-gray-100 text-gray-500",
};

const SCORE_COLOR = (score: number) =>
  score >= 70 ? "text-red-500" : score >= 50 ? "text-orange-500" : score >= 30 ? "text-yellow-500" : "text-gray-400";

const CROWDED_LABEL: Record<number, string> = {
  0: "여유",
  1: "보통",
  2: "혼잡",
  3: "매우혼잡",
};

export default function BusTrafficPage() {
  const [stations, setStations] = useState<StationData[]>([]);
  const [queriedAt, setQueriedAt] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/bus-traffic");
      const data = await res.json();
      setStations(data.stations);
      setQueriedAt(new Date(data.queriedAt).toLocaleTimeString("ko-KR"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 60000); // 1분마다 갱신
    return () => clearInterval(timer);
  }, []);

  const chartData = stations.map((s) => ({
    name: s.name,
    교통량지수: s.score,
    노선수: s.routeCount,
  }));

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">버스 정류장 교통량 지수</h2>
          <p className="text-gray-500 mt-1">평택시 주요 정류장 실시간 버스 기반 유동인구 지수</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Clock size={14} />
          {loading ? "갱신 중..." : `${queriedAt} 기준`}
          <button
            onClick={fetchData}
            className="ml-2 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-100"
          >
            새로고침
          </button>
        </div>
      </div>

      {/* 지수 계산 설명 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm font-medium text-blue-800">교통량 지수 계산 방식</p>
        <p className="text-xs text-blue-600 mt-1">
          노선 수(50점) + 15분 내 도착 버스(30점) + 혼잡도(20점) = 100점 만점
        </p>
      </div>

      {loading && stations.length === 0 ? (
        <div className="text-center py-20 text-gray-400">실시간 데이터 불러오는 중...</div>
      ) : (
        <>
          {/* 차트 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">정류장별 교통량 지수 비교</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="교통량지수" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 정류장 카드 */}
          <div className="space-y-4">
            {stations.map((station) => (
              <div key={station.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 rounded-lg">
                      <Bus size={20} className="text-blue-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-gray-900">{station.name}</h3>
                        <span className="text-xs text-gray-400">{station.area}</span>
                        <span className={clsx("text-xs font-medium px-2 py-0.5 rounded-full", GRADE_COLOR[station.grade])}>
                          {station.grade}
                        </span>
                      </div>
                      <div className="flex gap-4 mt-1 text-xs text-gray-500">
                        <span>노선 {station.routeCount}개</span>
                        <span>15분내 도착 {station.activeCount}개</span>
                        <span>평균혼잡도 {CROWDED_LABEL[Math.round(station.avgCrowded)] ?? "정보없음"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={clsx("text-3xl font-bold", SCORE_COLOR(station.score))}>
                      {station.score}
                    </div>
                    <div className="text-xs text-gray-400">/ 100</div>
                  </div>
                </div>

                {/* 도착 예정 버스 */}
                {station.arrivals.filter((a) => a.predictTime1 !== "").length > 0 && (
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {station.arrivals
                      .filter((a) => a.predictTime1 !== "")
                      .map((a, i) => (
                        <div key={i} className="bg-gray-50 rounded-lg px-3 py-2 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-gray-800">{a.routeName}번</span>
                            <span className="text-blue-600 font-semibold">{a.predictTime1}분</span>
                          </div>
                          <div className="flex justify-between mt-1">
                            <span className="text-gray-400 truncate max-w-[100px]">{a.routeDestName}</span>
                            <span className={clsx("text-xs", Number(a.crowded1) >= 2 ? "text-red-500" : "text-gray-400")}>
                              {CROWDED_LABEL[Number(a.crowded1)] ?? "-"}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
