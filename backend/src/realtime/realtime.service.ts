import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { LaunchesService } from '../launches/launches.service';
import {
  buildEventId,
  ControlEventDoc,
  RealtimeEventType,
  SseEnvelope,
} from '@waffles/shared';
import { ChangeStream, Document } from 'mongodb';
import { Subject, Observable, defer, filter, finalize } from 'rxjs';
import { createHash } from 'node:crypto';

export interface SubscriptionFilter {
  topics?: string[];
  lastEventId?: string;
}

@Injectable()
export class RealtimeService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly eventSubject = new Subject<SseEnvelope>();
  private readonly replayBuffer: SseEnvelope[] = [];
  private readonly MAX_BUFFER_SIZE = 500;

  private tradeStream: ChangeStream | null = null;
  private launchStream: ChangeStream | null = null;
  private controlStream: ChangeStream | null = null;
  private isWatching = false;
  private isShuttingDown = false;
  private restartTimer: NodeJS.Timeout | null = null;
  private startPromise: Promise<void> | null = null;
  private activeConnections = 0;
  private publishedEvents = 0;
  private lastEventAt?: string;
  private lastEventLagMs?: number;

  constructor(
    private readonly dbService: DatabaseService,
    private readonly configService: ConfigService,
    private readonly launchesService: LaunchesService,
  ) {}

  async onApplicationBootstrap() {
    await this.startWatching();
  }

  async onApplicationShutdown(signal?: string) {
    this.isShuttingDown = true;
    this.logger.log(`Closing change streams due to shutdown: ${signal}`);
    await this.stopWatching();
  }

  async startWatching(): Promise<void> {
    if (this.isWatching || this.isShuttingDown) return;
    if (this.startPromise) return this.startPromise;

    this.startPromise = this.startWatchingInternal().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  private async startWatchingInternal(): Promise<void> {
    try {
      const db = await this.dbService.connect();

      // Watch trades collection
      const trades = db.collection('trades');
      this.tradeStream = trades.watch(
        [{ $match: { operationType: { $in: ['insert', 'replace', 'update'] } } }],
        { fullDocument: 'updateLookup' },
      );
      this.tradeStream.on('change', (change) => void this.handleTradeChange(change));
      this.tradeStream.on('error', (err) => this.handleChangeStreamError('trades', err));

      // Watch launches collection
      const launches = db.collection('launches');
      this.launchStream = launches.watch(
        [{ $match: { operationType: { $in: ['insert', 'replace', 'update'] } } }],
        { fullDocument: 'updateLookup' },
      );
      this.launchStream.on('change', (change) => void this.handleLaunchChange(change));
      this.launchStream.on('error', (err) => this.handleChangeStreamError('launches', err));

      // Watch realtimeEvents control collection
      const control = db.collection('realtimeEvents');
      this.controlStream = control.watch(
        [{ $match: { operationType: { $in: ['insert'] } } }],
        { fullDocument: 'updateLookup' },
      );
      this.controlStream.on('change', (change) => this.handleControlChange(change));
      this.controlStream.on('error', (err) => this.handleChangeStreamError('control', err));

      this.isWatching = true;
      this.logger.log('Realtime change streams initialized');
    } catch (err) {
      this.isWatching = false;
      await this.closeStreams();
      this.logger.error(
        'Change streams startup failed',
        err instanceof Error ? err.stack : String(err),
      );
      this.scheduleRestart();
    }
  }

  async stopWatching(): Promise<void> {
    this.isWatching = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    await this.closeStreams();
  }

  private async closeStreams(): Promise<void> {
    await Promise.allSettled([
      this.tradeStream?.close(),
      this.launchStream?.close(),
      this.controlStream?.close(),
    ]);
    this.tradeStream = null;
    this.launchStream = null;
    this.controlStream = null;
  }

  isHealthy(): boolean {
    return Boolean(
      this.isWatching &&
        this.tradeStream &&
        this.launchStream &&
        this.controlStream,
    );
  }

  private handleChangeStreamError(collectionName: string, err: unknown) {
    this.logger.error(`Change stream error on ${collectionName}:`, err instanceof Error ? err.stack : err);
    this.isWatching = false;
    this.scheduleRestart();
  }

  private scheduleRestart(): void {
    if (this.isShuttingDown || this.restartTimer) return;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      void this.closeStreams().then(() => this.startWatching());
    }, 5000);
  }

  // Publish an event into the stream and buffer
  publish(envelope: SseEnvelope): void {
    this.publishedEvents += 1;
    this.lastEventAt = new Date().toISOString();
    const occurredAt = Date.parse(envelope.occurredAt);
    this.lastEventLagMs = Number.isFinite(occurredAt)
      ? Math.max(0, Date.now() - occurredAt)
      : undefined;
    this.replayBuffer.push(envelope);
    if (this.replayBuffer.length > this.MAX_BUFFER_SIZE) {
      this.replayBuffer.shift();
    }
    this.eventSubject.next(envelope);
  }

  getReplayEventsAfter(
    lastEventId: string,
    topics: string[] = [],
  ): { replayed: SseEnvelope[]; canReplay: boolean } {
    if (!lastEventId) return { replayed: [], canReplay: true };
    const index = this.replayBuffer.findIndex((e) => e.id === lastEventId);
    if (index === -1) {
      // Buffer does not have this ID (either too old or invalid)
      return { replayed: [], canReplay: false };
    }
    return {
      replayed: this.replayBuffer
        .slice(index + 1)
        .filter((event) => this.matchesTopics(event, topics)),
      canReplay: true,
    };
  }

  getEventsObservable(filterOptions: SubscriptionFilter): Observable<SseEnvelope> {
    return defer(() => {
      this.activeConnections += 1;
      return this.eventSubject.asObservable().pipe(
        filter((event) => this.matchesTopics(event, filterOptions.topics || [])),
        finalize(() => {
          this.activeConnections = Math.max(0, this.activeConnections - 1);
        }),
      );
    });
  }

  getMetrics() {
    return {
      watcherReady: this.isHealthy(),
      activeConnections: this.activeConnections,
      replayBufferSize: this.replayBuffer.length,
      publishedEvents: this.publishedEvents,
      lastEventAt: this.lastEventAt ?? null,
      lastEventLagMs: this.lastEventLagMs ?? null,
    };
  }

  private matchesTopics(event: SseEnvelope, rawTopics: string[]): boolean {
    const topics = rawTopics.map((t) => t.toLowerCase().trim()).filter(Boolean);
    if (event.type.startsWith('system.') || event.type === 'stream.ready' || event.type === 'heartbeat') {
      return true;
    }
    if (topics.length === 0 || topics.includes('*')) return true;

    const eventToken = event.token?.toLowerCase();
    const eventCurve = event.curve?.toLowerCase();
    const eventTrader = this.getEventTrader(event);

    return topics.some((topic) => {
      if (topic === 'launches') return event.type.startsWith('launch.');
      if (topic.startsWith('token:')) {
        const target = topic.slice(6);
        return eventToken === target || eventCurve === target;
      }
      if (topic.startsWith('portfolio:')) {
        return eventTrader === topic.slice(10);
      }
      return false;
    });
  }

  private getEventTrader(event: SseEnvelope): string | undefined {
    if (!event.data || typeof event.data !== 'object') return undefined;
    const trader = (event.data as Record<string, unknown>).trader;
    return typeof trader === 'string' ? trader.toLowerCase() : undefined;
  }

  private getChangeSuffix(change: Document): string {
    return createHash('sha256')
      .update(JSON.stringify(change._id ?? change.clusterTime ?? Date.now()))
      .digest('hex')
      .slice(0, 16);
  }

  private async handleTradeChange(change: Document) {
    try {
      const doc = change.fullDocument;
      if (!doc) return;

      const chainId = this.configService.get<string>('chainId', 'arc-testnet');
      const eventId = buildEventId(
        chainId,
        doc.blockNumber,
        doc.logIndex,
        'trade.upserted',
        this.getChangeSuffix(change),
      );

      // Lookup token if curveAddress is known
      let tokenAddress: string | undefined;
      try {
        const db = this.dbService.getDb();
        const launch = await db.collection('launches').findOne(
          { curve: doc.curveAddress },
          { projection: { token: 1 } },
        );
        tokenAddress = launch?.token;
      } catch {}

      const envelope: SseEnvelope = {
        id: eventId,
        schemaVersion: 1,
        type: 'trade.upserted',
        occurredAt: doc.timestamp instanceof Date ? doc.timestamp.toISOString() : new Date().toISOString(),
        chainId,
        blockNumber: doc.blockNumber,
        logIndex: doc.logIndex,
        txHash: doc.txHash,
        token: tokenAddress,
        curve: doc.curveAddress,
        data: {
          trader: doc.trader,
          isBuy: doc.isBuy,
          usdcAmount: doc.usdcAmount,
          usdcGrossAmount: doc.usdcGrossAmount ?? doc.usdcAmount,
          feeAmount: doc.feeAmount,
          tokenAmount: doc.tokenAmount,
          priceAfter: doc.priceAfter,
          executionPrice: doc.executionPrice,
          mcapAfter: doc.mcapAfter,
          progressBpsAfter: doc.progressBpsAfter,
          blockNumber: doc.blockNumber,
          logIndex: doc.logIndex,
          txHash: doc.txHash,
          timestamp: doc.timestamp instanceof Date ? doc.timestamp.toISOString() : doc.timestamp,
          source: doc.source,
        },
      };

      this.publish(envelope);
    } catch (err) {
      this.logger.error('Error processing trade change:', err instanceof Error ? err.stack : err);
    }
  }

  private async handleLaunchChange(change: Document) {
    try {
      const doc = change.fullDocument;
      if (!doc) return;

      const chainId = this.configService.get<string>('chainId', 'arc-testnet');
      const opType = change.operationType;

      let type: RealtimeEventType = 'launch.updated';
      if (opType === 'insert') {
        type = 'launch.created';
      } else if (
        opType === 'update' &&
        (change.updateDescription?.updatedFields?.graduated === true ||
          change.updateDescription?.updatedFields?.graduationBlock !== undefined)
      ) {
        type = 'launch.graduated';
      }

      const eventId = buildEventId(
        chainId,
        type === 'launch.graduated'
          ? (doc.graduationBlock ?? doc.createdBlock)
          : doc.createdBlock,
        0,
        type,
        this.getChangeSuffix(change),
      );

      // Enrich launch metrics
      const db = this.dbService.getDb();
      const [summary] = await this.launchesService.enrichLaunches(db, [doc]);

      const envelope: SseEnvelope = {
        id: eventId,
        schemaVersion: 1,
        type,
        occurredAt: new Date().toISOString(),
        chainId,
        token: doc.token,
        curve: doc.curve,
        data: summary,
      };

      this.publish(envelope);
    } catch (err) {
      this.logger.error('Error processing launch change:', err instanceof Error ? err.stack : err);
    }
  }

  private handleControlChange(change: Document) {
    try {
      const doc = change.fullDocument as ControlEventDoc;
      if (!doc) return;

      const chainId = this.configService.get<string>('chainId', 'arc-testnet');
      const eventId = buildEventId(chainId, undefined, undefined, doc.type as RealtimeEventType);

      const envelope: SseEnvelope = {
        id: eventId,
        schemaVersion: 1,
        type: doc.type as RealtimeEventType,
        occurredAt: doc.occurredAt instanceof Date ? doc.occurredAt.toISOString() : new Date().toISOString(),
        chainId: doc.chainId || chainId,
        data: {
          fromBlock: doc.fromBlock,
          reason: doc.reason,
          metadata: doc.metadata,
        },
      };

      this.publish(envelope);
    } catch (err) {
      this.logger.error('Error processing control event:', err instanceof Error ? err.stack : err);
    }
  }
}
