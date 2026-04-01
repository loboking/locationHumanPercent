"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Key, BarChart2, MapPin, Bus, History, Settings } from "lucide-react";
import clsx from "clsx";

const NAV_ITEMS = [
  { href: "/", label: "대시보드", icon: LayoutDashboard },
  { href: "/api-guide", label: "API 신청 가이드", icon: Key },
  { href: "/analytics/foottraffic", label: "유동인구 추정", icon: BarChart2 },
  { href: "/analytics/commerce", label: "상권 매출 분석", icon: MapPin },
  { href: "/analytics/transport", label: "실시간 교통", icon: Bus },
  { href: "/analytics/bus-history", label: "교통량 이력", icon: History },
  { href: "/settings", label: "설정", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 min-h-screen bg-gray-900 text-white flex flex-col">
      <div className="p-6 border-b border-gray-700">
        <h1 className="text-lg font-bold text-white">평택 부동산 인사이트</h1>
        <p className="text-xs text-gray-400 mt-1">SaaS Analytics Platform</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
              pathname === href
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:bg-gray-800 hover:text-white"
            )}
          >
            <Icon size={18} />
            {label}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-700">
        <div className="bg-gray-800 rounded-lg p-3">
          <p className="text-xs text-gray-400">수집 중</p>
          <div className="mt-2 h-1.5 bg-gray-700 rounded-full">
            <div className="h-1.5 bg-emerald-500 rounded-full w-3/5" />
          </div>
          <p className="text-xs text-gray-500 mt-1">버스 데이터 실시간 수집 중</p>
        </div>
      </div>
    </aside>
  );
}
