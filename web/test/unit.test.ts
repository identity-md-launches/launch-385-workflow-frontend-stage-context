import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { zeroAddress, type Address } from 'viem';
import { abiSourceDir, buildManifest, canonicalKeccak as canonicalKeccakNode } from '../scripts/manifest-lib.mjs';
import { canonicalKeccak, chainFromNetwork, isSafeRelativePath, parseManifest, walletAddChainFromNetwork } from '../src/deployment';
import { describeError, isUnknownChainError } from '../src/lib/errors';
import { formatAmount, shortAddress } from '../src/lib/format';
import { buildReferralLink, readRefParam } from '../src/lib/referralLink';
import { poolKeyFor } from '../src/hooks/useQuote';

const handoff = JSON.parse(readFileSync(join(__dirname, '..', 'deployment', 'handoff.json'), 'utf8')) as {
  contracts: Array<{ name: string; abiHash: string; address: string }>;
  launchId: string;
  sourceCommit: string;
  attestationHash: string;
  chainId: number;
};
const networkFile = JSON.parse(readFileSync(join(__dirname, '..', 'deployment', 'network.json'), 'utf8')) as {
  network: Record<string, unknown>;
  walletAddChain: Record<string, unknown>;
};

describe('deployment manifest', () => {
  const manifest = buildManifest({ assets: [] });

  it('copies identifiers, contract set and network block from the handoff', () => {
    expect(manifest.version).toBe(1);
    expect(manifest.launchId).toBe(handoff.launchId);
    expect(manifest.chainId).toBe(handoff.chainId);
    expect(manifest.sourceCommit).toBe(handoff.sourceCommit);
    expect(manifest.attestationHash).toBe(handoff.attestationHash);
    expect(manifest.contracts.map((c) => [c.name, c.address, c.abiHash])).toEqual(handoff.contracts.map((c) => [c.name, c.address, c.abiHash]));
    expect(manifest.contracts.every((c) => c.abiPath === `abi/${c.name}.json`)).toBe(true);
    expect(manifest.network).toEqual(networkFile.network);
    expect(Object.keys(manifest)).toEqual(['version', 'launchId', 'chainId', 'sourceCommit', 'attestationHash', 'contracts', 'assets', 'network']);
  });

  it('ABI exports hash to the attested values with both hash implementations', () => {
    for (const c of handoff.contracts) {
      const abi = JSON.parse(readFileSync(join(abiSourceDir, `${c.name}.json`), 'utf8')) as unknown;
      expect(canonicalKeccak(abi)).toBe(c.abiHash);
      expect(canonicalKeccakNode(abi)).toBe(c.abiHash);
    }
  });

  it('parses its own output and derives chain + wallet_addEthereumChain from the network block', () => {
    const parsed = parseManifest(manifest);
    const chain = chainFromNetwork(parsed.network);
    expect(chain.id).toBe(11155111);
    expect(chain.rpcUrls.default.http).toEqual(networkFile.network.rpcUrls);
    expect(chain.blockExplorers?.default.url).toBe(networkFile.network.explorer);
    expect(walletAddChainFromNetwork(parsed.network)).toEqual(networkFile.walletAddChain);
  });

  it('rejects unsafe ABI paths and inconsistent chain ids', () => {
    expect(isSafeRelativePath('abi/X.json')).toBe(true);
    expect(isSafeRelativePath('../abi/X.json')).toBe(false);
    expect(isSafeRelativePath('/abi/X.json')).toBe(false);
    expect(isSafeRelativePath('https://example.com/X.json')).toBe(false);
    expect(isSafeRelativePath('abi/../../X.json')).toBe(false);
    const bad = structuredClone(manifest) as { contracts: Array<{ abiPath: string }> };
    bad.contracts[0]!.abiPath = '../secret.json';
    expect(() => parseManifest(bad)).toThrow(/relative to dist/);
    const badChain = structuredClone(manifest) as { network: { chainId: number } };
    badChain.network.chainId = 1;
    expect(() => parseManifest(badChain)).toThrow(/does not match/);
    expect(() => parseManifest({ ...manifest, version: 2 })).toThrow(/unsupported version/);
  });
});

describe('referral links', () => {
  it('reads a checksummed ?ref= and ignores malformed values', () => {
    expect(readRefParam('?ref=0x2222222222222222222222222222222222222222')).toBe('0x2222222222222222222222222222222222222222');
    expect(readRefParam('?ref=0xabc')).toBeNull();
    expect(readRefParam('?other=1')).toBeNull();
    expect(readRefParam('?ref=0x00000000219ab540356cbb839cbe05303d7705fa')).toBe('0x00000000219ab540356cBB839Cbe05303d7705Fa');
  });

  it('builds a link that keeps the host path and only ?ref', () => {
    const link = buildReferralLink('0x2222222222222222222222222222222222222222', 'https://gw.example/ipfs/bafy123/index.html?ref=0x1&x=2#h');
    expect(link).toBe('https://gw.example/ipfs/bafy123/index.html?ref=0x2222222222222222222222222222222222222222');
  });
});

describe('formatting and errors', () => {
  it('formats amounts and addresses', () => {
    expect(formatAmount(1_000n * 10n ** 18n, 18)).toBe('1,000');
    expect(formatAmount(1234567n * 10n ** 14n, 18)).toBe('123.4567');
    expect(formatAmount(1n, 18)).toBe('<0.0001');
    expect(shortAddress('0x2222222222222222222222222222222222222222')).toBe('0x2222…2222');
  });

  it('recognises unknown-chain errors in the shapes wallets use', () => {
    expect(isUnknownChainError({ code: 4902, message: 'Unrecognized chain ID' })).toBe(true);
    expect(isUnknownChainError({ code: -32603, data: { originalError: { code: 4902 } } })).toBe(true);
    expect(isUnknownChainError(new Error('Unrecognized chain ID "0xaa36a7". Try adding the chain using wallet_addEthereumChain first.'))).toBe(true);
    expect(isUnknownChainError({ code: 4001, message: 'User rejected the request.' })).toBe(false);
  });

  it('describes a user rejection plainly', () => {
    expect(describeError({ code: 4001, message: 'User rejected the request.' })).toMatch(/rejected the request/);
  });
});

describe('pool key', () => {
  it('uses native ETH as currency0 and quotes ETH -> token', () => {
    const token: Address = '0xcec7717d01ae80eea14c93a5631a13b931ec3fed';
    const { key, zeroForOne } = poolKeyFor(token);
    expect(key.currency0).toBe(zeroAddress);
    expect(key.currency1).toBe(token);
    expect(key.fee).toBe(3000);
    expect(key.tickSpacing).toBe(60);
    expect(key.hooks).toBe(zeroAddress);
    expect(zeroForOne).toBe(true);
  });
});
