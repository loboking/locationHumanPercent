"use client";

import { MOCK_COMMERCE } from "@/infrastructure/api/mock-data";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444"];

export default function CommercePage() {
  return (
    <div className="p-8 space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">상권 매출 분석</h2>
        <p className="text-gray-500 mt-1">고덕동 업종별 월 추정 매출 현황</p>
      </div>

      {/* 추정치 경고 배너 */}
      <div className="flex items-center justify-center">
        <div className="flex items-center gap-3 bg-amber-50 border-2 border-amber-400 rounded-2xl px-8 py-4">
          <span className="text-3xl">⚠️</span>
          <div className="text-center">
            <p className="text-xl font-black text-amber-600 tracking-tight">추 정 치</p>
            <p className="text-xs text-amber-500 mt-0.5">아래 데이터는 실제 매출이 아닌 참고용 추정값입니다</p>
          </div>
          <span className="text-3xl">⚠️</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">업종별 월 매출 (백만원)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={MOCK_COMMERCE.map((d) => ({ name: d.category, 매출: Math.round(d.monthlyRevenue / 1000000), 점포수: d.storeCount }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="매출" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">매출 비중</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={MOCK_COMMERCE.map((d) => ({ name: d.category, value: d.monthlyRevenue }))}
                cx="50%" cy="50%" outerRadius={100}
                dataKey="value"
                label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
              >
                {MOCK_COMMERCE.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => `${(Number(v) / 1000000).toFixed(0)}백만원`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {["업종", "월 매출", "점포 수", "점포당 평균매출"].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {MOCK_COMMERCE.map((d) => (
              <tr key={d.category} className="hover:bg-gray-50">
                <td className="px-5 py-3.5 font-medium text-gray-900">{d.category}</td>
                <td className="px-5 py-3.5 text-gray-600">{(d.monthlyRevenue / 1000000).toFixed(0)}백만원</td>
                <td className="px-5 py-3.5 text-gray-600">{d.storeCount}개</td>
                <td className="px-5 py-3.5 text-gray-600">{(d.avgRevenuePerStore / 10000).toFixed(0)}만원</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
