import type { Metadata } from "next";

export function generateStaticParams() {
  return [{ address: "0x0000000000000000000000000000000000000000" }];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}): Promise<Metadata> {
  const { address } = await params;
  return {
    title: `${address.slice(0, 6)}…${address.slice(-4)} on waffles.meme`,
    description:
      "Trade this token against USDC on a bonding curve — graduates to DEX liquidity at $50K market cap.",
    openGraph: {
      title: "waffles.meme",
      description: "Permissionless token launchpad on Arc",
    },
  };
}

export default function TokenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
