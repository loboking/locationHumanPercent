"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { Search, MapPin, TrendingUp, Bus, Utensils, Coffee, ShoppingBag, Loader2 } from "lucide-react";
import clsx from "clsx";

declare global { interface Window { kakao: any } }

interface EstimateResult {
  address: string;
  coordinates: { lat: number; lng: number };
  estimate: {
    score: number;
    grade: string;
    busStopCount: number;
    restaurantCount: number;
    cafeCount: number;
    convStoreCount: number;
    detail: { transitScore: number; commerceScore: number };
  };
  nearby: {
    busStops: { name: string; distance: number }[];
    restaurants: number;
    cafes: number;
    convStores: number;
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

export default function FootTrafficAnalyzer() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EstimateResult | null>(null);
  const [error, setError] = useState("");

  const analyze = async (lat?: number, lng?: number, addr?: string) => {
    setLoading(true);
    setError("");
    try {
      const params = addr
        ? `address=${encodeURIComponent(addr)}`
        : `lat=${lat}&lng=${lng}`;
      const res = await fetch(`/api/foot-traffic?${params}`);
      if (!res.ok) {
        const e = await res.json();
        setError(e.error ?? "오류 발생");
        return;
      }
      const data: EstimateResult = await res.json();
      setResult(data);

      // 지도 마커 이동
      if (mapInstance.current && window.kakao?.maps) {
        const pos = new window.kakao.maps.LatLng(data.coordinates.lat, data.coordinates.lng);
        if (markerRef.current) markerRef.current.setPosition(pos);
        else markerRef.current = new window.kakao.maps.Marker({ position: pos, map: mapInstance.current });
        mapInstance.current.panTo(pos);
      }
    } finally {
      setLoading(false);
    }
  };

  const initMap = () => {
    if (!mapRef.current || !window.kakao?.maps) return;
    window.kakao.maps.load(() => {
      const map = new window.kakao.maps.Map(mapRef.current, {
        center: new window.kakao.maps.LatLng(37.03, 127.07),
        level: 7,
      });
      mapInstance.current = map;

      // 지도 클릭 이벤트
      window.kakao.maps.event.addListener(map, "click", (e: any) => {
        const lat = e.latLng.getLat();
        const lng = e.latLng.getLng();
        analyze(lat, lng);
      });
    });
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">유동인구 추정 분석</h2>
        <p className="text-gray-500 mt-1">지도를 클릭하거나 주소를 입력하면 해당 위치의 유동인구를 추정합니다</p>
      </div>

      {/* 주소 검색 */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && analyze(undefined, undefined, address)}
            placeholder="예: 경기도 평택시 고덕동 1234"
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={() => analyze(undefined, undefined, address)}
          disabled={loading || !address}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          분석
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 지도 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 text-sm text-gray-500">
            지도를 클릭하면 해당 위치를 분석합니다
          </div>
          <Script
            src={`//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_KEY}&autoload=false`}
            strategy="afterInteractive"
            onLoad={initMap}
          />
          <div ref={mapRef} className="w-full h-[400px]" />
        </div>

        {/* 결과 */}
        <div className="space-y-4">
          {loading && (
            <div className="bg-white rounded-xl border border-gray-200 p-8 flex items-center justify-center gap-3 text-gray-400">
              <Loader2 size={20} className="animate-spin" />
              반경 500m 데이터 분석 중...
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
                    <p className="font-semibold text-gray-900 mt-0.5">{result.address}</p>
                  </div>
                  <span className={clsx("px-3 py-1 rounded-full text-sm font-bold", GRADE_STYLE[result.estimate.grade])}>
                    {result.estimate.grade}
                  </span>
                </div>

                <div className="mt-4">
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-medium text-gray-700">유동인구 추정 점수</span>
                    <span className="font-bold text-gray-900">{result.estimate.score} / 100</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={clsx("h-3 rounded-full transition-all duration-700", SCORE_BAR(result.estimate.score))}
                      style={{ width: `${result.estimate.score}%` }}
                    />
                  </div>
                </div>

                {/* 세부 점수 */}
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="bg-blue-50 rounded-lg p-3">
                    <p className="text-xs text-blue-600 font-medium">교통 접근성</p>
                    <p className="text-xl font-bold text-blue-700 mt-0.5">{result.estimate.detail.transitScore}<span className="text-xs font-normal text-blue-400"> / 40</span></p>
                  </div>
                  <div className="bg-violet-50 rounded-lg p-3">
                    <p className="text-xs text-violet-600 font-medium">상권 활성도</p>
                    <p className="text-xl font-bold text-violet-700 mt-0.5">{result.estimate.detail.commerceScore}<span className="text-xs font-normal text-violet-400"> / 60</span></p>
                  </div>
                </div>
              </div>

              {/* 주변 데이터 */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-sm font-semibold text-gray-700 mb-3">반경 500m 내 시설 현황</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { icon: Bus, label: "버스 정류장", value: result.estimate.busStopCount, unit: "개", color: "text-blue-600 bg-blue-50" },
                    { icon: Utensils, label: "음식점", value: result.estimate.restaurantCount, unit: "개", color: "text-orange-600 bg-orange-50" },
                    { icon: Coffee, label: "카페", value: result.estimate.cafeCount, unit: "개", color: "text-amber-600 bg-amber-50" },
                    { icon: ShoppingBag, label: "편의점", value: result.estimate.convStoreCount, unit: "개", color: "text-emerald-600 bg-emerald-50" },
                  ].map(({ icon: Icon, label, value, unit, color }) => (
                    <div key={label} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                      <div className={clsx("p-1.5 rounded-lg", color.split(" ")[1])}>
                        <Icon size={16} className={color.split(" ")[0]} />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">{label}</p>
                        <p className="font-bold text-gray-900">{value}{unit}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 주변 버스정류장 */}
              {result.nearby.busStops.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-sm font-semibold text-gray-700 mb-3">인근 버스 정류장</p>
                  <div className="space-y-2">
                    {result.nearby.busStops.map((stop, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-gray-700">{stop.name}</span>
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
