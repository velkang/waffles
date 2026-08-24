import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";

export const dynamic = "force-dynamic";

function boundedInteger(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  return Number.isSafeInteger(parsed)
    ? Math.min(Math.max(parsed, min), max)
    : fallback;
}

/// GET /api/candles?token=0x…&interval=60&limit=240
/// interval is seconds; buckets are price OHLC + USDC volume from Traded events.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.toLowerCase();
  const interval = boundedInteger(url.searchParams.get("interval"), 60, 10, 86_400);
  const limit = boundedInteger(url.searchParams.get("limit"), 240, 1, 1000);

  if (!token || !/^0x[0-9a-f]{40}$/.test(token)) {
    return NextResponse.json({ error: "invalid token" }, { status: 400 });
  }

  try {
    const db = await getDb();
    const launch = await db.collection("launches").findOne(
      { token },
      { projection: { curve: 1 } },
    );
    if (!launch) {
      return NextResponse.json({ candles: [] });
    }

    const bucketMs = interval * 1000;
    const candles = await db
      .collection("trades")
      .aggregate([
        { $match: { curveAddress: launch.curve } },
        { $sort: { blockNumber: 1, logIndex: 1 } },
        {
          $group: {
            _id: {
              $trunc: {
                $divide: [{ $toLong: "$timestamp" }, bucketMs],
              },
            },
            open: { $first: { $toString: "$priceAfter" } },
            close: { $last: { $toString: "$priceAfter" } },
            high: { $max: { $toDouble: "$priceAfter" } },
            low: { $min: { $toDouble: "$priceAfter" } },
            volume: {
              $sum: {
                $toDouble: { $ifNull: ["$usdcGrossAmount", "$usdcAmount"] },
              },
            },
            trades: { $sum: 1 },
          },
        },
        { $sort: { _id: -1 } },
        { $limit: limit },
        { $sort: { _id: 1 } },
        {
          $project: {
            _id: 0,
            time: { $multiply: ["$_id", bucketMs] },
            open: 1,
            close: 1,
            high: { $toString: "$high" },
            low: { $toString: "$low" },
            volume: { $toString: "$volume" },
            trades: 1,
          },
        },
      ])
      .toArray();

    return NextResponse.json({ candles });
  } catch (err) {
    console.error("GET /api/candles failed:", err);
    return NextResponse.json(
      { error: "indexer unavailable" },
      { status: 503 },
    );
  }
}
