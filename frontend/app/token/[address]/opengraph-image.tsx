import { ImageResponse } from "next/og";
import { getAddress } from "viem";
import { getTokenSummary } from "@/lib/server/chain";

export const alt = "Token card on arc.fun";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function fmtUsd(raw: bigint | undefined): string {
  if (raw === undefined) return "—";
  const n = Number(raw) / 1e6;
  if (n >= 1_000_000) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 10_000) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPrice(raw: bigint | undefined): string {
  if (raw === undefined) return "—";
  const usd = Number(raw) / 1e6;
  if (usd === 0) return "$0";
  return `$${usd.toPrecision(4)}`;
}

export default async function OgImage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;

  let token = null as Awaited<ReturnType<typeof getTokenSummary>>;
  try {
    token = await getTokenSummary(getAddress(address));
  } catch {
    // fall through to generic render
  }

  if (!token || !token.symbol) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#09090b",
            color: "#f4f4f5",
            padding: 64,
            fontSize: 48,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline" }}>
            <span style={{ fontWeight: 900 }}>arc</span>
            <span style={{ fontWeight: 900, color: "#34d399" }}>.fun</span>
          </div>
          <div style={{ color: "#71717a", fontSize: 28 }}>Launch tokens on Arc</div>
        </div>
      ),
      size,
    );
  }

  const progressPct = Math.min(token.progressBps / 100, 100);
  const initials = token.symbol.slice(0, 2).toUpperCase();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "linear-gradient(135deg, #09090b 0%, #0c1512 55%, #071410 100%)",
          padding: 64,
          color: "#f4f4f5",
        }}
      >
        {/* header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: 9999,
                background: "linear-gradient(135deg, #34d399, #0891b2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 40,
                fontWeight: 900,
                color: "#09090b",
              }}
            >
              {initials}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  fontSize: 52,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  display: "flex",
                  alignItems: "baseline",
                }}
              >
                {token.symbol} <span style={{ color: "#71717a" }}>/ USDC</span>
              </div>
              <div style={{ fontSize: 24, color: "#a1a1aa" }}>
                {token.name}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", fontSize: 36 }}>
            <span style={{ fontWeight: 900 }}>arc</span>
            <span style={{ fontWeight: 900, color: "#34d399" }}>.fun</span>
          </div>
        </div>

        {/* middle: price + mcap */}
        <div style={{ display: "flex", flexDirection: "row", gap: 64 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 26, color: "#71717a" }}>Price</div>
            <div
              style={{
                fontSize: 84,
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.02em",
              }}
            >
              {fmtPrice(token.priceRaw)}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 26, color: "#71717a" }}>Market cap</div>
            <div
              style={{
                fontSize: 84,
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.02em",
              }}
            >
              {fmtUsd(token.mcapRaw)}
            </div>
          </div>
          {token.graduated && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                alignSelf: "flex-end",
                marginBottom: 18,
                padding: "8px 20px",
                borderRadius: 9999,
                background: "rgba(139,92,246,0.2)",
                color: "#c4b5fd",
                fontSize: 26,
                fontWeight: 600,
              }}
            >
              🎓 Graduated
            </div>
          )}
        </div>

        {/* footer: curve progress */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 24,
              color: "#a1a1aa",
            }}
          >
            <span>Bonding curve</span>
            <span>{progressPct.toFixed(1)}%</span>
          </div>
          <div
            style={{
              width: "100%",
              height: 12,
              background: "#18181b",
              borderRadius: 9999,
              display: "flex",
            }}
          >
            <div
              style={{
                width: `${progressPct}%`,
                height: "100%",
                background: token.graduated ? "#a78bfa" : "#34d399",
                borderRadius: 9999,
              }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 22, color: "#52525b" }}>
              Trade with USDC on Arc — every number in dollars.
            </span>
            <span style={{ fontSize: 22, color: "#52525b" }}>
              Graduates at $50K market cap
            </span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
