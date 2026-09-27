import type { Address } from 'viem';
import type { Deployment } from '../deployment';
import type { ChainGuard } from '../hooks/useChainGuard';
import type { ReferralState } from '../hooks/useReferralState';

/** Everything a page section needs; built once in App and passed down. */
export interface PageContext {
  deployment: Deployment;
  account: Address | undefined;
  guard: ChainGuard;
  state: ReferralState;
  /** Token symbol and decimals as reported by the token contract (falls back while loading). */
  symbol: string;
  decimals: number;
  explorer: string;
  /** Connected, on the right chain, and the deployment's token binding is consistent. */
  canTransact: boolean;
}

/** The first reason a transaction control must stay disabled, or null when it may run. */
export function firstBlocker(reasons: Array<string | false | null | undefined>): string | null {
  for (const r of reasons) if (r) return r;
  return null;
}

/** Shared prerequisite reasons for any transaction. */
export function baseBlockers(ctx: PageContext): Array<string | false> {
  return [
    !ctx.account && 'Connect a wallet to continue.',
    Boolean(ctx.account) && ctx.guard.wrongChain && `Switch your wallet to ${ctx.deployment.chain.name} first.`,
    ctx.state.tokenMismatch && 'The token address on chain does not match the deployment configuration, so actions are disabled.',
  ];
}
