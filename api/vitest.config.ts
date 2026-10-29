import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

let genesisRequests = 0;

export default defineConfig(async () => ({
  resolve: {
    mainFields: ["main", "module"],
    conditions: ["node"],
    extensions: [".js", ".mjs", ".ts", ".json"],
  },
  plugins: [
    cloudflareTest({
      main: "./test/worker.ts",
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        queueProducers: { BLOCKS: "test-blocks" },
        durableObjects: {
          RPC: { className: "RpcBudget" },
          COORDINATOR: { className: "Coordinator" },
        },
        outboundService: async (request) => {
          if (new URL(request.url).hostname !== "rpc.test")
            return new Response("Unexpected outbound test request", {
              status: 502,
            });
          const { id, method, params } = (await request.json()) as {
            id: string;
            method: string;
            params: unknown[];
          };
          if (method === "getGenesisHash") {
            genesisRequests++;
            return Response.json({
              jsonrpc: "2.0",
              id,
              result: "verified-devnet",
            });
          }
          if (method === "getBalance") {
            if (params[0] === "rate-limit")
              return new Response("limited", {
                status: 429,
                headers: { "Retry-After": "60" },
              });
            return Response.json({
              jsonrpc: "2.0",
              id,
              result: {
                context: { slot: 12 },
                value: params[0] === "network-checks" ? genesisRequests : 42,
              },
            });
          }
          if (method === "getSlot")
            return Response.json({ jsonrpc: "2.0", id, result: 20 });
          if (method === "getBlocks")
            return Response.json({
              jsonrpc: "2.0",
              id,
              result: [12, 14, 15].filter(
                (slot) =>
                  slot >= Number(params[0]) && slot <= Number(params[1]),
              ),
            });
          if (
            method !== "getBlock" ||
            (params[1] as { maxSupportedTransactionVersion: number })
              .maxSupportedTransactionVersion !== 1
          )
            return Response.json({
              jsonrpc: "2.0",
              id,
              error: {
                code: -32015,
                message: "Unsupported transaction version",
              },
            });
          return Response.json({
            jsonrpc: "2.0",
            id,
            result: {
              blockhash: "11111111111111111111111111111111",
              previousBlockhash: "11111111111111111111111111111111",
              parentSlot: 11,
              blockHeight: 12,
              blockTime: 200,
              transactions: [
                {
                  version: 1,
                  transaction: {
                    signatures: ["version-1-fixture"],
                    message: {
                      accountKeys: [],
                      instructions: [],
                      recentBlockhash: "11111111111111111111111111111111",
                    },
                  },
                  meta: {
                    err: null,
                    fee: 0,
                    preBalances: [],
                    postBalances: [],
                    innerInstructions: [],
                  },
                },
              ],
            },
          });
        },
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations("./migrations"),
          RPC_URL: "https://rpc.test",
          RPC_CU_PER_SECOND: "320",
          START_SLOT: "12",
          GENESIS_HASH: "verified-devnet",
          UPGRADE_AUTHORITY: "",
          ACCESS_TEAM: "",
          ACCESS_AUD: "",
          OPERATIONS_TOKEN: "test-only-operations",
        },
        serviceBindings: {
          JOBS: async () => new Response("not configured", { status: 503 }),
        },
      },
    }),
  ],
  test: { setupFiles: ["./test/setup.ts"], server: { deps: { inline: true } } },
}));
