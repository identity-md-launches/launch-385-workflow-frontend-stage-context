import { baseBlockers, firstBlocker, type PageContext } from './context';
import { useTxAction } from '../hooks/useTxAction';
import { formatAmount } from '../lib/format';
import { Button, TxStatus } from './ui';

/** burnExcess(): permissionless housekeeping, tucked behind a disclosure. */
export function MaintenanceSection({ ctx }: { ctx: PageContext }) {
  const { deployment, account, state, symbol, decimals, explorer } = ctx;
  const burn = useTxAction();
  const balance = state.global.contractBalance.data;
  const owed = state.global.totalClaimable.data;
  const excess = balance !== undefined && owed !== undefined && balance > owed ? balance - owed : 0n;
  const loading = state.global.contractBalance.isLoading || state.global.totalClaimable.isLoading;

  const blocker = firstBlocker([...baseBlockers(ctx), loading && 'Loading contract balances…', !loading && excess === 0n && `The contract holds no stray ${symbol}.`]);

  async function onBurn() {
    if (!account) return;
    await burn.run({
      address: deployment.referralList.address,
      abi: deployment.referralList.abi,
      functionName: 'burnExcess',
      account,
      chainId: deployment.chain.id,
    });
  }

  return (
    <details className="card disclosure" id="maintenance">
      <summary>
        <h2>Maintenance: burn stray {symbol}</h2>
      </summary>
      <p className="muted">
        {symbol} sent to the contract outside a join belongs to nobody. Anyone may forward it to the dead address; referral credit is never
        touched.
      </p>
      <dl className="stats">
        <div className="stat">
          <dt>Contract holds</dt>
          <dd className="num">{balance !== undefined ? `${formatAmount(balance, decimals)} ${symbol}` : '—'}</dd>
        </div>
        <div className="stat">
          <dt>Owed to referrers</dt>
          <dd className="num">{owed !== undefined ? `${formatAmount(owed, decimals)} ${symbol}` : '—'}</dd>
        </div>
        <div className="stat">
          <dt>Stray</dt>
          <dd className="num">{!loading ? `${formatAmount(excess, decimals)} ${symbol}` : '—'}</dd>
        </div>
      </dl>
      {blocker && (
        <p className="muted" id="burn-blocker">
          {blocker}
        </p>
      )}
      <Button busy={burn.busy} disabled={Boolean(blocker)} aria-describedby={blocker ? 'burn-blocker' : undefined} onClick={() => void onBurn()}>
        Burn stray {symbol}
      </Button>
      <TxStatus state={burn.state} explorer={explorer} successText={`Stray ${symbol} burned.`} />
    </details>
  );
}
