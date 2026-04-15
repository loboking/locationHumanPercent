"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kakao: any;
  }
}

interface Marker {
  lat: number;
  lng: number;
  title: string;
  score?: number;
}

interface HeatmapPoint {
  lat: number;
  lng: number;
  weight: number;
}

interface TrafficSegment {
  id: string;
  center: { lat: number; lng: number };
  density: number;
  grade: "높음" | "보통" | "낮음";
  gradeLevel: 3 | 2 | 1;
  label: string;
  source: string;
  details: Record<string, number>;
  radius: number;
}

interface KakaoMapProps {
  center?: { lat: number; lng: number };
  level?: number;
  markers?: Marker[];
  className?: string;
  heatmapPoints?: HeatmapPoint[];
  segments?: TrafficSegment[];
  polygon?: { path: [number, number][]; color?: string; opacity?: number }; // [lng, lat][]
}

export default function KakaoMap({
  center = { lat: 37.0147, lng: 127.0634 }, // 고덕동 기본값
  level = 7,
  markers = [],
  className = "w-full h-[400px]",
  heatmapPoints = [],
  segments = [],
  polygon,
}: KakaoMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);

  const initMap = () => {
    if (!mapRef.current || !window.kakao?.maps) return;

    window.kakao.maps.load(() => {
      const options = {
        center: new window.kakao.maps.LatLng(center.lat, center.lng),
        level,
      };
      const map = new window.kakao.maps.Map(mapRef.current, options);
      mapInstanceRef.current = map;

      // 마커 추가
      markers.forEach(({ lat, lng, title, score }) => {
        const position = new window.kakao.maps.LatLng(lat, lng);
        const marker = new window.kakao.maps.Marker({ position, map });

        const infoContent = `
          <div style="padding:8px 12px;font-size:12px;font-family:sans-serif;min-width:120px;">
            <strong style="font-size:13px;">${title}</strong>
            ${score !== undefined ? `<br/><span style="color:#3b82f6;font-weight:bold;">종합점수: ${score}점</span>` : ""}
          </div>
        `;

        const infowindow = new window.kakao.maps.InfoWindow({
          content: infoContent,
          removable: true,
        });

        window.kakao.maps.event.addListener(marker, "click", () => {
          infowindow.open(map, marker);
        });
      });

      // 폴리곤 렌더링 (동 경계)
      if (polygon && polygon.path.length > 2) {
        const polygonPath = polygon.path.map(
          ([lng, lat]) => new window.kakao.maps.LatLng(lat, lng)
        );
        const dongPolygon = new window.kakao.maps.Polygon({
          path: polygonPath,
          strokeWeight: 2,
          strokeColor: polygon.color ?? "#3b82f6",
          strokeOpacity: 0.8,
          fillColor: polygon.color ?? "#3b82f6",
          fillOpacity: polygon.opacity ?? 0.1,
        });
        dongPolygon.setMap(map);
      }

      // 히트맵 포인트 (Circle 오버레이)
      if (heatmapPoints && heatmapPoints.length > 0) {
        for (const point of heatmapPoints) {
          const circle = new window.kakao.maps.Circle({
            center: new window.kakao.maps.LatLng(point.lat, point.lng),
            radius: 30,
            strokeWeight: 0,
            fillColor:
              point.weight >= 3
                ? "#FF0000"
                : point.weight >= 2
                  ? "#FF8800"
                  : "#FFCC00",
            fillOpacity: 0.35,
          });
          circle.setMap(map);
        }
      }

      // 격자 밀도 세그먼트 (Circle + 클릭 팝업)
      if (segments && segments.length > 0) {
        const overlays: { setMap: (m: unknown) => void }[] = [];

        for (const seg of segments) {
          const position = new window.kakao.maps.LatLng(
            seg.center.lat,
            seg.center.lng,
          );

          // 등급별 색상
          const colors: Record<number, string> = {
            3: "#FF3B30", // 높음 - 빨강
            2: "#FF9500", // 보통 - 주황
            1: "#FFCC00", // 낮음 - 노랑
          };
          const color = colors[seg.gradeLevel] || "#FFCC00";
          const opacity =
            seg.gradeLevel === 3
              ? 0.5
              : seg.gradeLevel === 2
                ? 0.4
                : 0.3;

          // Circle (격자 영역 표시)
          const circle = new window.kakao.maps.Circle({
            center: position,
            radius: seg.radius,
            strokeWeight: 0,
            fillColor: color,
            fillOpacity: opacity,
          });
          circle.setMap(map);

          // 클릭 이벤트 → CustomOverlay 팝업
          window.kakao.maps.event.addListener(circle, "click", () => {
            // 기존 팝업 닫기
            overlays.forEach((o) => o.setMap(null));
            overlays.length = 0;

            const categoryLabels: Record<string, string> = {
              restaurant: "🍽️ 음식점",
              cafe: "☕ 카페",
              convenience: "🏪 편의점",
              hospital: "🏥 병원",
              pharmacy: "💊 약국",
              bus: "🚌 버스",
            };

            const detailsHtml = Object.entries(seg.details)
              .map(
                ([cat, cnt]) =>
                  `${categoryLabels[cat] || cat}: ${cnt}개`,
              )
              .join("<br/>");

            const content = document.createElement("div");
            content.innerHTML = `
              <div style="background:#1a1a1a; color:#fff; padding:10px 14px; border-radius:8px; font-size:13px; line-height:1.6; min-width:180px; box-shadow:0 2px 8px rgba(0,0,0,0.3);">
                <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px;">
                  <span style="width:10px; height:10px; border-radius:50%; background:${color}; display:inline-block;"></span>
                  <strong>${seg.grade}</strong>
                  <span style="color:#888; font-size:11px;">(밀도 ${seg.density})</span>
                </div>
                <div style="color:#ccc; font-size:12px;">
                  ${detailsHtml}
                </div>
                <div style="color:#666; font-size:10px; margin-top:6px; border-top:1px solid #333; padding-top:4px;">
                  ${seg.source === "poi_estimate" ? "POI 밀도 기반 추정" : "실측 데이터"}
                </div>
              </div>
            `;

            const overlay = new window.kakao.maps.CustomOverlay({
              position,
              content: content,
              yAnchor: 1.3,
            });
            overlay.setMap(map);
            overlays.push(overlay);
          });
        }

        // 지도 클릭 시 팝업 닫기
        window.kakao.maps.event.addListener(map, "click", () => {
          overlays.forEach((o) => o.setMap(null));
          overlays.length = 0;
        });
      }
    });
  };

  useEffect(() => {
    // 이미 SDK 로드된 경우 바로 초기화
    if (window.kakao?.maps) {
      initMap();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center, markers, heatmapPoints, segments, polygon]);

  return (
    <>
      <Script
        src={`//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_KEY}&autoload=false`}
        strategy="afterInteractive"
        onLoad={initMap}
      />
      <div ref={mapRef} className={className} />
    </>
  );
}
