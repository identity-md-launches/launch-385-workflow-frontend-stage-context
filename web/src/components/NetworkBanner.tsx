import { useAccount } from 'wagmi';
import type { ChainGuard } from '../hooks/useChainGuard';
import type { Deployment } from '../deployment';
import { Button } from './ui';

/** Wrong-network state with one control: switch, and add the chain first when the wallet lacks it. */
export function NetworkBanner({ deployment, guard }: { deployment: Deployment; guard: ChainGuard }) {
  const { chainId } = useAccount();
  if (!guard.wrongChain) return null;
  const name = deployment.chain.name;
  const busy = guard.phase === 'switching' || guard.phase === 'adding';
  return (
    <div className="banner banner-warning" role="region" aria-labelledby="network-title">
      <div className="banner-body">
        <p id="network-title" className="banner-title">
          Your wallet is on another network{chainId !== undefined ? ` (chain ${chainId})` : ''}.
        </p>
        <p>
          This list lives on {name}. Switching adds {name} to your wallet if it is missing. Reads below still come from{' '}
          {name}.
        </p>
        <p className="tx-status" role="status" aria-live="polite">
          {guard.phase === 'switching' && 'Confirm the network switch in your wallet.'}
          {guard.phase === 'adding' && `Confirm adding ${name} in your wallet, then the switch.`}
        </p>
        {guard.phase === 'error' && guard.message && (
          <p className="tx-error" role="alert">
            {guard.message}
          </p>
        )}
      </div>
      <Button variant="primary" busy={busy} onClick={() => void guard.switchNetwork()}>
        Switch to {name}
      </Button>
    </div>
  );
}
