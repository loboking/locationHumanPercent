// Infrastructure Layer: Mock 데이터 (실제 API 연동 전 개발용)

import { FootTrafficData, CommerceData, BusStopData, PropertyInsight } from "@/domain/types";

export const MOCK_FOOT_TRAFFIC: FootTrafficData[] = [
  { areaCode: "4180025000", areaName: "고덕동", date: "2024-01", totalCount: 85000, maleCount: 42000, femaleCount: 43000, age20s: 18000, age30s: 22000, age40s: 19000, age50s: 14000, weekday: "평일" },
  { areaCode: "4180025000", areaName: "고덕동", date: "2024-02", totalCount: 92000, maleCount: 46000, femaleCount: 46000, age20s: 20000, age30s: 24000, age40s: 21000, age50s: 15000, weekday: "평일" },
  { areaCode: "4180025000", areaName: "고덕동", date: "2024-03", totalCount: 98000, maleCount: 49000, femaleCount: 49000, age20s: 22000, age30s: 26000, age40s: 22000, age50s: 16000, weekday: "평일" },
  { areaCode: "4180025000", areaName: "고덕동", date: "2024-04", totalCount: 105000, maleCount: 53000, femaleCount: 52000, age20s: 24000, age30s: 28000, age40s: 24000, age50s: 17000, weekday: "평일" },
  { areaCode: "4180025000", areaName: "고덕동", date: "2024-05", totalCount: 112000, maleCount: 56000, femaleCount: 56000, age20s: 26000, age30s: 30000, age40s: 25000, age50s: 18000, weekday: "평일" },
  { areaCode: "4180025000", areaName: "고덕동", date: "2024-06", totalCount: 118000, maleCount: 60000, femaleCount: 58000, age20s: 28000, age30s: 32000, age40s: 26000, age50s: 19000, weekday: "평일" },
];

export const MOCK_COMMERCE: CommerceData[] = [
  { areaCode: "4180025000", areaName: "고덕동", category: "음식점", monthlyRevenue: 450000000, storeCount: 87, avgRevenuePerStore: 5172413, date: "2024-06" },
  { areaCode: "4180025000", areaName: "고덕동", category: "소매업", monthlyRevenue: 320000000, storeCount: 65, avgRevenuePerStore: 4923076, date: "2024-06" },
  { areaCode: "4180025000", areaName: "고덕동", category: "서비스업", monthlyRevenue: 280000000, storeCount: 54, avgRevenuePerStore: 5185185, date: "2024-06" },
  { areaCode: "4180025000", areaName: "고덕동", category: "의료/헬스", monthlyRevenue: 190000000, storeCount: 32, avgRevenuePerStore: 5937500, date: "2024-06" },
  { areaCode: "4180025000", areaName: "고덕동", category: "교육", monthlyRevenue: 150000000, storeCount: 28, avgRevenuePerStore: 5357142, date: "2024-06" },
];

export const MOCK_BUS_STOPS: BusStopData[] = [
  { stopId: "233000375", stopName: "고덕신도시입구", lat: 37.0147, lng: 127.0634, boardingCount: 1250, alightingCount: 980, date: "2024-06" },
  { stopId: "233000376", stopName: "고덕면사무소", lat: 37.0132, lng: 127.0612, boardingCount: 870, alightingCount: 720, date: "2024-06" },
  { stopId: "233000377", stopName: "평택역", lat: 36.9920, lng: 127.0889, boardingCount: 3200, alightingCount: 2980, date: "2024-06" },
];

export const MOCK_PROPERTY_INSIGHTS: PropertyInsight[] = [
  {
    address: "경기도 평택시 고덕동",
    coordinates: { lat: 37.0147, lng: 127.0634 },
    footTrafficScore: 82,
    commerceScore: 75,
    transportScore: 68,
    overallScore: 76,
    trend: "up",
  },
  {
    address: "경기도 평택시 소사동",
    coordinates: { lat: 36.9970, lng: 127.0830 },
    footTrafficScore: 70,
    commerceScore: 65,
    transportScore: 85,
    overallScore: 73,
    trend: "stable",
  },
  {
    address: "경기도 평택시 비전동",
    coordinates: { lat: 37.0650, lng: 127.0720 },
    footTrafficScore: 91,
    commerceScore: 88,
    transportScore: 79,
    overallScore: 87,
    trend: "up",
  },
];
