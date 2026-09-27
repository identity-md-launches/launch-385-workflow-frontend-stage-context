import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAbiItem, type AbiEvent, type Address, type Hex, type PublicClient } from 'viem';
import { usePublicClient } from 'wagmi';
import { DEPLOYMENT_BLOCK, LOG_CHUNK } from '../config';
import type { Deployment } from '../deployment';

export interface JoinedEvent {
  member: Address;
  referrer: Address;
  depth: bigint;
  blockNumber: bigint;
  txHash: Hex;
  logIndex: number;
}

export interface ScanProgress {
  scanned: bigint;
  total: bigint;
}

/**
 * Read every Joined(member, referrer, depth) event for one referrer straight from the chain.
 * Queries run in chunks from the deployment block to the current head; when a provider rejects a
 * range the chunk is halved (down to LOG_CHUNK.min) and retried. No backend, no indexer.
 */
export async function scanJoinedEvents(
  client: PublicClient,
  deployment: Deployment,
  referrer: Address,
  onProgress?: (p: ScanProgress) => void,
): Promise<JoinedEvent[]> {
  const event = getAbiItem({ abi: deployment.referralList.abi, name: 'Joined' }) as AbiEvent | undefined;
  if (!event) throw new Error('The ReferralList ABI has no Joined event.');
  const head = await client.getBlockNumber();
  const total = head >= DEPLOYMENT_BLOCK ? head - DEPLOYMENT_BLOCK + 1n : 0n;
  const out: JoinedEvent[] = [];
  let from = DEPLOYMENT_BLOCK;
  let chunk = LOG_CHUNK.initial;
  while (from <= head) {
    const to = from + chunk - 1n < head ? from + chunk - 1n : head;
    try {
      const logs = await client.getLogs({
        address: deployment.referralList.address,
        event,
        args: { referrer },
        fromBlock: from,
        toBlock: to,
      });
      for (const log of logs) {
        const args = log.args as { member?: Address; referrer?: Address; depth?: bigint };
        if (!args.member || !args.referrer || args.depth === undefined || log.blockNumber === null || log.transactionHash === null || log.logIndex === null) {
          continue;
        }
        out.push({
          member: args.member,
          referrer: args.referrer,
          depth: args.depth,
          blockNumber: log.blockNumber,
          txHash: log.transactionHash,
          logIndex: log.logIndex,
        });
      }
      from = to + 1n;
      onProgress?.({ scanned: from - DEPLOYMENT_BLOCK, total });
    } catch (err) {
      if (chunk > LOG_CHUNK.min) {
        chunk = chunk / 2n;
        continue;
      }
      throw err;
    }
  }
  out.sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1));
  return out;
}

export function useJoinedEvents(deployment: Deployment, referrer: Address | undefined) {
  const client = usePublicClient({ chainId: deployment.chain.id });
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const query = useQuery({
    queryKey: ['joinedEvents', deployment.chain.id, deployment.referralList.address, referrer ?? null],
    enabled: Boolean(referrer && client),
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      if (!client || !referrer) return [];
      setProgress(null);
      return scanJoinedEvents(client as PublicClient, deployment, referrer, setProgress);
    },
  });
  return { ...query, progress };
}
