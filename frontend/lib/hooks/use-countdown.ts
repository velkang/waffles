'use client';

import { useEffect, useState } from 'react';

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function useCountdown(endAt?: string) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const parsedEnd = endAt ? Date.parse(endAt) : Number.NaN;
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
