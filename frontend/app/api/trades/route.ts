import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";

export const dynamic = "force-dynamic";

function boundedLimit(value: string | null): number {
  const parsed = Number(value ?? 50);
  return Number.isSafeInteger(parsed) ? Math.min(Math.max(parsed, 1), 200) : 50;
}

/// GET /api/trades?token=0x…&limit=50
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.toLowerCase();
  const limit = boundedLimit(url.searchParams.get("limit"));

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
      return NextResponse.json({ trades: [] });
    }

    const trades = await db
      .collection("trades")
      .find({ curveAddress: launch.curve })
      .sort({ blockNumber: -1, logIndex: -1 })
      .limit(limit)
      .toArray();

    return NextResponse.json({
      trades: trades.map((t) => ({
        trader: t.trader,
        isBuy: t.isBuy,
        usdcAmount: t.usdcAmount,
        usdcGrossAmount: t.usdcGrossAmount ?? t.usdcAmount,
        tokenAmount: t.tokenAmount,
        priceAfter: t.priceAfter,
        mcapAfter: t.mcapAfter,
        blockNumber: t.blockNumber,
        logIndex: t.logIndex,
        txHash: t.txHash,
        timestamp: t.timestamp,
      })),
    });
  } catch (err) {
    console.error("GET /api/trades failed:", err);
    return NextResponse.json(
      { error: "indexer unavailable" },
      { status: 503 },
    );
  }
}
