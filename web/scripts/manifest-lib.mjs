// Shared logic for dist/imd-deployment.json.
//
// The same module serves two callers:
//   - scripts/write-manifest.mjs, which runs after `vite build` and writes the final manifest
//     with every exported file's SHA-256, plus copies the pinned ABIs into dist/abi/.
//   - the Vite dev middleware in vite.config.ts, which serves the same configuration (without
//     asset hashes) so `npm run dev` and the production export read identical deployment data.
//
// Inputs are the workflow handoff copies under web/deployment/ and the implementation-derived
// ABIs under ../docs/abi/. Nothing here is fetched from the network.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keccak256, toBytes } from 'viem';

const here = dirname(fileURLToPath(import.meta.url));
export const webRoot = resolve(here, '..');
export const repoRoot = resolve(webRoot, '..');
export const distDir = resolve(repoRoot, 'dist');
export const abiSourceDir = resolve(repoRoot, 'docs', 'abi');
export const handoffPath = resolve(webRoot, 'deployment', 'handoff.json');
export const networkPath = resolve(webRoot, 'deployment', 'network.json');

export const MANIFEST_NAME = 'imd-deployment.json';
export const MAX_ASSETS = 128;
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
// The checker has a 64 MiB total response budget; keep the whole export well under half of it.
export const EXPORT_BUDGET_BYTES = 24 * 1024 * 1024;

/** Deterministic JSON: object keys sorted, no whitespace. Matches the handoff's canonicalKeccak. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k]))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(value);
}

export function canonicalKeccak(value) {
  return keccak256(toBytes(canonicalJson(value))).slice(2);
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadHandoff() {
  const handoff = readJson(handoffPath);
  const network = readJson(networkPath);
  if (handoff.version !== 1) throw new Error(`unsupported handoff version ${handoff.version}`);
  if (network.network.chainId !== handoff.chainId) {
    throw new Error(`network.json chainId ${network.network.chainId} != handoff chainId ${handoff.chainId}`);
  }
  return { handoff, network };
}

/**
 * Read each contract's ABI from docs/abi/<Name>.json (raw bytes) and verify its canonical
 * keccak against the handoff. Returns [{ name, address, abiHash, abiPath, bytes }].
 */
export function loadVerifiedAbis(handoff) {
  return handoff.contracts.map((c) => {
    const file = join(abiSourceDir, `${c.name}.json`);
    if (!existsSync(file)) throw new Error(`missing ABI export ${relative(repoRoot, file)}`);
    const bytes = readFileSync(file);
    const abi = JSON.parse(bytes.toString('utf8'));
    if (!Array.isArray(abi)) throw new Error(`${file} is not a raw ABI array`);
    const hash = canonicalKeccak(abi);
    if (hash !== c.abiHash) {
      throw new Error(`ABI hash mismatch for ${c.name}: computed ${hash}, handoff ${c.abiHash}`);
    }
    return { name: c.name, address: c.address, abiHash: c.abiHash, abiPath: `abi/${c.name}.json`, bytes };
  });
}

/** Build the manifest object in the exact key order the schema lists. */
export function buildManifest({ assets }) {
  const { handoff, network } = loadHandoff();
  const contracts = loadVerifiedAbis(handoff).map(({ name, address, abiHash, abiPath }) => ({
    name,
    address,
    abiHash,
    abiPath,
  }));
  return {
    version: 1,
    launchId: handoff.launchId,
    chainId: handoff.chainId,
    sourceCommit: handoff.sourceCommit,
    attestationHash: handoff.attestationHash,
    contracts,
    assets,
    network: network.network,
  };
}

function walk(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, base, out);
    else out.push({ path: relative(base, full).split(sep).join('/'), size: st.size });
  }
  return out;
}

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Copy verified ABIs into dist/abi/ (verbatim bytes). */
export function writeAbis(dist = distDir) {
  const { handoff } = loadHandoff();
  const abis = loadVerifiedAbis(handoff);
  mkdirSync(join(dist, 'abi'), { recursive: true });
  for (const a of abis) writeFileSync(join(dist, a.abiPath), a.bytes);
  return abis;
}

/** Enumerate every file in dist except the manifest and hash it. */
export function collectAssets(dist = distDir) {
  const files = walk(dist).filter((f) => f.path !== MANIFEST_NAME);
  if (files.length > MAX_ASSETS) throw new Error(`${files.length} assets exceed the limit of ${MAX_ASSETS}`);
  let total = 0;
  for (const f of files) {
    total += f.size;
    if (f.size > MAX_FILE_BYTES) throw new Error(`${f.path} is ${f.size} bytes, over the 8 MiB per-file limit`);
  }
  if (total > EXPORT_BUDGET_BYTES) throw new Error(`export totals ${total} bytes, over the ${EXPORT_BUDGET_BYTES} byte budget`);
  const assets = files.map((f) => ({ path: f.path, sha256: sha256File(join(dist, f.path)) }));
  return { assets, totalBytes: total };
}

export function manifestJson(manifest) {
  return JSON.stringify(manifest, null, 2) + '\n';
}
