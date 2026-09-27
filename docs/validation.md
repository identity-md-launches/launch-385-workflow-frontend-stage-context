# Frontend validation record

Worker-side validation for the `lab-referral-list` frontend (assignment: join with `?ref=` prefill
and approve, copy my link, earnings + claim, my referrals and depth). This is the worker's own
report, not an independent network certification. Dates are 2026-09-27.

## 1. Scope and assumptions

- **Pages/flows:** one page (`dist/index.html`) with these states: deployment loading and load
  failure; no wallet installed; disconnected; connected on the wrong chain (switch, add-then-switch,
  rejected switch); connected non-member (approve → join, with and without referrer, referrer not
  on the list, self-referral, malformed address, insufficient balance, wallet rejection); connected
  member (link copy, credit claim, referral list from events, depth); permissionless `burnExcess`
  behind a disclosure.
- **Build/export:** source in `web/`, Vite 7 + React 19 + TypeScript 5.9 + wagmi 2 + viem 2,
  `base: './'`, export at repository-root `dist/` (7 files, 636,795 bytes) plus
  `dist/imd-deployment.json`.
- **Deployment handoff:** `.imd/reads/deployment.json` and `.imd/reads/network.json` were copied to
  `web/deployment/` as build inputs. Both ABI exports at `docs/abi/` hash (canonical sorted-key
  JSON, keccak-256) to the handoff's `abiHash` values (`f36d2fe2…` LaunchToken, `0956a693…`
  ReferralList); the build script refuses to write the manifest otherwise, and the app refuses to
  run if the served ABI does not match.
- **Inferred choices:** light theme only; system font stack (no font files); "Referral credit"
  rather than "earnings" as the on-page term, matching the approved "not an earning scheme"
  wording; `burnExcess` exposed as maintenance because the brief asks for a control per contract
  action; a read-only Uniswap v4 quote is shown for the exchange rate, no in-page swap (the approved
  workflow forbids one).
- **Out of permitted paths:** the acceptance criteria ask for `DESIGN.md` at the repository root,
  but this assignment may only write `web/**`, `dist/**`, `docs/**` and `web/.gitignore`. The
  document is therefore at `docs/DESIGN.md`.

## 2. Coverage (Better Interface, six domains)

| Domain | Status | Inspected | Not performed |
| --- | --- | --- | --- |
| Accessibility | Checked | Native `button`/`a`/`input`/`details`; labels via `label for`; skip link first in tab order; one `main`, one `h1`, `h2` per section, `h3` for steps; keyboard walk with visible 2 px focus ring at every stop (Playwright, 1024 px); `aria-invalid` + `aria-describedby` + focus on the failing field on submit; persistent `role="status"` regions and `role="alert"` for errors; `prefers-reduced-motion` verified (spinner `animation-name: none`); 16 px inputs; axe-core 4 (wcag2a/aa, wcag21aa, best-practice) with 0 violations on 4 states; all non-inline targets ≥ 24 px after the summary fix. | Screen-reader session; native 200 % zoom (only viewport reflow was tested); forced-colors rendering; physical touch device. |
| Layout | Checked | 320, 600, 768, 1024, 1280 px; no horizontal overflow at any width (`scrollWidth` check); content column `min(100% − 2rem, 44rem)`; stats grid `auto-fit minmax(11rem)`; step rows and banners wrap; logical properties used for inline spacing. | RTL mirror (single-language English page, `dir="ltr"`); container queries not used. |
| Writing | Checked (source) | Verb-first buttons ("Connect wallet", "Approve 1,000 INVT", "Join for 1,000 INVT", "Copy link", "Claim 400 INVT", "Switch to Sepolia", "Burn stray INVT"); sentence case throughout; every disabled control carries its reason next to it; every error names the fix; empty states point forward; explorer links describe their destination for screen readers. | Localization (none requested). |
| Typography | Checked | Semantic scale in `styles.css` (13/14/16/18/24/28 px); headings descend 28 → 18 → 16 with weight 650/600/600; body line-height 1.5, headings 1.15–1.3; `text-wrap: balance` on headings, `pretty` on paragraphs; measure capped at 65ch; tabular numerals on all changing values; `overflow-wrap: anywhere` on addresses; inputs 16 px. | Rendering with a specific brand font (system stack by design). |
| Colors | Checked | Hex primitives → semantic tokens; single accent (indigo) reserved for the one primary action per section and links; status ramps only where rendered. Contrast measured twice: declared pairs by script (24 pairs) and rendered pairs in Chromium per state (71–91 text elements per state). Lowest rendered text pair 4.91:1 (muted text on the subtle surface). Fixed: input/secondary-button border 1.73:1 → 3.24:1; primary-button focus ring now sits on a 2 px white halo (ring vs accent fill was 1.22:1); disabled buttons no longer use opacity (white-on-faded-accent 2.52:1) but muted-on-subtle 4.91:1. | Dark theme (not implemented, none requested). |
| UI | Checked | Surfaces: 1 px border + one soft shadow; radii 6/8/12 px; hover/active/disabled/busy button states; `scale(0.96)` on press; transitions name exact properties, 150 ms, `cubic-bezier(0.2, 0, 0, 1)`; spinner only under `no-preference`; disclosure chevron rotates. | Animations-panel replay at 10 % speed. |

Domains reviewed: 6 of 6. Not applicable: modals, theming, localization, media (none exist).

## 3. Findings and fixes

| # | Severity | Location | Evidence | Change | Recheck |
| --- | --- | --- | --- | --- | --- |
| 1 | MEDIUM | `web/src/styles.css` `--neutral-300` | Input and secondary-button border `#c9c4bc` measured 1.73:1 on white (below the 3:1 boundary floor). | Token changed to `#958e84` (3.24:1). | Rendered inputs/buttons re-measured in Chromium; axe clean. |
| 2 | MEDIUM | `web/src/styles.css` `.btn:disabled` | Disabled primary button used `opacity: .55`: white label on `#939eea`, 2.52:1; the disabled state carries the reason for many controls. | Flat inactive style: subtle background, muted text (4.91:1), light border. | Rendered pairs pass; visually distinct from active in screenshots. |
| 3 | LOW | `web/src/styles.css` `.btn-primary:focus-visible` | Focus ring `#4c5fe0` next to accent fill `#3b4fd8` is 1.22:1 at the button edge (outer edge on white passes at 5.22:1). | 2 px white `box-shadow` halo between button and ring. | `focus-primary-button-1024.png` shows ring on white halo. |
| 4 | LOW | `web/src/styles.css` `.disclosure > summary` | Summary control measured 654 × 23 px (below 24 px). | `min-height` = control height (40/44 px) with negative block margin to keep card rhythm. | Re-measured 40 px; no small non-inline targets remain. |
| 5 | LOW | `web/src/components/JoinSection.tsx` | Malformed referrer disabled the submit button, so Enter could never trigger validation (implicit submission skips a disabled default button). | Format problems no longer disable Join; submit validates, marks `aria-invalid`, describes the fix beside the field and focuses it. Chain/balance/allowance/known-bad-referrer prerequisites still disable. | vitest "refuses a referrer…" and browser `errors-1024.png`. |
| 6 | LOW | `web/src/components/ConnectControl.tsx` | wagmi always lists a generic injected connector, so a browser without a wallet saw a dead "Connect wallet" button. | Show "No browser wallet detected…" when nothing is announced and `window.ethereum` is absent. | `no-wallet-600.png`; vitest "says when no browser wallet is installed". |

Not changed, noted: the rendered-contrast probe in the wrong-network scenario once sampled the
Claim button mid-transition (150 ms) as it changed from disabled to primary after the chain
switch; the pair it reported (`rgb(137,133,127)` on `rgb(204,206,230)`) is not a token pair and
does not exist at rest.

## 4. Verification

All commands run from `web/` on this worker (Node 24.9.0, npm 11.6.0), exit code 0 unless stated.

| Command | Result |
| --- | --- |
| `npm ci` equivalent (`npm install`) | 341 packages; lockfile committed |
| `npm run typecheck` | `tsc -p tsconfig.json` and `tsc -p tsconfig.node.json`: clean |
| `npm test` | vitest 3: 2 files, 25 tests passed (unit 10, interaction 15), 5.2 s |
| `npm run build` | vite build: `index.html`, `assets/index-*.js` 608 kB (gzip 188 kB), `assets/index-*.css` 11 kB, `assets/ccip-*.js` 3 kB, `favicon.svg`; then ABIs copied + verified and `imd-deployment.json` written (7 assets, 636,795 bytes) |
| `npm run manifest:check` | matches `dist/` after the final build |
| `npm run dev` | served `/imd-deployment.json` and `/abi/ReferralList.json` from the same handoff data (checked with curl) |

### Interaction tests (vitest, jsdom, mock wallet + mock RPC in `web/test/mockChain.ts`)

The mock answers both `window.ethereum` (EIP-1193) and the three public RPC URLs from one
in-memory ReferralList/INVT/quoter state, with the contract's custom errors and events.

- disconnected: live stats from reads, actions disabled with the reason, quote line, INVT source text
- no wallet installed message
- `?ref=` prefill with live "On the list" verification
- wrong chain → "Switch to Sepolia" → `wallet_switchEthereumChain` (4902) → `wallet_addEthereumChain`
  with exactly the network-derived parameters → `wallet_switchEthereumChain`; actions re-enable
- rejected switch shows an alert and keeps actions disabled
- approve (simulate, sign, receipt) → join with referrer: member, 4,000 INVT left, referrer credited
  200 INVT, 800 INVT at the dead address, member count 2
- referrer not on the list / self / malformed address (submit validation, focus, `aria-invalid`)
- insufficient balance reason; approve not offered
- join without referrer burns the full 1,000 INVT
- wallet rejection (4001) → "You rejected the request in your wallet. Nothing was sent."
- member: credit 400 INVT and 2 joins, referral list from `Joined` events across chunked
  `eth_getLogs` (3,001-block range, provider limit 1,500 → chunk halved to 1,250), copy link writes
  `?ref=<address>` to the clipboard, claim pays 400 INVT and disables the control
- copy control disabled for a non-member with the reason
- `burnExcess` enabled only when the contract balance exceeds `totalClaimable`
- deployment guard: tampered ABI and inconsistent chain id refuse to start with an alert + retry

### Browser inspection (Playwright + headless Chromium, `test/scratch/browser/inspect.mjs`)

The assigned MCP browser tool has no managed preview on this worker (`test/scratch/browser/preview.json`
does not exist) and its code-execution path was not permitted, so the finished export was served
under a `/preview/` subpath by a static server inside one bounded foreground script and driven
with Playwright 1.x from the pinned MCP package. Screenshots are in `docs/validation/screenshots/`.

| Scenario | Width | Evidence |
| --- | --- | --- |
| Live Sepolia, disconnected (real RPC, no mock) | 1280, 320 | `live-disconnected-1280.png`, `live-disconnected-320.png`. Reads returned members 0, depth 0, fee 1,000 INVT, share 200 INVT (20%), unclaimed 0; `ReferralList.token()` = `0xCec7…3FEd` (matches manifest); live quoter: `0.001 ETH ≈ 49,627.09 INVT`. No console errors, no failed requests, axe 0 violations. |
| Wrong network, add-then-switch | 768 | `wrong-network-768.png`; wallet methods in order: switch, add, switch. |
| Approve → join with `?ref=` | 1280 | `join-connected-1280.png`, `join-approved-1280.png`, `join-done-1280.png`; mock state after: member, referrer credit 200 INVT; axe 0. |
| Member: credit, referrals from events, copy link, claim | 1280 | `member-earnings-1280.png`, `member-claimed-1280.png`; clipboard = `…/preview/?ref=0x1111…1111`; 34 `eth_getLogs` calls over a 3,001-block mock range with a 1,500-block provider limit; axe 0. |
| Member at the narrowest width | 320 | `member-320.png`; `scrollWidth` = 320, no element past the viewport; axe 0. |
| Keyboard walk, wallet rejection, field error | 1024 | `focus-skip-link-1024.png`, `focus-primary-button-1024.png`, `errors-1024.png`; focus order skip link → Connect → referrer input → links → summary, every stop `outline: solid 2px rgb(76,95,224)`; alert text "You rejected the request in your wallet. Nothing was sent."; field error with `aria-invalid="true"` and focus on the input. |
| Reduced motion, no wallet | 600 | `no-wallet-600.png`; spinner `animation-name: none` under `prefers-reduced-motion: reduce`. |

Rendered contrast was measured in the browser for every visible text element per state (71–91
elements); no pair below its requirement at rest. Heading sizes rendered 28/18/16 px (24 px `h1`
below 40 em); inputs 16 px at every width.

### Not tested (honest limits)

- No real transaction was broadcast on Sepolia: approve, join, claim and burnExcess were exercised
  only against the mock chain. The live path was tested for reads and the quoter simulation only.
- No real wallet extension (MetaMask etc.) was driven; the injected provider was the mock. Real
  wallets' `wallet_addEthereumChain` prompts were not observed.
- The live `Joined` scan covered only the ~25 blocks that existed after deployment at test time;
  chunk halving was exercised against the mock provider limit, not a public RPC rejection.
- Screen reader, native zoom, forced colors, RTL and physical touch devices were not tested.
- Gateway/ENS hosting was approximated by the `/preview/` subpath; the real CID/named entrypoint is
  the publisher's check.

## 5. Completion

**Complete for the stated scope**, with the limitations above. Root `DESIGN.md` could not be
written because the repository root is outside this assignment's permitted paths; the same
content is at `docs/DESIGN.md`.
