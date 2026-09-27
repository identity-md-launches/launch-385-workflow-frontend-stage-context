import { getAddress, isAddress, type Address } from 'viem';

export const REF_PARAM = 'ref';

/** The referrer address from ?ref=0x…, or null when absent or malformed. */
export function readRefParam(search: string = window.location.search): Address | null {
  const value = new URLSearchParams(search).get(REF_PARAM);
  if (!value) return null;
  const trimmed = value.trim();
  return isAddress(trimmed, { strict: false }) ? getAddress(trimmed) : null;
}

/** This page's URL with only ?ref=<address>, so the link works from any gateway or ENS host. */
export function buildReferralLink(address: Address, href: string = window.location.href): string {
  const url = new URL(href);
  url.search = '';
  url.hash = '';
  url.searchParams.set(REF_PARAM, getAddress(address));
  return url.toString();
}
