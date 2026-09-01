import { networks, projectId, wagmiAdapter } from '@/lib/wagmi'

type AppKitModule = typeof import('@reown/appkit/react')
type AppKitModal = ReturnType<AppKitModule['createAppKit']>

type AppKitGlobal = typeof globalThis & {
  __wafflesAppKitPromise?: Promise<AppKitModal>
}

const appKitGlobal = globalThis as AppKitGlobal

const metadata = {
  name: 'waffles.meme',
  description: 'Fair Token Launchpad on Arc L1',
  url: 'https://waffles.meme',
  icons: ['https://waffles.meme/favicon.ico'],
}

export function ensureAppKit(): Promise<AppKitModal> {
  if (!appKitGlobal.__wafflesAppKitPromise) {
    appKitGlobal.__wafflesAppKitPromise = import('@reown/appkit/react')
      .then(({ createAppKit }) =>
        createAppKit({
          adapters: [wagmiAdapter],
          projectId,
          networks,
          defaultNetwork: networks[0],
          metadata: {
            ...metadata,
            url: window.location.origin,
          },
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
        }),
      )
      .catch((cause) => {
        delete appKitGlobal.__wafflesAppKitPromise
        throw cause
      })
  }

  return appKitGlobal.__wafflesAppKitPromise
}
