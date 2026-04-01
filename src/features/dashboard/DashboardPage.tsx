"use client";

import { useEffect, useState } from "react";
import { MOCK_FOOT_TRAFFIC, MOCK_COMMERCE } from "@/infrastructure/api/mock-data";
import ScoreCard from "@/components/ui/ScoreCard";
import KakaoMap from "@/components/ui/KakaoMap";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";
import { Loader2 } from "lucide-react";

// 대시보드 분석 대상 주소
const DASHBOARD_LOCATIONS = [
  { label: "고덕동", address: "경기도 평택시 고덕동 1896" },
  { label: "소사동", address: "경기도 평택시 소사동" },
  { label: "비전동", address: "경기도 평택시 비전동" },
];

interface LocationScore {
  label: string;
  address: string;
  resolvedAddress: string;
  score: number;
  grade: string;
  detail: { transitScore: number; commerceScore: number; residentialScore: number };
  coordinates: { lat: number; lng: number };
  trend: "up" | "stable" | "down";
}

export default function DashboardPage() {
  const [scores, setScores] = useState<LocationScore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      const results = await Promise.allSettled(
        DASHBOARD_LOCATIONS.map(async (loc) => {
          const res = await fetch(`/api/foot-traffic?address=${encodeURIComponent(loc.address)}&radius=500`);
          if (!res.ok) throw new Error("fetch failed");
          const data = await res.json();
          return {
            label: loc.label,
            address: loc.address,
            resolvedAddress: data.address,
            score: data.estimate.score,
            grade: data.estimate.grade,
            detail: data.estimate.detail,
            coordinates: data.coordinates,
            trend: "stable" as const,
          } satisfies LocationScore;
        })
      );
      setScores(
        results
          .filter((r): r is PromiseFulfilledResult<LocationScore> => r.status === "fulfilled")
          .map((r) => r.value)
      );
      setLoading(false);
    };
    fetchAll();
  }, []);

  const chartData = MOCK_FOOT_TRAFFIC.map((d) => ({
    month: d.date,
    유동인구: d.totalCount,
    남성: d.maleCount,
    여성: d.femaleCount,
  }));

  const commerceData = MOCK_COMMERCE.map((d) => ({
    category: d.category,
    매출: Math.round(d.monthlyRevenue / 1000000),
    점포수: d.storeCount,
  }));

  return (
    <div className="p-8 space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">평택시 부동산 인사이트</h2>
        <p className="text-gray-500 mt-1">고덕동 · 소사동 · 비전동 실시간 분석 현황</p>
      </div>

      {/* Score Cards */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">지역별 종합 점수</h3>
        {loading ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm py-6">
            <Loader2 size={16} className="animate-spin" />
            실시간 데이터 분석 중...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {scores.map((s) => (
              <ScoreCard
                key={s.label}
                title={s.label}
                score={s.score}
                trend={s.trend}
                address={s.resolvedAddress}
              />
            ))}
          </div>
        )}
      </div>

      {/* 카카오맵 */}
      {scores.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">평택시 분석 지역 지도</h3>
            <p className="text-xs text-gray-400 mt-0.5">마커를 클릭하면 상세 점수를 확인합니다</p>
          </div>
          <KakaoMap
            center={{ lat: 37.03, lng: 127.07 }}
            level={8}
            markers={scores.map((s) => ({
              lat: s.coordinates.lat,
              lng: s.coordinates.lng,
              title: s.label,
              score: s.score,
            }))}
            className="w-full h-[350px]"
          />
        </div>
      )}

      {/* 세부 점수 테이블 */}
      {scores.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">항목별 점수 비교</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["지역", "교통 접근성 /25", "상권 활성도 /45", "주거 밀도 /30", "종합 /100", "등급"].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {scores.map((s) => (
                <tr key={s.label} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-semibold text-gray-900">{s.label}</td>
                  <td className="px-5 py-3 text-blue-600 font-medium">{s.detail.transitScore}</td>
                  <td className="px-5 py-3 text-violet-600 font-medium">{s.detail.commerceScore}</td>
                  <td className="px-5 py-3 text-emerald-600 font-medium">{s.detail.residentialScore}</td>
                  <td className="px-5 py-3 font-bold text-gray-900">{s.score}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      s.grade === "매우높음" ? "bg-red-100 text-red-700" :
                      s.grade === "높음" ? "bg-orange-100 text-orange-700" :
                      s.grade === "보통" ? "bg-yellow-100 text-yellow-700" :
                      "bg-gray-100 text-gray-500"
                    }`}>{s.grade}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">고덕동 유동인구 추이 (2024)</h3>
          <p className="text-xs text-amber-500 mb-3">※ 참고용 추정 데이터</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`} />
              <Tooltip formatter={(v) => `${Number(v).toLocaleString()}명`} />
              <Area type="monotone" dataKey="유동인구" stroke="#3b82f6" fill="url(#colorTotal)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">업종별 월 매출 (단위: 백만원)</h3>
          <p className="text-xs text-amber-500 mb-3">※ 참고용 추정 데이터</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={commerceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="category" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="매출" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
