import { useReadContract } from 'wagmi';
import type { Address } from 'viem';
import { READ_REFRESH_MS } from '../config';
import type { ContractBinding, Deployment } from '../deployment';

interface ReadOptions {
  enabled?: boolean;
  refetchInterval?: number | false;
}

export interface Read<T> {
  data: T | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/** A typed wrapper around useReadContract for ABIs that are only known at runtime. */
export function useRead<T>(
  chainId: number,
  binding: ContractBinding | { address: Address | undefined; abi: ContractBinding['abi'] } | undefined,
  functionName: string,
  args: readonly unknown[] = [],
  { enabled = true, refetchInterval = READ_REFRESH_MS }: ReadOptions = {},
): Read<T> {
  const query = useReadContract({
    address: binding?.address,
    abi: binding?.abi,
    functionName,
    args,
    chainId,
    query: { enabled: Boolean(binding?.address) && enabled, refetchInterval },
  });
  return {
    data: query.data as T | undefined,
    isLoading: query.isLoading,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}

export interface GlobalState {
  joinFee: Read<bigint>;
  referrerShare: Read<bigint>;
  memberCount: Read<bigint>;
  maxDepth: Read<bigint>;
  totalClaimable: Read<bigint>;
  tokenAddress: Read<Address>;
  tokenSymbol: Read<string>;
  tokenDecimals: Read<number>;
  contractBalance: Read<bigint>;
}

export interface AccountState {
  isMember: Read<boolean>;
  joinedAt: Read<bigint>;
  referrerOf: Read<Address>;
  depth: Read<bigint>;
  referralCount: Read<bigint>;
  claimable: Read<bigint>;
  balance: Read<bigint>;
  allowance: Read<bigint>;
}

export interface ReferralState {
  global: GlobalState;
  me: AccountState;
  /** The INVT binding: the manifest's LaunchToken ABI at the address ReferralList.token() reports. */
  tokenBinding: { address: Address | undefined; abi: ContractBinding['abi'] };
  /** ReferralList.token() disagrees with the manifest's LaunchToken address (should never happen). */
  tokenMismatch: boolean;
}

/** Every contract read the page shows. Account reads are enabled once a wallet is connected. */
export function useReferralState(deployment: Deployment, account: Address | undefined): ReferralState {
  const chainId = deployment.chain.id;
  const rl = deployment.referralList;

  const joinFee = useRead<bigint>(chainId, rl, 'JOIN_FEE', [], { refetchInterval: false });
  const referrerShare = useRead<bigint>(chainId, rl, 'REFERRER_SHARE', [], { refetchInterval: false });
  const memberCount = useRead<bigint>(chainId, rl, 'memberCount');
  const maxDepth = useRead<bigint>(chainId, rl, 'maxDepth');
  const totalClaimable = useRead<bigint>(chainId, rl, 'totalClaimable');
  const tokenAddress = useRead<Address>(chainId, rl, 'token', [], { refetchInterval: false });

  // The page reads the INVT address from ReferralList.token(); the manifest's LaunchToken ABI is
  // the ERC-20 ABI used to talk to it.
  const tokenBinding = { address: tokenAddress.data, abi: deployment.token.abi };
  const tokenMismatch =
    tokenAddress.data !== undefined && tokenAddress.data.toLowerCase() !== deployment.token.address.toLowerCase();

  const tokenSymbol = useRead<string>(chainId, tokenBinding, 'symbol', [], { refetchInterval: false });
  const tokenDecimals = useRead<number>(chainId, tokenBinding, 'decimals', [], { refetchInterval: false });
  const contractBalance = useRead<bigint>(chainId, tokenBinding, 'balanceOf', [rl.address]);

  const acct = { enabled: Boolean(account) };
  const isMember = useRead<boolean>(chainId, rl, 'isMember', [account], acct);
  const joinedAt = useRead<bigint>(chainId, rl, 'joinedAt', [account], acct);
  const referrerOf = useRead<Address>(chainId, rl, 'referrerOf', [account], acct);
  const depth = useRead<bigint>(chainId, rl, 'depth', [account], acct);
  const referralCount = useRead<bigint>(chainId, rl, 'referralCount', [account], acct);
  const claimable = useRead<bigint>(chainId, rl, 'claimable', [account], acct);
  const balance = useRead<bigint>(chainId, tokenBinding, 'balanceOf', [account], acct);
  const allowance = useRead<bigint>(chainId, tokenBinding, 'allowance', [account, rl.address], acct);

  return {
    global: { joinFee, referrerShare, memberCount, maxDepth, totalClaimable, tokenAddress, tokenSymbol, tokenDecimals, contractBalance },
    me: { isMember, joinedAt, referrerOf, depth, referralCount, claimable, balance, allowance },
    tokenBinding,
    tokenMismatch,
  };
}
