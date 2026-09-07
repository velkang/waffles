'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAccount } from 'wagmi';
import { ensureAppKit } from '@/lib/appkit';
import { shortAddress } from '@/lib/format';
import { CommandPalette } from './ui/CommandPalette';

const LINKS = [['/', 'Explore'], ['/analytics', 'Analytics'], ['/portfolio', 'Portfolio'], ['/rewards', 'Rewards']] as const;

export function Header() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [walletStatus, setWalletStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  async function openWallet() {
    setWalletStatus('loading');
    try { const modal = await ensureAppKit(); await modal.open(); setWalletStatus('idle'); }
    catch { setWalletStatus('error'); }
  }
  return <>
    <header className="market-header"><div className="market-header-inner">
      <Link href="/" className="market-brand">waffles<span>.meme</span></Link>
      <nav aria-label="Main navigation">{LINKS.filter(([href]) => href !== '/portfolio' || isConnected).map(([href, label]) => <Link href={href} key={href} aria-current={pathname === href ? 'page' : undefined}>{label}</Link>)}</nav>
      <div className="market-header-actions">
        <button className="market-search" onClick={() => setPaletteOpen(true)} aria-label="Search coins"><span>Search coins</span><kbd>⌘K</kbd></button>
        <Link href="/create" className="market-button">Create</Link>
        <button className="market-primary" disabled={walletStatus === 'loading'} onMouseEnter={() => void ensureAppKit().catch(() => undefined)} onFocus={() => void ensureAppKit().catch(() => undefined)} onClick={() => void openWallet()}>
          {walletStatus === 'loading' ? 'Loading…' : walletStatus === 'error' ? 'Retry wallet' : isConnected && address ? shortAddress(address) : 'Connect'}
        </button>
      </div>
    </div></header>
    {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
  </>;
}
