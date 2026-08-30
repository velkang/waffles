import type { Db } from "mongodb";
import type { EventLog } from "@circle-fin/smart-contract-platform";
import { config } from "./config.js";
import { CircleMonitorManager } from "./circle-monitors.js";
import {
  processCircleWebhookPayload,
  type CircleWebhookNotification,
} from "./webhook.js";

type CircleCursorDoc = {
  _id: string;
  lastConfirmDate?: string;
  updatedAt: Date;
};

function eventLogPayload(log: EventLog): CircleWebhookNotification {
  return {
    notificationId: log.id,
    notificationType: "contracts.eventLog",
    notification: {
      contractAddress: log.contractAddress as `0x${string}`,
      blockchain: String(log.blockchain),
      txHash: log.txHash as `0x${string}`,
      userOpHash: log.userOpHash,
      blockHash: log.blockHash as `0x${string}`,
      blockHeight: log.blockHeight,
      logIndex: log.logIndex,
      eventSignature: log.eventSignature,
      eventSignatureHash: log.eventSignatureHash as `0x${string}`,
      topics: log.topics as `0x${string}`[],
      data: log.data as `0x${string}`,
      firstConfirmDate: log.firstConfirmDate,
    },
    timestamp: log.firstConfirmDate,
    version: 2,
  };
}

export class CircleEventLogReconciler {
  constructor(
    private readonly db: Db,
    private readonly manager: CircleMonitorManager,
  ) {}

  async reconcile(): Promise<number> {
    let processed = await this.reconcilePass();
    // Factory history can discover launches whose curve monitors and histories
    // did not exist in the first pass.
    await this.manager.reconcile();
    processed += await this.reconcilePass();
    if (processed > 0) {
      console.log(`[circle] historical event logs reconciled: ${processed}`);
    }
    return processed;
  }

  private async reconcilePass(): Promise<number> {
    const specs = await this.manager.getMonitorSpecs();
    const addresses = [...new Set(specs.map((spec) => spec.address.toLowerCase()))];
    let processed = 0;
    for (const address of addresses) {
      processed += await this.reconcileAddress(address);
    }
    return processed;
  }

  private async reconcileAddress(address: string): Promise<number> {
    const cursors = this.db.collection<CircleCursorDoc>("circleEventCursors");
    const cursorId = `${config.circleBlockchain.toLowerCase()}:${address}`;
    const saved = await cursors.findOne({ _id: cursorId });
    let pageAfter: string | undefined;
    let newestConfirmDate = saved?.lastConfirmDate;
    let processed = 0;

    for (let page = 0; page < 100; page += 1) {
      const logs = await this.manager.listEventLogsPage(address, {
        from: saved?.lastConfirmDate,
        pageAfter,
        pageSize: 50,
      });
      if (logs.length === 0) break;

      for (const log of logs) {
        const result = await processCircleWebhookPayload(this.db, eventLogPayload(log));
        if (!result.success) {
          throw new Error(result.error ?? `failed to reconcile Circle event log ${log.id}`);
        }
        processed += 1;
        if (!newestConfirmDate || log.firstConfirmDate > newestConfirmDate) {
          newestConfirmDate = log.firstConfirmDate;
        }
      }

      pageAfter = logs.at(-1)?.id;
      if (logs.length < 50 || !pageAfter) break;
    }
    if (newestConfirmDate) {
      await cursors.updateOne(
        { _id: cursorId },
        { $set: { lastConfirmDate: newestConfirmDate, updatedAt: new Date() } },
        { upsert: true },
      );
    }
    return processed;
  }
}

export type CircleEventLogReconcilerHandle = {
  reconcileNow: () => void;
  stop: () => void;
};

export function startCircleEventLogReconciler(
  db: Db,
  manager: CircleMonitorManager,
): CircleEventLogReconcilerHandle {
  const reconciler = new CircleEventLogReconciler(db, manager);
  let running = false;
  let rerunRequested = false;
  let stopped = false;
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
          await reconciler.reconcile();
        } catch (error) {
          console.error(
            "[circle] event-log reconciliation failed:",
            error instanceof Error ? error.message : error,
          );
        }
      } while (rerunRequested && !stopped);
    } finally {
      running = false;
      if (!stopped) timer = setTimeout(run, config.circleEventLogIntervalMs);
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
