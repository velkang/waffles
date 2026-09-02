'use client';

import { useEffect, useState } from 'react';

function pad(value: number) {
  return String(Math.max(0, value)).padStart(2, '0');
}

export function parseDateTimestamp(value?: string | number | Date): number {
  if (!value) return Number.NaN;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') {
    if (value > 1e14) return Math.floor(value / 1000);
    return value > 1e11 ? value : value * 1000;
  }
  if (typeof value === 'string') {
    if (/^\d+$/.test(value)) {
      const num = Number(value);
      if (num > 1e14) return Math.floor(num / 1000);
      return num > 1e11 ? num : num * 1000;
    }
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      if (parsed > 1e14) return Math.floor(parsed / 1000);
      return parsed;
    }
  }
  return Number.NaN;
}

export function useCountdown(endAt?: string | number | Date) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const parsedEnd = parseDateTimestamp(endAt);
  const remaining = Number.isFinite(parsedEnd) ? Math.max(0, parsedEnd - now) : 0;
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1_000);

  return {
    parts: [
      { label: 'days', value: pad(days) },
      { label: 'hrs', value: pad(hours) },
      { label: 'min', value: pad(minutes) },
      { label: 'sec', value: pad(seconds) },
    ],
    label: `${days} days, ${hours} hours, ${minutes} minutes, ${seconds} seconds`,
  };
}
