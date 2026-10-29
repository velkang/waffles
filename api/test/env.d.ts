import type { Env as ApiEnv } from "../src/env";
import type { D1Migration } from "cloudflare:test";
declare global {
  namespace Cloudflare {
    interface Env extends ApiEnv {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
