import { env, applyD1Migrations, runInDurableObject } from "cloudflare:test";
import type { RpcBudget } from "../../jobs/src/rpc";
import { beforeAll, beforeEach } from "vitest";
beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));

beforeEach(async () => {
  // Range tests share the production-named limiter. Each test starts with a
  // fresh quota instead of consuming the allowance of the preceding test.
  await runInDurableObject<RpcBudget, void>(
    env.RPC.get(env.RPC.idFromName("devnet")),
    async (instance, state) => {
      await state.storage.deleteAll();
      const limiter = instance as unknown as { budget?: unknown; persistAt: number; requestBudget?: unknown };
      limiter.budget = undefined;
      limiter.persistAt = 0;
      limiter.requestBudget = undefined;
    },
  );
  const tables = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations'",
  ).all<{ name: string }>();
  await env.DB.batch([
    env.DB.prepare("PRAGMA defer_foreign_keys = ON"),
    ...tables.results.map(({ name }) =>
      env.DB.prepare(`DELETE FROM "${name.replaceAll('"', '""')}"`),
    ),
  ]);
});
