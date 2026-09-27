import { useBalance } from 'wagmi';
import { formatUnits } from 'viem';
import type { PageContext } from './context';
import { useQuote } from '../hooks/useQuote';
import { formatAmount, formatTimestamp } from '../lib/format';
import { AddressLink, Card, Value } from './ui';

export function WalletSection({ ctx }: { ctx: PageContext }) {
  const { deployment, account, state, symbol, decimals, explorer } = ctx;
  const native = deployment.chain.nativeCurrency;
  const eth = useBalance({ address: account, chainId: deployment.chain.id, query: { enabled: Boolean(account) } });
  const quote = useQuote(deployment, state.global.tokenAddress.data);
  const me = state.me;
  const isMember = me.isMember.data;
  const referrer = me.referrerOf.data;
  const noReferrer = !referrer || /^0x0{40}$/i.test(referrer);

  let quoteLine: string;
  if (quote.data && quote.data.amountOut > 0n) {
    const inEth = Number(formatUnits(quote.data.amountIn, native.decimals));
    const out = Number(formatUnits(quote.data.amountOut, decimals));
    const perThousand = (inEth * 1000) / out;
    quoteLine = `Pool quote right now: ${inEth} ${native.symbol} ≈ ${formatAmount(quote.data.amountOut, decimals, 2)} ${symbol}, about ${perThousand.toPrecision(3)} ${native.symbol} per 1,000 ${symbol}.`;
  } else if (quote.isLoading) {
    quoteLine = 'Fetching a pool quote…';
  } else {
    quoteLine = 'A pool quote is not available right now.';
  }

  return (
    <Card id="wallet" title="Your wallet">
      {account ? (
        <dl className="stats">
          <div className="stat">
            <dt>Address</dt>
            <dd>
              <AddressLink address={account} explorer={explorer} />
            </dd>
          </div>
          <div className="stat">
            <dt>{native.symbol} for gas</dt>
            <dd>
              <Value loading={eth.isLoading}>
                {eth.data ? `${formatAmount(eth.data.value, eth.data.decimals)} ${native.symbol}` : '—'}
              </Value>
            </dd>
          </div>
          <div className="stat">
            <dt>{symbol} balance</dt>
            <dd>
              <Value loading={me.balance.isLoading}>
                {me.balance.data !== undefined ? `${formatAmount(me.balance.data, decimals)} ${symbol}` : '—'}
              </Value>
            </dd>
          </div>
          <div className="stat">
            <dt>Approved for the list</dt>
            <dd>
              <Value loading={me.allowance.isLoading}>
                {me.allowance.data !== undefined ? `${formatAmount(me.allowance.data, decimals)} ${symbol}` : '—'}
              </Value>
            </dd>
          </div>
          <div className="stat stat-wide">
            <dt>Membership</dt>
            <dd>
              {me.isMember.isLoading ? (
                <Value loading>—</Value>
              ) : isMember ? (
                <>
                  On the list since {me.joinedAt.data ? formatTimestamp(me.joinedAt.data) : '…'} · depth{' '}
                  <span className="num">{me.depth.data?.toString() ?? '…'}</span> ·{' '}
                  {noReferrer ? 'no referrer' : <>referred by <AddressLink address={referrer} explorer={explorer} /></>}
                </>
              ) : (
                'Not on the list yet.'
              )}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="muted">Connect a wallet to see your {symbol} balance, allowance and membership.</p>
      )}
      <div className="note">
        <p>
          <strong>Getting {symbol}.</strong> {symbol} comes from swapping {deployment.chain.name} {native.symbol} in the {native.symbol}/{symbol}{' '}
          launch pool using your own wallet or a Uniswap interface. This page never swaps.
        </p>
        <p className="muted num" role="status" aria-live="polite">
          {quoteLine}
        </p>
      </div>
    </Card>
  );
}
