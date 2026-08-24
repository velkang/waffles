import { createPublicClient, http, type Address } from "viem";

const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_URL ?? "https://rpc.testnet.arc.io"],
    },
  },
} as const;

export function serverClient() {
  return createPublicClient({ transport: http(arcTestnet.rpcUrls.default.http[0]) });
}

const factoryAbi = [
  {
    type: "function",
    name: "launchOfToken",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [
      { name: "", type: "address" },
      { name: "", type: "address" },
      { name: "", type: "address" },
      { name: "", type: "string" },
      { name: "", type: "string" },
      { name: "", type: "string" },
      { name: "", type: "string" },
      { name: "", type: "string" },
      { name: "", type: "uint64" },
    ],
  },
  {
    type: "function",
    name: "migrator",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

const migratorAbi = [
  {
    type: "function",
    name: "factory",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

const ammFactoryAbi = [
  {
    type: "function",
    name: "getPair",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }],
    outputs: [{ type: "address" }],
  },
] as const;

const pairAbi = [
  {
    type: "function",
    name: "token0",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "getReserves",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }, { type: "uint256" }],
  },
] as const;

const curveAbi = [
  {
    type: "function",
    name: "currentPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "marketCap",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "graduationProgressBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "graduated",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
] as const;

const tokenAbi = [
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
] as const;

export type TokenSummary = {
  address: string;
  symbol: string;
  name: string;
  curve: string;
  description: string;
  imageUri: string;
  priceRaw: bigint;
  mcapRaw: bigint;
  progressBps: number;
  graduated: boolean;
};

export async function getTokenSummary(
  token: Address,
): Promise<TokenSummary | null> {
  const client = serverClient();
  try {
    const launch = await client.readContract({
      address: process.env.NEXT_PUBLIC_FACTORY_ADDRESS as Address,
      abi: factoryAbi,
      functionName: "launchOfToken",
      args: [token],
    });
    const curve = launch[1];
    const [priceRaw, mcapRaw, progressBps, graduated, symbol, name] =
      await Promise.all([
        client.readContract({ address: curve, abi: curveAbi, functionName: "currentPrice" }),
        client.readContract({ address: curve, abi: curveAbi, functionName: "marketCap" }),
        client.readContract({ address: curve, abi: curveAbi, functionName: "graduationProgressBps" }),
        client.readContract({ address: curve, abi: curveAbi, functionName: "graduated" }),
        client.readContract({ address: token, abi: tokenAbi, functionName: "symbol" }).catch(() => ""),
        client.readContract({ address: token, abi: tokenAbi, functionName: "name" }).catch(() => ""),
      ]);

    let resolvedPrice = priceRaw as bigint;
    let resolvedMcap = mcapRaw as bigint;
    if (graduated) {
      const factoryAddress = process.env.NEXT_PUBLIC_FACTORY_ADDRESS as Address;
      const usdcAddress = (process.env.NEXT_PUBLIC_USDC_ADDRESS ??
        "0x3600000000000000000000000000000000000000") as Address;
      const migrator = await client.readContract({
        address: factoryAddress,
        abi: factoryAbi,
        functionName: "migrator",
      });
      const ammFactory = await client.readContract({
        address: migrator,
        abi: migratorAbi,
        functionName: "factory",
      });
      const pool = await client.readContract({
        address: ammFactory,
        abi: ammFactoryAbi,
        functionName: "getPair",
        args: [token, usdcAddress],
      });
      const [token0, reserves] = await Promise.all([
        client.readContract({ address: pool, abi: pairAbi, functionName: "token0" }),
        client.readContract({ address: pool, abi: pairAbi, functionName: "getReserves" }),
      ]);
      const tokenIsToken0 = token0.toLowerCase() === token.toLowerCase();
      const tokenReserve = tokenIsToken0 ? reserves[0] : reserves[1];
      const usdcReserve = tokenIsToken0 ? reserves[1] : reserves[0];
      if (tokenReserve > 0n) {
        resolvedPrice = (usdcReserve * 10n ** 18n) / tokenReserve;
        resolvedMcap = resolvedPrice * 1_000_000_000n;
      }
    }

    return {
      address: token.toLowerCase(),
      symbol: String(symbol),
      name: String(name),
      curve,
      description: launch[3],
      imageUri: launch[4],
      priceRaw: resolvedPrice,
      mcapRaw: resolvedMcap,
      progressBps: Number(progressBps),
      graduated: Boolean(graduated),
    };
  } catch {
    return null;
  }
}
