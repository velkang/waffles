import { defineChain } from '@reown/appkit/networks'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { createAppKit } from '@reown/appkit/react'

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? 'https://rpc.testnet.arc.io'

// Arc Testnet — USDC-native gas L1 by Circle
export const arcTestnet = defineChain({
  id: 5042002,
  caipNetworkId: 'eip155:5042002',
  chainNamespace: 'eip155',
  name: 'Arc Testnet',
  nativeCurrency: { decimals: 18, name: 'USDC', symbol: 'USDC' },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://testnet.arcscan.app' },
  },
  testnet: true,
})

export const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? ''

export const FACTORY_ADDRESS = (process.env.NEXT_PUBLIC_FACTORY_ADDRESS ??
  '') as `0x${string}`

export const ROUTER_ADDRESS = (process.env.NEXT_PUBLIC_ROUTER_ADDRESS ??
  '') as `0x${string}`

export const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC_ADDRESS ??
  '0x3600000000000000000000000000000000000000') as `0x${string}`

const metadata = {
  name: 'arc.fun',
  description: 'Permissionless token launchpad on Arc',
  url: 'https://arc-fun-ten.vercel.app',
  icons: [],
}

export const wagmiAdapter = new WagmiAdapter({
  networks: [arcTestnet],
  projectId,
  ssr: true,
})

export const wagmiConfig = wagmiAdapter.wagmiConfig

createAppKit({
  adapters: [wagmiAdapter],
  networks: [arcTestnet],
  metadata,
  projectId,
  features: { analytics: false },
})
