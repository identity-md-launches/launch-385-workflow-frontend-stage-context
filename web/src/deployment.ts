/**
 * Runtime deployment configuration.
 *
 * The app loads ./imd-deployment.json (written by scripts/write-manifest.mjs after every build),
 * validates it, fetches each referenced ABI, verifies the ABI's canonical keccak against the
 * manifest, and derives the viem chain and wallet_addEthereumChain parameters from the embedded
 * network block. There is no other address, chain or ABI table in the app.
 */
import {
  defineChain,
  isAddress,
  keccak256,
  numberToHex,
  toBytes,
  type Abi,
  type AddEthereumChainParameter,
  type Address,
  type Chain,
} from 'viem';
import { CONTRACT_NAMES, DEPLOYMENT_URL } from './config';

export interface ManifestContract {
  name: string;
  address: Address;
  abiHash: string;
  abiPath: string;
}

export interface ManifestAsset {
  path: string;
  sha256: string;
}

export interface NetworkInfo {
  chainId: number;
  name: string;
  testnet: boolean;
  rpcUrls: string[];
  explorer: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  faucets: string[];
  uniswapV4: {
    poolManager: Address;
    universalRouter: Address;
    quoter: Address;
    stateView: Address;
    positionManager: Address;
    permit2: Address;
  };
}

export interface DeploymentManifest {
  version: 1;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  contracts: ManifestContract[];
  assets: ManifestAsset[];
  network: NetworkInfo;
}

export interface ContractBinding {
  name: string;
  address: Address;
  abi: Abi;
  abiHash: string;
}

export interface Deployment {
  manifest: DeploymentManifest;
  chain: Chain;
  walletAddChain: AddEthereumChainParameter;
  referralList: ContractBinding;
  token: ContractBinding;
}

export class DeploymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeploymentError';
  }
}

const HEX64 = /^[0-9a-f]{64}$/;

function fail(message: string): never {
  throw new DeploymentError(message);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function assertString(v: unknown, field: string): string {
  if (typeof v !== 'string' || v.length === 0) fail(`imd-deployment.json: ${field} must be a non-empty string`);
  return v;
}

function assertAddress(v: unknown, field: string): Address {
  if (typeof v !== 'string' || !isAddress(v, { strict: false })) fail(`imd-deployment.json: ${field} is not an address`);
  return v as Address;
}

/** A safe relative path: no scheme, no leading slash, no parent traversal. */
export function isSafeRelativePath(p: string): boolean {
  if (p.length === 0 || p.startsWith('/') || p.startsWith('\\')) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(p)) return false;
  return !p.split(/[\\/]/).some((seg) => seg === '..' || seg === '');
}

/** Deterministic JSON (sorted keys, no whitespace); matches the handoff's canonicalKeccak. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (isRecord(value)) {
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

export function canonicalKeccak(value: unknown): string {
  return keccak256(toBytes(canonicalJson(value))).slice(2);
}

export function parseManifest(raw: unknown): DeploymentManifest {
  if (!isRecord(raw)) fail('imd-deployment.json is not an object');
  if (raw.version !== 1) fail(`imd-deployment.json: unsupported version ${String(raw.version)}`);
  const launchId = assertString(raw.launchId, 'launchId');
  if (typeof raw.chainId !== 'number' || !Number.isInteger(raw.chainId) || raw.chainId <= 0) {
    fail('imd-deployment.json: chainId must be a positive integer');
  }
  const chainId = raw.chainId;
  const sourceCommit = assertString(raw.sourceCommit, 'sourceCommit');
  const attestationHash = assertString(raw.attestationHash, 'attestationHash');
  if (!Array.isArray(raw.contracts) || raw.contracts.length === 0) fail('imd-deployment.json: contracts is empty');
  const contracts: ManifestContract[] = raw.contracts.map((c, i) => {
    if (!isRecord(c)) fail(`imd-deployment.json: contracts[${i}] is not an object`);
    const abiHash = assertString(c.abiHash, `contracts[${i}].abiHash`);
    if (!HEX64.test(abiHash)) fail(`imd-deployment.json: contracts[${i}].abiHash is not 64 lowercase hex characters`);
    const abiPath = assertString(c.abiPath, `contracts[${i}].abiPath`);
    if (!isSafeRelativePath(abiPath)) fail(`imd-deployment.json: contracts[${i}].abiPath must be relative to dist/`);
    return {
      name: assertString(c.name, `contracts[${i}].name`),
      address: assertAddress(c.address, `contracts[${i}].address`),
      abiHash,
      abiPath,
    };
  });
  if (!Array.isArray(raw.assets)) fail('imd-deployment.json: assets must be an array');
  const assets: ManifestAsset[] = raw.assets.map((a, i) => {
    if (!isRecord(a)) fail(`imd-deployment.json: assets[${i}] is not an object`);
    return { path: assertString(a.path, `assets[${i}].path`), sha256: assertString(a.sha256, `assets[${i}].sha256`) };
  });
  const n = raw.network;
  if (!isRecord(n)) fail('imd-deployment.json: network block is missing');
  if (n.chainId !== chainId) fail(`imd-deployment.json: network.chainId ${String(n.chainId)} does not match chainId ${chainId}`);
  if (!Array.isArray(n.rpcUrls) || n.rpcUrls.length === 0 || !n.rpcUrls.every((u) => typeof u === 'string' && /^https:\/\//.test(u))) {
    fail('imd-deployment.json: network.rpcUrls must list https URLs');
  }
  const nc = n.nativeCurrency;
  if (!isRecord(nc) || typeof nc.decimals !== 'number') fail('imd-deployment.json: network.nativeCurrency is invalid');
  const u = n.uniswapV4;
  if (!isRecord(u)) fail('imd-deployment.json: network.uniswapV4 is missing');
  const uni = {
    poolManager: assertAddress(u.poolManager, 'network.uniswapV4.poolManager'),
    universalRouter: assertAddress(u.universalRouter, 'network.uniswapV4.universalRouter'),
    quoter: assertAddress(u.quoter, 'network.uniswapV4.quoter'),
    stateView: assertAddress(u.stateView, 'network.uniswapV4.stateView'),
    positionManager: assertAddress(u.positionManager, 'network.uniswapV4.positionManager'),
    permit2: assertAddress(u.permit2, 'network.uniswapV4.permit2'),
  };
  const network: NetworkInfo = {
    chainId,
    name: assertString(n.name, 'network.name'),
    testnet: Boolean(n.testnet),
    rpcUrls: n.rpcUrls as string[],
    explorer: assertString(n.explorer, 'network.explorer').replace(/\/+$/, ''),
    nativeCurrency: {
      name: assertString(nc.name, 'network.nativeCurrency.name'),
      symbol: assertString(nc.symbol, 'network.nativeCurrency.symbol'),
      decimals: nc.decimals,
    },
    faucets: Array.isArray(n.faucets) ? n.faucets.filter((f): f is string => typeof f === 'string') : [],
    uniswapV4: uni,
  };
  return { version: 1, launchId, chainId, sourceCommit, attestationHash, contracts, assets, network };
}

export function chainFromNetwork(network: NetworkInfo): Chain {
  return defineChain({
    id: network.chainId,
    name: network.name,
    nativeCurrency: network.nativeCurrency,
    rpcUrls: { default: { http: network.rpcUrls } },
    blockExplorers: { default: { name: 'Explorer', url: network.explorer } },
    testnet: network.testnet,
  });
}

/** The exact wallet_addEthereumChain parameters, derived from the same network block. */
export function walletAddChainFromNetwork(network: NetworkInfo): AddEthereumChainParameter {
  return {
    chainId: numberToHex(network.chainId),
    chainName: network.name,
    rpcUrls: network.rpcUrls,
    nativeCurrency: network.nativeCurrency,
    blockExplorerUrls: [network.explorer],
  };
}

async function fetchJson(url: URL, what: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-cache' });
  } catch (err) {
    fail(`Unable to load ${what} (${url.pathname}): ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) fail(`Unable to load ${what} (${url.pathname}): HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    fail(`${what} (${url.pathname}) is not valid JSON`);
  }
}

/**
 * Load and verify the runtime deployment. `baseHref` defaults to the document URL, so paths
 * resolve relative to index.html on any gateway subpath or ENS name.
 */
export async function loadDeployment(baseHref: string = document.baseURI): Promise<Deployment> {
  const manifestUrl = new URL(DEPLOYMENT_URL, baseHref);
  const manifest = parseManifest(await fetchJson(manifestUrl, 'the deployment configuration'));

  const bindings = new Map<string, ContractBinding>();
  for (const c of manifest.contracts) {
    const abiRaw = await fetchJson(new URL(c.abiPath, baseHref), `the ${c.name} ABI`);
    if (!Array.isArray(abiRaw)) fail(`${c.abiPath} is not an ABI array`);
    const hash = canonicalKeccak(abiRaw);
    if (hash !== c.abiHash) {
      fail(`${c.abiPath} does not match the attested ABI hash for ${c.name} (computed ${hash.slice(0, 12)}…). Refusing to use it.`);
    }
    bindings.set(c.name, { name: c.name, address: c.address, abi: abiRaw as Abi, abiHash: c.abiHash });
  }

  const referralList = bindings.get(CONTRACT_NAMES.referralList);
  const token = bindings.get(CONTRACT_NAMES.token);
  if (!referralList) fail(`imd-deployment.json does not list a ${CONTRACT_NAMES.referralList} contract`);
  if (!token) fail(`imd-deployment.json does not list a ${CONTRACT_NAMES.token} contract`);

  return {
    manifest,
    chain: chainFromNetwork(manifest.network),
    walletAddChain: walletAddChainFromNetwork(manifest.network),
    referralList,
    token,
  };
}
