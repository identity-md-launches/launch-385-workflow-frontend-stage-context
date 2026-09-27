import { useId, useRef, useState, type FormEvent } from 'react';
import { getAddress, isAddress, zeroAddress, type Address } from 'viem';
import { baseBlockers, firstBlocker, type PageContext } from './context';
import { useRead } from '../hooks/useReferralState';
import { useTxAction } from '../hooks/useTxAction';
import { formatAmount, formatTimestamp, shortAddress } from '../lib/format';
import { AddressLink, Button, Card, Field, TxStatus } from './ui';

export function JoinSection({ ctx, initialReferrer }: { ctx: PageContext; initialReferrer: Address | null }) {
  const { deployment, account, state, symbol, decimals, explorer } = ctx;
  const chainId = deployment.chain.id;
  const rl = deployment.referralList;
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [referrer, setReferrer] = useState<string>(initialReferrer ?? '');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const approve = useTxAction();
  const join = useTxAction();

  const fee = state.global.joinFee.data;
  const share = state.global.referrerShare.data;
  const balance = state.me.balance.data;
  const allowance = state.me.allowance.data;

  const trimmed = referrer.trim();
  const refValid = trimmed === '' || isAddress(trimmed, { strict: false });
  const refAddress = trimmed !== '' && refValid ? getAddress(trimmed) : undefined;
  const refIsSelf = Boolean(refAddress && account && refAddress.toLowerCase() === account.toLowerCase());
  const refMember = useRead<boolean>(chainId, rl, 'isMember', [refAddress], { enabled: Boolean(refAddress), refetchInterval: false });

  if (state.me.isMember.data === true && account) {
    const referred = state.me.referrerOf.data;
    const noReferrer = !referred || referred === zeroAddress;
    return (
      <Card id="join" title="You are on the list">
        <p>
          You joined on {state.me.joinedAt.data ? formatTimestamp(state.me.joinedAt.data) : '…'} at depth{' '}
          <span className="num">{state.me.depth.data?.toString() ?? '…'}</span>
          {noReferrer ? ' with no referrer.' : <>, referred by <AddressLink address={referred} explorer={explorer} />.</>}
        </p>
        <p className="muted">A wallet can join only once. Share your link below to earn {share !== undefined ? formatAmount(share, decimals) : '200'} {symbol} per join.</p>
      </Card>
    );
  }

  const feeText = fee !== undefined ? formatAmount(fee, decimals) : '1,000';
  const shareText = share !== undefined ? formatAmount(share, decimals) : '200';
  const burnText = fee !== undefined && share !== undefined ? formatAmount(fee - share, decimals) : '800';
  const hasFee = fee !== undefined && balance !== undefined && balance >= fee;
  const approved = fee !== undefined && allowance !== undefined && allowance >= fee;

  const base = baseBlockers(ctx);
  const loadingMe = Boolean(account) && (state.me.balance.isLoading || state.me.allowance.isLoading || fee === undefined);
  const approveBlocker = firstBlocker([
    ...base,
    loadingMe && 'Loading your balance…',
    !loadingMe && Boolean(account) && !hasFee && `You need ${feeText} ${symbol} to join; this wallet has ${balance !== undefined ? formatAmount(balance, decimals) : '0'} ${symbol}.`,
  ]);

  let referrerHint: string;
  let referrerBlocker: string | false = false;
  if (trimmed === '') {
    referrerHint = `Optional. Paste the address from a referral link. Without one, all ${feeText} ${symbol} is burned.`;
  } else if (!refValid) {
    // Format problems are reported on submit, beside the field, so the button stays usable.
    referrerHint = 'An address is 0x followed by 40 hexadecimal characters.';
  } else if (refIsSelf) {
    referrerHint = 'You cannot be your own referrer. Clear the field or use another address.';
    referrerBlocker = 'Clear the referrer field: it is your own address.';
  } else if (refMember.isLoading) {
    referrerHint = 'Checking whether this address is on the list…';
    referrerBlocker = 'Checking the referrer…';
  } else if (refMember.data === true) {
    referrerHint = `On the list. ${shareText} ${symbol} goes to ${refAddress ? shortAddress(refAddress) : 'the referrer'}, ${burnText} ${symbol} is burned.`;
  } else if (refMember.data === false) {
    referrerHint = 'This address has not joined, so joining with it would fail. Clear the field to join without a referrer, or ask them to join first.';
    referrerBlocker = 'The referrer is not on the list.';
  } else {
    referrerHint = 'Unable to check this address right now.';
    referrerBlocker = refMember.error ? 'Unable to verify the referrer; try again shortly.' : false;
  }

  const joinBlocker = firstBlocker([
    ...base,
    loadingMe && 'Loading your balance…',
    !loadingMe && Boolean(account) && !hasFee && `You need ${feeText} ${symbol} to join.`,
    !loadingMe && Boolean(account) && hasFee && !approved && `Approve ${feeText} ${symbol} first (step 1).`,
    referrerBlocker,
  ]);

  async function onApprove() {
    if (!account || fee === undefined || !state.tokenBinding.address) return;
    join.reset();
    await approve.run({
      address: state.tokenBinding.address,
      abi: state.tokenBinding.abi,
      functionName: 'approve',
      args: [rl.address, fee],
      account,
      chainId,
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (trimmed !== '' && !refValid) {
      setFieldError('Enter a full 0x address with 40 hexadecimal characters, or leave the field empty.');
      inputRef.current?.focus();
      return;
    }
    setFieldError(null);
    if (!account || joinBlocker) return;
    approve.reset();
    await join.run({
      address: rl.address,
      abi: rl.abi,
      functionName: 'join',
      args: [refAddress ?? zeroAddress],
      account,
      chainId,
    });
  }

  const describedBy = fieldError ? `${inputId}-error` : `${inputId}-hint`;

  return (
    <Card id="join" title="Join the list">
      <p>
        Joining costs exactly {feeText} {symbol}. With a referrer, {shareText} {symbol} is credited to them and {burnText} {symbol} is burned. Without one, all{' '}
        {feeText} {symbol} is burned. Nothing is refunded.
      </p>
      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        <Field id={inputId} label="Referrer address" hint={referrerHint} error={fieldError}>
          <input
            ref={inputRef}
            id={inputId}
            name="referrer"
            className="input mono"
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="0x…"
            value={referrer}
            onChange={(e) => {
              setReferrer(e.target.value);
              if (fieldError) setFieldError(null);
            }}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={describedBy}
          />
        </Field>

        <ol className="steps">
          <li className={`step${approved ? ' is-done' : ''}`}>
            <div className="step-body">
              <h3>Step 1 · Approve {feeText} {symbol}</h3>
              <p className="muted" id="approve-help">
                {approved
                  ? `Done: the list may pull ${feeText} ${symbol} from your wallet.`
                  : `Lets the list pull the fee from your wallet. One transaction.`}
              </p>
              {!approved && approveBlocker && (
                <p className="muted" id="approve-blocker">
                  {approveBlocker}
                </p>
              )}
              <TxStatus state={approve.state} explorer={explorer} successText="Approval confirmed." />
            </div>
            {!approved && (
              <Button
                variant={approved ? 'secondary' : 'primary'}
                busy={approve.busy}
                disabled={Boolean(approveBlocker)}
                aria-describedby={approveBlocker ? 'approve-blocker' : 'approve-help'}
                onClick={() => void onApprove()}
              >
                Approve {feeText} {symbol}
              </Button>
            )}
          </li>
          <li className="step">
            <div className="step-body">
              <h3>Step 2 · Join</h3>
              <p className="muted" id="join-help">
                {refAddress && !refIsSelf && refMember.data === true
                  ? `Pays ${feeText} ${symbol}: ${shareText} to ${shortAddress(refAddress)}, ${burnText} burned.`
                  : `Pays ${feeText} ${symbol}, all of it burned.`}
              </p>
              {joinBlocker && (
                <p className="muted" id="join-blocker">
                  {joinBlocker}
                </p>
              )}
              <TxStatus state={join.state} explorer={explorer} successText="You are on the list." />
            </div>
            <Button
              type="submit"
              variant={approved ? 'primary' : 'secondary'}
              busy={join.busy}
              disabled={Boolean(joinBlocker)}
              aria-describedby={joinBlocker ? 'join-blocker' : 'join-help'}
            >
              Join for {feeText} {symbol}
            </Button>
          </li>
        </ol>
      </form>
    </Card>
  );
}
