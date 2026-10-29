import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => ({
  resolve: {
    mainFields: ["main", "module"],
    conditions: ["node"],
    extensions: [".js", ".mjs", ".ts", ".json"],
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
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
          if (method === "getGenesisHash")
            return Response.json({
              jsonrpc: "2.0",
              id,
              result: "verified-devnet",
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
          RPC_URL: "https://api.devnet.solana.com",
          GENESIS_HASH: "",
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
