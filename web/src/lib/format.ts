import { formatUnits, getAddress, type Address, type Hex } from 'viem';

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });
const compactFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/** Format a token amount with grouping and at most 4 decimals ("1,000" / "0.0012"). */
export function formatAmount(value: bigint, decimals: number, maxFraction = 4): string {
  const s = formatUnits(value, decimals);
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  if (n !== 0 && Math.abs(n) < 10 ** -maxFraction) return `<${(10 ** -maxFraction).toFixed(maxFraction)}`;
  return maxFraction === 4 ? numberFormat.format(n) : compactFormat.format(n);
}

/** "0x1234…abcd" with EIP-55 checksum casing. */
export function shortAddress(address: Address): string {
  const a = getAddress(address);
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function shortHash(hash: Hex): string {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

export function formatTimestamp(seconds: bigint): string {
  const d = new Date(Number(seconds) * 1000);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function explorerAddressUrl(explorer: string, address: Address): string {
  return `${explorer}/address/${getAddress(address)}`;
}

export function explorerTxUrl(explorer: string, hash: Hex): string {
  return `${explorer}/tx/${hash}`;
}

export function explorerBlockUrl(explorer: string, block: bigint): string {
  return `${explorer}/block/${block.toString()}`;
}
