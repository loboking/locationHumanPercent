"use client";

import { MOCK_PROPERTY_INSIGHTS, MOCK_FOOT_TRAFFIC, MOCK_COMMERCE } from "@/infrastructure/api/mock-data";
import ScoreCard from "@/components/ui/ScoreCard";
import KakaoMap from "@/components/ui/KakaoMap";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";
import { AlertCircle } from "lucide-react";

export default function DashboardPage() {
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
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">평택시 부동산 인사이트</h2>
        <p className="text-gray-500 mt-1">고덕동 · 소사동 · 비전동 실시간 분석 현황</p>
      </div>

      {/* API 미연동 경고 */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle size={20} className="text-amber-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-amber-800">현재 Mock 데이터로 표시 중입니다</p>
          <p className="text-xs text-amber-600 mt-0.5">
            실제 데이터 연동을 위해{" "}
            <a href="/api-guide" className="underline font-medium">API 신청 가이드</a>를 완료해 주세요.
          </p>
        </div>
      </div>

      {/* Score Cards */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">지역별 종합 점수</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {MOCK_PROPERTY_INSIGHTS.map((insight) => (
            <ScoreCard
              key={insight.address}
              title={insight.address.split(" ").pop() || ""}
              score={insight.overallScore}
              trend={insight.trend}
              address={insight.address}
            />
          ))}
        </div>
      </div>

      {/* 카카오맵 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">평택시 분석 지역 지도</h3>
          <p className="text-xs text-gray-400 mt-0.5">마커를 클릭하면 상세 점수를 확인합니다</p>
        </div>
        <KakaoMap
          center={{ lat: 37.03, lng: 127.07 }}
          level={8}
          markers={MOCK_PROPERTY_INSIGHTS.map((p) => ({
            lat: p.coordinates.lat,
            lng: p.coordinates.lng,
            title: p.address.split(" ").pop() || "",
            score: p.overallScore,
          }))}
          className="w-full h-[350px]"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 유동인구 트렌드 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">고덕동 유동인구 추이 (2024)</h3>
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

        {/* 상권 매출 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">업종별 월 매출 (단위: 백만원)</h3>
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

      {/* API 호출 흐름 */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">데이터 파이프라인</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { step: "1", label: "주소 입력", color: "bg-blue-100 text-blue-700" },
            { step: "→", label: "", color: "" },
            { step: "2", label: "카카오 API (좌표 변환)", color: "bg-yellow-100 text-yellow-700" },
            { step: "→", label: "", color: "" },
            { step: "3", label: "공공데이터 API (유동인구/매출)", color: "bg-emerald-100 text-emerald-700" },
            { step: "→", label: "", color: "" },
            { step: "4", label: "경기 API (교통)", color: "bg-orange-100 text-orange-700" },
            { step: "→", label: "", color: "" },
            { step: "5", label: "GCP 알림 서버", color: "bg-red-100 text-red-700" },
          ].map((item, i) =>
            item.label ? (
              <div key={i} className={`px-3 py-1.5 rounded-full text-xs font-medium ${item.color}`}>
                {item.step} {item.label}
              </div>
            ) : (
              <span key={i} className="text-gray-400 font-bold">{item.step}</span>
            )
          )}
        </div>
      </div>
    </div>
  );
}
