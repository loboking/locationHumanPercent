"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Script from "next/script";
import {
  Search, MapPin, TrendingUp, Bus,
  Loader2, Plus, Trash2, Settings, X, Copy, Check,
} from "lucide-react";
import clsx from "clsx";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from "recharts";

declare global { interface Window { kakao: any } }

interface Station {
  id: number;
  name: string;
  area: string;
  lat: number | null;
  lng: number | null;
}

const ISOCHRONE_OPTIONS = [
  { mode: "car"  as const, minutes: 5,  label: "차로 5분" },
  { mode: "car"  as const, minutes: 10, label: "차로 10분" },
  { mode: "walk" as const, minutes: 10, label: "도보 10분" },
] as const;

interface IsochroneOption { mode: "car" | "walk"; minutes: number; label: string; }

interface PharmacyEstimate {
  score: number;
  grade: "최적" | "적합" | "보통" | "부적합";
  hospitalCount: number;
  pharmacyCompetitorCount: number;
  detail: {
    prescriptionScore: number;
    accessScore: number;
    residentialScore: number;
    competitionScore: number;
  };
  insights: string[];
}

interface EstimateResult {
  address: string;
  coordinates: { lat: number; lng: number };
  radius: number;
  isochrone: { polygon: [number, number][]; areaM2: number; mode: string; minutes: number } | null;
  busStopSource: "kakao" | "fallback";
  dataQuality: {
    confidence: "high" | "medium" | "low";
    realDataRatio: number;
    sources: {
      restaurant: "soho" | "kakao";
      busStop: "kakao" | "fallback";
      trafficHistory: "db" | "db_partial" | "none";
      isochrone: "valhalla" | "circle_fallback";
    };
  };
  estimate: {
    score: number;
    overScore: number;
    grade: string;
    busStopCount: number;
    restaurantCount: number;
    cafeCount: number;
    convStoreCount: number;
    parkingCount: number;
    totalHouseholds: number;
    detail: {
      transitScore: number;
      mobilityScore: number;
      busScore: number;
      parkingScore: number;
      commerceScore: number;
      residentialScore: number;
    };
    density: {
      areaKm2: number;
      restaurantPer1km2: number;
      cafePer1km2: number;
      convPer1km2: number;
      restaurantRatio: number;
      cafeRatio: number;
      convRatio: number;
    };
  };
  pharmacyEstimate?: PharmacyEstimate;
  agePopulation?: {
    adm_nm: string;
    total: number;
    age20s: number;
    age30s: number;
    age40s: number;
    age50s: number;
    age60s: number;
    youngFamily: number;
    chronicPatient: number;
    youngFamilyRatio: number;
    chronicPatientRatio: number;
  } | null;
  nearby: {
    busStops: { name: string; distance: number; lat?: number; lng?: number }[];
    restaurants: number;
    restaurantSource: "soho" | "kakao";
    cafes: number;
    convStores: number;
  };
  apartments: {
    totalCount: number;
    totalHouseholds: number;
    complexes: { name: string; distance: number }[];
  };
  trafficHistory: {
    stationName: string;
    distanceKm: number;
    dataPoints: number;
    avgScore: number | null;
    hourlyAvg: { hour: number; label: string; score: number }[];
  };
  roadTraffic?: {
    score: number;
    avgSpeed: number;
    majorRoadCount: number;
    congestionLevel: 1 | 2 | 3 | 4;
    congestionLabel: string;
    roadNames: string[];
  } | null;
  carAccessibility?: {
    avgDriveMinutes: number;
    within10min: number;
    within15min: number;
    totalOrigins: number;
    source: "tmap" | "haversine";
  } | null;
}

const GRADE_STYLE: Record<string, string> = {
  매우높음: "bg-red-500 text-white",
  높음: "bg-orange-500 text-white",
  보통: "bg-yellow-500 text-white",
  낮음: "bg-gray-400 text-white",
};

const PHARMACY_GRADE_STYLE: Record<string, string> = {
  최적: "bg-emerald-500 text-white",
  적합: "bg-blue-500 text-white",
  보통: "bg-yellow-500 text-white",
  부적합: "bg-red-400 text-white",
};

const SCORE_BAR = (score: number) =>
  score >= 70 ? "bg-red-500" : score >= 50 ? "bg-orange-500" : score >= 30 ? "bg-yellow-500" : "bg-gray-300";

const BAR_COLOR = (score: number) =>
  score >= 70 ? "#ef4444" : score >= 50 ? "#f97316" : score >= 30 ? "#eab308" : "#9ca3af";

const LS_KEY = "monitoring_stations_v1";

function loadCustomStations(): Station[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]"); } catch { return []; }
}

function saveCustomStations(list: Station[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}

export default function FootTrafficAnalyzer() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const polygonRef = useRef<any>(null);
  const infoOverlayRef = useRef<any>(null);
  const stationMarkersRef = useRef<any[]>([]);
  const busStopMarkersRef = useRef<any[]>([]);
  const radiusRef = useRef(500);
  const lastAnalyzedPos = useRef<{ lat: number; lng: number } | null>(null);
  const stationsRef = useRef<Station[]>([]);

  const [address, setAddress] = useState("");
  const [radius, setRadius] = useState<300 | 500 | 1000>(500);
  const [isoOption, setIsoOption] = useState<IsochroneOption>(ISOCHRONE_OPTIONS[0]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EstimateResult | null>(null);
  const [error, setError] = useState("");
  const [stations, setStations] = useState<Station[]>([]);
  const [showStationMgr, setShowStationMgr] = useState(false);
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [newStation, setNewStation] = useState({ name: "", lat: "", lng: "" });
  const [pharmacyMode, setPharmacyMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  const copyAddress = useCallback((addr: string) => {
    navigator.clipboard.writeText(addr).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  useEffect(() => { radiusRef.current = radius; }, [radius]);

  const updateStations = useCallback((list: Station[]) => {
    stationsRef.current = list;
    setStations(list);
  }, []);

  // 이소크론 폴리곤 또는 원 그리기
  const drawOverlay = useCallback((
    lat: number, lng: number, r: number,
    isoPolygon?: [number, number][] | null
  ) => {
    if (!mapInstance.current || !window.kakao?.maps) return;
    lastAnalyzedPos.current = { lat, lng };
    // 기존 오버레이 제거
    if (circleRef.current) { circleRef.current.setMap(null); circleRef.current = null; }
    if (polygonRef.current) { polygonRef.current.setMap(null); polygonRef.current = null; }

    if (isoPolygon && isoPolygon.length > 0) {
      // 이소크론 폴리곤 (실제 도로망 기반)
      const path = isoPolygon.map(([lng, lat]) => new window.kakao.maps.LatLng(lat, lng));
      polygonRef.current = new window.kakao.maps.Polygon({
        path,
        strokeWeight: 2,
        strokeColor: "#3B82F6",
        strokeOpacity: 0.8,
        strokeStyle: "solid",
        fillColor: "#3B82F6",
        fillOpacity: 0.07,
      });
      polygonRef.current.setMap(mapInstance.current);
    } else {
      // 폴백: 반경 원
      const pos = new window.kakao.maps.LatLng(lat, lng);
      circleRef.current = new window.kakao.maps.Circle({
        center: pos, radius: r,
        strokeWeight: 2, strokeColor: "#3B82F6",
        strokeOpacity: 0.7, strokeStyle: "dashed",
        fillColor: "#3B82F6", fillOpacity: 0.08,
      });
      circleRef.current.setMap(mapInstance.current);
    }
  }, []);

  // 주변 버스정류장 마커 (주황색 작은 마커)
  const drawBusStopMarkers = useCallback((stops: EstimateResult["nearby"]["busStops"]) => {
    if (!mapInstance.current || !window.kakao?.maps) return;
    busStopMarkersRef.current.forEach((m) => m.setMap(null));
    busStopMarkersRef.current = [];
    stops.forEach((stop) => {
      if (!stop.lat || !stop.lng) return;
      const pos = new window.kakao.maps.LatLng(stop.lat, stop.lng);
      const div = document.createElement("div");
      div.textContent = `🚏 ${stop.name}`;
      Object.assign(div.style, {
        background: "#f97316",
        color: "#fff",
        fontSize: "10px",
        fontWeight: "600",
        padding: "3px 8px",
        borderRadius: "10px",
        border: "1.5px solid #fff",
        boxShadow: "0 2px 6px rgba(0,0,0,.3)",
        whiteSpace: "nowrap",
        cursor: "default",
      });
      const overlay = new window.kakao.maps.CustomOverlay({
        position: pos, content: div, yAnchor: 1.4, zIndex: 2,
      });
      overlay.setMap(mapInstance.current);
      busStopMarkersRef.current.push(overlay);
    });
  }, []);

  const isoOptionRef = useRef(isoOption);
  useEffect(() => { isoOptionRef.current = isoOption; }, [isoOption]);

  // 함수 ref: analyze를 안정적인 ref로 감싸 deps 체인 재생성을 방지
  const analyzeRef = useRef<(lat?: number, lng?: number, addr?: string, r?: number) => Promise<void>>(async () => {});

  const analyze = useCallback(async (lat?: number, lng?: number, addr?: string, r?: number) => {
    setLoading(true);
    setError("");
    const activeRadius = r ?? radiusRef.current;
    const { mode, minutes } = isoOptionRef.current;
    try {
      const base = addr
        ? `address=${encodeURIComponent(addr)}`
        : `lat=${lat}&lng=${lng}`;
      const res = await fetch(`/api/foot-traffic?${base}&radius=${activeRadius}&mode=${mode}&minutes=${minutes}`);
      if (!res.ok) {
        const e = await res.json();
        setError(e.error ?? "오류 발생");
        return;
      }
      const data: EstimateResult = await res.json();
      setResult(data);
      setActiveTab(0);

      if (mapInstance.current && window.kakao?.maps) {
        const pos = new window.kakao.maps.LatLng(data.coordinates.lat, data.coordinates.lng);
        if (markerRef.current) markerRef.current.setPosition(pos);
        else markerRef.current = new window.kakao.maps.Marker({ position: pos, map: mapInstance.current });
        mapInstance.current.panTo(pos);
        drawOverlay(data.coordinates.lat, data.coordinates.lng, activeRadius, data.isochrone?.polygon);
        drawBusStopMarkers(data.nearby.busStops);

        // 분석 위치 팝업
        const infoContent = document.createElement("div");
        infoContent.innerHTML = `
          <div style="padding:10px 14px;background:#fff;border-radius:10px;border:1px solid #e5e7eb;
            box-shadow:0 4px 12px rgba(0,0,0,.15);min-width:160px;font-family:sans-serif;">
            <p style="font-size:11px;color:#6b7280;margin:0 0 4px">분석 위치</p>
            <p style="font-size:12px;font-weight:700;color:#111;margin:0 0 6px">${data.address}</p>
            <div style="display:flex;gap:8px;font-size:11px">
              <span style="color:#3b82f6">교통 ${data.estimate.detail.transitScore}/25</span>
              <span style="color:#7c3aed">상권 ${data.estimate.detail.commerceScore}/45</span>
              <span style="color:#059669">주거 ${data.estimate.detail.residentialScore}/30</span>
            </div>
            <div style="margin-top:6px;font-size:13px;font-weight:800;color:#1d4ed8">
              종합 ${data.estimate.score}점 · ${data.estimate.grade}
            </div>
          </div>`;

        if (!infoOverlayRef.current) {
          infoOverlayRef.current = new window.kakao.maps.CustomOverlay({
            position: pos, content: infoContent, yAnchor: 1.5, zIndex: 5,
          });
        }
        infoOverlayRef.current.setContent(infoContent);
        infoOverlayRef.current.setPosition(pos);
        infoOverlayRef.current.setMap(mapInstance.current);
      }
    } finally {
      setLoading(false);
    }
  }, [drawOverlay, drawBusStopMarkers]);

  // analyzeRef를 항상 최신 analyze로 유지 (deps 체인 없이 안정적인 참조 제공)
  useEffect(() => { analyzeRef.current = analyze; }, [analyze]);

  // isoOption 변경 시 자동 재분석 제거 — 수동 분석만 허용

  // 스테이션 마커: analyzeRef를 통해 호출하므로 analyze를 deps에서 제외
  const addStationMarkers = useCallback((stationList: Station[]) => {
    if (!mapInstance.current || !window.kakao?.maps) return;
    stationMarkersRef.current.forEach((m) => m.setMap(null));
    stationMarkersRef.current = [];

    stationList.forEach((station) => {
      if (!station.lat || !station.lng) return;
      const pos = new window.kakao.maps.LatLng(station.lat, station.lng);
      const div = document.createElement("div");
      div.textContent = `🚌 ${station.name}`;
      Object.assign(div.style, {
        background: "#1d4ed8",
        color: "#fff",
        fontSize: "11px",
        fontWeight: "700",
        padding: "4px 10px",
        borderRadius: "12px",
        border: "2px solid #fff",
        boxShadow: "0 2px 8px rgba(0,0,0,.35)",
        cursor: "pointer",
        whiteSpace: "nowrap",
        userSelect: "none",
      });
      div.addEventListener("click", () => { analyzeRef.current(station.lat!, station.lng!); });
      div.addEventListener("mouseenter", () => { div.style.background = "#1e40af"; });
      div.addEventListener("mouseleave", () => { div.style.background = "#1d4ed8"; });

      const overlay = new window.kakao.maps.CustomOverlay({
        position: pos, content: div, yAnchor: 1.5, zIndex: 3,
      });
      overlay.setMap(mapInstance.current);
      stationMarkersRef.current.push(overlay);
    });
  }, []); // analyzeRef는 ref이므로 deps 불필요

  // initMap: analyzeRef, addStationMarkers가 안정적이므로 deps에서 제외 가능하나
  // addStationMarkers는 useCallback이므로 안정적. analyzeRef는 ref로 교체.
  const initMap = useCallback(() => {
    if (!mapRef.current || !window.kakao?.maps) return;
    if (mapInstance.current) return; // 이미 초기화된 경우 스킵
    window.kakao.maps.load(() => {
      const map = new window.kakao.maps.Map(mapRef.current, {
        center: new window.kakao.maps.LatLng(37.02, 127.08),
        level: 8,
      });
      mapInstance.current = map;
      window.kakao.maps.event.addListener(map, "click", (e: any) => {
        analyzeRef.current(e.latLng.getLat(), e.latLng.getLng());
      });
      if (stationsRef.current.length > 0) addStationMarkers(stationsRef.current);
    });
  }, [addStationMarkers]); // analyze 제거 → initMap 재생성 빈도 최소화

  // 탭 재진입 시 Kakao 이미 로드돼있으면 직접 초기화
  useEffect(() => {
    if (window.kakao?.maps) {
      mapInstance.current = null; // 재초기화 허용
      initMap();
    }
  }, [initMap]);

  useEffect(() => {
    fetch("/api/stations")
      .then((r) => r.json())
      .then((data) => {
        const apiStations: Station[] = data.stations ?? [];
        const custom = loadCustomStations();
        // 중복 제거 후 병합
        const merged = [...apiStations, ...custom.filter((c) => !apiStations.find((a) => a.id === c.id))];
        updateStations(merged);
      })
      .catch(() => {});
  }, [updateStations]);

  useEffect(() => {
    if (stations.length > 0 && mapInstance.current) {
      addStationMarkers(stations);
    }
  }, [stations, addStationMarkers]);

  // 정류장 추가
  const handleAddStation = () => {
    const lat = parseFloat(newStation.lat);
    const lng = parseFloat(newStation.lng);
    if (!newStation.name || isNaN(lat) || isNaN(lng)) return;
    const s: Station = { id: Date.now(), name: newStation.name, area: "사용자정의", lat, lng };
    const custom = [...loadCustomStations(), s];
    saveCustomStations(custom);
    updateStations([...stations, s]);
    setNewStation({ name: "", lat: "", lng: "" });
  };

  // 정류장 삭제
  const handleDeleteStation = (id: number) => {
    const custom = loadCustomStations().filter((s) => s.id !== id);
    saveCustomStations(custom);
    updateStations(stations.filter((s) => s.id !== id));
  };

  // 상권 차트 데이터 (실제 Kakao 카운트 기반)
  const commerceChartData = result ? [
    { name: "음식점", value: result.estimate.restaurantCount, fill: "#f97316" },
    { name: "카페", value: result.estimate.cafeCount, fill: "#8b5cf6" },
    { name: "편의점", value: result.estimate.convStoreCount, fill: "#10b981" },
  ] : [];

  return (
    <div className="relative h-full overflow-hidden">

      {/* ── 지도 (풀스크린 배경) ── */}
      <Script
        src={`//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_KEY}&autoload=false`}
        strategy="afterInteractive"
        onLoad={initMap}
      />
      <div ref={mapRef} className="absolute inset-0 w-full h-full" />

      {/* ── 왼쪽 플로팅 패널 ── */}
      <div className="absolute top-0 left-0 bottom-0 w-[400px] z-10 bg-white shadow-2xl flex flex-col">

        {/* 헤더 */}
        <div className="bg-[#1250c8] px-4 py-3 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-white/60 text-[10px] uppercase tracking-widest font-medium">입지 분석</p>
              {result ? (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-white text-sm font-bold truncate">{result.address}</p>
                  <button onClick={() => copyAddress(result.address)} className="shrink-0 text-white/50 hover:text-white transition-colors">
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                </div>
              ) : (
                <p className="text-white text-sm font-semibold mt-0.5">위치를 선택하세요</p>
              )}
            </div>
            <div className="shrink-0">
              {result && pharmacyMode && result.pharmacyEstimate && (
                <span className={clsx("px-2 py-0.5 text-xs font-bold rounded", PHARMACY_GRADE_STYLE[result.pharmacyEstimate.grade])}>
                  {result.pharmacyEstimate.grade}
                </span>
              )}
              {result && !pharmacyMode && (
                <span className={clsx("px-2 py-0.5 text-xs font-bold rounded", GRADE_STYLE[result.estimate.grade])}>
                  {result.estimate.grade}
                </span>
              )}
            </div>
          </div>
          {result?.isochrone ? (
            <p className="text-white/50 text-[10px] mt-1">
              {result.isochrone.mode === "car" ? "차로" : "도보"} {result.isochrone.minutes}분 · {(result.isochrone.areaM2 / 1_000_000).toFixed(2)} km² · 실도로망 기반
            </p>
          ) : result && (
            <p className="text-amber-300/80 text-[10px] mt-1">
              ⚠ 도로망 분석 실패 · 1km 원형 추정 (점수 -25%)
            </p>
          )}
        </div>

        {/* 검색바 */}
        <div className="px-3 py-2.5 border-b border-slate-100 shrink-0 space-y-2">
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <MapPin size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && analyze(undefined, undefined, address)}
                placeholder="주소 입력"
                className="w-full pl-7 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={() => analyze(undefined, undefined, address)}
              disabled={loading || !address}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50 shrink-0"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
              분석
            </button>
            <button
              onClick={() => setShowStationMgr((v) => !v)}
              className={clsx("p-1.5 rounded-lg border transition-colors shrink-0",
                showStationMgr ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white border-gray-200 text-gray-500 hover:border-blue-300"
              )}
              title="정류장 관리"
            >
              <Settings size={13} />
            </button>
            <button
              onClick={() => setShowApiSettings((v) => !v)}
              className={clsx("px-2 py-1.5 rounded-lg border text-[10px] font-bold transition-colors shrink-0",
                showApiSettings ? "bg-slate-100 border-slate-400 text-slate-700" : "bg-white border-gray-200 text-gray-500 hover:border-slate-400"
              )}
            >
              API
            </button>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {ISOCHRONE_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                onClick={() => setIsoOption(opt)}
                className={clsx(
                  "px-2.5 py-0.5 rounded-full text-[10px] font-semibold border transition-colors",
                  isoOption.label === opt.label ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
                )}
              >
                {opt.label}
              </button>
            ))}
            <span className="text-gray-200">|</span>
            <label className="flex items-center gap-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={pharmacyMode}
                onChange={(e) => setPharmacyMode(e.target.checked)}
                className="w-3 h-3 accent-emerald-600 cursor-pointer"
              />
              <span className={clsx("text-[10px] font-semibold transition-colors", pharmacyMode ? "text-emerald-700" : "text-gray-400")}>
                약국 전용
              </span>
            </label>
          </div>
        </div>

        {/* 정류장 관리 (접힘) */}
        {showStationMgr && (
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-3 shrink-0 space-y-2 max-h-52 overflow-y-auto">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-600 flex items-center gap-1.5"><Bus size={12} />모니터링 정류장</p>
              <button onClick={() => setShowStationMgr(false)}><X size={12} className="text-gray-400" /></button>
            </div>
            <div className="space-y-1">
              {stations.map((s) => (
                <div key={s.id} className="flex items-center justify-between bg-white rounded px-2 py-1.5 text-xs">
                  <span className="text-gray-700 truncate">{s.name} <span className="text-[10px] text-gray-400">({s.area})</span></span>
                  <button onClick={() => handleDeleteStation(s.id)} className="text-red-400 hover:text-red-600 ml-2 shrink-0"><Trash2 size={11} /></button>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-200 pt-2">
              <div className="flex gap-1">
                <input placeholder="이름" value={newStation.name} onChange={(e) => setNewStation((v) => ({ ...v, name: e.target.value }))}
                  className="flex-1 min-w-0 border border-gray-200 rounded px-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-blue-400" />
                <input placeholder="위도" value={newStation.lat} onChange={(e) => setNewStation((v) => ({ ...v, lat: e.target.value }))}
                  className="w-14 border border-gray-200 rounded px-1.5 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-blue-400" />
                <input placeholder="경도" value={newStation.lng} onChange={(e) => setNewStation((v) => ({ ...v, lng: e.target.value }))}
                  className="w-14 border border-gray-200 rounded px-1.5 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-blue-400" />
                <button onClick={handleAddStation} className="px-2 py-1 bg-blue-600 text-white rounded text-[10px] shrink-0 flex items-center">
                  <Plus size={10} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* API 설정 (접힘) */}
        {showApiSettings && (
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-3 shrink-0 max-h-60 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-600">외부 API 사용 현황</p>
              <button onClick={() => setShowApiSettings(false)}><X size={12} className="text-gray-400" /></button>
            </div>
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left pb-1.5 text-slate-400 font-medium pr-2">API</th>
                  <th className="text-left pb-1.5 text-slate-400 font-medium pr-2">상태</th>
                  <th className="text-left pb-1.5 text-slate-400 font-medium pr-2">무료한도</th>
                  <th className="text-left pb-1.5 text-slate-400 font-medium">단가</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[
                  { name: "카카오 지역검색", status: "on", free: "45건/요청", price: "무료" },
                  { name: "소상공인 상가정보", status: "on", free: "1,000건/일", price: "무료" },
                  { name: "SGIS 연령별 인구", status: "on", free: "무제한", price: "무료" },
                  { name: "Valhalla 이소크론", status: "on", free: "무제한", price: "무료" },
                  { name: "T맵 교통정보", status: "on", free: "1,000건/일", price: "11원/건" },
                  { name: "T맵 경로 매트릭스", status: "on", free: "20건/일→폴백", price: "33원/건" },
                  { name: "T맵 puzzle 혼잡도", status: "off", free: "3건/일", price: "8.8원/건" },
                  { name: "T맵 POI 검색", status: "off", free: "20,000건/일", price: "1.1원/건" },
                ].map((api) => (
                  <tr key={api.name} className={clsx(api.status === "off" && "opacity-40")}>
                    <td className="py-1.5 text-slate-700 pr-2">{api.name}</td>
                    <td className="py-1.5 pr-2">
                      <span className={clsx("px-1 py-0.5 rounded text-[9px] font-bold", api.status === "on" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400")}>
                        {api.status === "on" ? "ON" : "OFF"}
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 text-slate-500">{api.free}</td>
                    <td className="py-1.5 text-slate-500">{api.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 탭 */}
        {result && !loading && (
          <div className="flex border-b border-slate-100 shrink-0 bg-white">
            {["입지 분석", "상권", "인구·연령", "교통·접근성"].map((tab, i) => (
              <button
                key={tab}
                onClick={() => setActiveTab(i)}
                className={clsx(
                  "flex-1 py-2 text-[10px] font-semibold transition-colors border-b-2",
                  activeTab === i ? "text-blue-600 border-blue-600" : "text-slate-400 border-transparent hover:text-slate-600"
                )}
              >
                {i + 1}. {tab}
              </button>
            ))}
          </div>
        )}

        {/* 스크롤 컨텐츠 */}
        <div suppressHydrationWarning className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 p-10 text-slate-400">
              <Loader2 size={20} className="animate-spin" />
              <span className="text-sm">도로망 이소크론 분석 중...</span>
            </div>
          )}
          {error && <div className="m-3 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-600">{error}</div>}

          {result && !loading && (
            <div className="p-3 space-y-3">
              {/* ─ TAB 0: 입지 분석 ─ */}
              {activeTab === 0 && (<>
              {/* ── 1. 분석 개요 카드 ── */}
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                {/* 헤더: 주소 + 등급 배지 */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-widest text-slate-400 font-medium">분석 위치</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p className="text-sm font-semibold text-slate-900 truncate">{result.address}</p>
                      <button
                        onClick={() => copyAddress(result.address)}
                        className="shrink-0 text-slate-400 hover:text-slate-600 transition-colors"
                        title="주소 복사"
                      >
                        {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                      </button>
                    </div>
                  </div>
                  <div className="shrink-0">
                    {pharmacyMode && result.pharmacyEstimate ? (
                      <span className={clsx("px-2 py-0.5 text-xs font-bold border rounded", PHARMACY_GRADE_STYLE[result.pharmacyEstimate.grade])}>
                        {result.pharmacyEstimate.grade}
                      </span>
                    ) : (
                      <span className={clsx("px-2 py-0.5 text-xs font-bold border rounded", GRADE_STYLE[result.estimate.grade])}>
                        {result.estimate.grade}
                      </span>
                    )}
                  </div>
                </div>

                {/* 이소크론 메타 */}
                {result.isochrone ? (
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    {result.isochrone.mode === "car" ? "차로" : "도보"} {result.isochrone.minutes}분 &middot; {(result.isochrone.areaM2 / 1_000_000).toFixed(2)} km² &middot; 실도로망 기반
                  </p>
                ) : (
                  <p className="text-xs text-amber-600 mt-0.5">
                    ⚠ 도로망 분석 실패 · 1km 원형 추정 · 점수 신뢰도 제한
                  </p>
                )}

                <div className="border-b border-slate-100 my-3" />

                {/* 범용 점수 */}
                {!pharmacyMode && (
                  <>
                    <div className="flex items-end justify-between mb-1.5">
                      <p className="text-[10px] uppercase tracking-widest text-slate-400 font-medium">유동인구 추정 점수</p>
                      <div className="flex items-center gap-2">
                        {result.estimate.overScore > 0 && (
                          <span className="text-[10px] font-bold text-amber-600 border border-amber-300 px-1.5 py-0.5">
                            +{result.estimate.overScore} 초과
                          </span>
                        )}
                        <span className="text-2xl font-bold text-slate-900 leading-none">{result.estimate.score}</span>
                        <span className="text-xs text-slate-400">/ 100</span>
                      </div>
                    </div>
                    <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={clsx("h-1 rounded-full transition-all duration-700", SCORE_BAR(result.estimate.score))}
                        style={{ width: `${result.estimate.score}%` }}
                      />
                    </div>
                    {result.estimate.overScore > 0 && (
                      <p className="text-[10px] text-amber-600 mt-1">기준치 100점 초과 · 상권 포화 가능성을 검토하세요</p>
                    )}

                    {/* 3개 서브지표 숫자 그리드 */}
                    <div className="mt-3 grid grid-cols-3 divide-x divide-slate-100">
                      <div className="pr-3">
                        <p className="text-[10px] uppercase tracking-widest text-slate-400 font-medium">교통</p>
                        <p className="text-xl font-bold text-slate-900 mt-0.5">
                          {result.estimate.detail.transitScore}
                          <span className="text-xs font-normal text-slate-400"> / 25</span>
                        </p>
                        <div className="mt-1 space-y-0.5">
                          <div className="flex justify-between text-[10px] text-slate-400">
                            <span>이동범위</span><span>{result.estimate.detail.mobilityScore}/12</span>
                          </div>
                          <div className="flex justify-between text-[10px] text-slate-400">
                            <span>버스정류장</span><span>{result.estimate.detail.busScore}/8</span>
                          </div>
                          <div className="flex justify-between text-[10px] text-slate-400">
                            <span>주차장</span><span>{result.estimate.detail.parkingScore}/5</span>
                          </div>
                        </div>
                      </div>
                      <div className="px-3">
                        <p className="text-[10px] uppercase tracking-widest text-slate-400 font-medium">상권</p>
                        <p className="text-xl font-bold text-slate-900 mt-0.5">
                          {result.estimate.detail.commerceScore}
                          <span className="text-xs font-normal text-slate-400"> / 45</span>
                        </p>
                        <p className="mt-1 text-[10px] text-slate-400">밀도 기반</p>
                      </div>
                      <div className="pl-3">
                        <p className="text-[10px] uppercase tracking-widest text-slate-400 font-medium">주거</p>
                        <p className="text-xl font-bold text-slate-900 mt-0.5">
                          {result.estimate.detail.residentialScore}
                          <span className="text-xs font-normal text-slate-400"> / 30</span>
                        </p>
                      </div>
                    </div>
                  </>
                )}

                {/* 약국 전용 점수 */}
                {pharmacyMode && result.pharmacyEstimate && (
                  <>
                    <div className="flex items-end justify-between mb-1.5">
                      <p className="text-[10px] uppercase tracking-widest text-slate-400 font-medium">약국 입지 점수</p>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-slate-900 leading-none">{result.pharmacyEstimate.score}</span>
                        <span className="text-xs text-slate-400">/ 100</span>
                      </div>
                    </div>
                    <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-1 rounded-full transition-all duration-700 bg-blue-600"
                        style={{ width: `${result.pharmacyEstimate.score}%` }}
                      />
                    </div>

                    {/* 4개 지표 각각 프로그레스바 */}
                    <div className="mt-3 space-y-2.5">
                      {[
                        { label: "처방 수요", value: result.pharmacyEstimate.detail.prescriptionScore, max: 40, sub: `병원 ${result.pharmacyEstimate.hospitalCount}개` },
                        { label: "접근성",   value: result.pharmacyEstimate.detail.accessScore,       max: 30, sub: "이동범위 · 주차 · 버스" },
                        { label: "주거 배후", value: result.pharmacyEstimate.detail.residentialScore,  max: 20, sub: "" },
                        { label: "경쟁 강도", value: result.pharmacyEstimate.detail.competitionScore,  max: 10, sub: `경쟁약국 ${result.pharmacyEstimate.pharmacyCompetitorCount}개` },
                      ].map(({ label, value, max, sub }) => (
                        <div key={label}>
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-[10px] uppercase tracking-widest text-slate-400 font-medium">{label}</span>
                            <span className="text-xs font-bold text-slate-700">{value} <span className="font-normal text-slate-400">/ {max}</span></span>
                          </div>
                          <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-1 bg-blue-600 rounded-full transition-all duration-500"
                              style={{ width: `${(value / max) * 100}%` }}
                            />
                          </div>
                          {sub && <p className="text-[9px] text-slate-400 mt-0.5">{sub}</p>}
                        </div>
                      ))}
                    </div>

                    {/* 인사이트 */}
                    {result.pharmacyEstimate.insights.length > 0 && (
                      <div className="mt-3 border-t border-slate-100 pt-3 space-y-1">
                        {result.pharmacyEstimate.insights.map((text, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className="text-slate-400 shrink-0 leading-4 text-xs">&rsaquo;</span>
                            <span className="text-[11px] text-slate-600">{text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* ── 2. 핵심 지표 그리드 ── */}
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-2 mb-3">
                  핵심 지표
                </p>
                <div className="grid grid-cols-3 gap-0 divide-x divide-slate-100">
                  {/* 이동권 */}
                  <div className="pr-3 pb-3">
                    <p className="text-[10px] uppercase tracking-widest text-slate-400 font-medium">이동권</p>
                    <p className="text-xl font-bold text-slate-900 mt-0.5">
                      {result.isochrone ? `${(result.isochrone.areaM2 / 1_000_000).toFixed(2)}` : "-"}
                      <span className="text-xs font-normal text-slate-500"> km²</span>
                    </p>
                    <p className="text-[9px] text-slate-400 mt-0.5">
                      {result.dataQuality?.sources.isochrone === "valhalla" ? "Valhalla 실도로망" : "⚠ 원형 추정 (점수 ×0.75)"}
                    </p>
                  </div>
                  {/* 거주인구 */}
                  <div className="px-3 pb-3">
                    <p className="text-[10px] uppercase tracking-widest text-slate-400 font-medium">거주인구</p>
                    <p className="text-xl font-bold text-slate-900 mt-0.5">
                      {result.agePopulation ? result.agePopulation.total.toLocaleString() : "-"}
                      <span className="text-xs font-normal text-slate-500"> 명</span>
                    </p>
                    <p className="text-[9px] text-slate-400 mt-0.5">통계청 2020</p>
                  </div>
                  {/* 아파트 */}
                  <div className="pl-3 pb-3">
                    <p className="text-[10px] uppercase tracking-widest text-slate-400 font-medium">아파트</p>
                    <p className="text-xl font-bold text-slate-900 mt-0.5">
                      {result.apartments.totalHouseholds > 0 ? result.apartments.totalHouseholds.toLocaleString() : "-"}
                      <span className="text-xs font-normal text-slate-500"> 세대</span>
                    </p>
                    <p className="text-[9px] text-slate-400 mt-0.5">카카오</p>
                  </div>
                  {/* 음식점 */}
                  <div className="pr-3 pt-3 border-t border-slate-100">
                    <p className="text-[10px] uppercase tracking-widest text-slate-400 font-medium">음식점</p>
                    <p className="text-xl font-bold text-slate-900 mt-0.5">
                      {result.estimate.restaurantCount.toLocaleString()}
                      <span className="text-xs font-normal text-slate-500"> 개</span>
                    </p>
                    <p className="text-[9px] text-slate-400 mt-0.5">
                      {result.dataQuality?.sources.restaurant === "soho" ? "소상공인DB" : "카카오"}
                    </p>
                  </div>
                  {/* 병원 */}
                  <div className="px-3 pt-3 border-t border-slate-100">
                    <p className="text-[10px] uppercase tracking-widest text-slate-400 font-medium">
                      {pharmacyMode ? "병원/의원" : "버스정류장"}
                    </p>
                    <p className="text-xl font-bold text-slate-900 mt-0.5">
                      {pharmacyMode && result.pharmacyEstimate
                        ? result.pharmacyEstimate.hospitalCount.toLocaleString()
                        : result.estimate.busStopCount.toLocaleString()}
                      <span className="text-xs font-normal text-slate-500"> 개</span>
                    </p>
                    <p className="text-[9px] text-slate-400 mt-0.5">소상공인DB</p>
                  </div>
                  {/* 주차장 */}
                  <div className="pl-3 pt-3 border-t border-slate-100">
                    <p className="text-[10px] uppercase tracking-widest text-slate-400 font-medium">주차장</p>
                    <p className="text-xl font-bold text-slate-900 mt-0.5">
                      {result.estimate.parkingCount.toLocaleString()}
                      <span className="text-xs font-normal text-slate-500"> 개</span>
                    </p>
                    <p className="text-[9px] text-slate-400 mt-0.5">카카오</p>
                  </div>
                </div>
              </div>
              </>)}

              {/* ─ TAB 1: 상권 ─ */}
              {activeTab === 1 && (<>
              {/* ── 3. 상권 현황 테이블 ── */}
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-0">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">상권 현황</p>
                  <div className="flex items-center gap-2">
                    {result.dataQuality && (
                      <span className={clsx("px-2 py-0.5 text-[10px] font-bold border", {
                        "border-slate-300 text-slate-600": result.dataQuality.confidence === "high",
                        "border-amber-300 text-amber-600": result.dataQuality.confidence === "medium",
                        "border-red-300 text-red-500": result.dataQuality.confidence === "low",
                      })}>
                        {result.dataQuality.confidence === "high" ? "실측" : "추정"}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400">
                      분석면적 {result.estimate.density?.areaKm2 ?? "-"} km²
                    </span>
                  </div>
                </div>

                {/* 약국 모드: 병원/경쟁약국/주차/편의점/버스 */}
                {pharmacyMode && result.pharmacyEstimate ? (
                  <table className="w-full text-xs mt-0">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left py-2 text-[10px] uppercase tracking-widest text-slate-400 font-medium">업종</th>
                        <th className="text-right py-2 text-[10px] uppercase tracking-widest text-slate-400 font-medium">점포수</th>
                        <th className="text-right py-2 text-[10px] uppercase tracking-widest text-slate-400 font-medium">출처</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[
                        { label: "병원/의원",  value: result.pharmacyEstimate.hospitalCount,           src: "소상공인DB" },
                        { label: "경쟁 약국",  value: result.pharmacyEstimate.pharmacyCompetitorCount, src: "소상공인DB" },
                        { label: "주차장",     value: result.estimate.parkingCount,                   src: "카카오" },
                        { label: "편의점",     value: result.estimate.convStoreCount,                 src: "카카오" },
                        { label: "버스정류장", value: result.estimate.busStopCount,                   src: result.busStopSource === "fallback" ? "카카오(미등록)" : "카카오" },
                      ].map(({ label, value, src }) => (
                        <tr key={label}>
                          <td className="py-2 text-slate-700">{label}</td>
                          <td className="py-2 text-right font-bold text-slate-900">{value.toLocaleString()}개</td>
                          <td className="py-2 text-right text-[10px] text-slate-400">{src}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <>
                    {/* 일반 모드: 밀도 배율 테이블 */}
                    {result.estimate.density && (
                      <table className="w-full text-xs mt-0">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className="text-left py-2 text-[10px] uppercase tracking-widest text-slate-400 font-medium">업종</th>
                            <th className="text-right py-2 text-[10px] uppercase tracking-widest text-slate-400 font-medium">점포수</th>
                            <th className="text-right py-2 text-[10px] uppercase tracking-widest text-slate-400 font-medium">밀도</th>
                            <th className="text-right py-2 text-[10px] uppercase tracking-widest text-slate-400 font-medium hidden sm:table-cell">전국비</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {[
                            {
                              label: "음식점", value: result.estimate.restaurantCount,
                              density: result.estimate.density.restaurantPer1km2,
                              ratio: result.estimate.density.restaurantRatio,
                              base: 50,
                            },
                            {
                              label: "카페", value: result.estimate.cafeCount,
                              density: result.estimate.density.cafePer1km2,
                              ratio: result.estimate.density.cafeRatio,
                              base: 20,
                            },
                            {
                              label: "편의점", value: result.estimate.convStoreCount,
                              density: result.estimate.density.convPer1km2,
                              ratio: result.estimate.density.convRatio,
                              base: 7,
                            },
                          ].map(({ label, value, density, ratio, base }) => (
                            <tr key={label}>
                              <td className="py-2 text-slate-700">{label}</td>
                              <td className="py-2 text-right font-bold text-slate-900">{value.toLocaleString()}개</td>
                              <td className="py-2 text-right text-slate-500">
                                <div className="flex items-center justify-end gap-1.5">
                                  <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                                    <div
                                      className="h-1 rounded-full bg-blue-600"
                                      style={{ width: `${Math.min(ratio * 100, 100)}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px]">{density}/{base}/km²</span>
                                </div>
                              </td>
                              <td className={clsx(
                                "py-2 text-right font-bold text-xs hidden sm:table-cell",
                                ratio >= 1.5 ? "text-orange-600" : ratio >= 1.0 ? "text-blue-600" : "text-slate-400"
                              )}>
                                {ratio.toFixed(1)}×
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {/* 업종 분포 미니 차트 */}
                    {commerceChartData.some((d) => d.value > 0) && (
                      <div className="mt-2 border-t border-slate-100 pt-3">
                        <ResponsiveContainer width="100%" height={72}>
                          <BarChart data={commerceChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                            <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
                            <Tooltip
                              formatter={(v: any) => [`${v}개`, "시설 수"]}
                              contentStyle={{ fontSize: 11, border: "1px solid #e2e8f0", borderRadius: 4 }}
                            />
                            <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                              {commerceChartData.map((entry, i) => (
                                <Cell key={i} fill={entry.fill} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </>
                )}
                <p className="text-[10px] text-slate-400 mt-3 pt-2 border-t border-slate-100">
                  출처: 소상공인진흥공단 상가정보DB &middot; 카카오 Local API
                </p>
              </div>
              </>)}

              {/* ─ TAB 2: 인구·연령 ─ */}
              {activeTab === 2 && (<>
              {/* ── 4. 연령별 거주인구 ── */}
              {result.agePopulation && (
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">연령별 거주인구</p>
                    <span className="text-[10px] text-slate-400">{result.agePopulation.adm_nm}</span>
                  </div>

                  {/* 약국 모드: 30-40대 vs 50-60대 강조 */}
                  {pharmacyMode && (
                    <div className="grid grid-cols-2 divide-x divide-slate-100 mb-4">
                      <div className="pr-3">
                        <p className="text-[10px] uppercase tracking-widest text-slate-400 font-medium">30–40대 (육아세대)</p>
                        <p className="text-xl font-bold text-slate-900 mt-0.5">
                          {result.agePopulation.youngFamily.toLocaleString()}
                          <span className="text-xs font-normal text-slate-400"> 명</span>
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{result.agePopulation.youngFamilyRatio}% · 저마진 자발적 구매</p>
                      </div>
                      <div className="pl-3">
                        <p className="text-[10px] uppercase tracking-widest text-slate-400 font-medium">50–60대 (만성질환)</p>
                        <p className="text-xl font-bold text-slate-900 mt-0.5">
                          {result.agePopulation.chronicPatient.toLocaleString()}
                          <span className="text-xs font-normal text-slate-400"> 명</span>
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{result.agePopulation.chronicPatientRatio}% · 고마진 처방 수요</p>
                      </div>
                    </div>
                  )}

                  {/* 연령대별 단색 바 차트 */}
                  {(() => {
                    const maxVal = Math.max(
                      result.agePopulation.age20s,
                      result.agePopulation.age30s,
                      result.agePopulation.age40s,
                      result.agePopulation.age50s,
                      result.agePopulation.age60s,
                    );
                    const ageRows = [
                      { label: "20대", value: result.agePopulation.age20s },
                      { label: "30대", value: result.agePopulation.age30s },
                      { label: "40대", value: result.agePopulation.age40s },
                      { label: "50대", value: result.agePopulation.age50s },
                      { label: "60대", value: result.agePopulation.age60s },
                    ];
                    const maxRow = ageRows.reduce((a, b) => (b.value > a.value ? b : a), ageRows[0]);
                    return (
                      <div className="space-y-2">
                        {ageRows.map(({ label, value }) => {
                          const pct = result.agePopulation!.total > 0
                            ? Math.round((value / result.agePopulation!.total) * 100)
                            : 0;
                          const isMax = label === maxRow.label;
                          return (
                            <div key={label} className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-400 w-7 shrink-0">{label}</span>
                              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={clsx("h-1.5 rounded-full transition-all duration-500", isMax ? "bg-blue-600" : "bg-slate-700")}
                                  style={{ width: maxVal > 0 ? `${(value / maxVal) * 100}%` : "0%" }}
                                />
                              </div>
                              <span className="text-[10px] text-slate-500 w-10 text-right shrink-0 font-medium tabular-nums">
                                {pct}%
                              </span>
                              <span className="text-[10px] text-slate-400 w-16 shrink-0 tabular-nums">
                                {value.toLocaleString()}명
                              </span>
                              {isMax && (
                                <span className="text-[9px] text-blue-600 font-bold shrink-0">MAX</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  <p className="text-[10px] text-slate-400 mt-3 pt-2 border-t border-slate-100">
                    출처: 통계청 인구주택총조사 2020
                  </p>
                </div>
              )}

              {/* ── 6. 주변 아파트 단지 ── */}
              {result.apartments && result.apartments.totalHouseholds > 0 && (
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-0">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">주변 아파트 단지</p>
                    <span className="text-[10px] font-bold text-slate-700">
                      총 {result.apartments.totalHouseholds.toLocaleString()}세대
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {result.apartments.complexes.map((apt, i) => (
                      <div key={i} className="flex items-center justify-between py-2">
                        <span className="text-xs text-slate-700 truncate">{apt.name}</span>
                        <span className="text-[10px] font-medium text-slate-400 ml-2 shrink-0 tabular-nums">{apt.distance}m</span>
                      </div>
                    ))}
                  </div>
                  {result.apartments.totalCount > 5 && (
                    <p className="text-[10px] text-slate-400 pt-2 border-t border-slate-100 text-center">
                      외 {result.apartments.totalCount - 5}개 단지
                    </p>
                  )}
                  <p className="text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
                    출처: 카카오 Local API
                  </p>
                </div>
              )}
              </>)}

              {/* ─ TAB 3: 교통·접근성 ─ */}
              {activeTab === 3 && (<>
              {/* ── 5. 교통량 이력 차트 ── */}
              {result.trafficHistory && result.trafficHistory.dataPoints === 0 && (
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-2 mb-3">
                    교통량 이력
                  </p>
                  <p className="text-xs text-slate-400">
                    수집된 이력 데이터가 없습니다.{" "}
                    <code className="bg-slate-100 px-1 rounded text-[10px]">npm run collect</code> 실행 후 1시간 뒤 확인하세요.
                  </p>
                </div>
              )}
              {result.trafficHistory && result.trafficHistory.dataPoints > 0 && (
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">교통량 이력 (최근 7일)</p>
                    <span className="text-[10px] text-slate-400">
                      {result.trafficHistory.stationName} &middot; {result.trafficHistory.distanceKm}km
                    </span>
                  </div>
                  {result.trafficHistory.avgScore !== null && (
                    <p className="text-[10px] text-slate-400 mb-3">
                      주간 평균 교통량 지수{" "}
                      <span className="font-bold text-slate-700">{result.trafficHistory.avgScore}점</span>
                    </p>
                  )}
                  <ResponsiveContainer width="100%" height={110}>
                    <BarChart data={result.trafficHistory.hourlyAvg} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} interval={3} />
                      <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} domain={[0, 100]} />
                      <Tooltip
                        formatter={(v: any) => [`${Number(v)}점`, "교통량 지수"]}
                        labelFormatter={(l) => `${l}대 평균`}
                        contentStyle={{ fontSize: 11, border: "1px solid #e2e8f0", borderRadius: 4 }}
                      />
                      <Bar dataKey="score" radius={[2, 2, 0, 0]}>
                        {result.trafficHistory.hourlyAvg.map((entry, i) => (
                          <Cell key={i} fill={BAR_COLOR(entry.score)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* ── 7. 인근 버스 정류장 ── */}
              {result.nearby.busStops.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-2 mb-0">
                    인근 버스 정류장
                  </p>
                  <div className="divide-y divide-slate-100">
                    {result.nearby.busStops.map((stop, i) => (
                      <div key={i} className="flex items-center justify-between py-2">
                        <span className="text-xs text-slate-700">{stop.name}</span>
                        <span className="text-[10px] font-medium text-slate-400 tabular-nums">{stop.distance}m</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
                    출처: 카카오 Local API
                  </p>
                </div>
              )}
              {/* ── 8. 차량 도로 접근성 (T맵) ── */}
              {result.roadTraffic && (
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">차량 도로 접근성</p>
                    <span className={clsx(
                      "px-2 py-0.5 text-[10px] font-bold rounded border",
                      result.roadTraffic.congestionLevel === 1 ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                      result.roadTraffic.congestionLevel === 2 ? "bg-blue-50 text-blue-700 border-blue-200" :
                      result.roadTraffic.congestionLevel === 3 ? "bg-orange-50 text-orange-700 border-orange-200" :
                      "bg-red-50 text-red-700 border-red-200"
                    )}>
                      {result.roadTraffic.congestionLabel}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="text-center">
                      <p className="text-lg font-bold text-slate-800 tabular-nums">{result.roadTraffic.avgSpeed}</p>
                      <p className="text-[10px] text-slate-400">평균속도 km/h</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-slate-800 tabular-nums">{result.roadTraffic.majorRoadCount}</p>
                      <p className="text-[10px] text-slate-400">주요도로 수</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-slate-800 tabular-nums">{result.roadTraffic.score}</p>
                      <p className="text-[10px] text-slate-400">접근성 점수</p>
                    </div>
                  </div>
                  {result.roadTraffic.roadNames.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {result.roadTraffic.roadNames.map((name, i) => (
                        <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] rounded">{name}</span>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400 pt-2 border-t border-slate-100">
                    출처: T맵 교통정보 API · 실시간
                  </p>
                </div>
              )}

              {/* ── 9. 차량 상권 반경 (경로 매트릭스) ── */}
              {result.carAccessibility && (
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-2 mb-3">
                    차량 상권 반경
                  </p>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="text-center">
                      <p className="text-lg font-bold text-slate-800 tabular-nums">{result.carAccessibility.avgDriveMinutes}분</p>
                      <p className="text-[10px] text-slate-400">평균 이동시간</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-blue-600 tabular-nums">{result.carAccessibility.within10min}</p>
                      <p className="text-[10px] text-slate-400">10분내 단지</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-slate-800 tabular-nums">{result.carAccessibility.within15min}</p>
                      <p className="text-[10px] text-slate-400">15분내 단지</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 pt-2 border-t border-slate-100">
                    출처: {result.carAccessibility.source === "tmap" ? "T맵 경로 매트릭스" : "직선거리 근사값 (T맵 한도 초과)"} · 아파트 {result.carAccessibility.totalOrigins}곳 기준
                  </p>
                </div>
              )}
              </>)}
            </div>
          )}

          {!result && !loading && !error && (
            <div className="bg-slate-50 rounded-lg border-2 border-dashed border-slate-200 p-8 text-center text-slate-400">
              <TrendingUp size={28} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm">지도를 클릭하거나<br />주소를 입력해 분석을 시작하세요</p>
              {stations.length > 0 && (
                <p className="text-xs mt-2 text-blue-400">지도의 파란 마커를 클릭해도 됩니다</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
