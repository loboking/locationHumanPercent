"use client";

import { useApiSetup } from "@/application/hooks/useApiSetup";
import { CATEGORY_LABELS, CATEGORY_COLORS } from "@/domain/entities/api-registry";
import { CheckCircle2, Circle, ExternalLink, ChevronRight } from "lucide-react";
import clsx from "clsx";

const COLOR_MAP: Record<string, string> = {
  blue: "bg-blue-100 text-blue-700 border-blue-200",
  emerald: "bg-emerald-100 text-emerald-700 border-emerald-200",
  violet: "bg-violet-100 text-violet-700 border-violet-200",
  orange: "bg-orange-100 text-orange-700 border-orange-200",
};

const STEP_INSTRUCTIONS: Record<string, string[]> = {
  "kakao-local": [
    "developers.kakao.com 접속 후 카카오 계정으로 로그인",
    "'내 애플리케이션' 클릭 → '애플리케이션 추가하기'",
    "앱 이름 입력 (예: 평택부동산인사이트) 후 저장",
    "'앱 키' 탭에서 REST API 키 복사 → .env.local의 KAKAO_REST_API_KEY에 입력",
    "플랫폼 탭 → Web 플랫폼 등록 (localhost:3000, 배포 도메인)",
    "제품 설정 → 카카오맵 → 활성화 설정 ON → JavaScript 키를 NEXT_PUBLIC_KAKAO_MAP_KEY에 입력",
  ],
  "public-data-bus": [
    "data.go.kr 접속 후 회원가입/로그인",
    "검색창에 '경기도 버스도착정보 조회 서비스' 입력",
    "오픈 API 탭 선택 → 활용신청",
    "활용목적 작성 후 신청 → 자동승인으로 즉시 발급",
    "마이페이지 → 인증키 확인 → .env.local의 PUBLIC_DATA_SERVICE_KEY에 입력",
  ],
  "mltm-apt": [
    "data.go.kr 접속 후 로그인",
    "검색창에 '국토교통부 공동주택 기본 정보제공 서비스' 입력",
    "오픈 API 탭 선택 → 활용신청",
    "활용목적 작성 (예: 부동산 인사이트 분석 서비스 개발) → 자동승인",
    "마이페이지 → 인증키 확인 (공공데이터 기존 키와 동일할 수 있음)",
    "⚠️ 이미 승인된 경우: 기존 PUBLIC_DATA_SERVICE_KEY 그대로 사용 가능",
  ],
  "semas-foottraffic": [
    "data.go.kr 접속 후 회원가입/로그인",
    "검색창에 '소상공인시장진흥공단 상권분석 유동인구' 입력",
    "검색 결과 좌측 탭에서 '오픈 API' 선택",
    "'활용신청' 버튼 클릭 → 활용목적 작성 (예: 부동산 인사이트 분석 서비스 개발)",
    "1~2시간 후 마이페이지에서 일반 인증키(Encoding) 확인",
  ],
  "gg-population": [
    "data.gg.go.kr 접속 후 경기도 계정 로그인 (없으면 회원가입)",
    "검색창에 '시군별 유동인구 분석 현황' 입력",
    "오픈 API 탭 선택 후 활용신청",
    "활용목적 작성: '평택시 부동산 가치 분석 SaaS 서비스 개발'",
    "1~3일 내 인증키 발급 → .env.local의 GG_POPULATION_API_KEY에 입력",
  ],
};

export default function ApiGuidePage() {
  const { steps, toggleComplete, completedCount, totalCount, progressPercent } = useApiSetup();

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">API 신청 가이드</h2>
        <p className="text-gray-500 mt-1">데이터 연동을 위한 5개 API를 순서대로 신청하세요</p>
      </div>

      {/* Progress */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-gray-700">전체 진행률</span>
          <span className="text-sm font-bold text-blue-600">{completedCount} / {totalCount} 완료</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-3 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
            const count = steps.filter((s) => s.category === key && s.isCompleted).length;
            const total = steps.filter((s) => s.category === key).length;
            return (
              <div key={key} className={clsx("rounded-lg border px-3 py-2 text-xs font-medium", COLOR_MAP[CATEGORY_COLORS[key as keyof typeof CATEGORY_COLORS]])}>
                {label} · {count}/{total}
              </div>
            );
          })}
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-4">
        {steps.map((step) => {
          const colorKey = CATEGORY_COLORS[step.category];
          const instructions = STEP_INSTRUCTIONS[step.id] || [];

          return (
            <div
              key={step.id}
              className={clsx(
                "bg-white rounded-xl border-2 transition-all",
                step.isCompleted ? "border-emerald-200 bg-emerald-50/30" : "border-gray-200"
              )}
            >
              {/* Step Header */}
              <div className="flex items-start gap-4 p-5">
                <button
                  onClick={() => toggleComplete(step.id)}
                  className="mt-0.5 shrink-0 transition-transform hover:scale-110"
                >
                  {step.isCompleted ? (
                    <CheckCircle2 size={24} className="text-emerald-500" />
                  ) : (
                    <Circle size={24} className="text-gray-300" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-gray-400">STEP {step.order}</span>
                    <span className={clsx("px-2 py-0.5 rounded-full text-xs font-medium border", COLOR_MAP[colorKey])}>
                      {CATEGORY_LABELS[step.category]}
                    </span>
                    <span className="text-xs text-gray-400">⏱ {step.estimatedTime}</span>
                  </div>
                  <h3 className={clsx("text-base font-bold mt-1", step.isCompleted ? "text-gray-400 line-through" : "text-gray-900")}>
                    {step.title}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">{step.description}</p>

                  <a
                    href={step.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium text-blue-600 hover:text-blue-800"
                  >
                    {step.url} <ExternalLink size={14} />
                  </a>
                </div>
              </div>

              {/* Instructions */}
              {!step.isCompleted && (
                <div className="border-t border-gray-100 px-5 pb-5 pt-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">신청 방법</p>
                  <ol className="space-y-2">
                    {instructions.map((instruction, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-gray-600">
                        <span className="flex-shrink-0 w-5 h-5 bg-gray-100 text-gray-600 rounded-full flex items-center justify-center text-xs font-bold">
                          {i + 1}
                        </span>
                        {instruction}
                      </li>
                    ))}
                  </ol>
                  <button
                    onClick={() => toggleComplete(step.id)}
                    className="mt-4 flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-800"
                  >
                    <CheckCircle2 size={14} /> 신청 완료로 표시
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 완료 메시지 */}
      {completedCount === totalCount && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
          <div className="text-3xl mb-2">🎉</div>
          <h3 className="text-lg font-bold text-emerald-800">모든 API 신청 완료!</h3>
          <p className="text-sm text-emerald-600 mt-1">이제 대시보드에서 실제 데이터를 연동할 수 있습니다.</p>
          <a href="/" className="inline-flex items-center gap-1.5 mt-4 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700">
            대시보드로 이동 <ChevronRight size={16} />
          </a>
        </div>
      )}

      {/* API 연동 코드 샘플 */}
      <div className="bg-gray-900 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-gray-400 mb-4">Python 샘플 코드</h3>
        <pre className="text-xs text-green-400 overflow-x-auto leading-relaxed">
{`import requests

# 1. 카카오 API: 주소 → 좌표 변환
KAKAO_KEY = "YOUR_KAKAO_REST_API_KEY"
address = "경기도 평택시 고덕동 1234-5"

kakao_url = "https://dapi.kakao.com/v2/local/search/address.json"
res = requests.get(kakao_url,
    headers={"Authorization": f"KakaoAK {KAKAO_KEY}"},
    params={"query": address}
)
coords = res.json()["documents"][0]
lat, lng = coords["y"], coords["x"]

# 2. 공공데이터 API: 유동인구 조회
PUBLIC_KEY = "YOUR_PUBLIC_DATA_SERVICE_KEY"
semas_url = "https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInRadius"
res2 = requests.get(semas_url, params={
    "serviceKey": PUBLIC_KEY,
    "pageNo": 1, "numOfRows": 10,
    "radius": 500,
    "cx": lng, "cy": lat,
    "type": "json"
})
print(res2.json())`}
        </pre>
      </div>
    </div>
  );
}
