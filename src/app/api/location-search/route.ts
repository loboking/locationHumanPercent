import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchDongBoundary, type DongBoundaryResult } from "@/infrastructure/api/sgis-boundary-client";
import { fetchSohoByBbox } from "@/infrastructure/api/soho-batch-client";
import { generateGrid } from "@/domain/grid-generator";
import { calcStaticScore } from "@/domain/pharmacy-static-scorer";
import { getAgePopulationByRegion, getWorkersByRegion } from "@/infrastructure/api/sgis-client";
import { fetchAptsByBjdCode } from "@/infrastructure/api/apt-client";

// fallback: bbox 기반 폴리곤
function buildFallbackBoundary(
  dongName: string, sido: string, sigungu: string, admCd: string,
  centerLat: number, centerLng: number, radiusM = 1000
): DongBoundaryResult {
  const mPerLat = 111320;
  const mPerLng = 111320 * Math.cos((centerLat * Math.PI) / 180);
  const dLat = radiusM / mPerLat;
  const dLng = radiusM / mPerLng;

  const bboxSwLat = centerLat - dLat;
  const bboxSwLng = centerLng - dLng;
  const bboxNeLat = centerLat + dLat;
  const bboxNeLng = centerLng + dLng;

  const polygon: [number, number][] = [
    [bboxSwLng, bboxSwLat], [bboxNeLng, bboxSwLat],
    [bboxNeLng, bboxNeLat], [bboxSwLng, bboxNeLat],
    [bboxSwLng, bboxSwLat],
  ];
  return { admCd, dongName, sido, sigungu, polygon, centerLat, centerLng, areaM2: Math.PI * radiusM * radiusM, bboxSwLat, bboxSwLng, bboxNeLat, bboxNeLng };
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const dong = sp.get("dong");
    const latParam = sp.get("lat");
    const lngParam = sp.get("lng");
    const admCd = sp.get("admCd") ?? "";
    const sido = sp.get("sido") ?? "";
    const sigungu = sp.get("sigungu") ?? "";

    if (!dong || !latParam || !lngParam) {
      return NextResponse.json({ error: "dong, lat, lng 파라미터가 필요합니다" }, { status: 400 });
    }

    const centerLat = parseFloat(latParam);
    const centerLng = parseFloat(lngParam);

    // 캐시 키: admCd가 있으면 그걸로, 없으면 동이름+좌표
    const cacheKey = admCd || `${dong}_${centerLat.toFixed(4)}_${centerLng.toFixed(4)}`;

    // 1. 캐시 확인
    const cached = await prisma.locationSearchCache.findUnique({ where: { dongName: cacheKey } });
    if (cached) {
      const phase1 = JSON.parse(cached.phase1);
      return NextResponse.json({
        dong: phase1.dong,
        phase1: phase1.grids,
        cached: true,
      });
    }

    // 2. 동 경계 DB 조회 또는 생성
    let dongBoundary = await prisma.dongBoundary.findFirst({ where: { admCd } });

    if (!dongBoundary) {
      // SGIS에서 실제 행정동 경계 가져오기
      const boundary = await fetchDongBoundary(dong, centerLat, centerLng, sido, sigungu, admCd)
        ?? buildFallbackBoundary(dong, sido, sigungu, admCd, centerLat, centerLng);

      dongBoundary = await prisma.dongBoundary.create({
        data: {
          dongName: dong,
          sido: boundary.sido,
          sigungu: boundary.sigungu,
          admCd: boundary.admCd,
          bboxSwLat: boundary.bboxSwLat,
          bboxSwLng: boundary.bboxSwLng,
          bboxNeLat: boundary.bboxNeLat,
          bboxNeLng: boundary.bboxNeLng,
          centerLat: boundary.centerLat,
          centerLng: boundary.centerLng,
          areaM2: boundary.areaM2,
          polygon: JSON.stringify(boundary.polygon),
        },
      });
    }

    const polygon: [number, number][] = JSON.parse(dongBoundary.polygon);

    // 3. 인구 데이터 DB 조회 또는 API 수집
    let dongPop = await prisma.dongPopulation.findUnique({ where: { dongName: cacheKey } });

    if (!dongPop && admCd) {
      const admNm = `${sido} ${sigungu} ${dong}`;
      const [agePop, workerStats] = await Promise.all([
        getAgePopulationByRegion(admCd, admNm).catch(() => null),
        getWorkersByRegion(admCd, admNm).catch(() => null),
      ]);

      dongPop = await prisma.dongPopulation.create({
        data: {
          dongName: cacheKey,
          total: agePop?.total ?? 0,
          youngFamily: agePop?.youngFamily ?? 0,
          chronicPatient: agePop?.chronicPatient ?? 0,
          youngFamilyRatio: agePop?.youngFamilyRatio ?? 0,
          chronicPatientRatio: agePop?.chronicPatientRatio ?? 0,
          workerCnt: workerStats?.workerCnt ?? 0,
          companyCnt: workerStats?.companyCnt ?? 0,
        },
      });
    }

    if (!dongPop) {
      dongPop = { id: 0, dongName: cacheKey, total: 0, youngFamily: 0, chronicPatient: 0, youngFamilyRatio: 0, chronicPatientRatio: 0, workerCnt: 0, companyCnt: 0, fetchedAt: new Date() };
    }

    // 4. POI DB 조회 또는 API 수집
    let pois = await prisma.businessPOI.findMany({ where: { dongName: cacheKey } });

    if (pois.length === 0) {
      const batchPois = await fetchSohoByBbox(
        dongBoundary.bboxSwLat,
        dongBoundary.bboxSwLng,
        dongBoundary.bboxNeLat,
        dongBoundary.bboxNeLng
      );

      if (batchPois.length > 0) {
        await prisma.businessPOI.createMany({
          data: batchPois.map(p => ({
            dongName: cacheKey,
            bizesNm: p.bizesNm,
            category: p.category,
            lat: p.lat,
            lng: p.lng,
            isActive: true,
          })),
        });
        pois = await prisma.businessPOI.findMany({ where: { dongName: cacheKey } });
      }
    }

    // 5. 아파트 DB 조회 또는 API 수집
    let aptComplexes = await prisma.aptComplex.findMany({ where: { dongName: cacheKey } });
    let totalAptHouseholds = 0;

    if (aptComplexes.length === 0 && admCd) {
      const aptData = await fetchAptsByBjdCode(admCd).catch(() => null);

      if (aptData && aptData.items.length > 0) {
        await prisma.aptComplex.createMany({
          data: aptData.items.map(apt => ({
            dongName: cacheKey,
            kaptCode: apt.kaptCode,
            kaptName: apt.kaptName,
            kaptAddr: apt.kaptAddr,
            households: apt.kaptMrAgnt,
            lat: 0,
            lng: 0,
          })),
        });
        aptComplexes = await prisma.aptComplex.findMany({ where: { dongName: cacheKey } });
      }
    }
    totalAptHouseholds = aptComplexes.reduce((sum, a) => sum + a.households, 0);

    // 6. 격자 생성
    const gridPoints = generateGrid({
      swLat: dongBoundary.bboxSwLat,
      swLng: dongBoundary.bboxSwLng,
      neLat: dongBoundary.bboxNeLat,
      neLng: dongBoundary.bboxNeLng,
      polygon,
    });

    // 7. 정적 점수 계산
    const poiData = pois.map(p => ({
      bizesNm: p.bizesNm,
      category: p.category,
      lat: p.lat,
      lng: p.lng,
      indsLclsNm: "",
      indsSclsNm: "",
    }));

    const gridScores = gridPoints.map(point =>
      calcStaticScore({
        lat: point.lat,
        lng: point.lng,
        pois: poiData,
        totalPopulation: dongPop.total,
        youngFamilyRatio: dongPop.youngFamilyRatio,
        chronicPatientRatio: dongPop.chronicPatientRatio,
        workerCnt: dongPop.workerCnt,
        aptHouseholds: totalAptHouseholds,
      })
    );

    // Top 5 선발
    const top5 = [...gridScores]
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 5);

    // 히트맵 데이터 (점수 정규화)
    const maxScore = Math.max(...gridScores.map(g => g.totalScore), 1);
    const heatmap = gridScores.map(g => ({
      lat: g.lat,
      lng: g.lng,
      weight: g.totalScore / maxScore,
      score: g.totalScore,
    }));

    // 8. 2차: Top 5 상세 분석 (foot-traffic API 호출)
    const phase2Results = await Promise.all(
      top5.map(async (candidate) => {
        try {
          const res = await fetch(
            `${req.nextUrl.origin}/api/foot-traffic?lat=${candidate.lat}&lng=${candidate.lng}&radius=500`,
            { signal: AbortSignal.timeout(30000) }
          );
          if (!res.ok) return null;
          const data = await res.json();
          return { ...candidate, footTraffic: data };
        } catch {
          return { ...candidate, footTraffic: null };
        }
      })
    );

    // 9. 캐시 저장 (1차 결과만)
    const cacheData = {
      dong: {
        dongName: dong,
        sido: dongBoundary.sido,
        sigungu: dongBoundary.sigungu,
        admCd: dongBoundary.admCd,
        centerLat: dongBoundary.centerLat,
        centerLng: dongBoundary.centerLng,
        areaM2: dongBoundary.areaM2,
        bboxSwLat: dongBoundary.bboxSwLat,
        bboxSwLng: dongBoundary.bboxSwLng,
        bboxNeLat: dongBoundary.bboxNeLat,
        bboxNeLng: dongBoundary.bboxNeLng,
        polygon,
        population: {
          total: dongPop.total,
          youngFamilyRatio: dongPop.youngFamilyRatio,
          chronicPatientRatio: dongPop.chronicPatientRatio,
          workerCnt: dongPop.workerCnt,
        },
      },
      grids: {
        totalGrids: gridScores.length,
        heatmap,
        top5: top5.map(t => ({
          lat: t.lat,
          lng: t.lng,
          totalScore: t.totalScore,
          detail: t.detail,
          nearby: t.nearby,
        })),
      },
    };

    await prisma.locationSearchCache.upsert({
      where: { dongName: cacheKey },
      update: { phase1: JSON.stringify(cacheData), fetchedAt: new Date() },
      create: { dongName: cacheKey, phase1: JSON.stringify(cacheData) },
    });

    return NextResponse.json({
      dong: cacheData.dong,
      phase1: cacheData.grids,
      phase2: phase2Results,
      cached: false,
    });
  } catch (error) {
    console.error("[location-search] Error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다", detail: msg },
      { status: 500 }
    );
  }
}
