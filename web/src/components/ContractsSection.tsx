import type { PageContext } from './context';
import { AddressLink, Card } from './ui';

export function ContractsSection({ ctx }: { ctx: PageContext }) {
  const { deployment, state, explorer, symbol } = ctx;
  const m = deployment.manifest;
  const tokenOnChain = state.global.tokenAddress.data;

  return (
    <Card id="contracts" title="Contracts and network">
      <dl className="stats">
        <div className="stat stat-wide">
          <dt>ReferralList</dt>
          <dd>
            <AddressLink address={deployment.referralList.address} explorer={explorer} full />
          </dd>
        </div>
        <div className="stat stat-wide">
          <dt>{symbol} token (from ReferralList.token())</dt>
          <dd>
            {tokenOnChain ? <AddressLink address={tokenOnChain} explorer={explorer} full /> : <span className="muted">Reading…</span>}
            {state.tokenMismatch && (
              <p className="tx-error" role="alert">
                The on-chain token address differs from the deployment configuration&apos;s LaunchToken (
                {deployment.token.address}). Transactions are disabled.
              </p>
            )}
          </dd>
        </div>
        <div className="stat">
          <dt>Network</dt>
          <dd>
            {deployment.chain.name} (chain ID <span className="num">{deployment.chain.id}</span>)
            {m.network.testnet ? ', a test network' : ''}
          </dd>
        </div>
        <div className="stat">
          <dt>Pool quotes</dt>
          <dd>
            Uniswap v4 quoter <AddressLink address={m.network.uniswapV4.quoter} explorer={explorer} />
          </dd>
        </div>
        <div className="stat">
          <dt>Source commit</dt>
          <dd className="mono">{m.sourceCommit.slice(0, 12)}</dd>
        </div>
        <div className="stat">
          <dt>Launch</dt>
          <dd className="mono small">{m.launchId}</dd>
        </div>
      </dl>
      <p className="muted small">
        Addresses, chain, RPC endpoints and ABIs are read at load time from{' '}
        <a href="./imd-deployment.json" target="_blank" rel="noreferrer">
          the deployment configuration
        </a>
        , whose ABI hashes were verified against the attested handoff.
      </p>
    </Card>
  );
}
