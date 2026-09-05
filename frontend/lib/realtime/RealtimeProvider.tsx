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

function tradeIdentity(trade: Trade): string {
  return trade.eventId ?? `${trade.txHash}-${trade.logIndex}`;
}

function compareIntegerStrings(left: string, right: string): number {
  if (/^\d+$/.test(left) && /^\d+$/.test(right)) {
    const leftValue = BigInt(left);
    const rightValue = BigInt(right);
    return leftValue === rightValue ? 0 : leftValue > rightValue ? 1 : -1;
  }
  return Number(left) - Number(right);
}

function addIntegerStrings(left: string, right: string): string {
  if (/^\d+$/.test(left) && /^\d+$/.test(right)) {
    return String(BigInt(left) + BigInt(right));
  }
  return String(Number(left) + Number(right));
}

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
    (trade: Trade, tokenAddress?: string) => {
      const token = tokenAddress?.toLowerCase();
      if (trade.trader) {
        void queryClient.invalidateQueries({
          queryKey: ['portfolio', trade.trader.toLowerCase()],
        });
      }

      // 1. Update trades query cache
      if (token) {
        const tradeKey = tradeIdentity(trade);
        const cachedTrades = queryClient.getQueryData<TradesResponse>(['trades', token]);
        const tradeAlreadyInSnapshot = Boolean(
          cachedTrades?.trades.some((item) => tradeIdentity(item) === tradeKey),
        );

        queryClient.setQueryData<TradesResponse>(['trades', token], (old) => {
          if (!old || !old.trades) return { trades: [trade] };
          const withoutCurrent = old.trades.filter(
            (item) => tradeIdentity(item) !== tradeKey,
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

        // REST derives metrics from the latest trade, even when this event is
        // a recovered creation trade that predates the current snapshot.
        void queryClient.invalidateQueries({ queryKey: ['launch', token] });
        void queryClient.invalidateQueries({ queryKey: ['launches'] });

        // 4. Update every candle interval currently open in the UI. A normal
        // confirmed event stays entirely in memory; only a late historical
        // event reconciles its REST snapshot.
        if (!tradeAlreadyInSnapshot) {
          const candleQueries = queryClient.getQueryCache().findAll({
            queryKey: ['candles', token],
          });

          for (const candleQuery of candleQueries) {
            const intervalSec = Number(candleQuery.queryKey[2]);
            if (!Number.isSafeInteger(intervalSec) || intervalSec <= 0) continue;

            let requiresReconciliation = false;
            queryClient.setQueryData<CandlesResponse>(candleQuery.queryKey, (old) => {
              const bucketMs = intervalSec * 1000;
              const tradeTime = new Date(trade.timestamp).getTime();
              const tradeBucketTime = Math.floor(tradeTime / bucketMs) * bucketMs;
              const tradePrice = trade.priceAfter ?? trade.executionPrice;
              const tradeVolume = trade.usdcGrossAmount ?? trade.usdcAmount;
              if (!Number.isFinite(tradeBucketTime) || !tradePrice || !tradeVolume) {
                return old;
              }
              const newCandle = {
                time: tradeBucketTime,
                open: tradePrice,
                close: tradePrice,
                high: tradePrice,
                low: tradePrice,
                volume: tradeVolume,
                trades: 1,
              };
              if (!old || !old.candles || old.candles.length === 0) {
                return { candles: [newCandle] };
              }

              const candles = [...old.candles];
              const lastCandle = { ...candles[candles.length - 1] };

              if (tradeBucketTime === lastCandle.time) {
                lastCandle.close = tradePrice;
                if (compareIntegerStrings(tradePrice, lastCandle.high) > 0) {
                  lastCandle.high = tradePrice;
                }
                if (compareIntegerStrings(tradePrice, lastCandle.low) < 0) {
                  lastCandle.low = tradePrice;
                }
                lastCandle.volume = addIntegerStrings(lastCandle.volume, tradeVolume);
                lastCandle.trades += 1;
                candles[candles.length - 1] = lastCandle;
                return { candles };
              }
              if (tradeBucketTime > lastCandle.time) {
                return { candles: [...candles, newCandle].slice(-240) };
              }

              requiresReconciliation = true;
              return old;
            });

            if (requiresReconciliation) {
              void queryClient.invalidateQueries({
                queryKey: candleQuery.queryKey,
                exact: true,
              });
            }
          }
        }
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
    void queryClient.invalidateQueries({ queryKey: ['readContract'] });
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
        // Header and trading-panel metrics use Wagmi contract reads, whose
        // cache is separate from the API snapshots updated below.
        void queryClient.invalidateQueries({ queryKey: ['readContract'] });
        lastEventIdRef.current = envelope.id;
      }

      // Keep seen set bounded
      if (seenEventIds.current.size > 1000) {
        const arr = Array.from(seenEventIds.current);
        seenEventIds.current = new Set(arr.slice(500));
      }

      switch (envelope.type) {
        case 'trade.upserted':
          handleTradeEvent(envelope.data as Trade, envelope.token);
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
