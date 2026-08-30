'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  type CandlesResponse,
  type LaunchesResponse,
  type LaunchResponse,
  type LaunchSummary,
  type RealtimeEventType,
  type SseEnvelope,
  type Trade,
  type TradesResponse,
} from '@waffles/shared';
import { API_BASE_URL } from '../api-client';

interface RealtimeContextValue {
  status: 'connecting' | 'connected' | 'disconnected';
  subscribeTopics: (topics: string[]) => void;
  unsubscribeTopics: (topics: string[]) => void;
}

const RealtimeContext = createContext<RealtimeContextValue>({
  status: 'disconnected',
  subscribeTopics: () => {},
  unsubscribeTopics: () => {},
});

export function useRealtime() {
  return useContext(RealtimeContext);
}

/**
 * Hook to automatically subscribe to specific realtime topics while a component is mounted.
 */
export function useRealtimeTopics(topics: string[]) {
  const { subscribeTopics, unsubscribeTopics } = useRealtime();
  const topicKey = topics.map((topic) => topic.toLowerCase().trim()).join(',');

  useEffect(() => {
    const normalizedTopics = topicKey ? topicKey.split(',') : [];
    if (normalizedTopics.length === 0) return;
    subscribeTopics(normalizedTopics);
    return () => {
      unsubscribeTopics(normalizedTopics);
    };
  }, [topicKey, subscribeTopics, unsubscribeTopics]);
}

const SSE_EVENT_TYPES: readonly RealtimeEventType[] = [
  'trade.upserted',
  'launch.created',
  'launch.updated',
  'launch.graduated',
  'system.resync',
  'system.backfill_complete',
  'system.admin_correction',
  'stream.ready',
  'heartbeat',
];

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');

  const topicRefCounts = useRef<Map<string, number>>(new Map());
  const activeTopicsRef = useRef<string[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectSSERef = useRef<() => void>(() => {});
  const stoppedRef = useRef(false);
  const lastEventIdRef = useRef<string>('');
  const seenEventIds = useRef<Set<string>>(new Set());

  // Helper to handle trade event and dispatch updates across caches
  const handleTradeEvent = useCallback(
    (trade: Trade, tokenAddress?: string, curveAddress?: string) => {
      const token = tokenAddress?.toLowerCase();
      const curve = curveAddress?.toLowerCase();
      if (trade.trader) {
        void queryClient.invalidateQueries({
          queryKey: ['portfolio', trade.trader.toLowerCase()],
        });
      }

      // 1. Update trades query cache
      if (token) {
        queryClient.setQueryData<TradesResponse>(['trades', token], (old) => {
          if (!old || !old.trades) return { trades: [trade] };
          const tradeKey = trade.eventId ?? `${trade.txHash}-${trade.logIndex}`;
          const withoutCurrent = old.trades.filter(
            (item) => (item.eventId ?? `${item.txHash}-${item.logIndex}`) !== tradeKey,
          );
          return {
            trades: [trade, ...withoutCurrent]
              .sort(
                (a, b) =>
                  b.blockNumber - a.blockNumber || b.logIndex - a.logIndex,
              )
              .slice(0, 200),
          };
        });

        // 2. Update launch detail cache
        queryClient.setQueryData<LaunchResponse>(['launch', token], (old) => {
          if (!old || !old.launch) return old;
          return {
            launch: {
              ...old.launch,
              price: trade.priceAfter ?? old.launch.price,
              mcap: trade.mcapAfter ?? old.launch.mcap,
              progressBps: trade.progressBpsAfter ?? old.launch.progressBps,
            },
          };
        });

        // 3. Update all launches lists in cache
        queryClient.setQueriesData<LaunchesResponse>({ queryKey: ['launches'] }, (old) => {
          if (!old || !old.launches) return old;
          return {
            launches: old.launches.map((l) => {
              if (l.token.toLowerCase() === token || (curve && l.curve.toLowerCase() === curve)) {
                return {
                  ...l,
                  price: trade.priceAfter ?? l.price,
                  mcap: trade.mcapAfter ?? l.mcap,
                  progressBps: trade.progressBpsAfter ?? l.progressBps,
                };
              }
              return l;
            }),
          };
        });

        // 4. Update candles for active intervals
        const intervals = [60, 300, 900];
        intervals.forEach((intervalSec) => {
          queryClient.setQueryData<CandlesResponse>(['candles', token, intervalSec], (old) => {
            const bucketMs = intervalSec * 1000;
            const tradeTime = new Date(trade.timestamp).getTime();
            const tradeBucketTime = Math.floor(tradeTime / bucketMs) * bucketMs;
            const tradePriceNum = Number(trade.priceAfter ?? trade.executionPrice ?? 0);
            const tradeVolumeNum = Number(trade.usdcGrossAmount ?? trade.usdcAmount ?? 0);
            if (!Number.isFinite(tradeBucketTime) || !Number.isFinite(tradePriceNum)) {
              return old;
            }
            const newCandle = {
              time: tradeBucketTime,
              open: String(tradePriceNum),
              close: String(tradePriceNum),
              high: String(tradePriceNum),
              low: String(tradePriceNum),
              volume: String(tradeVolumeNum),
              trades: 1,
            };
            if (!old || !old.candles || old.candles.length === 0) {
              return { candles: [newCandle] };
            }

            const candles = [...old.candles];
            const lastCandle = { ...candles[candles.length - 1] };

            if (tradeBucketTime === lastCandle.time) {
              // Update current candle
              lastCandle.close = String(tradePriceNum);
              lastCandle.high = String(Math.max(Number(lastCandle.high), tradePriceNum));
              lastCandle.low = String(Math.min(Number(lastCandle.low), tradePriceNum));
              lastCandle.volume = String(Number(lastCandle.volume) + tradeVolumeNum);
              lastCandle.trades += 1;
              candles[candles.length - 1] = lastCandle;
              return { candles };
            } else if (tradeBucketTime > lastCandle.time) {
              return { candles: [...candles.slice(1), newCandle] };
            }
            return old;
          });
        });
      }
    },
    [queryClient],
  );

  // Helper to handle launch update/create events
  const handleLaunchEvent = useCallback(
    (launch: LaunchSummary, type: RealtimeEventType) => {
      const token = launch.token.toLowerCase();

      // Update single launch cache
      queryClient.setQueryData<LaunchResponse>(['launch', token], () => ({
        launch,
      }));

      // Update launches lists
      queryClient.setQueriesData<LaunchesResponse>({ queryKey: ['launches'] }, (old) => {
        if (!old || !old.launches) return { launches: [launch] };
        const exists = old.launches.some((l) => l.token.toLowerCase() === token);
        if (exists) {
          return {
            launches: old.launches.map((l) => (l.token.toLowerCase() === token ? launch : l)),
          };
        }
        if (type === 'launch.created') {
          return {
            launches: [launch, ...old.launches],
          };
        }
        return old;
      });
    },
    [queryClient],
  );

  const resyncActiveQueries = useCallback(() => {
    for (const topic of activeTopicsRef.current) {
      if (topic === 'launches') {
        void queryClient.invalidateQueries({ queryKey: ['launches'] });
      } else if (topic.startsWith('token:')) {
        const token = topic.slice(6);
        void queryClient.invalidateQueries({ queryKey: ['launch', token] });
        void queryClient.invalidateQueries({ queryKey: ['trades', token] });
        void queryClient.invalidateQueries({ queryKey: ['candles', token] });
      } else if (topic.startsWith('portfolio:')) {
        void queryClient.invalidateQueries({
          queryKey: ['portfolio', topic.slice(10)],
        });
      }
    }
  }, [queryClient]);

  // Dispatch incoming SSE envelope
  const handleEnvelope = useCallback(
    (envelope: SseEnvelope) => {
      if (!envelope || !envelope.id) return;
      if (seenEventIds.current.has(envelope.id)) return;
      seenEventIds.current.add(envelope.id);
      if (envelope.type.startsWith('trade.') || envelope.type.startsWith('launch.')) {
        lastEventIdRef.current = envelope.id;
      }

      // Keep seen set bounded
      if (seenEventIds.current.size > 1000) {
        const arr = Array.from(seenEventIds.current);
        seenEventIds.current = new Set(arr.slice(500));
      }

      switch (envelope.type) {
        case 'trade.upserted':
          handleTradeEvent(envelope.data as Trade, envelope.token, envelope.curve);
          break;
        case 'launch.created':
        case 'launch.updated':
        case 'launch.graduated':
          handleLaunchEvent(envelope.data as LaunchSummary, envelope.type);
          break;
        case 'system.resync':
        case 'system.backfill_complete':
        case 'system.admin_correction':
          // Re-sync all query snapshots
          void queryClient.invalidateQueries();
          break;
        case 'stream.ready':
          resyncActiveQueries();
          break;
        case 'heartbeat':
          // Keep-alive / handshake messages
          break;
      }
    },
    [handleTradeEvent, handleLaunchEvent, queryClient, resyncActiveQueries],
  );

  // Connect or reconnect SSE stream
  const connectSSE = useCallback(() => {
    if (typeof window === 'undefined') return;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    const topics = activeTopicsRef.current;
    const url = new URL(
      `${API_BASE_URL || window.location.origin}/v1/events`,
      window.location.origin,
    );

    if (topics.length > 0) {
      url.searchParams.set('topic', topics.join(','));
    }
    if (lastEventIdRef.current) {
      url.searchParams.set('lastEventId', lastEventIdRef.current);
    }

    setStatus('connecting');
    const es = new EventSource(url.toString());
    eventSourceRef.current = es;

    es.onopen = () => {
      setStatus('connected');
    };

    const onSseMessage = (event: MessageEvent<string>) => {
      try {
        const envelope = JSON.parse(event.data) as SseEnvelope;
        handleEnvelope(envelope);
      } catch (err) {
        console.error('Failed to parse SSE envelope:', err);
      }
    };
    es.onmessage = onSseMessage;
    for (const eventType of SSE_EVENT_TYPES) {
      es.addEventListener(eventType, onSseMessage as EventListener);
    }

    es.onerror = () => {
      if (eventSourceRef.current !== es || stoppedRef.current) return;
      setStatus('disconnected');
      es.close();
      eventSourceRef.current = null;
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        connectSSERef.current();
      }, 3000);
    };
  }, [handleEnvelope]);

  useEffect(() => {
    connectSSERef.current = connectSSE;
  }, [connectSSE]);

  // Debounced topic update to avoid reconnect churn
  const syncConnectionTimer = useRef<NodeJS.Timeout | null>(null);
  const syncConnection = useCallback(() => {
    if (syncConnectionTimer.current) clearTimeout(syncConnectionTimer.current);
    syncConnectionTimer.current = setTimeout(() => {
      const active: string[] = [];
      for (const [topic, count] of topicRefCounts.current.entries()) {
        if (count > 0) active.push(topic);
      }
      activeTopicsRef.current = active;
      if (active.length === 0) {
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
        eventSourceRef.current?.close();
        eventSourceRef.current = null;
        setStatus('disconnected');
        return;
      }
      connectSSERef.current();
    }, 50);
  }, []);

  const subscribeTopics = useCallback(
    (topics: string[]) => {
      let changed = false;
      for (const t of topics) {
        const norm = t.toLowerCase().trim();
        const current = topicRefCounts.current.get(norm) || 0;
        topicRefCounts.current.set(norm, current + 1);
        if (current === 0) changed = true;
      }
      if (changed) syncConnection();
    },
    [syncConnection],
  );

  const unsubscribeTopics = useCallback(
    (topics: string[]) => {
      let changed = false;
      for (const t of topics) {
        const norm = t.toLowerCase().trim();
        const current = topicRefCounts.current.get(norm) || 0;
        const updated = Math.max(0, current - 1);
        if (updated === 0) {
          topicRefCounts.current.delete(norm);
          if (current > 0) changed = true;
        } else {
          topicRefCounts.current.set(norm, updated);
        }
      }
      if (changed) syncConnection();
    },
    [syncConnection],
  );

  useEffect(() => {
    stoppedRef.current = false;
    return () => {
      stoppedRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (syncConnectionTimer.current) {
        clearTimeout(syncConnectionTimer.current);
        syncConnectionTimer.current = null;
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  return (
    <RealtimeContext.Provider value={{ status, subscribeTopics, unsubscribeTopics }}>
      {children}
    </RealtimeContext.Provider>
  );
}
