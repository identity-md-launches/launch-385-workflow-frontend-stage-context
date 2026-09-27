import { baseBlockers, firstBlocker, type PageContext } from './context';
import { useTxAction } from '../hooks/useTxAction';
import { formatAmount } from '../lib/format';
import { Button, Card, TxStatus, Value } from './ui';

export function EarningsSection({ ctx }: { ctx: PageContext }) {
  const { deployment, account, state, symbol, decimals, explorer } = ctx;
  const claim = useTxAction();
  const claimable = state.me.claimable.data;
  const count = state.me.referralCount.data;
  const share = state.global.referrerShare.data;

  const blocker = firstBlocker([
    ...baseBlockers(ctx),
    Boolean(account) && state.me.claimable.isLoading && 'Loading your credit…',
    Boolean(account) && claimable !== undefined && claimable === 0n && 'Nothing to claim yet.',
  ]);

  async function onClaim() {
    if (!account) return;
    await claim.run({
      address: deployment.referralList.address,
      abi: deployment.referralList.abi,
      functionName: 'claim',
      account,
      chainId: deployment.chain.id,
    });
  }

  return (
    <Card id="earnings" title="Referral credit">
      {account ? (
        <>
          <dl className="stats">
            <div className="stat">
              <dt>Claimable now</dt>
              <dd>
                <Value loading={state.me.claimable.isLoading}>
                  {claimable !== undefined ? `${formatAmount(claimable, decimals)} ${symbol}` : '—'}
                </Value>
              </dd>
            </div>
            <div className="stat">
              <dt>Joins through your link</dt>
              <dd>
                <Value loading={state.me.referralCount.isLoading}>{count !== undefined ? count.toString() : '—'}</Value>
              </dd>
            </div>
          </dl>
          <p className="muted" id="claim-help">
            Each join credits {share !== undefined ? formatAmount(share, decimals) : '200'} {symbol}. Claiming sends your whole credit to this wallet in one
            transaction. {blocker && blocker !== 'Nothing to claim yet.' ? blocker : ''}
          </p>
          <div className="row">
            <Button variant="primary" busy={claim.busy} disabled={Boolean(blocker)} aria-describedby="claim-help" onClick={() => void onClaim()}>
              {claimable && claimable > 0n ? `Claim ${formatAmount(claimable, decimals)} ${symbol}` : `Claim ${symbol}`}
            </Button>
          </div>
          <TxStatus state={claim.state} explorer={explorer} successText="Credit claimed and sent to your wallet." />
        </>
      ) : (
        <p className="muted">Connect a wallet to see and claim referral credit. It is {symbol} on Sepolia and has no value.</p>
      )}
    </Card>
  );
}
