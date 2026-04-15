"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BarChart2, Bus, History, Settings, Star, Crosshair } from "lucide-react";
import clsx from "clsx";

const NAV_ITEMS = [
  { href: "/", label: "대시보드", icon: LayoutDashboard },
  { href: "/favorites", label: "즐겨찾기", icon: Star },
  { href: "/location-search", label: "입지탐색", icon: Crosshair },
  { href: "/analytics/foottraffic", label: "입지분석", icon: BarChart2 },
  { href: "/analytics/transport", label: "교통", icon: Bus },
  { href: "/settings", label: "설정", icon: Settings },
];

// 데스크탑에서 보여줄 전체 메뉴
const FULL_NAV_ITEMS = [
  { href: "/", label: "대시보드", icon: LayoutDashboard },
  { href: "/favorites", label: "즐겨찾기", icon: Star },
  { href: "/location-search", label: "입지 탐색", icon: Crosshair },
  { href: "/analytics/foottraffic", label: "입지 분석", icon: BarChart2 },
  { href: "/analytics/transport", label: "실시간 교통", icon: Bus },
  { href: "/analytics/bus-history", label: "교통량 이력", icon: History },
  { href: "/settings", label: "설정", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* 데스크탑 사이드바 */}
      <aside className="hidden md:flex w-56 lg:w-64 min-h-screen bg-gray-900 text-white flex-col shrink-0">
        <div className="p-5 lg:p-6 border-b border-gray-700">
          <h1 className="text-base lg:text-lg font-bold text-white">상권분석 인사이트</h1>
          <p className="text-xs text-gray-400 mt-1">Commercial Analytics Platform</p>
        </div>

        <nav className="flex-1 p-3 lg:p-4 space-y-1">
          {FULL_NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-3 px-3 lg:px-4 py-2.5 lg:py-3 rounded-lg text-sm font-medium transition-colors",
                pathname === href
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white"
              )}
            >
              <Icon size={17} />
              <span className="truncate">{label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-3 lg:p-4 border-t border-gray-700">
          <div className="bg-gray-800 rounded-lg p-3">
            <p className="text-xs text-gray-400">수집 중</p>
            <div className="mt-2 h-1.5 bg-gray-700 rounded-full">
              <div className="h-1.5 bg-emerald-500 rounded-full w-3/5" />
            </div>
            <p className="text-xs text-gray-500 mt-1">버스 데이터 실시간 수집 중</p>
          </div>
        </div>
      </aside>

      {/* 모바일 하단 탭바 */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t border-gray-700 flex">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              "flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors min-w-0",
              pathname === href
                ? "text-blue-400"
                : "text-gray-500 hover:text-gray-300"
            )}
          >
            <Icon size={19} />
            <span className="truncate w-full text-center leading-tight">{label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
