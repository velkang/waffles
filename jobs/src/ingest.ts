import { rpcConnection } from "./rpc";
import {
  Connection,
  PublicKey,
  type ParsedBlockResponse,
  type ParsedInstruction,
  type PartiallyDecodedInstruction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { utils } from "@coral-xyz/anchor";
import {
  program,
  plain,
  marketAddress,
  inventoryAddress,
  pda,
} from "@waffles/shared/client";
import {
  SUPPLY,
  INITIAL_SOL,
  INITIAL_TOKENS,
  MIN_TOKENS,
  DAY,
  LAMPORTS,
  epochAt,
  epochBounds,
  splitFee,
  routeCreator,
  json,
  type Market,
  type SolTrade,
  type Commitment,
} from "@waffles/shared/solana";
import {
  consumeLots,
  holdingWeight,
  type PurchaseLot,
  sha,
  hex,
} from "@waffles/shared/rewards";
import type { Env } from "./env";

type Event = { name: string; data: Record<string, any>; order: number };
type Owner = {
  mint: string;
  wallet: string;
  balance: bigint;
  lots: PurchaseLot[];
  updated: number;
};
type TokenOwner = {
  mint: string;
  owner: string;
  beneficiary: string | null;
  limit?: bigint;
};
const text = new TextEncoder();
export async function fetchBlock(env: Env, slot: number) {
  const saved = await env.DB.prepare(
    "SELECT object_key FROM pending_blocks WHERE slot=?",
  )
    .bind(slot)
    .first<{ object_key: string }>();
  if (saved && (await env.ARTIFACTS.head(saved.object_key))) return;
  const connection = rpcConnection(env);
  const block = await connection.getParsedBlock(slot, {
    commitment: "finalized",
    maxSupportedTransactionVersion: 1,
    transactionDetails: "full",
    rewards: false,
  });
  if (!block || block.blockTime === null)
    throw new Error(
      `Finalized block ${slot} is unavailable or missing its timestamp`,
    );
  const body = json(block);
  const hash = hex(await sha(text.encode(body)));
  const objectKey = `blocks/${slot}/${hash}.json.gz`;
  const compressed = await new Response(
    new Blob([body]).stream().pipeThrough(new CompressionStream("gzip")),
  ).arrayBuffer();
  await env.ARTIFACTS.put(objectKey, compressed, {
    httpMetadata: { contentType: "application/json", contentEncoding: "gzip" },
  });
  await env.DB.prepare(
    "INSERT INTO pending_blocks(slot,parent,time,object_key,hash) VALUES(?,?,?,?,?) ON CONFLICT(slot) DO UPDATE SET object_key=excluded.object_key,hash=excluded.hash WHERE pending_blocks.applied=0",
  )
    .bind(slot, block.parentSlot, block.blockTime, objectKey, hash)
    .run();
}
function flatten(tx: ParsedBlockResponse["transactions"][number]) {
  const result: (ParsedInstruction | PartiallyDecodedInstruction)[] = [];
  tx.transaction.message.instructions.forEach((ix, i) => {
    result.push(ix);
    result.push(
      ...(tx.meta?.innerInstructions?.find((inner) => inner.index === i)
        ?.instructions ?? []),
    );
  });
  return result;
}
function events(
  env: Env,
  connection: Connection,
  instructions: (ParsedInstruction | PartiallyDecodedInstruction)[],
): Event[] {
  const coder = program(connection).coder.events;
  const result: Event[] = [];
  instructions.forEach((ix, order) => {
    if (ix.programId.toBase58() !== env.PROGRAM_ID || !("data" in ix)) return;
    const data = utils.bytes.bs58.decode(ix.data);
    // Anchor's self-CPI event tag. Only our program can sign its event authority.
    if (hex(data.subarray(0, 8)) !== "e445a52e51cb9a1d") return;
    const decoded = coder.decode(utils.bytes.base64.encode(data.subarray(8)));
    if (decoded)
      result.push({
        name: decoded.name,
        data: plain(decoded.data) as Record<string, any>,
        order,
      });
  });
  return result;
}
export async function applyBlock(
  env: Env,
  slot: number,
  block: ParsedBlockResponse,
) {
  if (block.blockTime === null) throw new Error("Missing block timestamp");
  const connection = rpcConnection(env);
  let hasMarkets = Boolean(
    await env.DB.prepare("SELECT mint FROM markets LIMIT 1").first(),
  );
  for (let position = 0; position < block.transactions.length; position++) {
    const tx = block.transactions[position];
    if (tx.meta?.err) continue;
    // Every SPL mutation must include its executable program in the resolved
    // account list. Vote/system-only transactions cannot change our holdings.
    if (
      !tx.transaction.message.accountKeys.some(({ pubkey }) => {
        const address = typeof pubkey === "string" ? pubkey : pubkey.toBase58();
        return (
          address === env.PROGRAM_ID ||
          (hasMarkets && address === TOKEN_PROGRAM_ID.toBase58())
        );
      })
    )
      continue;

    const signature = tx.transaction.signatures[0];
    const txid = `${slot}:${signature}`;
    if (
      await env.DB.prepare("SELECT id FROM indexed_events WHERE id=?")
        .bind(txid)
        .first()
    )
      continue;
    // R2 JSON archives contain addresses as strings. Restore SDK values at
    // this boundary before instruction decoding and ownership accounting.
    for (const account of tx.transaction.message.accountKeys)
      account.pubkey = new PublicKey(account.pubkey);
    if (
      tx.meta?.innerInstructions == null &&
      tx.transaction.message.accountKeys.some(
        (k) =>
          k.pubkey.toBase58() === env.PROGRAM_ID ||
          k.pubkey.equals(TOKEN_PROGRAM_ID),
      )
    )
      throw new Error("Incomplete token inner-instruction history");
    const instructions = flatten(tx);
    for (const instruction of instructions)
      instruction.programId = new PublicKey(instruction.programId);
    const decoded = events(env, connection, instructions);
    const statements: D1PreparedStatement[] = [];
    const sql = (query: string, ...values: unknown[]) =>
      statements.push(env.DB.prepare(query).bind(...values));
    const markets = new Map<string, Market>();
    const owners = new Map<string, Owner>();
    const accounts = new Map<string, TokenOwner>();
    const market = async (mint: string): Promise<Market | null> => {
      let m = markets.get(mint);
      if (m) return m;
      const row = await env.DB.prepare("SELECT data FROM markets WHERE mint=?")
        .bind(mint)
        .first<{ data: string }>();
      if (!row) return null;
      m = JSON.parse(row.data);
      markets.set(mint, m!);
      return m!;
    };
    // Discover creation and vault beneficiaries before their token CPI instructions.
    for (const event of decoded)
      if (event.name === "created") {
        const d = event.data,
          a = d.args;
        const m: Market = {
          mint: d.mint,
          market: marketAddress(new PublicKey(d.mint)).toBase58(),
          creator: d.creator,
          name: a.name,
          symbol: a.symbol,
          description: a.description,
          imageUri: a.imageUri,
          launchedAt: Number(d.time),
          state: "curve",
          solReserve: INITIAL_SOL.toString(),
          tokenReserve: INITIAL_TOKENS.toString(),
          supply: SUPPLY.toString(),
          volumeSol: "0",
          routing: a.routing,
          feeCliff: Number(a.feeCliff),
          upgradeAuthority: null,
        };
        hasMarkets = true;
        markets.set(m.mint, m);
        sql(
          "INSERT INTO markets(mint,creator,state,launched_at,data) VALUES(?,?,?,?,?)",
          m.mint,
          m.creator,
          m.state,
          m.launchedAt,
          json(m),
        );
        sql(
          "INSERT INTO holding_checkpoints(mint,at) VALUES(?,?)",
          m.mint,
          m.launchedAt + DAY,
        );
      }
    const tokenBalances = new Map<string, bigint>();
    for (const b of tx.meta?.preTokenBalances ?? [])
      tokenBalances.set(
        tx.transaction.message.accountKeys[b.accountIndex].pubkey.toBase58(),
        BigInt(b.uiTokenAmount.amount),
      );
    for (const b of tx.meta?.postTokenBalances ?? []) {
      const address =
        tx.transaction.message.accountKeys[b.accountIndex].pubkey.toBase58();
      if (!tokenBalances.has(address)) tokenBalances.set(address, 0n);
    }
    const locks = new Map(
      decoded
        .filter((e) => e.name === "locked")
        .map((e) => [e.data.id, e.data]),
    );
    const retired = new Set<string>();
    const describe = async (
      id: string,
      mint: string,
      authority: string,
    ): Promise<TokenOwner> => {
      const fresh = locks.get(authority);
      const row = fresh
        ? null
        : await env.DB.prepare("SELECT data FROM commitments WHERE id=?")
            .bind(authority)
            .first<{ data: string }>();
      const commitment: Commitment | null = row ? JSON.parse(row.data) : null;
      const beneficiary = fresh?.owner ?? commitment?.owner ?? null;
      const active = fresh
        ? fresh.tokenAsset
        : commitment?.asset === "token" && !commitment.withdrawn;
      return {
        mint,
        owner: authority,
        beneficiary,
        ...(beneficiary
          ? {
              limit:
                active &&
                !retired.has(authority) &&
                id === pda("locked-tokens", new PublicKey(authority)).toBase58()
                  ? BigInt(fresh?.amount ?? commitment!.amount)
                  : 0n,
            }
          : {}),
      };
    };
    for (const balance of [
      ...(tx.meta?.preTokenBalances ?? []),
      ...(tx.meta?.postTokenBalances ?? []),
    ]) {
      if (!(await market(balance.mint))) continue;
      if (!balance.owner)
        throw new Error("Incomplete token ownership metadata");
      const id =
        tx.transaction.message.accountKeys[
          balance.accountIndex
        ].pubkey.toBase58();
      if (!accounts.has(id))
        accounts.set(id, await describe(id, balance.mint, balance.owner));
    }
    const account = async (id: string) => {
      let a = accounts.get(id);
      if (!a) {
        const row = await env.DB.prepare(
          "SELECT mint,owner,beneficiary FROM token_accounts WHERE address=?",
        )
          .bind(id)
          .first<TokenOwner>();
        if (row) {
          a = await describe(id, row.mint, row.owner);
          accounts.set(id, a);
        }
      }
      return a;
    };
    const protocol = (a: TokenOwner) =>
      !a.beneficiary &&
      (a.owner === marketAddress(new PublicKey(a.mint)).toBase58() ||
        a.owner === pda("config").toBase58());
    const owner = async (mint: string, wallet: string): Promise<Owner> => {
      const id = `${mint}:${wallet}`;
      let o = owners.get(id);
      if (o) return o;
      const row = await env.DB.prepare(
        "SELECT balance,lots,updated_at FROM ownership WHERE mint=? AND wallet=?",
      )
        .bind(mint, wallet)
        .first<{ balance: string; lots: string; updated_at: number }>();
      o = {
        mint,
        wallet,
        balance: BigInt(row?.balance ?? "0"),
        lots: row
          ? JSON.parse(row.lots).map((l: PurchaseLot) => ({
              ...l,
              tokens: BigInt(l.tokens),
              cost: BigInt(l.cost),
            }))
          : [],
        updated: row?.updated_at ?? block.blockTime!,
      };
      owners.set(id, o);
      return o;
    };
    const weights = new Map<
      string,
      { epoch: number; mint: string; wallet: string; weight: bigint }
    >();
    const accrue = (o: Owner, time: number) => {
      const end = Math.max(o.updated, time);
      let start = o.updated;
      while (start < end) {
        const epoch = epochAt(start),
          stop = Math.min(end, epochBounds(epoch).end),
          id = `${epoch}:${o.mint}:${o.wallet}`;
        const w = weights.get(id) ?? {
          epoch,
          mint: o.mint,
          wallet: o.wallet,
          weight: 0n,
        };
        w.weight += o.balance * BigInt(stop - start);
        weights.set(id, w);
        start = stop;
      }
      o.updated = end;
    };
    const held = (a: TokenOwner, amount: bigint) => {
      if (amount < 0n) throw new Error("Incomplete token ownership history");
      return protocol(a)
        ? 0n
        : a.limit === undefined
          ? amount
          : amount < a.limit
            ? amount
            : a.limit;
    };
    const move = async (
      from: TokenOwner,
      to: TokenOwner,
      debit: bigint,
      credit: bigint,
      at: number,
    ) => {
      const sourceWallet = from.beneficiary ?? from.owner;
      const targetWallet = to.beneficiary ?? to.owner;
      if (sourceWallet === targetWallet) {
        const delta = credit - debit;
        if (!delta) return;
        const o = await owner(from.mint, sourceWallet);
        accrue(o, at);
        if (o.balance + delta < 0n)
          throw new Error("Incomplete token ownership history");
        o.balance += delta;
        if (delta < 0n) consumeLots(o.lots, -delta);
      } else {
        if (debit) {
          const o = await owner(from.mint, sourceWallet);
          accrue(o, at);
          if (o.balance < debit)
            throw new Error("Incomplete token ownership history");
          o.balance -= debit;
          consumeLots(o.lots, debit);
        }
        if (credit) {
          const o = await owner(to.mint, targetWallet);
          accrue(o, at);
          o.balance += credit;
        }
      }
    };
    const checkpoints = new Set<string>();
    const checkpoint = async (mint: string, time: number) => {
      const m = await market(mint);
      if (!m || time < m.launchedAt + DAY || checkpoints.has(mint)) return;
      const pending = await env.DB.prepare(
        "SELECT completed FROM holding_checkpoints WHERE mint=?",
      )
        .bind(mint)
        .first<{ completed: number }>();
      if (pending?.completed) return;
      const old = await env.DB.prepare(
        "SELECT wallet FROM ownership WHERE mint=?",
      )
        .bind(mint)
        .all<{ wallet: string }>();
      for (const row of old.results) await owner(mint, row.wallet);
      for (const o of owners.values())
        if (o.mint === mint && o.wallet !== m.creator) {
          const weight = holdingWeight(o.lots, m.launchedAt);
          sql(
            "INSERT OR IGNORE INTO holding_rewards(epoch,mint,wallet,weight) VALUES(?,?,?,?)",
            epochAt(m.launchedAt + DAY),
            mint,
            o.wallet,
            weight.toString(),
          );
        }
      sql("UPDATE holding_checkpoints SET completed=1 WHERE mint=?", mint);
      checkpoints.add(mint);
    };
    // Same-transaction round trips cannot issue purchased holding lots or trading tickets.
    const sides = new Map<string, Set<boolean>>();
    for (const e of decoded)
      if (e.name === "traded") {
        const id = `${e.data.mint}:${e.data.trader}`;
        const set = sides.get(id) ?? new Set();
        set.add(e.data.buy);
        sides.set(id, set);
      }
    for (let i = 0; i < instructions.length; i++) {
      const ix = instructions[i];
      const at = block.blockTime;
      if (ix.programId.equals(TOKEN_PROGRAM_ID) && "parsed" in ix) {
        const info = ix.parsed.info,
          type = ix.parsed.type;
        if (type === "transfer" || type === "transferChecked") {
          const source = await account(info.source),
            destination = await account(info.destination);
          if (!source || !destination) {
            if (
              source ||
              destination ||
              decoded.some(
                (e) =>
                  e.data.mint &&
                  (inventoryAddress(new PublicKey(e.data.mint)).toBase58() ===
                    info.source ||
                    inventoryAddress(new PublicKey(e.data.mint)).toBase58() ===
                      info.destination),
              )
            )
              throw new Error("Incomplete token ownership metadata");
            continue;
          }
          if (source.mint !== destination.mint)
            throw new Error("Inconsistent token transfer metadata");
          const m = await market(source.mint);
          if (!m) continue;
          await checkpoint(source.mint, at);
          const amount = BigInt(info.amount ?? info.tokenAmount?.amount ?? "0");
          const beforeSource = tokenBalances.get(info.source) ?? 0n;
          const beforeDestination = tokenBalances.get(info.destination) ?? 0n;
          const afterSource = beforeSource - amount;
          const afterDestination = beforeDestination + amount;
          // Unlock releases only the recorded entitlement; donated surplus stays inaccessible.
          const unlocking =
            source.limit !== undefined &&
            decoded.some(
              (e) => e.name === "unlocked" && e.data.id === source.owner,
            );
          const debit =
            held(source, beforeSource) -
            (unlocking ? 0n : held(source, afterSource));
          const credit =
            held(destination, afterDestination) -
            held(destination, beforeDestination);
          tokenBalances.set(info.source, afterSource);
          tokenBalances.set(info.destination, afterDestination);
          await move(source, destination, debit, credit, at);
        } else if (type === "burn" || type === "burnChecked") {
          const a = await account(info.account);
          if (!a) continue;
          const m = await market(a.mint);
          if (!m) continue;
          await checkpoint(a.mint, at);
          const amount = BigInt(info.amount ?? info.tokenAmount?.amount ?? "0");
          m.supply = (BigInt(m.supply) - amount).toString();
          const before = tokenBalances.get(info.account) ?? 0n;
          const after = before - amount;
          const debit = held(a, before) - held(a, after);
          tokenBalances.set(info.account, after);
          await move(a, a, debit, 0n, at);
        } else if (type === "mintTo" || type === "mintToChecked") {
          tokenBalances.set(
            info.account,
            (tokenBalances.get(info.account) ?? 0n) +
              BigInt(info.amount ?? info.tokenAmount?.amount ?? "0"),
          );
        } else if (
          type === "setAuthority" &&
          info.authorityType === "accountOwner"
        ) {
          const a = await account(info.account);
          if (!a || !info.newAuthority) continue;
          // Balance is taken from the transaction's pre-state, adjusted by prior parsed transfers.
          const index = tx.transaction.message.accountKeys.findIndex(
            (k) => k.pubkey.toBase58() === info.account,
          );
          const b = tx.meta?.preTokenBalances?.find(
            (b) => b.accountIndex === index,
          );
          if (!b) throw new Error("Missing owner-change balance");
          await checkpoint(a.mint, at);
          const amount =
            tokenBalances.get(info.account) ?? BigInt(b.uiTokenAmount.amount);
          const next = await describe(info.account, a.mint, info.newAuthority);
          await move(a, next, held(a, amount), held(next, amount), at);
          accounts.set(info.account, next);
        }
      }
      const e = decoded.find((e) => e.order === i);
      if (!e) continue;
      const d = e.data;
      if (e.name === "traded") {
        const m = await market(d.mint);
        if (!m) throw new Error("Trade before indexed creation");
        await checkpoint(m.mint, Number(d.time));
        const excluded =
          d.trader === m.creator ||
          Boolean(d.protocol) ||
          (sides.get(`${d.mint}:${d.trader}`)?.size ?? 0) > 1;
        const trade: SolTrade = {
          id: `${signature}:${i}`,
          mint: d.mint,
          trader: d.trader,
          side: d.buy ? "buy" : "sell",
          grossSol: d.gross,
          netSol: d.net,
          tokens: d.tokens,
          fee: d.fee,
          price: (
            (BigInt(d.solReserve) * 1_000_000_000_000_000n) /
            BigInt(d.tokenReserve)
          ).toString(),
          signature,
          slot,
          time: Number(d.time),
          protocol: Boolean(d.protocol),
        };
        const price = await env.DB.prepare(
          "SELECT usd_micros FROM oracle_prices WHERE at=?",
        )
          .bind(trade.time)
          .first<{ usd_micros: string }>();
        const usd = price
          ? ((BigInt(d.gross) * BigInt(price.usd_micros)) / LAMPORTS).toString()
          : null;
        sql(
          "INSERT INTO trades(id,mint,trader,slot,time,signature,gross_sol,usd_micros,excluded,data) VALUES(?,?,?,?,?,?,?,?,?,?)",
          trade.id,
          m.mint,
          trade.trader,
          slot,
          trade.time,
          signature,
          trade.grossSol,
          usd,
          excluded ? 1 : 0,
          json(trade),
        );
        m.solReserve = d.solReserve;
        m.tokenReserve = d.tokenReserve;
        m.volumeSol = (BigInt(m.volumeSol) + BigInt(d.gross)).toString();
        if (m.state === "curve" && BigInt(d.tokenReserve) === MIN_TOKENS)
          m.state = "complete";
        if (
          d.buy &&
          !d.protocol &&
          (sides.get(`${d.mint}:${d.trader}`)?.size ?? 0) === 1
        ) {
          const o = await owner(m.mint, trade.trader);
          o.lots.push({
            id: trade.id,
            owner: trade.trader,
            mint: m.mint,
            tokens: BigInt(d.tokens),
            cost: BigInt(d.net),
            boughtAt: trade.time,
          });
        }
        const fee = BigInt(d.fee),
          creator = (fee * 4000n) / 10000n,
          platform = (fee * 4000n) / 10000n,
          raffle = fee - creator - platform;
        const routing = routeCreator(
          creator,
          m.routing,
          m.feeCliff,
          trade.time,
        );
        if (routing.locked > 0n)
          sql(
            "INSERT OR IGNORE INTO fee_deposits(id,mint,owner,amount,start_at,unlock_at) VALUES(?,?,?,?,?,?)",
            trade.id,
            m.mint,
            m.creator,
            routing.locked.toString(),
            trade.time,
            m.feeCliff,
          );
        sql(
          "INSERT INTO epochs(epoch,status,pool_sol) VALUES(?,'open','0') ON CONFLICT(epoch) DO NOTHING",
          epochAt(trade.time),
        );
        // Pool totals are reconciled against the on-chain Fund before settlement.
        sql(
          "INSERT INTO protocol_actions(id,kind,mint,amount,time,data) VALUES(?,'fee',?,?,?,?)",
          trade.id,
          m.mint,
          fee.toString(),
          trade.time,
          json({
            raffle: raffle.toString(),
            holders: routing.holders.toString(),
            buyback: routing.buyback.toString(),
            platform: platform.toString(),
          }),
        );
        sql(
          "INSERT INTO outbox(type,mint,wallet,data) VALUES('trade',?,?,?)",
          m.mint,
          trade.trader,
          json(trade),
        );
      } else if (e.name === "graduated") {
        const m = await market(d.mint);
        if (!m) throw new Error("Unknown graduation");
        m.state = "pool";
        m.solReserve = d.sol;
        m.tokenReserve = d.tokens;
      } else if (e.name === "locked") {
        const o = await owner(d.mint, d.owner);
        const eligibleTokens = o.lots.reduce((s, l) => s + l.tokens, 0n);
        // Reserve purchase provenance per funded deposit; another lock cannot
        // reuse the same purchased principal while this vault holds its tokens.
        const cost = d.tokenAsset
          ? consumeLots(o.lots, BigInt(d.amount))
          : BigInt(d.amount);
        // No purchase provenance is invented for tokens received from other wallets.
        const purchaseCost =
          d.tokenAsset && eligibleTokens < BigInt(d.amount)
            ? null
            : cost.toString();
        const commitment: Commitment = {
          id: d.id,
          mint: d.mint,
          owner: d.owner,
          asset: d.tokenAsset ? "token" : "sol",
          amount: d.amount,
          purchaseCost,
          startAt: Number(d.start),
          unlockAt: Number(d.unlock),
          withdrawn: false,
          kind: d.tokenAsset ? "purchased-tokens" : "earned-fees",
        };
        sql(
          "INSERT INTO commitments(id,mint,owner,start_at,unlock_at,data) VALUES(?,?,?,?,?,?)",
          d.id,
          d.mint,
          d.owner,
          commitment.startAt,
          commitment.unlockAt,
          json(commitment),
        );
        if (!d.tokenAsset)
          sql(
            "INSERT INTO fee_deposits(id,mint,owner,amount,start_at,unlock_at) VALUES(?,?,?,?,?,?)",
            d.id,
            d.mint,
            d.owner,
            d.amount,
            Number(d.start),
            Number(d.unlock),
          );
      } else if (e.name === "unlocked") {
        const row = await env.DB.prepare(
          "SELECT data FROM commitments WHERE id=?",
        )
          .bind(d.id)
          .first<{ data: string }>();
        if (!row) throw new Error("Unlock before indexed commitment");
        const commitment: Commitment = JSON.parse(row.data);
        if (commitment.asset === "token" && commitment.purchaseCost) {
          const o = await owner(commitment.mint, commitment.owner);
          o.lots.push({
            id: d.id,
            owner: commitment.owner,
            mint: commitment.mint,
            tokens: BigInt(commitment.amount),
            cost: BigInt(commitment.purchaseCost),
            boughtAt: commitment.startAt,
          });
        }
        retired.add(d.id);
        for (const a of accounts.values()) if (a.owner === d.id) a.limit = 0n;
        sql(
          "UPDATE commitments SET withdrawn=1,data=json_set(data,'$.withdrawn',json('true')) WHERE id=?",
          d.id,
        );
      } else if (e.name === "claimed") {
        sql(
          "UPDATE claims SET claimed=1 WHERE distribution=? AND wallet=?",
          d.distribution,
          d.wallet,
        );
        sql(
          "INSERT INTO outbox(type,wallet,data) VALUES('claim',?,?)",
          d.wallet,
          json(d),
        );
      } else if (e.name === "fundMoved") {
        sql(
          "INSERT INTO protocol_actions(id,kind,amount,time,data) VALUES(?,'fund-move',?,?,?)",
          `${signature}:${i}`,
          d.amount,
          at,
          json(d),
        );
      } else if (e.name === "boughtBack") {
        const m = await market(d.mint);
        if (!m) throw new Error("Unknown buyback");
        m.tokenReserve = (BigInt(m.tokenReserve) - BigInt(d.tokens)).toString();
        m.solReserve = (
          BigInt(m.solReserve) +
          BigInt(d.sol) -
          splitFee(BigInt(d.sol), 100n).total
        ).toString();
        const routed = routeCreator(
          splitFee(BigInt(d.sol), 100n).creator,
          m.routing,
          m.feeCliff,
          Number(d.time),
        );
        if (routed.locked > 0n)
          sql(
            "INSERT OR IGNORE INTO fee_deposits(id,mint,owner,amount,start_at,unlock_at) VALUES(?,?,?,?,?,?)",
            `${signature}:${i}`,
            m.mint,
            m.creator,
            routed.locked.toString(),
            Number(d.time),
            m.feeCliff,
          );
        sql(
          "INSERT INTO protocol_actions(id,kind,mint,amount,time,data) VALUES(?,'buyback',?,?,?,?)",
          `${signature}:${i}`,
          d.mint,
          d.sol,
          Number(d.time),
          json(d),
        );
      }
    }
    const postAccounts = new Set<string>();
    for (const balance of tx.meta?.postTokenBalances ?? []) {
      const address =
        tx.transaction.message.accountKeys[
          balance.accountIndex
        ].pubkey.toBase58();
      if (!accounts.has(address)) continue;
      postAccounts.add(address);
      if (
        tokenBalances.get(address) !== BigInt(balance.uiTokenAmount.amount) ||
        accounts.get(address)!.owner !== balance.owner
      )
        throw new Error("Incomplete token balance history");
    }
    for (const balance of tx.meta?.preTokenBalances ?? []) {
      const address =
        tx.transaction.message.accountKeys[
          balance.accountIndex
        ].pubkey.toBase58();
      if (
        accounts.has(address) &&
        !postAccounts.has(address) &&
        tokenBalances.get(address) !== 0n
      )
        throw new Error("Incomplete token closure history");
    }
    for (const m of markets.values()) {
      sql(
        "UPDATE markets SET state=?,data=? WHERE mint=?",
        m.state,
        json(m),
        m.mint,
      );
      sql(
        "INSERT INTO outbox(type,mint,data) VALUES('market',?,?)",
        m.mint,
        json(m),
      );
    }
    for (const o of owners.values())
      sql(
        "INSERT INTO ownership(mint,wallet,balance,lots,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(mint,wallet) DO UPDATE SET balance=excluded.balance,lots=excluded.lots,updated_at=excluded.updated_at",
        o.mint,
        o.wallet,
        o.balance.toString(),
        json(o.lots.filter((l) => l.tokens > 0n)),
        o.updated,
      );
    for (const a of accounts)
      sql(
        "INSERT INTO token_accounts(address,mint,owner,beneficiary) VALUES(?,?,?,?) ON CONFLICT(address) DO UPDATE SET owner=excluded.owner,beneficiary=excluded.beneficiary",
        a[0],
        a[1].mint,
        a[1].owner,
        a[1].beneficiary,
      );
    for (const w of weights.values()) {
      const old = await env.DB.prepare(
        "SELECT weight FROM holder_weights WHERE epoch=? AND mint=? AND wallet=?",
      )
        .bind(w.epoch, w.mint, w.wallet)
        .first<{ weight: string }>();
      sql(
        "INSERT INTO holder_weights(epoch,mint,wallet,weight) VALUES(?,?,?,?) ON CONFLICT(epoch,mint,wallet) DO UPDATE SET weight=excluded.weight",
        w.epoch,
        w.mint,
        w.wallet,
        (BigInt(old?.weight ?? "0") + w.weight).toString(),
      );
    }
    if (statements.length) {
      sql("INSERT INTO indexed_events(id,slot) VALUES(?,?)", txid, slot);
      await env.DB.batch(statements);
    }
  }
  await env.DB.batch([
    env.DB.prepare("UPDATE pending_blocks SET applied=1 WHERE slot=?").bind(
      slot,
    ),
    env.DB.prepare(
      "INSERT INTO checkpoints(id,value) VALUES('complete-slot',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
    ).bind(String(slot)),
    env.DB.prepare(
      "INSERT INTO checkpoints(id,value) VALUES('complete-time',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
    ).bind(String(block.blockTime)),
  ]);
}
