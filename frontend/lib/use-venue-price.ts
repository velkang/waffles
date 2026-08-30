"use client";

import {
  useReadWafflesAmmFactoryGetPair,
  useReadWafflesAmmMigratorFactory,
  useReadWafflesAmmPairGetReserves,
  useReadWafflesAmmPairToken0,
  useReadWafflesBondingCurveCurrentPrice,
  useReadWafflesBondingCurveGraduated,
  useReadWafflesBondingCurveMarketCap,
  useReadWafflesLaunchFactoryMigrator,
} from "@/generated/contracts-generated";
import { FACTORY_ADDRESS, USDC_ADDRESS } from "@/lib/wagmi";

type Address = `0x${string}`;

const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as Address;

export function poolPriceFromReserves(
  token: Address,
  token0: Address | undefined,
  reserves: readonly [bigint, bigint] | undefined,
): bigint | undefined {
  if (!token0 || !reserves) return undefined;
  const tokenIsToken0 = token0.toLowerCase() === token.toLowerCase();
  const tokenReserve = tokenIsToken0 ? reserves[0] : reserves[1];
  const usdcReserve = tokenIsToken0 ? reserves[1] : reserves[0];
  if (tokenReserve === 0n) return undefined;
  return (usdcReserve * 10n ** 30n) / tokenReserve;
}

/// Resolves price from the venue that currently owns price discovery:
/// the bonding curve before graduation and AMM reserves afterwards.
export function useVenuePrice(token: Address, curve: Address | undefined) {
  const graduatedQuery = useReadWafflesBondingCurveGraduated({
    address: curve,
    query: { enabled: Boolean(curve) },
  });
  const curvePrice = useReadWafflesBondingCurveCurrentPrice({
    address: curve,
    query: { enabled: Boolean(curve && !graduatedQuery.data) },
  });
  const curveMcap = useReadWafflesBondingCurveMarketCap({
    address: curve,
    query: { enabled: Boolean(curve && !graduatedQuery.data) },
  });

  const migrator = useReadWafflesLaunchFactoryMigrator({
    address: FACTORY_ADDRESS,
    query: { enabled: Boolean(graduatedQuery.data) },
  });
  const ammFactory = useReadWafflesAmmMigratorFactory({
    address: migrator.data,
    query: { enabled: Boolean(migrator.data && graduatedQuery.data) },
  });
  const pair = useReadWafflesAmmFactoryGetPair({
    address: ammFactory.data,
    args: [token, USDC_ADDRESS],
    query: { enabled: Boolean(ammFactory.data && graduatedQuery.data) },
  });
  const pool =
    pair.data && pair.data !== ZERO_ADDRESS ? (pair.data as Address) : undefined;
  const token0 = useReadWafflesAmmPairToken0({
    address: pool,
    query: { enabled: Boolean(pool), refetchInterval: 10_000 },
  });
  const reserves = useReadWafflesAmmPairGetReserves({
    address: pool,
    query: { enabled: Boolean(pool), refetchInterval: 10_000 },
  });

  const poolPrice = poolPriceFromReserves(
    token,
    token0.data as Address | undefined,
    reserves.data,
  );
  const graduated = Boolean(graduatedQuery.data);

  return {
    graduated,
    pool,
    price: graduated ? poolPrice : curvePrice.data,
    mcap:
      graduated && poolPrice !== undefined
        ? (poolPrice * 1_000_000_000n) / 10n ** 12n
        : curveMcap.data,
    isLoading:
      graduatedQuery.isLoading ||
      (graduated
        ? pair.isLoading || token0.isLoading || reserves.isLoading
        : curvePrice.isLoading || curveMcap.isLoading),
  };
}
