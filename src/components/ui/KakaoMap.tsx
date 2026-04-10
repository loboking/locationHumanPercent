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

interface KakaoMapProps {
  center?: { lat: number; lng: number };
  level?: number;
  markers?: Marker[];
  className?: string;
}

export default function KakaoMap({
  center = { lat: 37.0147, lng: 127.0634 }, // 고덕동 기본값
  level = 7,
  markers = [],
  className = "w-full h-[400px]",
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
    });
  };

  useEffect(() => {
    // 이미 SDK 로드된 경우 바로 초기화
    if (window.kakao?.maps) {
      initMap();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center, markers]);

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
