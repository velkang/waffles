'use client'

import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createAppKit } from '@reown/appkit/react'
import { cookieToInitialState, WagmiProvider } from 'wagmi'
import { networks, projectId, wagmiAdapter, wagmiConfig } from '@/lib/wagmi'

const metadata = {
  name: 'waffles.meme',
  description: 'Fair Token Launchpad on Arc L1',
  url:
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://waffles.meme',
  icons: ['https://waffles.meme/favicon.ico'],
}

// Created once at module load (outside React) as AppKit requires.
export const modal = createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks,
  defaultNetwork: networks[0],
  metadata,
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#db9d6a',
    '--w3m-color-mix': '#141519',
    '--w3m-color-mix-strength': 20,
    '--w3m-border-radius-master': '2px',
  },
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
