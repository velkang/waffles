import type { Metadata } from 'next'
import { GRADUATION_TARGET_FORMATTED } from '@/lib/config'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>
}): Promise<Metadata> {
  const { address } = await params
  return {
    title: `${address.slice(0, 6)}…${address.slice(-4)} on waffles.meme`,
    description:
      `Trade this token against USDC on a bonding curve — graduates to DEX liquidity at ${GRADUATION_TARGET_FORMATTED} market cap.`,
    openGraph: {
      title: 'waffles.meme',
      description: 'Permissionless token launchpad on Arc',
    },
  }
}

export default function TokenLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
