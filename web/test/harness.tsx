/**
 * Test harness: builds the same runtime deployment configuration the production manifest script
 * writes (without asset hashes), serves it and the ABIs through a stubbed fetch, routes JSON-RPC
 * requests to the MockChain and installs the mock wallet as window.ethereum.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import type { Abi, Address } from 'viem';
import { abiSourceDir, buildManifest, type Manifest } from '../scripts/manifest-lib.mjs';
import { v4QuoterAbi } from '../src/abis/v4Quoter';
import { Root } from '../src/Root';
import { MockChain, type MockOptions } from './mockChain';

export const ACCOUNT: Address = '0x1111111111111111111111111111111111111111';
export const REFERRER: Address = '0x2222222222222222222222222222222222222222';
export const OTHER: Address = '0x3333333333333333333333333333333333333333';
export const STRANGER: Address = '0x4444444444444444444444444444444444444444';

export interface Harness {
  mock: MockChain;
  manifest: Manifest;
  fetchCalls: string[];
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export interface HarnessOptions extends MockOptions {
  /** Override the manifest served to the app (to test validation failures). */
  manifestOverride?: (m: Manifest) => unknown;
  /** Serve a tampered ABI for this contract name. */
  tamperAbi?: string;
  /** Do not install window.ethereum. */
  noWallet?: boolean;
}

export function installHarness(opts: HarnessOptions = {}): Harness {
  const manifest = buildManifest({ assets: [] });
  const abis: Record<string, Abi> = {};
  for (const c of manifest.contracts) {
    abis[c.name] = JSON.parse(readFileSync(join(abiSourceDir, `${c.name}.json`), 'utf8')) as Abi;
  }
  const byName = Object.fromEntries(manifest.contracts.map((c) => [c.name, c.address as Address]));
  const mock = new MockChain(
    {
      referralList: byName.ReferralList as Address,
      token: byName.LaunchToken as Address,
      quoter: manifest.network.uniswapV4.quoter as Address,
      referralListAbi: abis.ReferralList as Abi,
      tokenAbi: abis.LaunchToken as Abi,
      quoterAbi: v4QuoterAbi as unknown as Abi,
    },
    opts,
  );
  if (!opts.noWallet) (window as unknown as { ethereum: unknown }).ethereum = mock.provider;

  const fetchCalls: string[] = [];
  const served = opts.manifestOverride ? opts.manifestOverride(manifest) : manifest;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    fetchCalls.push(url);
    const path = new URL(url, 'http://localhost/').pathname;
    if (path.endsWith('/imd-deployment.json')) return jsonResponse(served);
    const abiMatch = /\/abi\/([A-Za-z0-9_]+)\.json$/.exec(path);
    if (abiMatch) {
      const name = abiMatch[1] as string;
      const abi = abis[name];
      if (!abi) return new Response('missing', { status: 404 });
      if (opts.tamperAbi === name) return jsonResponse([...abi, { type: 'function', name: 'evil', inputs: [], outputs: [], stateMutability: 'view' }]);
      return jsonResponse(abi);
    }
    const rpcHosts = manifest.network.rpcUrls.map((u) => new URL(u).host);
    if (rpcHosts.includes(new URL(url).host)) {
      const body = JSON.parse(String(init?.body ?? 'null')) as unknown;
      return jsonResponse(await mock.handleHttp(body));
    }
    return new Response('not found', { status: 404 });
  });
  return { mock, manifest, fetchCalls };
}

/** Render the app and wait for the deployment configuration to load. */
export async function renderApp() {
  const utils = render(<Root />);
  await screen.findByRole('heading', { level: 1, name: /Invite referral list/ }, { timeout: 10_000 });
  return utils;
}
