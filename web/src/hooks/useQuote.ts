import { useQuery } from '@tanstack/react-query';
import type { Address, PublicClient } from 'viem';
import { usePublicClient } from 'wagmi';
import { v4QuoterAbi } from '../abis/v4Quoter';
import { POOL, QUOTE_SAMPLE_WEI } from '../config';
import type { Deployment } from '../deployment';

export interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

/** The launch pool's key: paired currency (native ETH = zero address) vs. the token, sorted. */
export function poolKeyFor(token: Address): { key: PoolKey; zeroForOne: boolean } {
  let currency0: Address = POOL.pairedCurrency;
  let currency1: Address = token;
  if (POOL.pairedCurrency !== '0x0000000000000000000000000000000000000000' && BigInt(token) < BigInt(POOL.pairedCurrency)) {
    currency0 = token;
    currency1 = POOL.pairedCurrency;
  }
  return {
    key: { currency0, currency1, fee: POOL.fee, tickSpacing: POOL.tickSpacing, hooks: POOL.hooks },
    // Input is the paired currency, so the swap direction is 0 -> 1 when it sits at currency0.
    zeroForOne: currency0.toLowerCase() === POOL.pairedCurrency.toLowerCase(),
  };
}

export interface Quote {
  amountIn: bigint;
  amountOut: bigint;
}

/** Read-only price from the Uniswap v4 quoter in the network block. Never a transaction. */
export async function fetchQuote(client: PublicClient, deployment: Deployment, token: Address): Promise<Quote> {
  const { key, zeroForOne } = poolKeyFor(token);
  const { result } = await client.simulateContract({
    address: deployment.manifest.network.uniswapV4.quoter,
    abi: v4QuoterAbi,
    functionName: 'quoteExactInputSingle',
    args: [{ poolKey: key, zeroForOne, exactAmount: QUOTE_SAMPLE_WEI, hookData: '0x' }],
  });
  return { amountIn: QUOTE_SAMPLE_WEI, amountOut: result[0] };
}

export function useQuote(deployment: Deployment, token: Address | undefined) {
  const client = usePublicClient({ chainId: deployment.chain.id });
  return useQuery({
    queryKey: ['quote', deployment.chain.id, token ?? null],
    enabled: Boolean(token && client),
    refetchInterval: 60_000,
    retry: 1,
    queryFn: () => fetchQuote(client as PublicClient, deployment, token as Address),
  });
}
