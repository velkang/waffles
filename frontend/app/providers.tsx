'use client'

import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createAppKit } from '@reown/appkit/react'
import { cookieToInitialState, WagmiProvider } from 'wagmi'
import { networks, projectId, wagmiAdapter, wagmiConfig } from '@/lib/wagmi'
import { arcTestnet } from 'viem/chains'

const metadata = {
  name: 'waffles.meme',
  description: 'Fair Token Launchpad on Arc L1',
  url: 'https://waffles.meme',
  icons: ['https://waffles.meme/favicon.ico'],
}

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  defaultNetwork: arcTestnet,
  metadata,
  projectId,
  features: {
    analytics: false,
    email: false,
    socials: [],
  },
})

export function Providers({
  children,
  cookies,
}: {
  children: React.ReactNode
  cookies: string | null
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5000,
            gcTime: 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  )
  const initialState = cookieToInitialState(wagmiConfig, cookies)

  return (
    <WagmiProvider config={wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}
