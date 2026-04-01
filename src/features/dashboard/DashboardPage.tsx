"use client";

import { useEffect, useState } from "react";
import ScoreCard from "@/components/ui/ScoreCard";
import KakaoMap from "@/components/ui/KakaoMap";
import { Loader2 } from "lucide-react";

// 대시보드 분석 대상 주소
// 좌표 직접 지정으로 카카오 주소 오인식 방지
const DASHBOARD_LOCATIONS = [
  { label: "고덕동", lat: 37.0506, lng: 127.0437 },   // 고덕신도시 중심부
  { label: "소사동", lat: 36.9989, lng: 127.0899 },   // 소사동 주민센터 인근 (평택 구도심)
  { label: "비전동", lat: 37.0109, lng: 127.1122 },   // 비전동 주민센터
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
          const res = await fetch(`/api/foot-traffic?lat=${loc.lat}&lng=${loc.lng}&radius=500`);
          if (!res.ok) throw new Error("fetch failed");
          const data = await res.json();
          return {
            label: loc.label,
            address: `${loc.lat},${loc.lng}`,
            resolvedAddress: data.address,
            score: data.estimate.score,
            grade: data.estimate.grade,
            detail: data.estimate.detail,
            coordinates: data.coordinates,
            trend: "stable" as const,
          } satisfies LocationScore;
        })
      );
      const fulfilled: LocationScore[] = [];
      for (const r of results) {
        if (r.status === "fulfilled") fulfilled.push(r.value);
      }
      setScores(fulfilled);
      setLoading(false);
    };
    fetchAll();
  }, []);

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

    </div>
  );
}
