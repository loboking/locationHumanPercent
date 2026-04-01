import { NextResponse } from "next/server";

// 공공데이터 API 연결 테스트
export async function GET() {
  const SERVICE_KEY = process.env.PUBLIC_DATA_SERVICE_KEY;

  if (!SERVICE_KEY) {
    return NextResponse.json({ error: "SERVICE_KEY 없음" }, { status: 500 });
  }

  try {
    const params = new URLSearchParams({
      serviceKey: SERVICE_KEY,
      page: "1",
      perPage: "3",
    });

    const res = await fetch(
      `https://api.odcloud.kr/api/15083033/v1/uddi:3571f498-87ea-4a9c-8783-8c7ac5c65fb7?${params}`
    );

    const data = await res.json();

    return NextResponse.json({
      status: "연결 성공",
      totalCount: data.totalCount,
      sample: data.data?.[0] ?? null,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
