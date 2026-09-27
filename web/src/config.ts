/**
 * Static application configuration.
 *
 * Deployment addresses, the chain, public RPC URLs, the explorer, the Uniswap v4 addresses and
 * the ABI paths are NOT here: they are read at runtime from ./imd-deployment.json (see
 * deployment.ts), which is generated from the workflow handoff copies in web/deployment/ and is
 * the single source of truth for both the app and the publication checker.
 *
 * Everything below is either a UI parameter or a launch constant that the manifest schema does
 * not carry. Values marked "handoff" are copied from web/deployment/handoff.json.
 */
import { parseEther, zeroAddress, type Address } from 'viem';

/** Where the app fetches its runtime deployment configuration, relative to index.html. */
export const DEPLOYMENT_URL = './imd-deployment.json';

/** Names the app expects in the manifest's contract set. */
export const CONTRACT_NAMES = {
  referralList: 'ReferralList',
  token: 'LaunchToken',
} as const;

/**
 * Block in which both contracts were deployed (handoff: contracts[].blockNumber, both
 * 11791675). Event scans start here; nothing older can contain a Joined event.
 */
export const DEPLOYMENT_BLOCK = 11791675n;

/**
 * Chunking for eth_getLogs. Public Sepolia RPCs cap a query at 50,000 blocks; the scanner starts
 * below that and halves the window whenever a provider rejects a range.
 */
export const LOG_CHUNK = { initial: 40_000n, min: 1_000n } as const;

/**
 * Launch pool parameters (handoff: manifest.pool). The pool has no hook. Used only to ask the
 * Uniswap v4 quoter for a read-only price; the page never swaps.
 */
export const POOL = {
  pairedCurrency: zeroAddress as Address, // native ETH
  fee: 3000,
  tickSpacing: 60,
  hooks: zeroAddress as Address,
} as const;

/** Amount of ETH used for the indicative quote. Small, to stay close to the spot price. */
export const QUOTE_SAMPLE_WEI = parseEther('0.001');

/** How often live reads refresh while the tab is visible (ms). */
export const READ_REFRESH_MS = 20_000;

/**
 * Optional WalletConnect project ID. Set VITE_WALLETCONNECT_PROJECT_ID at build time to add a
 * WalletConnect connector; without it the app offers browser (injected / EIP-6963) wallets only.
 * This is a public identifier, not a secret.
 */
export const WALLETCONNECT_PROJECT_ID: string | undefined =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || undefined;
