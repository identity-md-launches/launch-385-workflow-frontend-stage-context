// Type surface for the JavaScript manifest helper, used by vite.config.ts and the tests.
export interface ManifestAsset {
  path: string;
  sha256: string;
}
export interface ManifestContract {
  name: string;
  address: string;
  abiHash: string;
  abiPath: string;
}
export interface Manifest {
  version: 1;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  contracts: ManifestContract[];
  assets: ManifestAsset[];
  network: Record<string, unknown> & { chainId: number; rpcUrls: string[]; uniswapV4: Record<string, string> };
}
export const webRoot: string;
export const repoRoot: string;
export const distDir: string;
export const abiSourceDir: string;
export const handoffPath: string;
export const networkPath: string;
export const MANIFEST_NAME: string;
export const MAX_ASSETS: number;
export const MAX_FILE_BYTES: number;
export const EXPORT_BUDGET_BYTES: number;
export function canonicalJson(value: unknown): string;
export function canonicalKeccak(value: unknown): string;
export function readJson(path: string): unknown;
export function loadHandoff(): { handoff: Record<string, unknown>; network: Record<string, unknown> };
export function loadVerifiedAbis(handoff: Record<string, unknown>): Array<ManifestContract & { bytes: Uint8Array }>;
export function buildManifest(opts: { assets: ManifestAsset[] }): Manifest;
export function sha256File(path: string): string;
export function writeAbis(dist?: string): ManifestContract[];
export function collectAssets(dist?: string): { assets: ManifestAsset[]; totalBytes: number };
export function manifestJson(manifest: Manifest): string;
