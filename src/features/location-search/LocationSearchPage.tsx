"use client";

import { useState, useCallback } from "react";
import { Search, MapPin, Loader2, TrendingUp, Users, Building2, Crosshair, ChevronDown, ChevronUp } from "lucide-react";
import clsx from "clsx";
import KakaoMap from "@/components/ui/KakaoMap";

interface DongInfo {
  dongName: string;
  sido: string;
  sigungu: string;
  centerLat: number;
  centerLng: number;
  areaM2: number;
  polygon: [number, number][];
  population: {
    total: number;
    youngFamilyRatio: number;
    chronicPatientRatio: number;
    workerCnt: number;
  };
}

interface HeatmapPoint {
  lat: number;
  lng: number;
  weight: number;
  score: number;
}

interface Top5Candidate {
  lat: number;
  lng: number;
  totalScore: number;
  detail: {
    residentScore: number;
    commerceScore: number;
    competitionScore: number;
    accessScore: number;
  };
  nearby: {
    restaurants: number;
    cafes: number;
    conveniences: number;
    pharmacies: number;
    hospitals: number;
  };
  footTraffic?: Record<string, unknown> | null;
}

interface SearchResult {
  dong: DongInfo;
  phase1: {
    totalGrids: number;
    heatmap: HeatmapPoint[];
    top5: Top5Candidate[];
  };
  phase2: (Top5Candidate & { footTraffic: Record<string, unknown> | null })[];
  cached: boolean;
}

interface DongCandidate {
  addressName: string;
  bunjiAddress: string;
  sido: string;
  sigungu: string;
  dongName: string;
  admCd: string;
  bjdCd: string;
  centerLat: number;
  centerLng: number;
}

type Phase = "idle" | "searching" | "selecting" | "loading" | "done";

export default function LocationSearchPage() {
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<DongCandidate[]>([]);

  // 1단계: 동 검색 → 후보 리스트
  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;

    setPhase("searching");
    setError(null);
    setResult(null);
    setCandidates([]);

    try {
      const res = await fetch(`/api/dong-search?q=${encodeURIComponent(q)}`);
      const data = await res.json();

      if (data.candidates?.length === 0) {
        setError(`"${q}"에 대한 검색 결과가 없습니다. 시/구/동을 함께 입력해보세요 (예: 강남구 역삼동)`);
        setPhase("idle");
        return;
      }

      if (data.candidates.length === 1) {
        // 후보가 1개면 바로 분석
        selectAndAnalyze(data.candidates[0]);
        return;
      }

      // 여러 후보 → 선택 대기
      setCandidates(data.candidates);
      setPhase("selecting");
    } catch {
      setError("네트워크 오류가 발생했습니다");
      setPhase("idle");
    }
  }, [query]);

  // 2단계: 후보 선택 → 분석 실행
  const selectAndAnalyze = useCallback(async (c: DongCandidate) => {
    setPhase("loading");
    setCandidates([]);
    setError(null);

    try {
      const params = new URLSearchParams({
        dong: c.dongName,
        lat: String(c.centerLat),
        lng: String(c.centerLng),
        admCd: c.admCd,
        sido: c.sido,
        sigungu: c.sigungu,
      });
      const res = await fetch(`/api/location-search?${params}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "오류가 발생했습니다");
        setPhase("idle");
        return;
      }

      setResult(data);
      setPhase("done");
    } catch {
      setError("네트워크 오류가 발생했습니다");
      setPhase("idle");
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (phase === "idle" || phase === "selecting")) handleSearch();
  };

  // 히트맵 데이터를 KakaoMap용으로 변환 (최대 200개만 표시)
  const heatmapPoints = result?.phase1.heatmap
    ? [...result.phase1.heatmap]
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 200)
        .map(p => ({
          lat: p.lat,
          lng: p.lng,
          weight: p.weight,
        }))
    : [];

  // Top 5 마커
  const top5Markers = result?.phase1.top5.map((c, i) => ({
    lat: c.lat,
    lng: c.lng,
    title: `Top ${i + 1} (${c.totalScore}점)`,
    score: c.totalScore,
  })) ?? [];

  // 폴리곤 (동 경계)
  const polygonData = result?.dong?.polygon
    ? { path: result.dong.polygon, color: "#3b82f6", opacity: 0.1 }
    : undefined;

  // 상세 분석이 있는 Top 5
  const topCandidates = result?.phase2 ?? result?.phase1.top5 ?? [];

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold">입지 탐색</h1>
        <p className="text-gray-500 text-sm mt-1">동 단위 대형약국 최적 입지 Top 5 탐색</p>
      </div>

      {/* 검색바 */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="동 이름 입력 (예: 고덕동, 강남구 역삼동)"
            className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={phase === "searching" || phase === "loading"}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          {phase === "searching" || phase === "loading" ? (
            <>
              <Loader2 className="animate-spin" size={18} />
              {phase === "searching" ? "검색 중..." : "분석 중..."}
            </>
          ) : (
            <>
              <Crosshair size={18} />
              탐색
            </>
          )}
        </button>
      </div>

      {/* 동 후보 선택 */}
      {phase === "selecting" && candidates.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-gray-750 border-b border-gray-700 text-xs text-gray-400">
            {candidates.length}개의 동이 검색되었습니다. 분석할 동을 선택하세요.
          </div>
          <div className="max-h-60 overflow-y-auto">
            {candidates.map((c, i) => (
              <button
                key={c.admCd}
                onClick={() => selectAndAnalyze(c)}
                className={clsx(
                  "w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-700 transition-colors",
                  i < candidates.length - 1 && "border-b border-gray-700/50"
                )}
              >
                <MapPin size={16} className="text-blue-400 shrink-0" />
                <div>
                  <div className="text-white text-sm font-medium">
                    {c.sido} {c.sigungu} {c.dongName}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {c.bunjiAddress || c.addressName}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}

      {/* 동 정보 카드 */}
      {result?.dong && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <InfoCard icon={<Users size={16} />} label="인구" value={result.dong.population.total.toLocaleString() + "명"} />
          <InfoCard icon={<Building2 size={16} />} label="면적" value={Math.round(result.dong.areaM2 / 10000).toLocaleString() + "만㎡"} />
          <InfoCard icon={<Users size={16} />} label="육아세대" value={result.dong.population.youngFamilyRatio + "%"} />
          <InfoCard icon={<Users size={16} />} label="직장인구" value={result.dong.population.workerCnt.toLocaleString() + "명"} />
          {result.cached && (
            <div className="col-span-2 md:col-span-4 text-xs text-green-400 bg-green-900/20 rounded px-3 py-1">
              캐시에서 로드 (DB 저장된 데이터)
            </div>
          )}
        </div>
      )}

      {/* 지도 */}
      <div className="rounded-lg overflow-hidden border border-gray-700">
        <KakaoMap
          center={result?.dong
            ? { lat: result.dong.centerLat, lng: result.dong.centerLng }
            : undefined
          }
          level={5}
          markers={top5Markers}
          heatmapPoints={heatmapPoints}
          polygon={polygonData}
          className="w-full h-[500px]"
        />
      </div>

      {/* 분석 정보 */}
      {result && (
        <div className="text-xs text-gray-500">
          총 {result.phase1.totalGrids}개 격자 분석 | Top 5 후보 선발
        </div>
      )}

      {/* Top 5 후보 카드 */}
      {topCandidates.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp size={18} />
            최적 입지 Top 5
          </h2>
          {topCandidates.map((candidate, idx) => (
            <CandidateCard
              key={idx}
              rank={idx + 1}
              candidate={candidate}
              expanded={expandedIdx === idx}
              onToggle={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
      <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
        {icon}
        {label}
      </div>
      <div className="text-white font-semibold">{value}</div>
    </div>
  );
}

function CandidateCard({
  rank,
  candidate,
  expanded,
  onToggle,
}: {
  rank: number;
  candidate: Top5Candidate;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { totalScore, detail, nearby, footTraffic, lat, lng } = candidate;
  const grade = totalScore >= 60 ? "최적" : totalScore >= 45 ? "적합" : totalScore >= 30 ? "보통" : "부적합";
  const gradeColor = totalScore >= 60 ? "text-green-400" : totalScore >= 45 ? "text-blue-400" : totalScore >= 30 ? "text-yellow-400" : "text-red-400";

  // footTraffic에서 상세 점수 추출
  const ftEstimate = footTraffic?.estimate as Record<string, number> | undefined;
  const ftPharmacy = footTraffic?.pharmacyEstimate as {
    score?: number;
    grade?: string;
    detail?: {
      residentScore?: number;
      prescriptionScore?: number;
      workforceScore?: number;
      accessScore?: number;
      competitionScore?: number;
    };
    insights?: string[];
    hospitalCount?: number;
    pharmacyCompetitorCount?: number;
    summary?: {
      headline?: string;
      strengths?: string[];
      weaknesses?: string[];
      recommendation?: string;
    };
  } | undefined;

  // footTraffic에서 추가 정보 추출
  const ftAgePop = footTraffic?.agePopulation as { total?: number; youngFamilyRatio?: number; chronicPatientRatio?: number; youngFamily?: number; chronicPatient?: number } | undefined;
  const ftWorker = footTraffic?.workerStats as { workerCnt?: number; companyCnt?: number } | undefined;
  const ftAddress = footTraffic?.address as string | undefined;
  const ftNearby = footTraffic?.nearby as { busStops?: Array<{ name: string; distance: number }>; restaurants?: number; cafes?: number; convStores?: number } | undefined;

  // 2차 pharmacy 점수가 있으면 그걸로 등급 산정, 없으면 1차 점수
  const displayScore = ftPharmacy?.score ?? totalScore;
  const displayGrade = ftPharmacy?.grade ?? (totalScore >= 60 ? "최적" : totalScore >= 45 ? "적합" : totalScore >= 30 ? "보통" : "부적합");
  const displayGradeColor =
    displayScore >= 75 ? "text-green-400" :
    displayScore >= 55 ? "text-blue-400" :
    displayScore >= 35 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-750 transition-colors"
      >
        <div className="flex items-center gap-4">
          <span className={clsx(
            "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
            rank === 1 ? "bg-yellow-500/20 text-yellow-400" :
            rank === 2 ? "bg-gray-400/20 text-gray-300" :
            rank === 3 ? "bg-amber-600/20 text-amber-500" :
            "bg-gray-700 text-gray-400"
          )}>
            {rank}
          </span>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <MapPin size={14} className="text-gray-400" />
              <span className="text-white text-sm font-medium">
                {ftAddress ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm text-gray-400">
                약국 점수: <span className="text-white font-semibold">{displayScore}</span>/100
              </span>
              <span className={clsx("text-xs font-medium", displayGradeColor)}>{displayGrade}</span>
              {!ftPharmacy && (
                <span className="text-xs text-gray-600">(1차 정적: {totalScore}/80)</span>
              )}
            </div>
          </div>
        </div>
        {expanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
      </button>

      {expanded && (
        <div className="border-t border-gray-700 p-4 space-y-4">

          {/* 2차 약국 상세 점수 (foot-traffic API 결과) */}
          {ftPharmacy?.detail && (
            <div>
              <h4 className="text-xs text-gray-400 mb-2">약국 입지 상세 점수 (2차 분석)</h4>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <ScoreBar label="거주 수요" score={ftPharmacy.detail.residentScore ?? 0} max={25} />
                <ScoreBar label="처방 인프라" score={ftPharmacy.detail.prescriptionScore ?? 0} max={20} />
                <ScoreBar label="유동·직장인구" score={ftPharmacy.detail.workforceScore ?? 0} max={15} />
                <ScoreBar label="접근성" score={ftPharmacy.detail.accessScore ?? 0} max={20} />
                <ScoreBar label="경쟁 환경" score={ftPharmacy.detail.competitionScore ?? 0} max={20} />
              </div>
            </div>
          )}

          {/* 1차 정적 점수 (2차가 없을 때만) */}
          {!ftPharmacy?.detail && (
            <div>
              <h4 className="text-xs text-gray-400 mb-2">정적 점수 (1차)</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <ScoreBar label="거주수요" score={detail.residentScore} max={25} />
                <ScoreBar label="상권밀도" score={detail.commerceScore} max={25} />
                <ScoreBar label="경쟁환경" score={detail.competitionScore} max={20} />
                <ScoreBar label="접근성" score={detail.accessScore} max={10} />
              </div>
            </div>
          )}

          {/* 거주인구 / 직장인구 요약 */}
          {(ftAgePop || ftWorker) && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {ftAgePop && ftAgePop.total != null && (
                <div className="bg-gray-900 rounded p-2">
                  <div className="text-xs text-gray-500">거주 인구</div>
                  <div className="text-white font-semibold">{ftAgePop.total.toLocaleString()}명</div>
                </div>
              )}
              {ftAgePop && ftAgePop.youngFamily != null && (
                <div className="bg-gray-900 rounded p-2">
                  <div className="text-xs text-gray-500">육아세대 (30-40대)</div>
                  <div className="text-white font-semibold">{ftAgePop.youngFamily.toLocaleString()}명 ({ftAgePop.youngFamilyRatio}%)</div>
                </div>
              )}
              {ftAgePop && ftAgePop.chronicPatient != null && (
                <div className="bg-gray-900 rounded p-2">
                  <div className="text-xs text-gray-500">만성질환층 (50-60대)</div>
                  <div className="text-white font-semibold">{ftAgePop.chronicPatient.toLocaleString()}명 ({ftAgePop.chronicPatientRatio}%)</div>
                </div>
              )}
              {ftWorker && ftWorker.workerCnt != null && (
                <div className="bg-gray-900 rounded p-2">
                  <div className="text-xs text-gray-500">직장 인구</div>
                  <div className="text-white font-semibold">{ftWorker.workerCnt.toLocaleString()}명</div>
                </div>
              )}
            </div>
          )}

          {/* 반경 500m 내 시설 */}
          <div>
            <h4 className="text-xs text-gray-400 mb-2">반경 500m 내 시설</h4>
            <div className="flex flex-wrap gap-2">
              <Tag emoji="🍽️" label="음식점" count={nearby.restaurants} />
              <Tag emoji="☕" label="카페" count={nearby.cafes} />
              <Tag emoji="🏪" label="편의점" count={nearby.conveniences} />
              <Tag emoji="💊" label="약국" count={nearby.pharmacies} />
              <Tag emoji="🏥" label="병원" count={nearby.hospitals} />
              {ftNearby?.busStops && ftNearby.busStops.length > 0 && (
                <Tag emoji="🚌" label="버스정류장" count={ftNearby.busStops.length} />
              )}
            </div>
          </div>

          {/* 2차 인사이트 */}
          {ftPharmacy?.insights && ftPharmacy.insights.length > 0 && (
            <div>
              <h4 className="text-xs text-gray-400 mb-2">분석 인사이트</h4>
              <ul className="space-y-1">
                {ftPharmacy.insights.map((insight, i) => (
                  <li key={i} className="text-xs text-gray-300 flex items-start gap-2">
                    <span className="text-blue-400 mt-0.5">&#8226;</span>
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 요약 (headline + recommendation) */}
          {ftPharmacy?.summary && (
            <div className="bg-gray-900 rounded p-3">
              {ftPharmacy.summary.headline && (
                <p className="text-sm text-white font-medium mb-2">{ftPharmacy.summary.headline}</p>
              )}
              {ftPharmacy.summary.strengths && ftPharmacy.summary.strengths.length > 0 && (
                <div className="mb-2">
                  <span className="text-xs text-green-400 font-medium">장점</span>
                  <ul className="mt-1 space-y-0.5">
                    {ftPharmacy.summary.strengths.map((s, i) => (
                      <li key={i} className="text-xs text-gray-400">+ {s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {ftPharmacy.summary.weaknesses && ftPharmacy.summary.weaknesses.length > 0 && (
                <div className="mb-2">
                  <span className="text-xs text-red-400 font-medium">약점</span>
                  <ul className="mt-1 space-y-0.5">
                    {ftPharmacy.summary.weaknesses.map((w, i) => (
                      <li key={i} className="text-xs text-gray-400">- {w}</li>
                    ))}
                  </ul>
                </div>
              )}
              {ftPharmacy.summary.recommendation && (
                <p className="text-xs text-blue-300 border-t border-gray-700 pt-2 mt-2">{ftPharmacy.summary.recommendation}</p>
              )}
            </div>
          )}

          {!footTraffic && (
            <div className="text-xs text-gray-500 bg-gray-900 rounded p-2">
              상세 분석 데이터를 불러오지 못했습니다
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScoreBar({ label, score, max }: { label: string; score: number; max: number }) {
  const pct = Math.round((score / max) * 100);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="text-white">{score}/{max}</span>
      </div>
      <div className="h-1.5 bg-gray-700 rounded-full">
        <div
          className={clsx(
            "h-1.5 rounded-full",
            pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-500"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Tag({ emoji, label, count }: { emoji: string; label: string; count: number }) {
  return (
    <span className="bg-gray-900 rounded px-2 py-1 text-xs text-gray-300">
      {emoji} {label} {count}개
    </span>
  );
}
