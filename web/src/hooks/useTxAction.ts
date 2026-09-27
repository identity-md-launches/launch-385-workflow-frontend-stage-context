import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Abi, Address, Hex } from 'viem';
import { useConfig } from 'wagmi';
import { simulateContract, waitForTransactionReceipt, writeContract } from 'wagmi/actions';
import { describeError } from '../lib/errors';

export type TxPhase = 'idle' | 'simulating' | 'signing' | 'pending' | 'confirmed' | 'error';

export interface TxState {
  phase: TxPhase;
  hash?: Hex;
  message?: string;
}

export interface TxParams {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  account: Address;
  chainId: number;
}

export interface TxAction {
  state: TxState;
  busy: boolean;
  run: (params: TxParams) => Promise<boolean>;
  reset: () => void;
}

/**
 * One contract write as a small state machine: simulate (so a revert shows before the wallet
 * opens), ask the wallet to sign, wait for the receipt, then refresh every read on the page.
 */
export function useTxAction(): TxAction {
  const config = useConfig();
  const queryClient = useQueryClient();
  const [state, setState] = useState<TxState>({ phase: 'idle' });

  const run = useCallback(
    async (params: TxParams): Promise<boolean> => {
      setState({ phase: 'simulating' });
      let hash: Hex | undefined;
      try {
        const { request } = await simulateContract(config, {
          address: params.address,
          abi: params.abi,
          functionName: params.functionName,
          args: params.args ?? [],
          account: params.account,
          chainId: params.chainId,
        });
        setState({ phase: 'signing' });
        hash = await writeContract(config, request);
        setState({ phase: 'pending', hash });
        const receipt = await waitForTransactionReceipt(config, { hash, chainId: params.chainId });
        if (receipt.status !== 'success') {
          setState({ phase: 'error', hash, message: 'The transaction was mined but reverted, so nothing changed.' });
          await queryClient.invalidateQueries();
          return false;
        }
        setState({ phase: 'confirmed', hash });
        await queryClient.invalidateQueries();
        return true;
      } catch (err) {
        setState(hash ? { phase: 'error', hash, message: describeError(err) } : { phase: 'error', message: describeError(err) });
        return false;
      }
    },
    [config, queryClient],
  );

  const reset = useCallback(() => setState({ phase: 'idle' }), []);
  const busy = state.phase === 'simulating' || state.phase === 'signing' || state.phase === 'pending';
  return { state, busy, run, reset };
}
