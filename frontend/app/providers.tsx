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

type AppKitGlobal = typeof globalThis & {
  __wafflesAppKitModal?: ReturnType<typeof createAppKit>
}

const appKitGlobal = globalThis as AppKitGlobal

// Preserve AppKit across Next.js Fast Refresh so its WalletConnect listeners
// are registered once for the lifetime of the browser page.
export const modal =
  appKitGlobal.__wafflesAppKitModal ??
  createAppKit({
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
    enableBaseAccount: false,
    enableCoinbase: false,
  })

if (process.env.NODE_ENV !== 'production') {
  appKitGlobal.__wafflesAppKitModal = modal
}

import { RealtimeProvider } from '@/lib/realtime/RealtimeProvider'

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
            staleTime: 10000,
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
      <QueryClientProvider client={queryClient}>
        <RealtimeProvider>{children}</RealtimeProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
