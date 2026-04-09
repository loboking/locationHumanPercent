"use client";

import { useState } from "react";
import ApiGuidePage from "@/features/api-guide/ApiGuidePage";
import { Settings, Key } from "lucide-react";
import clsx from "clsx";

const API_KEYS = [
  {
    label: "카카오 REST API 키",
    envKey: "KAKAO_REST_API_KEY",
    placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    hint: "developers.kakao.com → 내 애플리케이션 → 앱 키 → REST API 키",
    link: "https://developers.kakao.com",
  },
  {
    label: "카카오 JavaScript 키 (지도 표시용)",
    envKey: "NEXT_PUBLIC_KAKAO_MAP_KEY",
    placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    hint: "developers.kakao.com → 앱 키 → JavaScript 키 (지도 SDK 초기화에 사용)",
    link: "https://developers.kakao.com",
  },
  {
    label: "공공데이터 서비스 키",
    envKey: "PUBLIC_DATA_SERVICE_KEY",
    placeholder: "인코딩된 서비스 키",
    hint: "data.go.kr → 마이페이지 → 인증키. 버스도착정보 + 국토교통부 공동주택 API에 공통 사용",
    link: "https://www.data.go.kr",
  },
  {
    label: "경기데이터드림 유동인구 키",
    envKey: "GG_POPULATION_API_KEY",
    placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    hint: "data.gg.go.kr → 유동인구_시군구_성연령별_집계 API 키",
    link: "https://data.gg.go.kr",
  },
  {
    label: "Cron Secret (자동 수집 보안키)",
    envKey: "CRON_SECRET",
    placeholder: "임의의 비밀키 입력 (예: my-secret-key-123)",
    hint: "Vercel 대시보드 → Environment Variables에도 동일하게 등록해야 합니다. /api/collect 엔드포인트 보호용",
    link: "https://vercel.com",
  },
];

const TABS = [
  { id: "env", label: "환경 변수", icon: Settings },
  { id: "api-guide", label: "API 신청 가이드", icon: Key },
];

export default function SettingsPage() {
  const [tab, setTab] = useState<"env" | "api-guide">("env");

  return (
    <div className="p-4 md:p-8">
      <h2 className="text-xl md:text-2xl font-bold text-gray-900">설정</h2>
      <p className="text-gray-500 mt-1 text-sm">환경 변수 관리 및 API 신청 가이드</p>

      {/* 탭 */}
      <div className="flex gap-1 mt-5 border-b border-gray-200">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id as "env" | "api-guide")}
            className={clsx(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              tab === id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* 환경 변수 탭 */}
      {tab === "env" && (
        <div className="mt-6 space-y-6">
          {/* .env.local 예시 */}
          <div className="bg-gray-900 rounded-xl p-5">
            <p className="text-xs font-semibold text-gray-400 mb-3">.env.local 파일 형식</p>
            <pre className="text-xs text-green-400 leading-relaxed overflow-x-auto">{`# 카카오
NEXT_PUBLIC_KAKAO_MAP_KEY=ff94c0085a1e04d3e0dfb47ec9bdb15a
KAKAO_REST_API_KEY=530f3a4a86d1ec5863c88d48e92d89ad

# 공공데이터포털 (버스도착정보 + 국토교통부 공동주택)
PUBLIC_DATA_SERVICE_KEY=bc2af5adcbb51a70a19c736313f49382...

# 경기데이터드림
GG_POPULATION_API_KEY=beaa0fffbf774c8c83efad06b119fa37

# Vercel Cron 보안키 (임의 문자열로 설정)
CRON_SECRET=your-secret-key-here

# Neon PostgreSQL
DATABASE_URL=postgresql://...`}</pre>
          </div>

          {/* Vercel 배포 안내 */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
            <h3 className="text-sm font-bold text-amber-800 mb-2">Vercel 환경 변수 등록 방법</h3>
            <ol className="text-sm text-amber-700 space-y-1.5 list-decimal list-inside">
              <li>Vercel 대시보드 → 프로젝트 선택 → Settings → Environment Variables</li>
              <li>위 키들을 하나씩 Key/Value로 추가</li>
              <li>환경: Production, Preview, Development 모두 체크</li>
              <li>저장 후 Redeploy 필요</li>
            </ol>
          </div>

          {/* 자동 수집 현황 */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
            <h3 className="text-sm font-bold text-blue-800 mb-2">버스 교통량 자동 수집 (GitHub Actions)</h3>
            <p className="text-sm text-blue-700">
              <code className="bg-blue-100 px-1 rounded font-mono">.github/workflows/collect-hourly.yml</code>이 매 정시마다{" "}
              <code className="bg-blue-100 px-1 rounded font-mono">/api/collect</code>를 호출해 DB에 버스 데이터를 자동 저장합니다.
            </p>
            <div className="mt-3 text-xs text-blue-600 space-y-1">
              <p>• 수동 수집: <code className="bg-blue-100 px-1 rounded font-mono">curl /api/collect?secret=CRON_SECRET</code></p>
              <p>• 로컬 테스트: <code className="bg-blue-100 px-1 rounded font-mono">npm run collect</code></p>
            </div>
          </div>

          {/* 키 목록 */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">API 키 목록</h3>
            {API_KEYS.map((field) => (
              <div key={field.envKey} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-semibold text-gray-700">{field.label}</label>
                    <code className="text-xs text-gray-400 font-mono">{field.envKey}</code>
                    <p className="text-xs text-gray-400 mt-1">{field.hint}</p>
                  </div>
                  <a
                    href={field.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800 shrink-0 mt-1"
                  >
                    발급 →
                  </a>
                </div>
                <input
                  type="password"
                  placeholder={field.placeholder}
                  className="mt-3 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* API 신청 가이드 탭 */}
      {tab === "api-guide" && (
        <div className="mt-2 -mx-4 md:-mx-8">
          <ApiGuidePage />
        </div>
      )}
    </div>
  );
}
