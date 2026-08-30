import { randomUUID } from "node:crypto";
import {
  initiateSmartContractPlatformClient,
  type Blockchain,
  type CircleSmartContractPlatformClient,
  type EventLog,
} from "@circle-fin/smart-contract-platform";
import type { Db } from "mongodb";
import { config } from "./config.js";
import { closeDb, getDb, type LaunchDoc } from "./db.js";
import type { CircleWebhookNotification } from "./webhook.js";

export const TOKEN_CREATED_SIGNATURE =
  "TokenCreated(address,address,address,string,string,string,string,string,string,string,uint256,uint256)";
export const TRADED_SIGNATURE = "Traded(address,bool,uint256,uint256,uint256,uint256,uint256)";
export const GRADUATED_SIGNATURE = "Graduated(address,address,uint256,uint256)";
export const SWAP_SIGNATURE = "Swap(address,address,uint256,uint256,uint256,uint256)";
export const SYNC_SIGNATURE = "Sync(uint256,uint256)";

export type MonitorSpec = {
  address: string;
  contractName: string;
  eventSignature: string;
};

function circleErrorCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as {
    code?: number;
    response?: { data?: { code?: number } };
  };
  return candidate.response?.data?.code ?? candidate.code;
}

export function circleMonitoringConfigured(): boolean {
  return Boolean(config.circleApiKey && config.circleEntitySecret);
}

export function createCircleClient(): CircleSmartContractPlatformClient {
  if (!config.circleApiKey || !config.circleEntitySecret) {
    throw new Error("CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET are required for Circle event monitors");
  }
  return initiateSmartContractPlatformClient({
    apiKey: config.circleApiKey,
    entitySecret: config.circleEntitySecret,
  });
}

export class CircleMonitorManager {
  private readonly importedContracts = new Set<string>();
  private readonly activeMonitors = new Set<string>();

  constructor(
    private readonly db: Db,
    private readonly client: CircleSmartContractPlatformClient = createCircleClient(),
    private readonly blockchain = config.circleBlockchain as Blockchain,
  ) {}

  private async ensureContractImported(address: string, name: string): Promise<void> {
    const normalized = address.toLowerCase();
    if (this.importedContracts.has(normalized)) return;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await this.client.importContract({
          blockchain: this.blockchain,
          address: normalized,
          name,
          description: "Waffles indexer event source",
          idempotencyKey: randomUUID(),
        });
        break;
      } catch (error) {
        const code = circleErrorCode(error);
        if (code === 175004) break;
        if (code !== 175403 || attempt === 1) throw error;
      }
    }
    this.importedContracts.add(normalized);
  }

  private async findMonitor(address: string, eventSignature: string) {
    const response = await this.client.listEventMonitors({
      blockchain: this.blockchain,
      contractAddress: address,
      eventSignature,
      pageSize: 50,
    });
    return response.data?.eventMonitors.find(
      (candidate) =>
        candidate.contractAddress.toLowerCase() === address
        && candidate.eventSignature === eventSignature,
    );
  }

  private async ensureMonitor(spec: MonitorSpec): Promise<void> {
    const address = spec.address.toLowerCase();
    const key = `${address}:${spec.eventSignature}`;
    if (this.activeMonitors.has(key)) return;

    await this.ensureContractImported(address, spec.contractName);
    let monitor = await this.findMonitor(address, spec.eventSignature);
    if (!monitor) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await this.client.createEventMonitor({
            blockchain: this.blockchain,
            contractAddress: address,
            eventSignature: spec.eventSignature,
            idempotencyKey: randomUUID(),
          });
          monitor = response.data?.eventMonitor;
          break;
        } catch (error) {
          const code = circleErrorCode(error);
          if (code === 175302) {
            monitor = await this.findMonitor(address, spec.eventSignature);
            if (monitor) break;
          }
          if (code !== 175403 || attempt === 1) throw error;
        }
      }
    }
    if (monitor && !monitor.isEnabled) {
      await this.client.updateEventMonitor({ id: monitor.id, isEnabled: true });
    }
    this.activeMonitors.add(key);
    console.log(`[circle] monitor active: ${spec.eventSignature} on ${address}`);
  }

  async getMonitorSpecs(): Promise<MonitorSpec[]> {
    const specs: MonitorSpec[] = [
      {
        address: config.factoryAddress,
        contractName: "WafflesLaunchFactory",
        eventSignature: TOKEN_CREATED_SIGNATURE,
      },
    ];

    const launches = await this.db
      .collection<LaunchDoc>("launches")
      .find({}, { projection: { curve: 1, pool: 1 } })
      .toArray();

    for (const launch of launches) {
      specs.push(
        {
          address: launch.curve,
          contractName: `WafflesBondingCurve${launch.curve.slice(2, 10)}`,
          eventSignature: TRADED_SIGNATURE,
        },
        {
          address: launch.curve,
          contractName: `WafflesBondingCurve${launch.curve.slice(2, 10)}`,
          eventSignature: GRADUATED_SIGNATURE,
        },
      );
      if (launch.pool) {
        specs.push(
          {
            address: launch.pool,
            contractName: `WafflesAmmPair${launch.pool.slice(2, 10)}`,
            eventSignature: SWAP_SIGNATURE,
          },
          {
            address: launch.pool,
            contractName: `WafflesAmmPair${launch.pool.slice(2, 10)}`,
            eventSignature: SYNC_SIGNATURE,
          },
        );
      }
    }
    return specs;
  }

  async reconcile(): Promise<void> {
    const specs = await this.getMonitorSpecs();

    const errors: unknown[] = [];
    for (const spec of specs) {
      try {
        await this.ensureMonitor(spec);
      } catch (error) {
        errors.push(error);
        console.error(
          `[circle] failed to reconcile ${spec.eventSignature} on ${spec.address}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, `${errors.length} Circle monitor(s) failed to reconcile`);
    }
  }

  async listEventLogs(contractAddress: string, pageSize = 50) {
    return this.client.listEventLogs({
      blockchain: this.blockchain,
      contractAddress: contractAddress.toLowerCase(),
      pageSize,
    });
  }

  async listEventLogsPage(
    contractAddress: string,
    options: { from?: string; to?: string; pageAfter?: string; pageSize?: number } = {},
  ): Promise<EventLog[]> {
    const response = await this.client.listEventLogs({
      blockchain: this.blockchain,
      contractAddress: contractAddress.toLowerCase(),
      from: options.from,
      to: options.to,
      pageAfter: options.pageAfter,
      pageSize: options.pageSize ?? 50,
    });
    return response.data?.eventLogs ?? [];
  }

  async resolveLogIndex(body: CircleWebhookNotification): Promise<number> {
    const notification = body.notification;
    const confirmedAt = new Date(notification.firstConfirmDate ?? body.timestamp);
    const sentAt = new Date(body.timestamp);
    const from = new Date(confirmedAt.getTime() - 2 * 60_000).toISOString();
    const to = new Date(sentAt.getTime() + 2 * 60_000).toISOString();
    let pageAfter: string | undefined;

    for (let page = 0; page < 10; page += 1) {
      const logs = await this.listEventLogsPage(notification.contractAddress, {
        from,
        to,
        pageAfter,
        pageSize: 50,
      });
      const match = logs.find((log) => this.matchesWebhook(log, body));
      if (match) {
        const logIndex = Number(match.logIndex);
        if (Number.isSafeInteger(logIndex) && logIndex >= 0) return logIndex;
        throw new Error(`Circle returned invalid logIndex ${match.logIndex}`);
      }
      if (logs.length < 50) break;
      pageAfter = logs.at(-1)?.id;
      if (!pageAfter) break;
    }
    throw new Error(`Circle event log is not available yet for ${notification.txHash}`);
  }

  private matchesWebhook(log: EventLog, body: CircleWebhookNotification): boolean {
    const notification = body.notification;
    return log.contractAddress.toLowerCase() === notification.contractAddress.toLowerCase()
      && log.txHash.toLowerCase() === notification.txHash.toLowerCase()
      && log.eventSignatureHash.toLowerCase()
        === (notification.eventSignatureHash ?? notification.topics[0])?.toLowerCase()
      && log.data.toLowerCase() === notification.data.toLowerCase()
      && log.topics.length === notification.topics.length
      && log.topics.every(
        (topic, index) => topic.toLowerCase() === notification.topics[index]?.toLowerCase(),
      );
  }
}

export type CircleMonitorReconciler = {
  reconcileNow: () => void;
  stop: () => void;
};

export function startCircleMonitorReconciler(
  db: Db,
  existingManager?: CircleMonitorManager,
): CircleMonitorReconciler | undefined {
  if (!circleMonitoringConfigured()) {
    console.warn("[circle] monitor reconciliation disabled: Circle credentials are not configured");
    return undefined;
  }

  const manager = existingManager ?? new CircleMonitorManager(db);
  let stopped = false;
  let running = false;
  let rerunRequested = false;
  let timer: NodeJS.Timeout | undefined;
  const run = async () => {
    if (running) {
      rerunRequested = true;
      return;
    }
    running = true;
    try {
      do {
        rerunRequested = false;
        try {
          await manager.reconcile();
        } catch (error) {
          console.error("[circle] monitor reconciliation failed:", error instanceof Error ? error.message : error);
        }
      } while (rerunRequested && !stopped);
    } finally {
      running = false;
      if (!stopped) timer = setTimeout(run, config.circleMonitorIntervalMs);
    }
  };
  void run();

  return {
    reconcileNow: () => {
      if (timer) clearTimeout(timer);
      void run();
    },
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}

async function main() {
  const db = await getDb();
  try {
    await new CircleMonitorManager(db).reconcile();
  } finally {
    await closeDb();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Circle monitor setup failed:", error);
    process.exitCode = 1;
  });
}
