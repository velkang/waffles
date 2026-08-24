import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";

export const dynamic = "force-dynamic";

type LaunchDoc = {
  token: string;
  curve: string;
  creator?: string;
  name?: string;
  symbol?: string;
  imageUri?: string;
  graduated?: boolean;
  pool?: string | null;
  createdAt?: Date;
};

function mapLaunch(d: LaunchDoc & { volume24h?: string; mcap?: string }) {
  return {
    token: d.token,
    curve: d.curve,
    creator: d.creator,
    name: d.name,
    symbol: d.symbol,
    imageUri: d.imageUri,
    graduated: d.graduated,
    pool: d.pool ?? null,
    createdAt: d.createdAt,
    volume24h: d.volume24h ?? "0",
    mcap: d.mcap ?? undefined,
  };
}

function boundedLimit(value: string | null): number {
  const parsed = Number(value ?? 50);
  return Number.isSafeInteger(parsed) ? Math.min(Math.max(parsed, 1), 200) : 50;
}

/// GET /api/launches?token=0x…            — single launch
/// GET /api/launches?sort=new|mcap|volume — list
export async function GET(request: Request) {
  const url = new URL(request.url);
  const sort = url.searchParams.get("sort") ?? "new";
  const limit = boundedLimit(url.searchParams.get("limit"));
  const token = url.searchParams.get("token")?.toLowerCase();

  try {
    const db = await getDb();
    const launches = db.collection<LaunchDoc>("launches");

    if (token) {
      if (!/^0x[0-9a-f]{40}$/.test(token)) {
        return NextResponse.json({ error: "invalid token" }, { status: 400 });
      }
      const launch = await launches.findOne({ token });
      return NextResponse.json({ launch: launch ? mapLaunch(launch) : null });
    }

    if (sort === "volume" || sort === "mcap") {
      // aggregate latest trade per curve for mcap, and 24h volume
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const pipeline = [
        { $sort: { blockNumber: 1, logIndex: 1 } },
        {
          $group: {
            _id: "$curveAddress",
            volume24h: {
              $sum: {
                $toDecimal: { $ifNull: ["$usdcGrossAmount", "$usdcAmount"] },
              },
            },
            lastMcap: { $last: "$mcapAfter" },
            lastBlock: { $max: "$blockNumber" },
          },
        },
      ];
      // volume over all trades in the window
      const volPipeline = [
        { $match: { timestamp: { $gte: since } } },
        ...pipeline,
      ];
      const [vols, mcaps] = await Promise.all([
        db.collection("trades").aggregate(volPipeline).toArray(),
        sort === "mcap"
          ? db.collection("trades").aggregate(pipeline).toArray()
          : Promise.resolve([]),
      ]);
      const volByCurve = new Map(
        vols.map((v) => [v._id as string, v.volume24h?.toString() ?? "0"]),
      );
      const mcapByCurve = new Map(
        mcaps.map((m) => [m._id as string, m.lastMcap?.toString() ?? "0"]),
      );

      const docs = await launches.find().limit(500).toArray();
      const enriched = docs.map((d) =>
        mapLaunch({
          ...d,
          volume24h: volByCurve.get(d.curve) ?? "0",
          mcap:
            sort === "mcap"
              ? (mcapByCurve.get(d.curve) ?? "0")
              : undefined,
        }),
      );

      enriched.sort((a, b) =>
        sort === "mcap"
          ? Number(b.mcap ?? 0) - Number(a.mcap ?? 0)
          : Number(b.volume24h) - Number(a.volume24h),
      );

      return NextResponse.json({ launches: enriched.slice(0, limit) });
    }

    // default: newest first
    const docs = await launches
      .find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return NextResponse.json({
      launches: docs.map((d) => mapLaunch(d)),
    });
  } catch (err) {
    console.error("GET /api/launches failed:", err);
    return NextResponse.json(
      { error: "indexer unavailable" },
      { status: 503 },
    );
  }
}
