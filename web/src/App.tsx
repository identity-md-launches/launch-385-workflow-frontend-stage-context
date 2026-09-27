import { useMemo } from 'react';
import { useAccount } from 'wagmi';
import type { Deployment } from './deployment';
import { useChainGuard } from './hooks/useChainGuard';
import { useReferralState } from './hooks/useReferralState';
import { readRefParam } from './lib/referralLink';
import type { PageContext } from './components/context';
import { ConnectControl } from './components/ConnectControl';
import { ContractsSection } from './components/ContractsSection';
import { EarningsSection } from './components/EarningsSection';
import { JoinSection } from './components/JoinSection';
import { LinkSection } from './components/LinkSection';
import { ListSection } from './components/ListSection';
import { MaintenanceSection } from './components/MaintenanceSection';
import { NetworkBanner } from './components/NetworkBanner';
import { ReferralsSection } from './components/ReferralsSection';
import { WalletSection } from './components/WalletSection';

export function App({ deployment }: { deployment: Deployment }) {
  const { address } = useAccount();
  const guard = useChainGuard(deployment);
  const state = useReferralState(deployment, address);
  const initialReferrer = useMemo(() => readRefParam(), []);
  const network = deployment.manifest.network;

  const ctx: PageContext = {
    deployment,
    account: address,
    guard,
    state,
    symbol: state.global.tokenSymbol.data ?? 'INVT',
    decimals: state.global.tokenDecimals.data ?? 18,
    explorer: network.explorer,
    canTransact: guard.ready && !state.tokenMismatch,
  };

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="brand">
          <h1>Invite referral list</h1>
          <p className="tagline">
            On-chain referral tracking paid in {ctx.symbol}, on {deployment.chain.name}.
          </p>
        </div>
        <ConnectControl />
      </header>
      <main id="main" className="page">
        <div className="banner banner-info" role="note">
          <p>
            <strong>A Sepolia test toy, not an investment or earning scheme.</strong> {ctx.symbol} has no value. Joining burns most of the fee
            for good.
          </p>
        </div>
        <NetworkBanner deployment={deployment} guard={guard} />
        <WalletSection ctx={ctx} />
        <JoinSection ctx={ctx} initialReferrer={initialReferrer} />
        <LinkSection ctx={ctx} />
        <EarningsSection ctx={ctx} />
        <ReferralsSection ctx={ctx} />
        <ListSection ctx={ctx} />
        <ContractsSection ctx={ctx} />
        <MaintenanceSection ctx={ctx} />
      </main>
      <footer className="site-footer">
        <p>
          Runs entirely in your browser against public {deployment.chain.name} RPC endpoints. No backend, no indexer, no tracking.
        </p>
        {network.faucets.length > 0 && (
          <p>
            Need {network.nativeCurrency.symbol} for gas? Faucets:{' '}
            {network.faucets.map((f, i) => (
              <span key={f}>
                {i > 0 && ', '}
                <a href={f} target="_blank" rel="noreferrer">
                  {new URL(f).hostname}
                </a>
              </span>
            ))}
            .
          </p>
        )}
      </footer>
    </>
  );
}
