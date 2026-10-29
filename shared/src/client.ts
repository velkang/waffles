import { Program } from "@coral-xyz/anchor";
import BN from "bn.js";
export { BN };
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  Keypair,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  unpackAccount,
} from "@solana/spl-token";
import idl from "./waffles-idl.json" with { type: "json" };
import type { Waffles } from "./waffles.js";
import {
  PROGRAM_ID,
  epochAt,
  type Routing,
  INITIAL_TOKENS,
  SUPPLY,
  POOL_TOKENS,
} from "./solana.js";

export const programKey = new PublicKey(PROGRAM_ID);
export const zeroKey = PublicKey.default;
const encoder = new TextEncoder();
export const key = (address: string) => new PublicKey(address);
export function numberBytes(value: bigint) {
  const data = new Uint8Array(8);
  new DataView(data.buffer).setBigUint64(0, value, true);
  return data;
}
export function pda(...seeds: (string | Uint8Array | PublicKey)[]) {
  return PublicKey.findProgramAddressSync(
    seeds.map((s) =>
      typeof s === "string"
        ? encoder.encode(s)
        : s instanceof Uint8Array
          ? s
          : s.toBytes(),
    ),
    programKey,
  )[0];
}
export const marketAddress = (mint: PublicKey) => pda("market", mint);
export const inventoryAddress = (mint: PublicKey) => pda("inventory", mint);
export const configAddress = () => pda("config");
export const fundAddress = (kind: number, mint: PublicKey, epoch: number) =>
  pda("fund", Uint8Array.of(kind), mint, numberBytes(BigInt(epoch)));
export const distributionAddress = (
  kind: number,
  mint: PublicKey,
  epoch: number,
) => pda("distribution", Uint8Array.of(kind), mint, numberBytes(BigInt(epoch)));
export const commitmentAddress = (
  owner: PublicKey,
  mint: PublicKey,
  nonce: bigint,
) => pda("lock", owner, mint, numberBytes(nonce));
export const eventAccounts = () => ({
  eventAuthority: pda("__event_authority"),
  program: programKey,
});

export function program(connection: Connection, publicKey = zeroKey) {
  return new Program<Waffles>(idl as unknown as Waffles, {
    connection,
    publicKey,
  });
}
/** Read accounted reserves and custody from one finalized account snapshot. */
export async function marketCustody(connection: Connection, mint: PublicKey) {
  const market = marketAddress(mint),
    inventory = inventoryAddress(mint);
  const [account, vault] = await connection.getMultipleAccountsInfo(
    [market, inventory],
    "finalized",
  );
  if (!account) return null;
  if (!account.owner.equals(programKey) || !vault)
    throw new Error("Invalid market custody accounts");
  if (!Number.isSafeInteger(account.lamports))
    throw new Error("RPC lamport value exceeds exact integer range");
  type State = Awaited<
    ReturnType<ReturnType<typeof program>["account"]["market"]["fetch"]>
  >;
  const state = program(connection).coder.accounts.decode<State>(
    "market",
    account.data,
  );
  const tokens = unpackAccount(inventory, vault, TOKEN_PROGRAM_ID);
  if (!tokens.mint.equals(mint) || !tokens.owner.equals(market))
    throw new Error("Invalid market token vault");
  const rent = await connection.getMinimumBalanceForRentExemption(
    account.data.length,
    "finalized",
  );
  const actualSol = BigInt(account.lamports) - BigInt(rent);
  const accountedSol =
    BigInt(state.realSol.toString()) +
    BigInt(state.direct.toString()) +
    BigInt(state.locked.toString()) +
    BigInt(state.buyback.toString());
  const accountedTokens =
    state.state === 0
      ? BigInt(state.virtualTokens.toString()) - (INITIAL_TOKENS - SUPPLY)
      : state.state === 1
        ? POOL_TOKENS
        : BigInt(state.virtualTokens.toString());
  return {
    state,
    actualSol,
    accountedSol,
    actualTokens: tokens.amount,
    accountedTokens,
    consistent: actualSol >= accountedSol && tokens.amount >= accountedTokens,
  };
}
export function plain(value: unknown): unknown {
  if (
    value &&
    typeof value === "object" &&
    "toBase58" in value &&
    typeof value.toBase58 === "function"
  )
    return value.toBase58();
  if (BN.isBN(value)) return (value as BN).toString();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, plain(v)]),
    );
  return value;
}
export type TxAction =
  | {
      action: "create";
      name: string;
      symbol: string;
      description: string;
      imageUri: string;
      routing: Routing;
      feeCliff: number;
      initialBuy: string;
      minOut: string;
      lockedTokens: string;
      tokenCliff: number;
    }
  | {
      action: "trade";
      mint: string;
      buy: boolean;
      amount: string;
      minOut: string;
    }
  | { action: "graduate"; mint: string }
  | { action: "withdrawFees"; mint: string; locked: boolean }
  | {
      action: "lock";
      mint: string;
      amount: string;
      unlock: number;
      tokenAsset: boolean;
      nonce: string;
    }
  | { action: "unlock"; mint: string; nonce: string }
  | {
      action: "claim";
      distribution: string;
      amount: string;
      proof: number[][];
    };

export async function makeInstruction(
  connection: Connection,
  method: string,
  args: unknown[],
  accounts: Record<string, PublicKey>,
) {
  const methods = program(connection).methods as unknown as Record<
    string,
    (...args: unknown[]) => {
      accountsStrict(accounts: Record<string, PublicKey>): {
        instruction(): Promise<TransactionInstruction>;
      };
    }
  >;
  if (!methods[method]) throw new Error("Unknown program instruction");
  return methods[method](...args)
    .accountsStrict(accounts)
    .instruction();
}
export async function initFunds(
  connection: Connection,
  payer: PublicKey,
  mint: PublicKey,
  epoch: number,
): Promise<TransactionInstruction[]> {
  return Promise.all(
    [
      [0, zeroKey, epoch],
      [1, mint, epoch],
      [2, zeroKey, 0],
    ].map(async ([kind, m, e]) =>
      makeInstruction(connection, "initFund", [kind, m, new BN(e as number)], {
        payer,
        fund: fundAddress(kind as number, m as PublicKey, e as number),
        systemProgram: SystemProgram.programId,
      }),
    ),
  );
}
export async function buildTransaction(
  connection: Connection,
  wallet: PublicKey,
  input: TxAction,
) {
  const transaction = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
  );
  const epoch = epochAt(Math.floor(Date.now() / 1000));
  let signer: Keypair | undefined;
  let mint: PublicKey | undefined;
  const base = {
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    rent: SYSVAR_RENT_PUBKEY,
  };
  if (input.action === "create") {
    signer = Keypair.generate();
    mint = signer.publicKey;
    if (BigInt(input.initialBuy) > 0n)
      transaction.add(...(await initFunds(connection, wallet, mint, epoch)));
    transaction.add(
      await makeInstruction(
        connection,
        "create",
        [
          {
            name: input.name,
            symbol: input.symbol,
            description: input.description,
            imageUri: input.imageUri,
            routing: input.routing,
            feeCliff: new BN(input.feeCliff),
          },
        ],
        {
          creator: wallet,
          mint,
          market: marketAddress(mint),
          inventory: inventoryAddress(mint),
          ...base,
          ...eventAccounts(),
        },
      ),
    );
    if (BigInt(input.initialBuy) > 0n)
      transaction.add(
        await makeInstruction(
          connection,
          "initialBuy",
          [new BN(input.initialBuy), new BN(input.minOut)],
          {
            creator: wallet,
            mint,
            market: marketAddress(mint),
            inventory: inventoryAddress(mint),
            creatorTokens: getAssociatedTokenAddressSync(mint, wallet),
            config: configAddress(),
            raffle: fundAddress(0, zeroKey, epoch),
            holders: fundAddress(1, mint, epoch),
            instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            ...eventAccounts(),
          },
        ),
      );
    if (BigInt(input.lockedTokens) > 0n) {
      const nonce = BigInt(Date.now());
      const commitment = commitmentAddress(wallet, mint, nonce);
      transaction.add(
        await makeInstruction(
          connection,
          "lock",
          [
            new BN(nonce.toString()),
            new BN(input.lockedTokens),
            new BN(input.tokenCliff),
            true,
          ],
          {
            owner: wallet,
            mint,
            market: marketAddress(mint),
            commitment,
            ownerTokens: getAssociatedTokenAddressSync(mint, wallet),
            lockTokens: pda("locked-tokens", commitment),
            ...base,
            ...eventAccounts(),
          },
        ),
      );
    }
  } else if (input.action === "claim") {
    const distribution = key(input.distribution);
    transaction.add(
      await makeInstruction(
        connection,
        "claim",
        [new BN(input.amount), input.proof],
        {
          wallet,
          config: configAddress(),
          distribution,
          receipt: pda("receipt", distribution, wallet),
          systemProgram: SystemProgram.programId,
          ...eventAccounts(),
        },
      ),
    );
  } else {
    mint = key(input.mint);
    const market = marketAddress(mint),
      inventory = inventoryAddress(mint);
    if (input.action === "trade") {
      transaction.add(...(await initFunds(connection, wallet, mint, epoch)));
      transaction.add(
        await makeInstruction(
          connection,
          "trade",
          [input.buy, new BN(input.amount), new BN(input.minOut)],
          {
            trader: wallet,
            mint,
            market,
            inventory,
            traderTokens: getAssociatedTokenAddressSync(mint, wallet),
            config: configAddress(),
            raffle: fundAddress(0, zeroKey, epoch),
            holders: fundAddress(1, mint, epoch),
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            ...eventAccounts(),
          },
        ),
      );
    } else if (input.action === "graduate")
      transaction.add(
        await makeInstruction(connection, "graduate", [], {
          market,
          inventory,
          ...eventAccounts(),
        }),
      );
    else if (input.action === "withdrawFees")
      transaction.add(
        await makeInstruction(connection, "withdrawFees", [input.locked], {
          creator: wallet,
          market,
        }),
      );
    else {
      const commitment = commitmentAddress(wallet, mint, BigInt(input.nonce));
      transaction.add(
        createAssociatedTokenAccountIdempotentInstruction(
          wallet,
          getAssociatedTokenAddressSync(mint, wallet),
          wallet,
          mint,
        ),
      );
      const accounts = {
        owner: wallet,
        mint,
        commitment,
        ownerTokens: getAssociatedTokenAddressSync(mint, wallet),
        lockTokens: pda("locked-tokens", commitment),
        tokenProgram: TOKEN_PROGRAM_ID,
        ...eventAccounts(),
      };
      if (input.action === "lock")
        transaction.add(
          await makeInstruction(
            connection,
            "lock",
            [
              new BN(input.nonce),
              new BN(input.amount),
              new BN(input.unlock),
              input.tokenAsset,
            ],
            {
              ...accounts,
              market,
              systemProgram: SystemProgram.programId,
              rent: SYSVAR_RENT_PUBKEY,
            },
          ),
        );
      else
        transaction.add(
          await makeInstruction(connection, "unlock", [], accounts),
        );
    }
  }
  const block = await connection.getLatestBlockhash("confirmed");
  transaction.feePayer = wallet;
  transaction.recentBlockhash = block.blockhash;
  if (signer) transaction.partialSign(signer);
  // Solana's packet limit also applies to creation with long metadata/locks.
  const serialized = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });
  if (serialized.length > 1232)
    throw new Error(
      "Transaction exceeds the Solana packet limit. Shorten metadata or create the token lock separately.",
    );
  return {
    transaction,
    lastValidBlockHeight: block.lastValidBlockHeight,
    mint: mint?.toBase58(),
  };
}
