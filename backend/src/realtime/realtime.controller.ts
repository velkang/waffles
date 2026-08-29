import {
  BadRequestException,
  Controller,
  Header,
  Headers,
  Query,
  Sse,
  MessageEvent,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RealtimeService } from './realtime.service';
import { buildEventId, SseEnvelope } from '@waffles/shared';
import { Observable, concat, from, interval, map, merge } from 'rxjs';

@ApiTags('Realtime')
@Controller()
export class RealtimeController {
  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly configService: ConfigService,
  ) {}

  @Sse('v1/events')
  @Header('Cache-Control', 'no-cache, no-transform')
  @Header('X-Accel-Buffering', 'no')
  @ApiOperation({
    summary: 'Server-Sent Events (SSE) stream for realtime trades, launches, and system events',
  })
  @ApiQuery({
    name: 'topic',
    required: false,
    description: 'Topic filter: "launches", "token:0x...", "portfolio:0x...", or comma-separated list',
    example: 'launches,token:0x1111111111111111111111111111111111111111',
  })
  @ApiResponse({ status: 200, description: 'SSE event stream connection established' })
  events(
    @Query('topic') rawTopic?: string,
    @Query('lastEventId') queryLastEventId?: string,
    @Headers('last-event-id') headerLastEventId?: string,
  ): Observable<MessageEvent> {
    this.assertRealtimeReady();
    return this.createEventStream(rawTopic, queryLastEventId, headerLastEventId);
  }

  @Sse('events')
  @Header('Cache-Control', 'no-cache, no-transform')
  @Header('X-Accel-Buffering', 'no')
  legacyEvents(
    @Query('topic') rawTopic?: string,
    @Query('lastEventId') queryLastEventId?: string,
    @Headers('last-event-id') headerLastEventId?: string,
  ): Observable<MessageEvent> {
    this.assertRealtimeReady();
    return this.createEventStream(rawTopic, queryLastEventId, headerLastEventId);
  }

  private assertRealtimeReady(): void {
    if (!this.realtimeService.isHealthy()) {
      throw new ServiceUnavailableException('Realtime change streams are not ready');
    }
  }

  private createEventStream(
    rawTopic?: string,
    queryLastEventId?: string,
    headerLastEventId?: string,
  ): Observable<MessageEvent> {
    const topics = this.parseTopics(rawTopic);
    const lastEventId = headerLastEventId || queryLastEventId || '';
    const chainId = this.configService.get<string>('chainId', 'arc-testnet');

    const initialMessages: SseEnvelope[] = [];

    // 1. Initial stream.ready event
    const readyEventId = buildEventId(chainId, undefined, undefined, 'stream.ready');
    const readyEvent: SseEnvelope = {
      id: readyEventId,
      schemaVersion: 1,
      type: 'stream.ready',
      occurredAt: new Date().toISOString(),
      data: {
        subscribedTopics: topics,
        connectedAt: new Date().toISOString(),
      },
    };
    initialMessages.push(readyEvent);

    // 2. Check replay buffer if lastEventId is provided
    if (lastEventId) {
      const { replayed, canReplay } = this.realtimeService.getReplayEventsAfter(
        lastEventId,
        topics,
      );
      if (canReplay) {
        initialMessages.push(...replayed);
      } else {
        // Cannot replay -> notify client to perform full snapshot resync
        const resyncEvent: SseEnvelope = {
          id: buildEventId(chainId, undefined, undefined, 'system.resync'),
          schemaVersion: 1,
          type: 'system.resync',
          occurredAt: new Date().toISOString(),
          data: {
            reason: 'last_event_id_expired_from_buffer',
            requestedLastEventId: lastEventId,
          },
        };
        initialMessages.push(resyncEvent);
      }
    }

    const initial$ = from(initialMessages);

    // 3. Heartbeat stream (every 20 seconds)
    const heartbeat$ = interval(20000).pipe(
      map(() => {
        const envelope: SseEnvelope = {
          id: buildEventId(chainId, undefined, undefined, 'heartbeat'),
          schemaVersion: 1,
          type: 'heartbeat',
          occurredAt: new Date().toISOString(),
          data: { ping: 'pong' },
        };
        return envelope;
      }),
    );

    // 4. Live events stream filtered by topic
    const live$ = this.realtimeService.getEventsObservable({
      topics,
      lastEventId,
    });

    const combinedLive$ = merge(live$, heartbeat$);

    return concat(initial$, combinedLive$).pipe(
      map((envelope: SseEnvelope) => ({
        id: envelope.id,
        type: envelope.type,
        data: envelope,
      })),
    );
  }

  private parseTopics(rawTopic?: string): string[] {
    if (!rawTopic) return [];
    if (rawTopic.length > 1_024) {
      throw new BadRequestException('topic query is too long');
    }

    const topics = rawTopic
      .split(',')
      .map((topic) => topic.toLowerCase().trim())
      .filter(Boolean);
    if (topics.length > 16) {
      throw new BadRequestException('at most 16 topics may be subscribed');
    }

    const valid = topics.every(
      (topic) =>
        topic === '*' ||
        topic === 'launches' ||
        /^(token|portfolio):0x[0-9a-f]{40}$/.test(topic),
    );
    if (!valid) throw new BadRequestException('invalid realtime topic');
    return [...new Set(topics)];
  }
}
