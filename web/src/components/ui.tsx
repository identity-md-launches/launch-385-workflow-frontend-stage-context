import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Address, Hex } from 'viem';
import { explorerAddressUrl, explorerTxUrl, shortAddress, shortHash } from '../lib/format';
import type { TxState } from '../hooks/useTxAction';

type ButtonVariant = 'primary' | 'secondary' | 'quiet';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** A request is in flight: show a spinner beside the original label and disable the control. */
  busy?: boolean;
}

export function Button({ variant = 'secondary', busy = false, disabled, children, className, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={['btn', `btn-${variant}`, className].filter(Boolean).join(' ')}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy && <span className="spinner" aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
}

interface CardProps {
  id: string;
  title: string;
  children: ReactNode;
  /** Short text beside the title, such as a live count. */
  meta?: ReactNode;
}

export function Card({ id, title, children, meta }: CardProps) {
  return (
    <section className="card" id={id} aria-labelledby={`${id}-title`}>
      <header className="card-header">
        <h2 id={`${id}-title`}>{title}</h2>
        {meta !== undefined && <div className="card-meta">{meta}</div>}
      </header>
      {children}
    </section>
  );
}

interface FieldProps {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}

/** Label + control + hint/error, wired with aria-describedby by the caller via `${id}-hint`. */
export function Field({ id, label, hint, error, children }: FieldProps) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

interface AddressLinkProps {
  address: Address;
  explorer: string;
  full?: boolean;
}

export function AddressLink({ address, explorer, full = false }: AddressLinkProps) {
  return (
    <a className="mono link-external" href={explorerAddressUrl(explorer, address)} target="_blank" rel="noreferrer">
      {full ? address : shortAddress(address)}
      <span className="visually-hidden"> (opens the block explorer in a new tab)</span>
    </a>
  );
}

export function TxLink({ hash, explorer }: { hash: Hex; explorer: string }) {
  return (
    <a className="mono link-external" href={explorerTxUrl(explorer, hash)} target="_blank" rel="noreferrer">
      {shortHash(hash)}
      <span className="visually-hidden"> (opens the transaction in a new tab)</span>
    </a>
  );
}

/**
 * Transaction status. The polite status region is always rendered so repeated updates announce;
 * failures render as an alert with a stated next step.
 */
export function TxStatus({ state, explorer, successText }: { state: TxState; explorer: string; successText: string }) {
  let text: ReactNode = null;
  switch (state.phase) {
    case 'simulating':
      text = 'Checking the transaction…';
      break;
    case 'signing':
      text = 'Confirm the request in your wallet.';
      break;
    case 'pending':
      text = (
        <>
          Waiting for the network to include the transaction {state.hash && <TxLink hash={state.hash} explorer={explorer} />}…
        </>
      );
      break;
    case 'confirmed':
      text = (
        <>
          <span className="status-ok" aria-hidden="true">
            ✓
          </span>{' '}
          {successText} {state.hash && <TxLink hash={state.hash} explorer={explorer} />}
        </>
      );
      break;
    default:
      text = null;
  }
  return (
    <>
      <p className={`tx-status${text ? '' : ' is-empty'}`} role="status" aria-live="polite">
        {text}
      </p>
      {state.phase === 'error' && (
        <p className="tx-error" role="alert">
          {state.message}
          {state.hash && (
            <>
              {' '}
              <TxLink hash={state.hash} explorer={explorer} />
            </>
          )}
        </p>
      )}
    </>
  );
}

/** A value that may still be loading. */
export function Value({ children, loading }: { children: ReactNode; loading?: boolean }) {
  if (loading) {
    return (
      <span className="value is-loading" aria-busy="true">
        <span className="visually-hidden">Loading</span>
        <span aria-hidden="true">···</span>
      </span>
    );
  }
  return <span className="value num">{children}</span>;
}
