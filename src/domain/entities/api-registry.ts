// Domain Layer: API 목록 엔티티 (비즈니스 규칙)

import { ApiSetupStep } from "../types";

export const API_REGISTRY: ApiSetupStep[] = [
  {
    id: "kakao-local",
    order: 1,
    title: "카카오 로컬 API",
    description: "주소를 위도/경도 좌표로 변환합니다. 모든 데이터 조회의 첫 번째 단계로 반드시 먼저 신청해야 합니다.",
    url: "https://developers.kakao.com",
    apiName: "카카오 로컬(Local) API",
    category: "location",
    isCompleted: false,
    estimatedTime: "즉시 발급",
  },
  {
    id: "semas-foottraffic",
    order: 2,
    title: "소상공인 상권분석 유동인구",
    description: "평택시 특정 영역의 성별·연령별·요일별 유동인구 지수를 제공합니다. MVP 핵심 데이터입니다.",
    url: "https://www.data.go.kr",
    apiName: "소상공인시장진흥공단_상권분석_유동인구",
    category: "foottraffic",
    isCompleted: false,
    estimatedTime: "1~2시간 승인",
  },
  {
    id: "semas-commerce",
    order: 3,
    title: "소상공인 상권분석 상권정보",
    description: "해당 주소지의 주요 업종별 추정 매출액 및 점포 수를 확인합니다.",
    url: "https://www.data.go.kr",
    apiName: "소상공인시장진흥공단_상권분석_상권정보",
    category: "commerce",
    isCompleted: false,
    estimatedTime: "1~2시간 승인",
  },
  {
    id: "gg-busstop",
    order: 4,
    title: "경기도 정류소별 이용현황",
    description: "평택시 내 버스 정류장별 승하차 인원 데이터입니다. 교통 접근성 기반 부동산 가치 판단 지표입니다.",
    url: "https://data.gg.go.kr",
    apiName: "경기도_정류소별 이용현황",
    category: "transport",
    isCompleted: false,
    estimatedTime: "1~3일 승인",
  },
  {
    id: "gg-population",
    order: 5,
    title: "경기도 시군별 유동인구 분석",
    description: "평택시 전체 또는 동 단위의 월간/일간 유동인구 추이를 분석합니다.",
    url: "https://data.gg.go.kr",
    apiName: "경기도_시군별 유동인구 분석 현황",
    category: "transport",
    isCompleted: false,
    estimatedTime: "1~3일 승인",
  },
];

export const CATEGORY_LABELS: Record<ApiSetupStep["category"], string> = {
  location: "위치 변환",
  foottraffic: "유동인구",
  commerce: "상권 매출",
  transport: "교통",
};

export const CATEGORY_COLORS: Record<ApiSetupStep["category"], string> = {
  location: "blue",
  foottraffic: "emerald",
  commerce: "violet",
  transport: "orange",
};
