import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { connectorLabel } from '../wagmi';
import { describeError } from '../lib/errors';
import { shortAddress } from '../lib/format';
import { Button } from './ui';

/**
 * Wallet connection. Lists EIP-6963 wallets when present, otherwise the generic browser wallet,
 * and says plainly when no wallet is installed.
 */
export function ConnectControl() {
  const { address, isConnected, connector: active } = useAccount();
  const { connectors, connect, isPending, variables, error } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <div className="connect connected">
        <span className="pill mono" title={address}>
          <span className="dot dot-ok" aria-hidden="true" />
          <span className="visually-hidden">Connected wallet </span>
          {shortAddress(address)}
          {active && <span className="pill-sub"> · {connectorLabel(active)}</span>}
        </span>
        <Button variant="quiet" onClick={() => disconnect()}>
          Disconnect
        </Button>
      </div>
    );
  }

  // EIP-6963 announced wallets have their own connector; drop the generic entry when they exist.
  // The generic entry is only usable when window.ethereum is present.
  const hasWindowProvider = typeof window !== 'undefined' && Boolean((window as { ethereum?: unknown }).ethereum);
  const announced = connectors.filter((c) => c.id !== 'injected');
  const list = announced.length > 0 ? announced : hasWindowProvider ? connectors : [];

  if (list.length === 0) {
    return (
      <div className="connect">
        <p className="connect-none">
          No browser wallet detected. Install a wallet extension such as MetaMask or Rabby, then reload this page.
        </p>
      </div>
    );
  }

  return (
    <div className="connect">
      <div className="connect-list">
        {list.map((c) => (
          <Button
            key={c.uid}
            variant="primary"
            busy={isPending && variables?.connector === c}
            onClick={() => connect({ connector: c })}
          >
            {list.length === 1 ? 'Connect wallet' : `Connect ${connectorLabel(c)}`}
          </Button>
        ))}
      </div>
      {error && (
        <p className="tx-error" role="alert">
          {describeError(error)}
        </p>
      )}
    </div>
  );
}
