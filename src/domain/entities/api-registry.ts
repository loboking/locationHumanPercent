// Domain Layer: API 목록 엔티티 (비즈니스 규칙)

import { ApiSetupStep } from "../types";

export const API_REGISTRY: ApiSetupStep[] = [
  {
    id: "kakao-local",
    order: 1,
    title: "카카오 로컬 API",
    description: "주소를 위도/경도 좌표로 변환하고 주변 시설(버스정류장·음식점·카페 등)을 검색합니다. 유동인구 분석의 기반이 됩니다.",
    url: "https://developers.kakao.com",
    apiName: "카카오 로컬(Local) API",
    category: "location",
    isCompleted: false,
    estimatedTime: "즉시 발급",
  },
  {
    id: "public-data-bus",
    order: 2,
    title: "경기도 버스도착정보 API",
    description: "평택시 주요 정류장의 실시간 버스 도착 정보와 혼잡도를 제공합니다. 교통량 지수 산출에 사용됩니다.",
    url: "https://www.data.go.kr",
    apiName: "경기도_버스도착정보 조회 서비스",
    category: "transport",
    isCompleted: false,
    estimatedTime: "자동승인",
  },
  {
    id: "mltm-apt",
    order: 3,
    title: "국토교통부 공동주택 기본정보",
    description: "반경 내 아파트 단지명·세대수·동수를 제공합니다. 주거 밀도 기반 유동인구 추정의 핵심 데이터입니다.",
    url: "https://www.data.go.kr",
    apiName: "국토교통부_공동주택 기본 정보제공 서비스",
    category: "foottraffic",
    isCompleted: false,
    estimatedTime: "자동승인",
  },
  {
    id: "semas-foottraffic",
    order: 4,
    title: "소상공인 상권분석 유동인구",
    description: "평택시 특정 영역의 성별·연령별·요일별 유동인구 지수를 제공합니다.",
    url: "https://www.data.go.kr",
    apiName: "소상공인시장진흥공단_상권분석_유동인구",
    category: "foottraffic",
    isCompleted: false,
    estimatedTime: "1~2시간 승인",
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
