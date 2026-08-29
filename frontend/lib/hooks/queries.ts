'use client';

import { useQuery } from '@tanstack/react-query';
import {
  LaunchesQuery,
} from '@waffles/shared';
import { apiClient } from '../api-client';

export function useLaunches(query?: LaunchesQuery) {
  const sort = query?.sort ?? 'new';
  const limit = query?.limit ?? 50;

  return useQuery({
    queryKey: ['launches', sort, limit],
    queryFn: () => apiClient.getLaunches({ sort, limit }),
    staleTime: 10_000,
  });
}

export function useLaunch(token?: string) {
  const normToken = token?.toLowerCase();

  return useQuery({
    queryKey: ['launch', normToken],
    queryFn: () => (normToken ? apiClient.getLaunch(normToken) : { launch: null }),
    enabled: Boolean(normToken && /^0x[0-9a-fA-F]{40}$/.test(normToken)),
    staleTime: 10_000,
  });
}

export function useTrades(token?: string, limit = 200) {
  const normToken = token?.toLowerCase();

  return useQuery({
    queryKey: ['trades', normToken],
    queryFn: () =>
      normToken ? apiClient.getTrades({ token: normToken, limit }) : { trades: [] },
    enabled: Boolean(normToken && /^0x[0-9a-fA-F]{40}$/.test(normToken)),
    staleTime: 10_000,
  });
}

export function useCandles(token?: string, interval = 60, limit = 240) {
  const normToken = token?.toLowerCase();

  return useQuery({
    queryKey: ['candles', normToken, interval],
    queryFn: () =>
      normToken
        ? apiClient.getCandles({ token: normToken, interval, limit })
        : { candles: [] },
    enabled: Boolean(normToken && /^0x[0-9a-fA-F]{40}$/.test(normToken)),
    staleTime: 10_000,
  });
}

export function usePortfolio(address?: string) {
  const normAddress = address?.toLowerCase();

  return useQuery({
    queryKey: ['portfolio', normAddress],
    queryFn: () =>
      normAddress ? apiClient.getPortfolio(normAddress) : { positions: [] },
    enabled: Boolean(normAddress && /^0x[0-9a-fA-F]{40}$/.test(normAddress)),
    staleTime: 10_000,
  });
}
