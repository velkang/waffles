import { config } from "./config.js";
import { getDb } from "./db.js";
import {
  CircleMonitorManager,
  circleMonitoringConfigured,
  startCircleMonitorReconciler,
} from "./circle-monitors.js";
import { startCircleEventLogReconciler } from "./circle-event-logs.js";
import { startWebhookServer } from "./webhook.js";

async function main() {
  if (!circleMonitoringConfigured()) {
    throw new Error(
      "CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET are required: Circle webhooks and event logs are the indexer's event source",
    );
  }

  const db = await getDb();
  const manager = new CircleMonitorManager(db);
  const monitorReconciler = startCircleMonitorReconciler(db, manager);
  const eventLogReconciler = startCircleEventLogReconciler(db, manager);
  const reconcileTopology = () => {
    monitorReconciler?.reconcileNow();
    eventLogReconciler.reconcileNow();
  };

  startWebhookServer(
    db,
    config.port,
    reconcileTopology,
    (body) => manager.resolveLogIndex(body),
  );

  console.log(
    `⚡ waffles Circle indexer running: webhook=${config.port} blockchain=${config.circleBlockchain} factory=${config.factoryAddress}`,
  );
}

main().catch((err) => {
  console.error("fatal indexer error:", err);
  process.exit(1);
});
