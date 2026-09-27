#!/usr/bin/env node
// Runs after `vite build`. Copies the verified ABIs into dist/abi/, hashes every exported
// file and writes dist/imd-deployment.json. With --check it only verifies that the committed
// manifest matches the current dist/ contents and exits non-zero otherwise.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MANIFEST_NAME,
  buildManifest,
  collectAssets,
  distDir,
  manifestJson,
  writeAbis,
} from './manifest-lib.mjs';

const check = process.argv.includes('--check');

if (!existsSync(join(distDir, 'index.html'))) {
  console.error(`dist/index.html not found at ${distDir}; run \`vite build\` first.`);
  process.exit(1);
}

const abis = writeAbis(distDir);
const { assets, totalBytes } = collectAssets(distDir);
const manifest = buildManifest({ assets });
const text = manifestJson(manifest);
const target = join(distDir, MANIFEST_NAME);

if (check) {
  const current = existsSync(target) ? readFileSync(target, 'utf8') : '';
  if (current !== text) {
    console.error(`${MANIFEST_NAME} is stale; run \`npm run manifest\` and commit the result.`);
    process.exit(1);
  }
  console.log(`${MANIFEST_NAME} matches dist/ (${assets.length} assets, ${totalBytes} bytes).`);
} else {
  writeFileSync(target, text);
  for (const a of abis) console.log(`ABI ${a.name} -> ${a.abiPath} (keccak ${a.abiHash.slice(0, 12)}… verified)`);
  console.log(`wrote ${MANIFEST_NAME}: ${assets.length} assets, ${totalBytes} bytes total`);
}
