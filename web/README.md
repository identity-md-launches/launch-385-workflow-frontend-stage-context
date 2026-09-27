# Invite referral list · frontend

One static page for the `ReferralList` contract on Sepolia: join with a referral link (`?ref=0x…`
pre-fills the referrer), approve the 1,000 INVT fee, copy your own link, see and claim referral
credit, list the wallets that joined through your link, and read your depth and the member count.
It is a Sepolia test toy, not an investment or earning scheme, and the page says so.

The production export is committed at the repository root `dist/` and works from any static host,
IPFS gateway subpath or ENS name: Vite's `base` is `./`, there is no routing, and every asset is
bundled locally. There is no backend and no indexer; lists come from contract views and `Joined`
events read straight from public RPC endpoints.

## Layout

| Path | Purpose |
| --- | --- |
| `src/config.ts` | UI constants and launch constants the manifest schema does not carry (deployment block for event scans, pool fee/tick spacing for quotes, optional WalletConnect ID). No addresses, chain or ABIs. |
| `src/deployment.ts` | Loads and validates `./imd-deployment.json` at runtime, fetches the referenced ABIs, verifies their canonical keccak hashes against the manifest, and derives the viem chain and `wallet_addEthereumChain` parameters from the embedded `network` block. |
| `src/wagmi.ts` | wagmi config built from the loaded deployment: injected / EIP-6963 wallets, HTTP fallback across the network's public RPC URLs. |
| `src/hooks/` | Reads (`useReferralState`), transactions with simulate → sign → receipt (`useTxAction`), wrong-network switch/add flow (`useChainGuard`), chunked `Joined` event scan (`useJoinedEvents`), read-only Uniswap v4 quote (`useQuote`). |
| `src/components/` | The page sections and the small UI kit (`ui.tsx`). |
| `src/styles.css` | Design tokens and all styling. Documented in `../docs/DESIGN.md`. |
| `deployment/handoff.json`, `deployment/network.json` | Copies of the workflow handoff and vetted network table. Build-time inputs for the manifest. |
| `scripts/manifest-lib.mjs`, `scripts/write-manifest.mjs` | Copy the pinned ABIs from `../docs/abi/` into `dist/abi/`, verify their hashes, hash every exported file and write `dist/imd-deployment.json`. |
| `test/` | Vitest interaction tests with an in-memory mock wallet + RPC (`mockChain.ts`). |

## Configuration in one place

The app has exactly one deployment configuration: `dist/imd-deployment.json`. It holds the launch
ID, chain ID, deployed source commit, attestation hash, the contract set with addresses and ABI
hashes/paths, the SHA-256 of every other exported file, and the `network` block copied unchanged
from the vetted network table (public RPC URLs, explorer, native currency, faucets and the Uniswap
v4 addresses). The frontend fetches this file at start-up, refuses to run if it is malformed or an
ABI's hash does not match, and reads every address, RPC URL and Uniswap address from it. The INVT
address is additionally read on chain from `ReferralList.token()` and cross-checked against the
manifest; a mismatch disables transactions.

There are no private credentials anywhere. The RPC endpoints are public. A WalletConnect project
ID is optional: set `VITE_WALLETCONNECT_PROJECT_ID` at build time to add a WalletConnect connector
(a public identifier, not a secret); without it only browser wallets are offered.

## Commands

```sh
cd web
npm ci                 # install (Node 24 / npm 11 were used)
npm run dev            # Vite dev server; /imd-deployment.json and /abi/*.json are served from the same handoff data
npm run typecheck      # tsc for app, tests and node scripts
npm test               # vitest: unit + interaction tests against the mock wallet/RPC
npm run build          # vite build -> ../dist, then writes dist/abi/*.json and dist/imd-deployment.json
npm run preview        # serve the built export locally
npm run manifest:check # fail if dist/imd-deployment.json is stale relative to dist/
```

Rebuild after any source change and commit `dist/` together with the source: the publisher pins
the committed files without rebuilding. `npm run build` always regenerates the manifest last, so
its asset hashes match the final bytes.

## Wallet and network behaviour

- Wallets are discovered through EIP-6963 with `window.ethereum` as the fallback. With no wallet
  the page says so instead of showing a dead button.
- A connected wallet on another chain sees one control, "Switch to Sepolia". It sends
  `wallet_switchEthereumChain`; on EIP-3085 code 4902 (or an equivalent unknown-chain message) it
  sends `wallet_addEthereumChain` with parameters derived from the manifest's network block, then
  switches again. Reads keep coming from Sepolia meanwhile.
- Every transaction is simulated first (`eth_call`) so contract reverts (`AlreadyJoined`,
  `ReferrerNotMember`, `SelfReferral`, `NothingToClaim`, `NoExcess`, ERC-20 allowance/balance
  errors) are shown in plain words before the wallet opens. Rejections, pending, confirmed and
  reverted states are shown with explorer links.
- Approval is an explicit step 1 for exactly 1,000 INVT; step 2 joins. Both stay disabled with the
  reason shown beside them until wallet, chain, balance, allowance and referrer are satisfied.
  A malformed referrer address is reported on submit, next to the field.
- Referrals are read from `Joined(member, referrer, depth)` events filtered by the `referrer`
  topic, scanned in 40,000-block chunks from the deployment block; the chunk is halved (down to
  1,000) whenever a provider rejects the range.
- The page never swaps. It shows a read-only price from the Uniswap v4 quoter in the network block
  (`quoteExactInputSingle` via `simulateContract`) and tells visitors that INVT comes from swapping
  Sepolia ETH in the launch pool with their own wallet or a Uniswap interface.

## Validation

See `../docs/validation.md` for the build/typecheck/test results, the browser inspection with
screenshots, the Better Interface review and the checks that were not performed.
