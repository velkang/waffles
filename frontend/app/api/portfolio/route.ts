import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";

export const dynamic = "force-dynamic";

/// GET /api/portfolio?address=0x…
/// Per-curve trade aggregates for one trader (raw units as stored).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const address = url.searchParams.get("address")?.toLowerCase();

  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }

  try {
    const db = await getDb();
    const rows = await db
      .collection("trades")
      .aggregate([
        { $match: { trader: address } },
        {
          $group: {
            _id: "$curveAddress",
            usdcSpent: {
              $sum: {
                $cond: [{ $eq: ["$isBuy", true] }, { $toDecimal: "$usdcAmount" }, 0],
              },
            },
            usdcReceived: {
              $sum: {
                $cond: [{ $eq: ["$isBuy", false] }, { $toDecimal: "$usdcAmount" }, 0],
              },
            },
            tokensBought: {
              $sum: {
                $cond: [{ $eq: ["$isBuy", true] }, { $toDecimal: "$tokenAmount" }, 0],
              },
            },
            tokensSold: {
              $sum: {
                $cond: [{ $eq: ["$isBuy", false] }, { $toDecimal: "$tokenAmount" }, 0],
              },
            },
            tradeCount: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            curve: "$_id",
            usdcSpent: { $toString: "$usdcSpent" },
            usdcReceived: { $toString: "$usdcReceived" },
            tokensBought: { $toString: "$tokensBought" },
            tokensSold: { $toString: "$tokensSold" },
            tradeCount: 1,
          },
        },
      ])
      .toArray();

    return NextResponse.json({ positions: rows });
  } catch (err) {
    console.error("GET /api/portfolio failed:", err);
    return NextResponse.json(
      { error: "indexer unavailable" },
      { status: 503 },
    );
  }
}
