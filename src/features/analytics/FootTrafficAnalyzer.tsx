"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Script from "next/script";
import {
  Search, MapPin, TrendingUp, Bus, Utensils, Coffee, ShoppingBag,
  Loader2, Home, BarChart2, Building2, Plus, Trash2, Settings, X
} from "lucide-react";
import clsx from "clsx";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from "recharts";
import { MOCK_COMMERCE } from "@/infrastructure/api/mock-data";

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

interface EstimateResult {
  address: string;
  coordinates: { lat: number; lng: number };
  radius: number;
  isochrone: { polygon: [number, number][]; areaM2: number; mode: string; minutes: number } | null;
  busStopSource: "kakao" | "fallback";
  estimate: {
    score: number;
    grade: string;
    busStopCount: number;
    restaurantCount: number;
    cafeCount: number;
    convStoreCount: number;
    totalHouseholds: number;
    detail: { transitScore: number; commerceScore: number; residentialScore: number };
  };
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
}

const GRADE_STYLE: Record<string, string> = {
  매우높음: "bg-red-500 text-white",
  높음: "bg-orange-500 text-white",
  보통: "bg-yellow-500 text-white",
  낮음: "bg-gray-400 text-white",
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
  const [newStation, setNewStation] = useState({ name: "", lat: "", lng: "" });

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

  // 이소크론 옵션 변경 시 자동 재분석
  useEffect(() => {
    if (lastAnalyzedPos.current && mapInstance.current) {
      analyze(lastAnalyzedPos.current.lat, lastAnalyzedPos.current.lng);
    }
  }, [isoOption]); // eslint-disable-line react-hooks/exhaustive-deps

  // 스테이션 마커
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
      div.addEventListener("click", () => { analyze(station.lat!, station.lng!); });
      div.addEventListener("mouseenter", () => { div.style.background = "#1e40af"; });
      div.addEventListener("mouseleave", () => { div.style.background = "#1d4ed8"; });

      const overlay = new window.kakao.maps.CustomOverlay({
        position: pos, content: div, yAnchor: 1.5, zIndex: 3,
      });
      overlay.setMap(mapInstance.current);
      stationMarkersRef.current.push(overlay);
    });
  }, [analyze]);

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
        analyze(e.latLng.getLat(), e.latLng.getLng());
      });
      if (stationsRef.current.length > 0) addStationMarkers(stationsRef.current);
    });
  }, [analyze, addStationMarkers]);

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
    <div className="p-4 md:p-8 space-y-4 md:space-y-6">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-gray-900">유동인구 추정 분석</h2>
        <p className="text-gray-500 mt-1 text-sm">지도를 클릭하거나 주소를 입력 · 버스정류장 마커를 클릭해 분석합니다</p>
      </div>

      {/* 주소 검색 + 반경 선택 */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && analyze(undefined, undefined, address)}
              placeholder="예: 평택시 고덕동 1234"
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={() => analyze(undefined, undefined, address)}
            disabled={loading || !address}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 shrink-0"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            <span className="hidden sm:inline">분석</span>
          </button>
          <button
            onClick={() => setShowStationMgr((v) => !v)}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors shrink-0",
              showStationMgr ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white border-gray-200 text-gray-600 hover:border-blue-300"
            )}
          >
            <Settings size={14} />
            <span className="hidden sm:inline">정류장</span>
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500">이동 기준</span>
          {ISOCHRONE_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              onClick={() => setIsoOption(opt)}
              className={clsx(
                "px-3 py-1 rounded-full text-xs font-semibold border transition-colors",
                isoOption.label === opt.label
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
              )}
            >
              {opt.label}
            </button>
          ))}
          <span className="text-xs text-gray-400">· 실제 도로망 기준</span>
        </div>
      </div>

      {/* 정류장 관리 패널 */}
      {showStationMgr && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <Bus size={14} className="text-blue-600" />
              모니터링 정류장 관리
            </p>
            <button onClick={() => setShowStationMgr(false)}>
              <X size={14} className="text-gray-400 hover:text-gray-600" />
            </button>
          </div>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {stations.map((s) => (
              <div key={s.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                <span className="text-gray-800 truncate">{s.name} <span className="text-xs text-gray-400">({s.area})</span></span>
                <button
                  onClick={() => handleDeleteStation(s.id)}
                  className="text-red-400 hover:text-red-600 ml-2 shrink-0"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs text-gray-500 mb-2">새 정류장 추가</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                placeholder="이름"
                value={newStation.name}
                onChange={(e) => setNewStation((v) => ({ ...v, name: e.target.value }))}
                className="flex-1 min-w-0 border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <div className="flex gap-2">
                <input
                  placeholder="위도(lat)"
                  value={newStation.lat}
                  onChange={(e) => setNewStation((v) => ({ ...v, lat: e.target.value }))}
                  className="flex-1 min-w-0 border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <input
                  placeholder="경도(lng)"
                  value={newStation.lng}
                  onChange={(e) => setNewStation((v) => ({ ...v, lng: e.target.value }))}
                  className="flex-1 min-w-0 border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <button
                  onClick={handleAddStation}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 shrink-0"
                >
                  <Plus size={12} />
                  추가
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* 지도 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 text-xs text-gray-500 flex flex-wrap items-center gap-1.5">
            <span>지도 클릭 또는 🚌 파란 마커 클릭 → 분석</span>
            <span className="text-orange-500">🚏 주황=버스정류장</span>
          </div>
          <Script
            src={`//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_KEY}&autoload=false`}
            strategy="afterInteractive"
            onLoad={initMap}
          />
          <div ref={mapRef} className="w-full" style={{ height: "clamp(280px, 45vw, 520px)" }} />
        </div>

        {/* 결과 */}
        <div suppressHydrationWarning className="space-y-4 overflow-y-auto pr-0.5" style={{ maxHeight: "clamp(400px, 80vh, 760px)" }}>
          {loading && (
            <div className="bg-white rounded-xl border border-gray-200 p-8 flex items-center justify-center gap-3 text-gray-400">
              <Loader2 size={20} className="animate-spin" />
              도로망 이소크론 분석 중...
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">{error}</div>
          )}

          {result && !loading && (
            <>
              {/* 주소 + 종합점수 */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-gray-400">분석 위치</p>
                    <p className="font-semibold text-gray-900 mt-0.5 text-sm">{result.address}</p>
                  </div>
                  <span className={clsx("px-3 py-1 rounded-full text-sm font-bold shrink-0 ml-2", GRADE_STYLE[result.estimate.grade])}>
                    {result.estimate.grade}
                  </span>
                </div>

                <div className="mt-3">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-700">유동인구 추정 점수</span>
                    <span className="font-bold text-gray-900">{result.estimate.score} / 100</span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={clsx("h-2.5 rounded-full transition-all duration-700", SCORE_BAR(result.estimate.score))}
                      style={{ width: `${result.estimate.score}%` }}
                    />
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="bg-blue-50 rounded-lg p-2.5">
                    <p className="text-xs text-blue-600 font-medium">교통 접근성</p>
                    <p className="text-base font-bold text-blue-700 mt-0.5">
                      {result.estimate.detail.transitScore}
                      <span className="text-xs font-normal text-blue-400"> / 25</span>
                    </p>
                  </div>
                  <div className="bg-violet-50 rounded-lg p-2.5">
                    <p className="text-xs text-violet-600 font-medium">상권 활성도</p>
                    <p className="text-base font-bold text-violet-700 mt-0.5">
                      {result.estimate.detail.commerceScore}
                      <span className="text-xs font-normal text-violet-400"> / 45</span>
                    </p>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-2.5">
                    <p className="text-xs text-emerald-600 font-medium">주거 밀도</p>
                    <p className="text-base font-bold text-emerald-700 mt-0.5">
                      {result.estimate.detail.residentialScore}
                      <span className="text-xs font-normal text-emerald-400"> / 30</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* 상권 매출 분석 (Kakao 시설 수 + MOCK 매출 추정) */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Building2 size={15} className="text-violet-500" />
                    <p className="text-sm font-semibold text-gray-700">상권 분석</p>
                  </div>
                  {result.isochrone ? (
                    <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                      {result.isochrone.mode === "car" ? "🚗" : "🚶"} {result.isochrone.minutes}분 · {(result.isochrone.areaM2 / 1000000).toFixed(2)}km²
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">반경 {result.radius}m</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {[
                    { icon: Bus, label: "버스 정류장", value: result.estimate.busStopCount, color: "text-blue-600 bg-blue-50", noKakao: result.busStopSource === "fallback", badge: null },
                    { icon: Utensils, label: "음식점", value: result.estimate.restaurantCount, color: "text-orange-600 bg-orange-50", noKakao: false, badge: result.nearby.restaurantSource === "soho" ? "소상공인DB" : null },
                    { icon: Coffee, label: "카페", value: result.estimate.cafeCount, color: "text-amber-600 bg-amber-50", noKakao: false, badge: null },
                    { icon: ShoppingBag, label: "편의점", value: result.estimate.convStoreCount, color: "text-emerald-600 bg-emerald-50", noKakao: false, badge: null },
                  ].map(({ icon: Icon, label, value, color, noKakao, badge }) => (
                    <div key={label} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2.5">
                      <div className={clsx("p-1 rounded-lg", color.split(" ")[1])}>
                        <Icon size={14} className={color.split(" ")[0]} />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">{label}</p>
                        <p className="font-bold text-gray-900 text-sm">{value}개</p>
                        {badge && (
                          <p className="text-xs text-emerald-600 font-medium mt-0.5">✓ {badge}</p>
                        )}
                        {noKakao && (
                          <p className="text-xs text-amber-500 mt-0.5">카카오 미등록 지역</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {/* 업종 분포 미니 차트 */}
                {commerceChartData.some((d) => d.value > 0) && (
                  <ResponsiveContainer width="100%" height={80}>
                    <BarChart data={commerceChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: any) => [`${v}개`, "시설 수"]} />
                      <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                        {commerceChartData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
                {/* 지역 전체 상권 매출 참고 (MOCK) */}
                <div className="mt-2 border-t border-gray-100 pt-2">
                  <p className="text-xs text-gray-400 mb-1">고덕동 권역 추정 월 매출 (참고)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {MOCK_COMMERCE.map((d) => (
                      <span key={d.category} className="text-xs bg-gray-100 px-2 py-0.5 rounded-full text-gray-600">
                        {d.category} {(d.monthlyRevenue / 1000000).toFixed(0)}백만
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* 교통량 이력 */}
              {result.trafficHistory && result.trafficHistory.dataPoints === 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <BarChart2 size={15} className="text-blue-500" />
                    <p className="text-sm font-semibold text-gray-700">교통량 이력</p>
                    <span className="text-xs text-gray-400">({result.trafficHistory.stationName} · {result.trafficHistory.distanceKm}km)</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    아직 수집된 이력 데이터가 없습니다.<br />
                    <code className="bg-gray-100 px-1 rounded">npm run collect</code> 실행 후 1시간 뒤 확인하세요.
                  </p>
                </div>
              )}
              {result.trafficHistory && result.trafficHistory.dataPoints > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <BarChart2 size={15} className="text-blue-500" />
                      <p className="text-sm font-semibold text-gray-700">교통량 이력 (최근 7일)</p>
                    </div>
                    <span className="text-xs text-gray-400">
                      {result.trafficHistory.stationName} · {result.trafficHistory.distanceKm}km
                    </span>
                  </div>
                  {result.trafficHistory.avgScore !== null && (
                    <p className="text-xs text-gray-500 mb-3">
                      주간 평균 교통량 지수: <span className="font-bold text-gray-800">{result.trafficHistory.avgScore}점</span>
                    </p>
                  )}
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={result.trafficHistory.hourlyAvg} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={3} />
                      <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                      <Tooltip
                        formatter={(v: any) => [`${Number(v)}점`, "교통량 지수"]}
                        labelFormatter={(l) => `${l}대 평균`}
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

              {/* 주변 아파트 단지 */}
              {result.apartments && result.apartments.totalHouseholds > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Home size={15} className="text-emerald-500" />
                      <p className="text-sm font-semibold text-gray-700">주변 아파트 단지</p>
                    </div>
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                      총 {result.apartments.totalHouseholds.toLocaleString()}세대
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {result.apartments.complexes.map((apt, i) => (
                      <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                        <span className="text-sm text-gray-800 truncate">{apt.name}</span>
                        <span className="text-xs font-semibold text-gray-500 ml-2 shrink-0">{apt.distance}m</span>
                      </div>
                    ))}
                    {result.apartments.totalCount > 5 && (
                      <p className="text-xs text-gray-400 text-center pt-1">
                        외 {result.apartments.totalCount - 5}개 단지
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* 인근 버스정류장 목록 */}
              {result.nearby.busStops.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-sm font-semibold text-gray-700 mb-2">인근 버스 정류장</p>
                  <div className="space-y-1.5">
                    {result.nearby.busStops.map((stop, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-gray-700">🚏 {stop.name}</span>
                        <span className="text-gray-400">{stop.distance}m</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {!result && !loading && !error && (
            <div className="bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 p-8 text-center text-gray-400">
              <TrendingUp size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">지도를 클릭하거나<br />주소를 입력해 분석을 시작하세요</p>
              {stations.length > 0 && (
                <p className="text-xs mt-2 text-blue-400">🚌 지도의 파란 마커를 클릭해도 됩니다</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
