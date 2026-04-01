"use client";

import { useEffect, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Clock, Database, TrendingUp, Bus } from "lucide-react";
import clsx from "clsx";

type Period = "day" | "week" | "month";

interface StationHistory {
  name: string;
  avgScore: number;
  maxScore: number;
  dataCount: number;
  hourlyAvg: { hour: number; score: number }[];
  raw: { score: number; routeCount: number; recordedAt: string }[];
}

interface HistoryResponse {
  period: Period;
  since: string;
  stations: StationHistory[];
}

const COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444"];
const PERIOD_LABELS: Record<Period, string> = { day: "오늘", week: "최근 7일", month: "최근 30일" };

const SCORE_COLOR = (s: number) =>
  s >= 70 ? "text-red-500" : s >= 50 ? "text-orange-500" : s >= 30 ? "text-yellow-500" : "text-gray-400";

export default function BusHistoryPage() {
  const [period, setPeriod] = useState<Period>("week");
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/bus-history?period=${period}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [period]);

  // 시간대별 비교 차트용 데이터
  const hourlyChartData = Array.from({ length: 24 }, (_, h) => {
    const row: Record<string, number | string> = { hour: `${h}시` };
    data?.stations.forEach((s) => {
      const found = s.hourlyAvg.find((a) => a.hour === h);
      if (found) row[s.name] = found.score;
    });
    return row;
  });

  // 시간순 추이 차트 (raw 데이터)
  const trendData = (() => {
    if (!data?.stations.length) return [];
    const allTimes = new Set(
      data.stations.flatMap((s) => s.raw.map((r) => r.recordedAt))
    );
    return Array.from(allTimes)
      .sort()
      .map((t) => {
        const row: Record<string, string | number> = {
          time: new Date(t).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }),
        };
        data.stations.forEach((s) => {
          const found = s.raw.find((r) => r.recordedAt === t);
          if (found) row[s.name] = found.score;
        });
        return row;
      });
  })();

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">버스 교통량 이력 분석</h2>
          <p className="text-gray-500 mt-1">정류장별 교통량 지수 누적 데이터</p>
        </div>
        {/* 기간 선택 */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(["day", "week", "month"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={clsx(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
                period === p ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* 수집 현황 카드 */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {data.stations.map((s, i) => (
            <div key={s.name} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                <p className="text-xs text-gray-500 font-medium truncate">{s.name}</p>
              </div>
              <p className={clsx("text-3xl font-bold", SCORE_COLOR(s.avgScore))}>{s.avgScore}</p>
              <p className="text-xs text-gray-400 mt-1">평균점수 / 최고 {s.maxScore}점</p>
              <div className="flex items-center gap-1 mt-2 text-xs text-gray-400">
                <Database size={11} /> {s.dataCount}회 수집
              </div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-gray-400">데이터 불러오는 중...</div>
      ) : !data?.stations.length ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center">
          <Bus size={32} className="mx-auto mb-3 text-amber-400" />
          <p className="font-medium text-amber-800">아직 수집된 데이터가 없습니다</p>
          <p className="text-sm text-amber-600 mt-1">
            <code className="bg-amber-100 px-1 rounded">npm run collect</code> 을 실행하면 매 정시마다 자동 수집됩니다
          </p>
        </div>
      ) : (
        <>
          {/* 시간순 추이 */}
          {trendData.length > 1 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">
                <TrendingUp size={14} className="inline mr-1" />
                교통량 지수 추이
              </h3>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  {data.stations.map((s, i) => (
                    <Line
                      key={s.name}
                      type="monotone"
                      dataKey={s.name}
                      stroke={COLORS[i]}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* 시간대별 평균 */}
          {data.stations.some((s) => s.hourlyAvg.length > 0) && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">
                <Clock size={14} className="inline mr-1" />
                시간대별 평균 교통량
              </h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={hourlyChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  {data.stations.map((s, i) => (
                    <Bar key={s.name} dataKey={s.name} fill={COLORS[i]} radius={[3, 3, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* 데이터 적을 때 안내 */}
          {trendData.length <= 1 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-sm text-blue-700">
              수집된 시점이 1회입니다. 데이터가 쌓일수록 추이 그래프가 표시됩니다.
              <br />매 정시마다 자동 수집 중 — 내일이면 24개 데이터 포인트가 생깁니다.
            </div>
          )}
        </>
      )}
    </div>
  );
}
