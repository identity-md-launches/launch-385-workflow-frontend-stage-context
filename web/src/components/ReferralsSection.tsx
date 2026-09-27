import type { PageContext } from './context';
import { useJoinedEvents } from '../hooks/useJoinedEvents';
import { describeError } from '../lib/errors';
import { AddressLink, Button, Card, TxLink } from './ui';

const intFormat = new Intl.NumberFormat('en-US');

export function ReferralsSection({ ctx }: { ctx: PageContext }) {
  const { deployment, account, explorer, symbol } = ctx;
  const events = useJoinedEvents(deployment, account);
  const list = events.data ?? [];

  let body;
  if (!account) {
    body = <p className="muted">Connect a wallet to list the members who joined with your link.</p>;
  } else if (events.isLoading) {
    body = (
      <p className="muted num" role="status" aria-live="polite">
        {events.progress
          ? `Scanning blocks: ${intFormat.format(Number(events.progress.scanned))} of ${intFormat.format(Number(events.progress.total))}…`
          : 'Reading Joined events from the chain…'}
      </p>
    );
  } else if (events.isError) {
    body = (
      <>
        <p className="tx-error" role="alert">
          Unable to read Joined events from the RPC: {describeError(events.error)}
        </p>
        <Button onClick={() => void events.refetch()}>Retry</Button>
      </>
    );
  } else if (list.length === 0) {
    body = (
      <>
        <p>No one has joined with your link yet.</p>
        <p className="muted">Share the link above. Each join through it credits you 200 {symbol}.</p>
      </>
    );
  } else {
    body = (
      <ol className="list">
        {list.map((ev) => (
          <li key={`${ev.txHash}-${ev.logIndex}`} className="list-row">
            <AddressLink address={ev.member} explorer={explorer} />
            <span className="muted num">depth {ev.depth.toString()}</span>
            <TxLink hash={ev.txHash} explorer={explorer} />
          </li>
        ))}
      </ol>
    );
  }

  return (
    <Card id="referrals" title="Your referrals" meta={account && events.isSuccess ? <span className="num">{list.length}</span> : undefined}>
      {body}
      {account && events.isSuccess && (
        <p className="muted small">Read from Joined events on chain, from the deployment block to the latest block.</p>
      )}
    </Card>
  );
}
