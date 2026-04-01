// Domain Layer: 비즈니스 핵심 타입 정의

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface FootTrafficData {
  areaCode: string;
  areaName: string;
  date: string;
  totalCount: number;
  maleCount: number;
  femaleCount: number;
  age20s: number;
  age30s: number;
  age40s: number;
  age50s: number;
  weekday: string;
}

export interface CommerceData {
  areaCode: string;
  areaName: string;
  category: string;
  monthlyRevenue: number;
  storeCount: number;
  avgRevenuePerStore: number;
  date: string;
}

export interface BusStopData {
  stopId: string;
  stopName: string;
  lat: number;
  lng: number;
  boardingCount: number;
  alightingCount: number;
  date: string;
}

export interface PropertyInsight {
  address: string;
  coordinates: Coordinates;
  footTrafficScore: number;
  commerceScore: number;
  transportScore: number;
  overallScore: number;
  trend: "up" | "down" | "stable";
}

export interface ApiSetupStep {
  id: string;
  order: number;
  title: string;
  description: string;
  url: string;
  apiName: string;
  category: "location" | "foottraffic" | "commerce" | "transport";
  isCompleted: boolean;
  estimatedTime: string;
}
