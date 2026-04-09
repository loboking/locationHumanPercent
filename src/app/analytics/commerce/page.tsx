"use client";

import { useState, useCallback } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { CommerceApiResponse, CommerceIndustry } from "@/app/api/commerce/route";

// ─── 분석 대상 지역 ───────────────────────────────────────────────
const REGIONS = [
  { label: "고덕동", lat: 37.0506, lng: 127.0437 },
  { label: "소사동", lat: 36.9989, lng: 127.0899 },
  { label: "비전동", lat: 37.0109, lng: 127.1122 },
];

// ─── 도넛 차트 색상 ───────────────────────────────────────────────
const CHART_COLORS = [
  "#3b82f6", // 음식점
  "#8b5cf6", // 카페
  "#10b981", // 편의점
  "#f59e0b", // 약국
  "#ef4444", // 병원
  "#06b6d4", // 은행
  "#84cc16", // 대형마트
];

// ─── 밀도 평가 색상 ───────────────────────────────────────────────
const EVAL_STYLE: Record<CommerceIndustry["evaluation"], { bg: string; text: string; bar: string }> = {
  밀집: { bg: "bg-orange-100", text: "text-orange-700", bar: "bg-orange-400" },
  적정: { bg: "bg-green-100",  text: "text-green-700",  bar: "bg-green-400"  },
  부족: { bg: "bg-blue-100",   text: "text-blue-700",   bar: "bg-blue-400"   },
};

// ─── 데이터 출처 배지 ─────────────────────────────────────────────
function SourceBadge({ source }: { source: CommerceIndustry["source"] }) {
  if (source === "soho_db") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
        ✓ 소상공인DB
      </span>
    );
  }
  if (source === "kakao_realtime" || source === "soho_fallback_kakao") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
        카카오 실측
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
      참고값
    </span>
  );
}

// ─── 업종 카드 ────────────────────────────────────────────────────
function IndustryCard({ industry }: { industry: CommerceIndustry }) {
  const evalStyle = EVAL_STYLE[industry.evaluation];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{industry.icon}</span>
          <span className="font-semibold text-gray-800">{industry.label}</span>
        </div>
        <SourceBadge source={industry.source} />
      </div>

      <div className="flex items-end gap-2">
        <span className="text-4xl font-black text-gray-900">{industry.count.toLocaleString()}</span>
        <span className="text-sm text-gray-500 mb-1">개소</span>
      </div>

      <span
        className={`self-start text-xs font-semibold px-2 py-0.5 rounded-full ${evalStyle.bg} ${evalStyle.text}`}
      >
        {industry.evaluation}
      </span>
    </div>
  );
}

// ─── 메인 페이지 ─────────────────────────────────────────────────
export default function CommercePage() {
  const [selectedRegion, setSelectedRegion] = useState<(typeof REGIONS)[0] | null>(null);
  const [customLat, setCustomLat] = useState("");
  const [customLng, setCustomLng] = useState("");
  const [radius, setRadius] = useState(1000);

  const [data, setData] = useState<CommerceApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(
    async (lat: number, lng: number) => {
      setLoading(true);
      setError(null);
      setData(null);
      try {
        const res = await fetch(`/api/commerce?lat=${lat}&lng=${lng}&radius=${radius}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
        }
        const json = (await res.json()) as CommerceApiResponse;
        setData(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : "데이터를 불러오지 못했습니다");
      } finally {
        setLoading(false);
      }
    },
    [radius]
  );

  const handleRegionClick = (region: (typeof REGIONS)[0]) => {
    setSelectedRegion(region);
    setCustomLat("");
    setCustomLng("");
    fetchData(region.lat, region.lng);
  };

  const handleCustomSearch = () => {
    const lat = parseFloat(customLat);
    const lng = parseFloat(customLng);
    if (isNaN(lat) || isNaN(lng)) {
      setError("유효한 위도/경도를 입력해 주세요");
      return;
    }
    setSelectedRegion(null);
    fetchData(lat, lng);
  };

  // 도넛 차트용 데이터
  const pieData = data?.industries.map((ind) => ({
    name: `${ind.icon} ${ind.label}`,
    value: ind.count,
    label: ind.label,
  })) ?? [];

  return (
    <div className="p-8 space-y-8">
      {/* 헤더 */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">상권 매출 분석</h2>
        <p className="text-gray-500 mt-1">
          소상공인DB + 카카오 실측 기반 업종별 점포 현황
        </p>
      </div>

      {/* 지역 선택 + 반경 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-gray-600">지역 선택</span>
          {REGIONS.map((region) => (
            <button
              key={region.label}
              onClick={() => handleRegionClick(region)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                selectedRegion?.label === region.label
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:text-blue-600"
              }`}
            >
              {region.label}
            </button>
          ))}

          <div className="flex items-center gap-2 ml-auto">
            <select
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 text-gray-700"
            >
              <option value={500}>반경 500m</option>
              <option value={1000}>반경 1km</option>
              <option value={1500}>반경 1.5km</option>
              <option value={2000}>반경 2km</option>
            </select>
          </div>
        </div>

        {/* 직접 좌표 입력 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">직접 입력</span>
          <input
            type="text"
            placeholder="위도 (예: 37.0506)"
            value={customLat}
            onChange={(e) => setCustomLat(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 w-36 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <input
            type="text"
            placeholder="경도 (예: 127.0437)"
            value={customLng}
            onChange={(e) => setCustomLng(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 w-36 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <button
            onClick={handleCustomSearch}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            분석
          </button>
        </div>
      </div>

      {/* 로딩 */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">소상공인DB + 카카오 데이터 조회 중...</p>
        </div>
      )}

      {/* 에러 */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          오류: {error}
        </div>
      )}

      {/* 초기 안내 */}
      {!loading && !error && !data && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
          <span className="text-5xl">📍</span>
          <p className="text-base">위 지역 버튼을 클릭하거나 좌표를 입력하여 분석을 시작하세요</p>
        </div>
      )}

      {/* 결과 */}
      {data && !loading && (
        <>
          {/* 요약 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="bg-blue-50 rounded-xl p-4">
              <p className="text-xs text-blue-500 font-medium">분석 반경</p>
              <p className="text-xl font-black text-blue-700 mt-1">{(data.radius / 1000).toFixed(1)}km</p>
            </div>
            <div className="bg-purple-50 rounded-xl p-4">
              <p className="text-xs text-purple-500 font-medium">아파트 단지 수</p>
              <p className="text-xl font-black text-purple-700 mt-1">{data.aptCount}단지</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-4">
              <p className="text-xs text-amber-500 font-medium">총 점포 수</p>
              <p className="text-xl font-black text-amber-700 mt-1">
                {data.industries.reduce((s, i) => s + i.count, 0).toLocaleString()}개
              </p>
            </div>
          </div>

          {/* 섹션 1: 업종별 실측 점포 수 카드 */}
          <div>
            <h3 className="text-base font-semibold text-gray-700 mb-3">업종별 실측 점포 수</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {data.industries.map((industry) => (
                <IndustryCard
                  key={industry.key}
                  industry={industry}
                />
              ))}
            </div>
          </div>

          {/* 섹션 2: 업종 분포 도넛 차트 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-base font-semibold text-gray-700 mb-4">업종 분포</h3>
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={110}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, value }) => `${name} ${value}개`}
                  labelLine={true}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${Number(value).toLocaleString()}개`} />
                <Legend
                  formatter={(value: string, entry) => {
                    const payload = entry.payload as { value?: number } | undefined;
                    return `${value} (${payload?.value?.toLocaleString() ?? 0}개)`;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* 섹션 3: 상권 밀도 분석 테이블 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-700">상권 밀도 분석</h3>
              {data.estimatedPopulation === 0 && (
                <p className="text-xs text-gray-400 mt-0.5">
                  아파트 단지가 없어 배후인구 기준 밀도를 계산할 수 없습니다 (최소 1,000명 기준 적용)
                </p>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {["업종", "실측 점포수", "1000명당", "전국 평균", "평가"].map((h) => (
                      <th
                        key={h}
                        className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.industries.map((ind) => {
                    const evalStyle = EVAL_STYLE[ind.evaluation];
                    return (
                      <tr key={ind.key} className="hover:bg-gray-50">
                        <td className="px-5 py-3.5 font-medium text-gray-900 whitespace-nowrap">
                          <span className="mr-1.5">{ind.icon}</span>
                          {ind.label}
                        </td>
                        <td className="px-5 py-3.5 text-gray-700 font-semibold">
                          {ind.count.toLocaleString()}개
                        </td>
                        <td className="px-5 py-3.5 text-gray-600">{ind.per1000}</td>
                        <td className="px-5 py-3.5 text-gray-500">{ind.nationalAvg}</td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${evalStyle.bg} ${evalStyle.text}`}
                          >
                            {ind.evaluation}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 섹션 4: 데이터 출처 안내 */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-2">
            <p className="text-sm font-semibold text-gray-700">데이터 출처</p>
            <div className="flex flex-wrap gap-3 text-xs">
              <span className="flex items-center gap-1 text-emerald-700">
                <span className="font-semibold">✓ 소상공인DB</span> — 인허가 기반 영업중 사업체 (음식점·카페·편의점·약국·병원·은행 우선)
              </span>
              <span className="flex items-center gap-1 text-blue-700">
                <span className="font-semibold">카카오 실측</span> — 소상공인DB 미응답 업종 폴백
              </span>
            </div>
            <p className="text-xs text-gray-400">
              전국 평균: 통계청 2023 기준 │ 밀집/적정/부족 평가는 전국 평균 대비 배후인구 밀도 기준
            </p>
            {data.generatedAt && (
              <p className="text-xs text-gray-400">
                조회 시각: {new Date(data.generatedAt).toLocaleString("ko-KR")}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
