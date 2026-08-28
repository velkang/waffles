import { arcTestnet } from 'viem/chains'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { cookieStorage, createStorage, http } from 'wagmi'
import type { AppKitNetwork } from '@reown/appkit/networks'

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? 'https://rpc.testnet.arc.network'

export const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? ''

if (!projectId) {
  throw new Error('NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not defined')
}

export const FACTORY_ADDRESS = (process.env.NEXT_PUBLIC_FACTORY_ADDRESS ??
  '') as `0x${string}`

export const ROUTER_ADDRESS = (process.env.NEXT_PUBLIC_ROUTER_ADDRESS ??
  '') as `0x${string}`

export const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC_ADDRESS ??
  '0x3600000000000000000000000000000000000000') as `0x${string}`

export const networks = [arcTestnet] as [AppKitNetwork, ...AppKitNetwork[]]

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: true,
  storage: createStorage({ storage: cookieStorage }),
  transports: {
    [arcTestnet.id]: http(RPC_URL, {
      batch: true,
    }),
  },
})

export const wagmiConfig = wagmiAdapter.wagmiConfig
