import { useCallback, useState } from 'react';
import { numberToHex } from 'viem';
import { useAccount } from 'wagmi';
import type { Deployment } from '../deployment';
import { describeError, isUnknownChainError, isUserRejection } from '../lib/errors';

interface Eip1193Like {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export type ChainGuardPhase = 'idle' | 'switching' | 'adding' | 'error';

export interface ChainGuard {
  /** Connected and the wallet reports a different chain than the deployment's. */
  wrongChain: boolean;
  /** Connected on the right chain. */
  ready: boolean;
  phase: ChainGuardPhase;
  message: string | null;
  switchNetwork: () => Promise<void>;
}

/**
 * Wrong-network handling. Asks the wallet to switch with wallet_switchEthereumChain; when the
 * wallet does not know the chain (EIP-3085 code 4902 or an equivalent message) it sends
 * wallet_addEthereumChain with the parameters derived from the network block, then switches again.
 */
export function useChainGuard(deployment: Deployment): ChainGuard {
  const { isConnected, chainId, connector } = useAccount();
  const [phase, setPhase] = useState<ChainGuardPhase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const targetId = deployment.chain.id;
  const wrongChain = isConnected && chainId !== targetId;

  const switchNetwork = useCallback(async () => {
    if (!connector) return;
    const provider = (await connector.getProvider()) as Eip1193Like;
    const params = [{ chainId: numberToHex(targetId) }];
    setMessage(null);
    setPhase('switching');
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params });
      setPhase('idle');
      return;
    } catch (err) {
      if (isUserRejection(err) || !isUnknownChainError(err)) {
        setPhase('error');
        setMessage(describeError(err));
        return;
      }
    }
    setPhase('adding');
    try {
      await provider.request({ method: 'wallet_addEthereumChain', params: [deployment.walletAddChain] });
      await provider.request({ method: 'wallet_switchEthereumChain', params });
      setPhase('idle');
    } catch (err) {
      setPhase('error');
      setMessage(describeError(err));
    }
  }, [connector, deployment.walletAddChain, targetId]);

  return { wrongChain, ready: isConnected && !wrongChain, phase, message, switchNetwork };
}
