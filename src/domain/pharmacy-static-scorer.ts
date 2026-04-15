// 대형약국 정적 점수 계산 (API 호출 없이 DB 데이터만 사용)
// 최대 80점 (2차에서 이소크론/실시간 데이터로 보완 시 100점 만점)

import type { BatchPOI } from "@/infrastructure/api/soho-batch-client";
import { haversineKm } from "./grid-generator";

export interface StaticScoreInput {
  lat: number;
  lng: number;
  pois: BatchPOI[];
  totalPopulation: number;
  youngFamilyRatio: number;
  chronicPatientRatio: number;
  workerCnt: number;
  aptHouseholds: number;
}

export interface StaticScoreResult {
  lat: number;
  lng: number;
  totalScore: number; // /80
  detail: {
    residentScore: number;     // /25 거주수요
    commerceScore: number;     // /25 상권밀도
    competitionScore: number;  // /20 경쟁환경
    accessScore: number;       // /10 접근성추정
  };
  nearby: {
    restaurants: number;
    cafes: number;
    conveniences: number;
    pharmacies: number;
    hospitals: number;
  };
}

const RADIUS_M = 500;
const RADIUS_KM = RADIUS_M / 1000;

export function calcStaticScore(input: StaticScoreInput): StaticScoreResult {
  const { lat, lng, pois, totalPopulation, youngFamilyRatio, chronicPatientRatio, workerCnt, aptHouseholds } = input;

  // 반경 500m 내 POI 카운트
  const nearby = pois.filter(p => haversineKm(lat, lng, p.lat, p.lng) <= RADIUS_KM);

  const restaurants = nearby.filter(p => p.category === "restaurant").length;
  const cafes = nearby.filter(p => p.category === "cafe").length;
  const conveniences = nearby.filter(p => p.category === "convenience").length;
  const pharmacies = nearby.filter(p => p.category === "pharmacy").length;
  const hospitals = nearby.filter(p => p.category === "hospital").length;

  // 1. 거주수요 /25
  const residentScore = calcResidentScore(totalPopulation, aptHouseholds, youngFamilyRatio, chronicPatientRatio);

  // 2. 상권밀도 /25
  const commerceScore = calcCommerceScore(restaurants, cafes, conveniences, workerCnt);

  // 3. 경쟁환경 /20
  const competitionScore = calcCompetitionScore(pharmacies, hospitals);

  // 4. 접근성추정 /10
  const accessScore = calcAccessScore(conveniences, restaurants);

  const totalScore = residentScore + commerceScore + competitionScore + accessScore;

  return {
    lat,
    lng,
    totalScore,
    detail: {
      residentScore,
      commerceScore,
      competitionScore,
      accessScore,
    },
    nearby: {
      restaurants,
      cafes,
      conveniences,
      pharmacies,
      hospitals,
    },
  };
}

// 거주수요 점수 /25
function calcResidentScore(
  population: number,
  households: number,
  youngFamilyRatio: number,
  chronicPatientRatio: number
): number {
  // 인구 점수 (0~10): 로그 스케일
  const popScore = Math.min(10, Math.log10(Math.max(population, 1)) * 2.5);

  // 세대수 점수 (0~8): 로그 스케일
  const householdScore = Math.min(8, Math.log10(Math.max(households, 1)) * 2);

  // 연령 가중치 (0~7): 육아세대 + 만성질환층 비율
  const ageScore = Math.min(7, (youngFamilyRatio + chronicPatientRatio) / 100 * 10);

  return Math.round(popScore + householdScore + ageScore);
}

// 상권밀도 점수 /25
function calcCommerceScore(
  restaurants: number,
  cafes: number,
  conveniences: number,
  workerCnt: number
): number {
  // 음식점+카페 (0~12): 10개당 3점
  const foodScore = Math.min(12, (restaurants + cafes) * 0.8);

  // 편의점 (0~5): 3개당 2점
  const convScore = Math.min(5, conveniences * 0.7);

  // 직장인구 (0~8): 로그 스케일
  const workerScore = Math.min(8, Math.log10(Math.max(workerCnt, 1)) * 2);

  return Math.round(foodScore + convScore + workerScore);
}

// 경쟁환경 점수 /20 (약국 수가 적을수록 좋음 → 역산)
function calcCompetitionScore(pharmacies: number, hospitals: number): number {
  // 약국 포화도 (0~12): 0개=12, 1개=10, 2개=7, 3개=4, 4+=2
  const pharmScore = pharmacies === 0 ? 12
    : pharmacies === 1 ? 10
    : pharmacies === 2 ? 7
    : pharmacies === 3 ? 4
    : 2;

  // 병원 인프라 (0~8): 있을수록 좋음 (처방전 수요)
  const hospScore = Math.min(8, hospitals * 2);

  return pharmScore + hospScore;
}

// 접근성추정 점수 /10
function calcAccessScore(conveniences: number, restaurants: number): number {
  // 편의점 인접 = 유동인구 많은 위치 (0~5)
  const convAccess = Math.min(5, conveniences * 1.5);

  // 음식점 많으면 대로변/상업지구 가능성 (0~5)
  const roadAccess = Math.min(5, restaurants * 0.3);

  return Math.round(convAccess + roadAccess);
}
