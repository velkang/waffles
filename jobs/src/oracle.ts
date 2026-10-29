import {
  SOL_USD_FEED,
  priceMicros,
  json,
  type PriceObservation,
} from "@waffles/shared/solana";
import type { Env } from "./env";
export async function oracle(env: Env, at: number): Promise<bigint> {
  const saved = await env.DB.prepare(
    "SELECT usd_micros FROM oracle_prices WHERE at=?",
  )
    .bind(at)
    .first<{ usd_micros: string }>();
  if (saved) return BigInt(saved.usd_micros);
  const url = new URL(`/v2/updates/price/${at}`, env.PYTH_URL);
  url.searchParams.append("ids[]", SOL_USD_FEED);
  const response = await fetch(url, {
    headers: env.PYTH_API_KEY
      ? { Authorization: `Bearer ${env.PYTH_API_KEY}` }
      : {},
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok)
    throw new Error(`Historical SOL/USD unavailable (${response.status})`);
  const body = (await response.json()) as {
    parsed: {
      id: string;
      price: {
        price: string;
        conf: string;
        expo: number;
        publish_time: number;
      };
    }[];
  };
  const row = body.parsed.find((p) => p.id === SOL_USD_FEED);
  if (!row) throw new Error("SOL/USD feed missing");
  const observation: PriceObservation = {
    feed: row.id,
    publishTime: row.price.publish_time,
    price: row.price.price,
    confidence: row.price.conf,
    exponent: row.price.expo,
  };
  const price = priceMicros(observation, at, SOL_USD_FEED);
  const objectKey = `oracle/${at}.json`;
  await env.ARTIFACTS.put(objectKey, json(body));
  await env.DB.prepare(
    "INSERT OR IGNORE INTO oracle_prices(at,publish_time,usd_micros,r2_key) VALUES(?,?,?,?)",
  )
    .bind(at, observation.publishTime, price.toString(), objectKey)
    .run();
  return price;
}
