import { ImageResponse } from "next/og";
import { getAddress } from "viem";
import { getTokenSummary } from "@/lib/server/chain";

export const alt = "Token on waffles.meme";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const CYAN = "#00b4d8";
const EMERALD = "#00e599";
const AMBER = "#ffb703";
const TEXT_WHITE = "#ffffff";
const TEXT_MUTED = "#94a3b8";

function fmtUsd(raw: bigint | undefined): string {
  if (raw === undefined) return "—";
  const n = Number(raw) / 1e6;
  if (n >= 1_000_000) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 10_000) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPrice(raw: bigint | undefined): string {
  if (raw === undefined) return "—";
  const usd = Number(raw) / 1e18;
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
    // fall through
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
            background: "#080b11",
            color: TEXT_WHITE,
            padding: 64,
            fontSize: 48,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline" }}>
            <span style={{ fontWeight: 700 }}>waffles</span>
            <span style={{ fontWeight: 700, color: AMBER }}>.meme</span>
          </div>
          <div style={{ color: TEXT_MUTED, fontSize: 28 }}>
            Permissionless Token Launchpad on Arc L1
          </div>
        </div>
      ),
      size,
    );
  }

  const progressPct = Math.min(token.progressBps / 100, 100);
  const initials = token.symbol.slice(0, 3).toUpperCase();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#080b11",
          padding: 64,
          color: TEXT_WHITE,
        }}
      >
        {/* Header */}
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
                width: 88,
                height: 88,
                borderRadius: 4,
                border: "2px solid #581c87",
                background: "#2e1065",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 36,
                fontWeight: 700,
                color: "#c084fc",
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
                {token.symbol} <span style={{ color: CYAN, marginLeft: 8 }}>/ USDC</span>
              </div>
              <div style={{ fontSize: 24, color: TEXT_MUTED }}>{token.name}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", fontSize: 36 }}>
            <span style={{ fontWeight: 700 }}>waffles</span>
            <span style={{ fontWeight: 700, color: AMBER }}>.meme</span>
          </div>
        </div>

        {/* Middle Stats */}
        <div style={{ display: "flex", flexDirection: "row", gap: 64 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 22, color: TEXT_MUTED }}>Price</div>
            <div
              style={{
                fontSize: 72,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                color: TEXT_WHITE,
              }}
            >
              {fmtPrice(token.priceRaw)}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 22, color: TEXT_MUTED }}>Market Cap</div>
            <div
              style={{
                fontSize: 72,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                color: CYAN,
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
                marginBottom: 16,
                padding: "8px 16px",
                borderRadius: 4,
                background: "#003824",
                color: EMERALD,
                border: `1px solid ${EMERALD}`,
                fontSize: 20,
                fontWeight: 700,
              }}
            >
              GRADUATED TO DEX
            </div>
          )}
        </div>

        {/* Footer: Progress */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 20,
              color: TEXT_MUTED,
            }}
          >
            <span>Bonding Curve Progress</span>
            <span style={{ color: token.graduated ? EMERALD : CYAN, fontWeight: 700 }}>
              {token.graduated ? "100%" : `${progressPct.toFixed(1)}%`}
            </span>
          </div>
          <div
            style={{
              width: "100%",
              height: 10,
              borderRadius: 4,
              background: "#1a2333",
              display: "flex",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${progressPct}%`,
                height: "100%",
                background: token.graduated ? EMERALD : CYAN,
                borderRadius: 4,
              }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, color: "#64748b" }}>
            <span>Circle USDC-Native Token on Arc L1</span>
            <span style={{ color: AMBER }}>$50,000 Graduation Target</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
