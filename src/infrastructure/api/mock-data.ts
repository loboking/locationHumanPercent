// Infrastructure Layer: Mock 데이터 (실제 API 연동 전 개발용)

import { FootTrafficData, CommerceData, BusStopData, PropertyInsight } from "@/domain/types";

// 고덕신도시 입주 추이 반영 추정치 (2024~2025)
// 실제 고덕동 등록인구: 2023년 약 4.2만명 → 2024년 약 5.5만명 → 2025년 약 7만명 예상
export const MOCK_FOOT_TRAFFIC: FootTrafficData[] = [
  { areaCode: "4180025000", areaName: "고덕동", date: "2024-01", totalCount: 42000, maleCount: 21000, femaleCount: 21000, age20s: 7000, age30s: 14000, age40s: 13000, age50s: 6000, weekday: "평일" },
  { areaCode: "4180025000", areaName: "고덕동", date: "2024-03", totalCount: 46000, maleCount: 23000, femaleCount: 23000, age20s: 8000, age30s: 15000, age40s: 14000, age50s: 7000, weekday: "평일" },
  { areaCode: "4180025000", areaName: "고덕동", date: "2024-06", totalCount: 51000, maleCount: 26000, femaleCount: 25000, age20s: 9000, age30s: 17000, age40s: 15000, age50s: 8000, weekday: "평일" },
  { areaCode: "4180025000", areaName: "고덕동", date: "2024-09", totalCount: 56000, maleCount: 28000, femaleCount: 28000, age20s: 10000, age30s: 19000, age40s: 16000, age50s: 8000, weekday: "평일" },
  { areaCode: "4180025000", areaName: "고덕동", date: "2024-12", totalCount: 61000, maleCount: 31000, femaleCount: 30000, age20s: 11000, age30s: 21000, age40s: 17000, age50s: 9000, weekday: "평일" },
  { areaCode: "4180025000", areaName: "고덕동", date: "2025-01", totalCount: 63000, maleCount: 32000, femaleCount: 31000, age20s: 11000, age30s: 22000, age40s: 18000, age50s: 9000, weekday: "평일" },
  { areaCode: "4180025000", areaName: "고덕동", date: "2025-02", totalCount: 65000, maleCount: 33000, femaleCount: 32000, age20s: 12000, age30s: 22000, age40s: 18000, age50s: 9000, weekday: "평일" },
  { areaCode: "4180025000", areaName: "고덕동", date: "2025-03", totalCount: 68000, maleCount: 34000, femaleCount: 34000, age20s: 12000, age30s: 23000, age40s: 19000, age50s: 10000, weekday: "평일" },
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
