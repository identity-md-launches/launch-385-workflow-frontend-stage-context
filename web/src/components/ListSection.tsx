import type { PageContext } from './context';
import { formatAmount } from '../lib/format';
import { Card, Value } from './ui';

export function ListSection({ ctx }: { ctx: PageContext }) {
  const { state, symbol, decimals } = ctx;
  const g = state.global;
  const fee = g.joinFee.data;
  const share = g.referrerShare.data;
  const pct = fee && share && fee > 0n ? Number((share * 10000n) / fee) / 100 : undefined;

  return (
    <Card id="list" title="The list">
      <dl className="stats">
        <div className="stat">
          <dt>Members</dt>
          <dd>
            <Value loading={g.memberCount.isLoading}>{g.memberCount.data?.toString() ?? '—'}</Value>
          </dd>
        </div>
        <div className="stat">
          <dt>Deepest chain</dt>
          <dd>
            <Value loading={g.maxDepth.isLoading}>{g.maxDepth.data !== undefined ? `depth ${g.maxDepth.data.toString()}` : '—'}</Value>
          </dd>
        </div>
        <div className="stat">
          <dt>Join fee</dt>
          <dd>
            <Value loading={g.joinFee.isLoading}>{fee !== undefined ? `${formatAmount(fee, decimals)} ${symbol}` : '—'}</Value>
          </dd>
        </div>
        <div className="stat">
          <dt>Referrer share</dt>
          <dd>
            <Value loading={g.referrerShare.isLoading}>
              {share !== undefined ? `${formatAmount(share, decimals)} ${symbol}${pct !== undefined ? ` (${pct}%)` : ''}` : '—'}
            </Value>
          </dd>
        </div>
        <div className="stat">
          <dt>Unclaimed credit</dt>
          <dd>
            <Value loading={g.totalClaimable.isLoading}>
              {g.totalClaimable.data !== undefined ? `${formatAmount(g.totalClaimable.data, decimals)} ${symbol}` : '—'}
            </Value>
          </dd>
        </div>
      </dl>
      <p className="muted small">
        The rest of every fee is sent to the dead address and can never move again. Depth is 0 for a member without a referrer, otherwise the
        referrer's depth plus one.
      </p>
    </Card>
  );
}
