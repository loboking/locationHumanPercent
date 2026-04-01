import { NextResponse } from "next/server";

// 평택시 상권코드 조회
export async function GET() {
  const SERVICE_KEY = process.env.PUBLIC_DATA_SERVICE_KEY!;

  const params = new URLSearchParams({
    serviceKey: SERVICE_KEY,
    page: "1",
    perPage: "100",
    "cond[시도_코드_명_eq]": "경기도",
    "cond[시군구_코드_명_eq]": "평택시",
  });

  const res = await fetch(
    `https://api.odcloud.kr/api/15083033/v1/uddi:3571f498-87ea-4a9c-8783-8c7ac5c65fb7?${params}`
  );

  const data = await res.json();
  return NextResponse.json(data);
}
