import { useEffect, useId, useRef, useState } from 'react';
import type { PageContext } from './context';
import { buildReferralLink } from '../lib/referralLink';
import { Button, Card, Field } from './ui';

export function LinkSection({ ctx }: { ctx: PageContext }) {
  const { account, state, symbol } = ctx;
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');
  const isMember = state.me.isMember.data === true;

  useEffect(() => {
    if (copied !== 'copied') return;
    const t = setTimeout(() => setCopied('idle'), 4000);
    return () => clearTimeout(t);
  }, [copied]);

  if (!account) {
    return (
      <Card id="link" title="Your referral link">
        <p className="muted">Connect a wallet to see your link. Anyone who joins through it credits you 200 {symbol}.</p>
      </Card>
    );
  }

  const link = buildReferralLink(account);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied('copied');
    } catch {
      inputRef.current?.select();
      setCopied('failed');
    }
  }

  return (
    <Card id="link" title="Your referral link">
      <Field
        id={id}
        label="Link with your address as referrer"
        hint={
          isMember
            ? `Share it. Each wallet that joins through it credits you 200 ${symbol}.`
            : 'Your link works once you are on the list: a joiner needs a referrer who has already joined.'
        }
      >
        <input
          ref={inputRef}
          id={id}
          className="input mono"
          type="url"
          readOnly
          value={link}
          aria-describedby={`${id}-hint`}
          onFocus={(e) => e.currentTarget.select()}
        />
      </Field>
      <div className="row">
        <Button variant="primary" onClick={() => void copy()} disabled={!isMember}>
          Copy link
        </Button>
        <p className="tx-status" role="status" aria-live="polite">
          {copied === 'copied' && 'Link copied.'}
          {copied === 'failed' && 'Copying is blocked here. The link is selected; copy it manually.'}
        </p>
      </div>
    </Card>
  );
}
