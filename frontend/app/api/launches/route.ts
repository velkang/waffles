import { NextResponse } from "next/server";
import type { Db } from "mongodb";
import { getDb } from "@/lib/mongo";
import type { LaunchSummary } from "@/lib/types/launch";

export const dynamic = "force-dynamic";

type LaunchDoc = {
  token: string;
  curve: string;
  creator?: string;
  name?: string;
  symbol?: string;
  description?: string;
  imageUri?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  graduated?: boolean;
  pool?: string | null;
  createdAt?: Date;
  price?: string;
  mcap?: string;
  progressBps?: number;
};

type TradeMetrics = {
  price?: string;
  mcap?: string;
  volume24h?: string;
  progressBps?: number;
};

function mapLaunch(d: LaunchDoc, metrics: TradeMetrics = {}): LaunchSummary {
  return {
    token: d.token,
    curve: d.curve,
    creator: d.creator ?? "",
    name: d.name ?? "",
    symbol: d.symbol ?? "",
    description: d.description ?? "",
    imageUri: d.imageUri ?? "",
    website: d.website ?? "",
    twitter: d.twitter ?? "",
    telegram: d.telegram ?? "",
    graduated: d.graduated ?? false,
    pool: d.pool ?? null,
    createdAt: d.createdAt ? d.createdAt.toISOString() : null,
    price: metrics.price ?? d.price ?? "0",
    mcap: metrics.mcap ?? d.mcap ?? "0",
    volume24h: metrics.volume24h ?? "0",
    progressBps: d.graduated
      ? 10_000
      : (metrics.progressBps ?? d.progressBps ?? 0),
  };
}

async function enrichLaunches(db: Db, docs: LaunchDoc[]): Promise<LaunchSummary[]> {
  if (docs.length === 0) return [];
  const curves = docs.map((d) => d.curve);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [volumes, latest] = await Promise.all([
    db.collection("trades").aggregate([
      { $match: { curveAddress: { $in: curves }, timestamp: { $gte: since } } },
      {
        $group: {
          _id: "$curveAddress",
          volume24h: {
            $sum: {
              $toDecimal: { $ifNull: ["$usdcGrossAmount", "$usdcAmount"] },
            },
          },
        },
      },
    ]).toArray(),
    db.collection("trades").aggregate([
      { $match: { curveAddress: { $in: curves } } },
      { $sort: { blockNumber: 1, logIndex: 1 } },
      {
        $group: {
          _id: "$curveAddress",
          price: { $last: "$priceAfter" },
          mcap: { $last: "$mcapAfter" },
          progressBps: { $last: "$progressBpsAfter" },
        },
      },
    ]).toArray(),
  ]);

  const metricsByCurve = new Map<string, TradeMetrics>();
  for (const row of latest) {
    metricsByCurve.set(String(row._id), {
      price: row.price?.toString(),
      mcap: row.mcap?.toString(),
      progressBps:
        row.progressBps === undefined ? undefined : Number(row.progressBps),
    });
  }
  for (const row of volumes) {
    const curve = String(row._id);
    metricsByCurve.set(curve, {
      ...metricsByCurve.get(curve),
      volume24h: row.volume24h?.toString() ?? "0",
    });
  }

  return docs.map((doc) => mapLaunch(doc, metricsByCurve.get(doc.curve)));
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
      const [summary] = launch ? await enrichLaunches(db, [launch]) : [];
      return NextResponse.json({ launch: summary ?? null });
    }

    if (sort === "volume" || sort === "mcap") {
      const docs = await launches.find().limit(500).toArray();
      const enriched = await enrichLaunches(db, docs);

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

    return NextResponse.json({ launches: await enrichLaunches(db, docs) });
  } catch (err) {
    console.error("GET /api/launches failed:", err);
    return NextResponse.json(
      { error: "indexer unavailable" },
      { status: 503 },
    );
  }
}
