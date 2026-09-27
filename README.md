# Invite (INVT) and ReferralList

A Sepolia test toy for on-chain referral tracking, paid in INVT. **It is not an investment or
earning scheme.** INVT has no value and the referral credit is a demonstration of pull-payment
accounting, nothing more.

This repository holds the contracts, tests and ABI exports for the contract stage of the
`lab-referral-list` launch. The manifest (`launch.json`), the independent adversarial review, the
factory deployment and the one-page website are separate assignments and are not in this
repository.

## Contents

| Path | What it is |
| --- | --- |
| `src/LaunchToken.sol` | The fixed-supply launch token, Invite (INVT). |
| `src/ReferralList.sol` | The single application contract. |
| `script/Deploy.s.sol` | Local Anvil helper. Not used on Sepolia; the factory deploys there. |
| `test/LaunchToken.t.sol` | Token tests. |
| `test/ReferralList.t.sol` | Unit, failure-path, re-entrancy and fuzz tests for ReferralList. |
| `test/ReferralList.invariant.t.sol` | Stateful invariant tests driven by a handler. |
| `test/mocks/ReenteringToken.sol` | A hostile ERC-20 used only to exercise the re-entrancy guard. |
| `docs/abi/LaunchToken.json`, `docs/abi/ReferralList.json` | ABI exports for the website and the manifest step. |
| `lib/forge-std`, `lib/openzeppelin-contracts` | Vendored dependencies as ordinary files (forge-std v1.9.7, OpenZeppelin Contracts v5.1.0). No submodules. |

## Build and test

```sh
forge build
forge test
forge fmt --check
```

`foundry.toml` pins `solc = "0.8.26"`, `evm_version = "cancun"`, `bytecode_hash = "none"`,
`cbor_metadata = false`, `ffi = false` and an empty `fs_permissions`. Tests read no environment
variables and do not depend on the caller address of the script, so they pass in any order and in
parallel with an empty environment.

## LaunchToken (INVT)

* Name `Invite`, symbol `INVT`, 18 decimals.
* No constructor arguments. The constructor mints exactly 1,000,000,000 INVT (10^27 minor units)
  to `msg.sender`, which is the project factory at launch.
* Plain OpenZeppelin `ERC20`. No owner, no mint, no burn entry point, no pause, no blocklist, no
  transfer fee, no upgrade path. Nothing after the constructor can change the supply.
* Tested: metadata, exact supply and recipient, exact transfer amounts, allowance handling, a set
  of common mint/admin selectors that all revert without changing the supply, and a bytecode scan
  for `DELEGATECALL`, `CALLCODE` and `SELFDESTRUCT`.

## ReferralList

### Deployment parameters

| Item | Value |
| --- | --- |
| Constructor | `constructor(address token_)` |
| Manifest `constructorArgs` | `["$token"]` |
| Argument types | one `address`, nothing dynamic |
| Owner | none; the request names no owner, so no `$owner` and no privileged role of any kind |
| INVT needed at deploy | none; the contract starts with a zero balance and never needs one |
| ETH | never accepted; no payable function, no `receive`, no `fallback` |
| Chain | Sepolia (11155111) only |

`msg.sender` in the constructor is the factory. The contract does not read or store it and grants
it nothing. The only stored configuration is the immutable `token`, exposed as `token()`.

### Behaviour

* **Constants.** `JOIN_FEE = 1,000e18`, `REFERRER_SHARE = 200e18` (20%),
  `BURN_SHARE_WITH_REFERRER = 800e18`, `BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD`.
* **`join(address referrer)`.** The caller must not already be a member. `referrer` is either
  `address(0)` or an address that is already a member. The caller cannot name itself. The contract
  pulls exactly 1,000 INVT with `SafeERC20.safeTransferFrom` (the caller must have approved at
  least that much). With a referrer, 200 INVT is added to the referrer's `claimable` balance and
  800 INVT is transferred to the dead address. Without a referrer all 1,000 INVT goes to the dead
  address. Emits `Joined(member, referrer, depth)`.
* **`claim()`.** Pays the caller its whole `claimable` balance with `safeTransfer`, after zeroing
  it (checks, effects, interactions, plus `nonReentrant`). Reverts with `NothingToClaim` when the
  balance is zero, so a second claim pays nothing. Emits `Claimed(referrer, amount)`.
* **Tracking.** `joinedAt`, `referrerOf`, `referralCount`, `depth` (0 without a referrer, else the
  referrer's depth + 1), `maxDepth`, `isMember`, `claimable`, `totalClaimable`.
* **Enumeration.** `memberCount()`, `memberAt(index)` (reverts past the end) and a paged
  `members(start, limit)` for frontends.
* **`burnExcess()`.** Permissionless. Forwards any INVT that reached the contract outside `join`
  (a direct transfer) to the dead address. It can only move `balance - totalClaimable`, so it can
  never touch referral credit. Emits `ExcessBurned(amount)`.

### Invariants the tests hold

* After every `join` and `claim`, `token.balanceOf(ReferralList) == totalClaimable`, and
  `totalClaimable` equals the sum of every `claimable` balance.
* Every unit paid as a join fee is either burned, already claimed, or still claimable.
* Members are unique, every referrer is a member, `depth(m) == depth(referrerOf(m)) + 1`,
  `maxDepth` is the true maximum, and `referralCount` matches the `referrerOf` relation.
* The contract never holds ETH and the token supply never changes.

### Why cycles are impossible

A referrer must already be a member and a joiner must not be. Membership is set once and never
cleared, and `referrerOf` is written once at join time. Following `referrerOf` from any member
therefore strictly decreases `depth` until it reaches `address(0)`.

## Assumptions and accepted behaviour

* **INVT is the only token.** The design relies on INVT being a plain fixed-supply ERC-20 with no
  transfer fee and no hooks, so the amount pulled equals the amount credited and the token cannot
  call back into the contract. The re-entrancy tests use a hostile mock to show the guard would hold
  even for a token that does call back.
* **Self-referral through a second wallet is accepted.** Anyone can join with one wallet and then
  refer their own second wallet, keeping 200 of the second wallet's 1,000 INVT fee. This is a 20%
  discount on the second join, it costs the first wallet a full fee, and it is documented rather
  than prevented. There is no on-chain notion of identity to prevent it.
* **Burns are transfers to the dead address.** INVT has no burn function, so `totalSupply()` does
  not fall; the burned share simply becomes unreachable.
* **Direct transfers are stranded by design until burned.** INVT sent to the contract outside `join`
  belongs to nobody. `burnExcess()` lets anyone forward it to the dead address. It is never
  redistributed.
* **Join fee is fixed forever.** There is no owner and no setter. Changing the fee means a new
  deployment.
* **`joinedAt` is a block timestamp** and is informational only; nothing in the contract depends
  on time.
* **Gas of `members(start, limit)`** grows with `limit`; callers choose the page size. `memberAt`
  and `memberCount` are O(1). No state-changing function loops over user data.

## Operational responsibilities

* **Factory / deploy service.** Deploys `LaunchToken` first, then `ReferralList` with
  `constructorArgs ["$token"]`. Confirms the token supply sits with the factory after both
  constructors run. Seeds the ETH/INVT pool from the token supply. Records the deployment block for
  the website's chunked log queries.
* **Manifest step.** Names `LaunchToken` as the launch token and one application contract,
  `ReferralList`, in the contracts list with the single `$token` argument. No `$owner` reference
  exists because there is no owner.
* **Independent adversarial review.** Should attack, at minimum: the 200/800/1,000 split
  arithmetic, `claim()` re-entrancy and double claim, referral cycles, and INVT left in the contract
  that nobody can claim. Tests passing here are not an audit.
* **Website.** Reads `token()` for the INVT address, shows balance and allowance, offers an Approve
  step before `join`, builds lists from views and `Joined`/`Claimed` events only, and states that
  INVT comes from swapping Sepolia ETH in the launch pool. No in-page swap.
* **Nobody** can pause, upgrade, sweep referral credit, change the fee or mint INVT. There is no key
  to protect after deployment.

## Edges that are covered, and edges that are not

Covered by tests: exact splits with and without a referrer, multiple referrals, a five-level chain
with depths 0 to 4 and `maxDepth` 4, later shallow joins not lowering `maxDepth`, referrer not on
the list, double join, self as referrer, dead address as referrer, missing approval, insufficient
balance, claim twice pays once, claim by a non-referrer, claim isolation between referrers, credit
accruing after a claim, re-entrancy into `claim` and into `join` from a hostile token, exact
guard error selector, stranded token burn, ETH rejection, opcode scan and EIP-170 size, deploy
wiring, and randomized conservation via fuzz and invariant tests.

Not covered, and deliberately out of scope: behaviour with any token other than INVT in production,
gas limits of very large pages from `members`, and the website's log-chunking logic.
