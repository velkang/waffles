import type { Metadata } from 'next'
import { Inter, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { Header } from '@/components/Header'

const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  metadataBase: new URL('https://waffles.meme'),
  title: 'waffles.meme — Fair Token Launchpad on Arc L1',
  description:
    'Fair launch tokens on waffles.meme: virtual USDC bonding curves, instant trading, and automatic DEX liquidity graduation on Arc L1.',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="flex min-h-full flex-col bg-[#0e0f12] text-[#fafafa] selection:bg-[#db9d6a] selection:text-[#0e0f12]">
        <Providers cookies={null}>
          <Header />
          <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-5 sm:px-6 lg:px-8">
            {children}
          </main>
          <footer className="border-t border-[#24262e] bg-[#0e0f12] py-6 text-center text-xs text-zinc-500">
            <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-3 font-mono">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">
                  waffles<span className="text-[#db9d6a]">.meme</span>
                </span>
                <span className="text-zinc-600">|</span>
                <span>USDC-Native Fair Launchpad on Arc L1</span>
              </div>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  )
}
