import {
  BaseError,
  ContractFunctionRevertedError,
  InsufficientFundsError,
  UserRejectedRequestError,
  ChainMismatchError,
} from 'viem';

/** Custom errors from ReferralList and OpenZeppelin ERC20, mapped to plain instructions. */
const CUSTOM_ERROR_MESSAGES: Record<string, string> = {
  AlreadyJoined: 'This wallet is already on the list, so it cannot join again.',
  SelfReferral: 'You cannot be your own referrer. Clear the referrer field or use another address.',
  ReferrerNotMember: 'The referrer has not joined the list. Ask them to join first, or clear the field to join without one.',
  NothingToClaim: 'There is no referral credit to claim for this wallet.',
  NoExcess: 'The contract holds no stray INVT, so there is nothing to burn.',
  IndexOutOfBounds: 'That member index does not exist.',
  ERC20InsufficientAllowance: 'Approve 1,000 INVT for the referral list first.',
  ERC20InsufficientBalance: 'This wallet holds less than 1,000 INVT. Swap Sepolia ETH for INVT in the launch pool first.',
  SafeERC20FailedOperation: 'The INVT transfer failed. Check your balance and allowance, then try again.',
};

function hasCode(err: unknown, code: number): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { code?: unknown; cause?: unknown; data?: { originalError?: { code?: unknown } } };
  if (e.code === code) return true;
  if (e.data?.originalError?.code === code) return true;
  return e.cause !== undefined && e.cause !== err && hasCode(e.cause, code);
}

/** True when a wallet reports the requested chain as unknown (EIP-3085 code 4902 or equivalent). */
export function isUnknownChainError(err: unknown): boolean {
  if (hasCode(err, 4902)) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /unrecognized chain|unknown chain|chain.*not (been )?added|4902/i.test(message);
}

export function isUserRejection(err: unknown): boolean {
  if (err instanceof BaseError && err.walk((e) => e instanceof UserRejectedRequestError)) return true;
  return hasCode(err, 4001);
}

/** Turn a viem / wallet error into one sentence that says what to do next. */
export function describeError(err: unknown): string {
  if (isUserRejection(err)) return 'You rejected the request in your wallet. Nothing was sent.';
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    if (reverted) {
      const name = reverted.data?.errorName ?? reverted.reason;
      if (name && CUSTOM_ERROR_MESSAGES[name]) return CUSTOM_ERROR_MESSAGES[name];
      if (reverted.reason) return `The contract rejected the call: ${reverted.reason}.`;
      return 'The contract rejected the call. Check the values above and try again.';
    }
    if (err.walk((e) => e instanceof InsufficientFundsError)) {
      return 'Not enough Sepolia ETH to pay for gas. Use a faucet listed at the bottom of the page.';
    }
    if (err.walk((e) => e instanceof ChainMismatchError)) {
      return 'Your wallet is on another network. Switch to Sepolia and try again.';
    }
    return err.shortMessage || err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Something failed. Try again.';
}
