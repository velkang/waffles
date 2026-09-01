export function formatUsdc(raw?: string) {
  if (!raw || !/^\d+$/.test(raw)) return '$0.00';

  const value = BigInt(raw);
  const whole = value / 1_000_000n;
  const cents = (value % 1_000_000n) / 10_000n;

  return `$${whole.toLocaleString()}.${cents.toString().padStart(2, '0')} USDC`;
}

export function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function progressBetween(startAt: string, endAt: string) {
  const start = Date.parse(startAt);
  const end = Date.parse(endAt);

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0;
  }

  return Math.max(0, Math.min(100, ((Date.now() - start) / (end - start)) * 100));
}

export function relativeTime(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return '—';

  const seconds = Math.max(0, Math.floor((Date.now() - parsed) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
}
