import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getAddress } from 'viem';
import { ACCOUNT, OTHER, REFERRER, STRANGER, installHarness, renderApp } from './harness';
import { JOIN_FEE, REFERRER_SHARE } from './mockChain';

const INVT = 10n ** 18n;

async function connect(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^Connect wallet$/ }));
  await screen.findByText(/Connected wallet/, undefined, { timeout: 10_000 });
}

describe('disconnected visitor', () => {
  it('shows live list state, disables actions with a reason and explains where INVT comes from', async () => {
    const { mock } = installHarness();
    mock.seedMember(REFERRER);
    mock.seedMember(OTHER, REFERRER, 2);
    await renderApp();

    const list = screen.getByRole('region', { name: 'The list' });
    await within(list).findByText('2'); // members
    expect(within(list).getByText('depth 1')).toBeInTheDocument();
    expect(within(list).getByText('1,000 INVT')).toBeInTheDocument();
    expect(within(list).getByText('200 INVT (20%)')).toBeInTheDocument();

    expect(screen.getByRole('note')).toHaveTextContent(/test toy, not an investment/);
    expect(screen.getByText(/This page never swaps/)).toBeInTheDocument();
    await screen.findByText(/Pool quote right now: 0.001 ETH ≈ 50,000 INVT/);

    const join = screen.getByRole('button', { name: /Join for 1,000 INVT/ });
    expect(join).toBeDisabled();
    expect(screen.getByText('Connect a wallet to continue.', { selector: '#join-blocker' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Approve 1,000 INVT/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Connect wallet$/ })).toBeEnabled();
    expect(screen.getByText(/Connect a wallet to see your link/)).toBeInTheDocument();
  });

  it('says when no browser wallet is installed', async () => {
    installHarness({ noWallet: true });
    await renderApp();
    expect(await screen.findByText(/No browser wallet detected/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Connect wallet/ })).not.toBeInTheDocument();
  });

  it('pre-fills the referrer from ?ref= and verifies membership live', async () => {
    const { mock } = installHarness();
    mock.seedMember(REFERRER);
    window.history.replaceState({}, '', `/?ref=${REFERRER}`);
    await renderApp();
    const input = screen.getByLabelText('Referrer address') as HTMLInputElement;
    expect(input.value).toBe(getAddress(REFERRER));
    await screen.findByText(/On the list\. 200 INVT goes to 0x2222…2222, 800 INVT is burned\./);
  });
});

describe('network handling', () => {
  it('offers one switch control and adds the chain when the wallet does not know it', async () => {
    const { mock, manifest } = installHarness({ walletChainId: 1, switchBehavior: 'unknown-then-ok' });
    mock.setBalance(ACCOUNT, 5_000n * INVT);
    await renderApp();
    const user = userEvent.setup();
    await connect(user);

    const banner = await screen.findByRole('region', { name: /Your wallet is on another network \(chain 1\)/ });
    expect(screen.getByText(/Switch your wallet to Sepolia first/, { selector: '#join-blocker' })).toBeInTheDocument();
    await user.click(within(banner).getByRole('button', { name: 'Switch to Sepolia' }));

    await waitFor(() => expect(screen.queryByRole('region', { name: /another network/ })).not.toBeInTheDocument(), { timeout: 10_000 });
    const methods = mock.walletRequests.map((r) => r.method).filter((m) => m === 'wallet_switchEthereumChain' || m === 'wallet_addEthereumChain');
    expect(methods).toEqual(['wallet_switchEthereumChain', 'wallet_addEthereumChain', 'wallet_switchEthereumChain']);
    const add = mock.walletRequests.find((r) => r.method === 'wallet_addEthereumChain');
    expect(add?.params?.[0]).toEqual({
      chainId: '0xaa36a7',
      chainName: 'Sepolia',
      rpcUrls: manifest.network.rpcUrls,
      nativeCurrency: manifest.network.nativeCurrency,
      blockExplorerUrls: [manifest.network.explorer],
    });
    // Reads and actions come back once the chain matches.
    await waitFor(() => expect(screen.getByRole('button', { name: /Approve 1,000 INVT/ })).toBeEnabled(), { timeout: 10_000 });
  });

  it('reports a rejected switch and keeps actions disabled', async () => {
    installHarness({ walletChainId: 1, switchBehavior: 'reject' });
    await renderApp();
    const user = userEvent.setup();
    await connect(user);
    await user.click(await screen.findByRole('button', { name: 'Switch to Sepolia' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/rejected the request/);
    expect(screen.getByRole('button', { name: /Join for 1,000 INVT/ })).toBeDisabled();
  });
});

describe('joining', () => {
  it('approves then joins with a referrer, crediting 200 INVT and burning 800', async () => {
    const { mock } = installHarness();
    mock.seedMember(REFERRER);
    mock.setBalance(ACCOUNT, 5_000n * INVT);
    window.history.replaceState({}, '', `/?ref=${REFERRER}`);
    await renderApp();
    const user = userEvent.setup();
    await connect(user);

    const wallet = screen.getByRole('region', { name: 'Your wallet' });
    await within(wallet).findByText('5,000 INVT');
    expect(within(wallet).getByText('0 INVT')).toBeInTheDocument(); // allowance
    expect(within(wallet).getByText('Not on the list yet.')).toBeInTheDocument();

    const joinButton = screen.getByRole('button', { name: /Join for 1,000 INVT/ });
    expect(joinButton).toBeDisabled();
    expect(screen.getByText('Approve 1,000 INVT first (step 1).')).toBeInTheDocument();

    const approve = screen.getByRole('button', { name: /Approve 1,000 INVT/ });
    await waitFor(() => expect(approve).toBeEnabled());
    await user.click(approve);
    await screen.findByText(/Approval confirmed\./, undefined, { timeout: 10_000 });
    expect(mock.walletRequests.some((r) => r.method === 'eth_sendTransaction')).toBe(true);
    await screen.findByText(/Done: the list may pull 1,000 INVT/);
    await waitFor(() => expect(screen.getByRole('button', { name: /Join for 1,000 INVT/ })).toBeEnabled(), { timeout: 10_000 });
    expect(screen.getByText(/Pays 1,000 INVT: 200 to 0x2222…2222, 800 burned\./)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Join for 1,000 INVT/ }));
    await screen.findByRole('region', { name: 'You are on the list' }, { timeout: 10_000 });
    expect(screen.getByText(/at depth/)).toHaveTextContent(/depth 1/);

    expect(mock.isMember(ACCOUNT)).toBe(true);
    expect(mock.balanceOf(ACCOUNT)).toBe(4_000n * INVT);
    expect(mock.claimableOf(REFERRER)).toBe(REFERRER_SHARE);
    expect(mock.balanceOf('0x000000000000000000000000000000000000dEaD')).toBe(JOIN_FEE - REFERRER_SHARE);
    // Simulation ran before the wallet was asked to sign.
    const calls = mock.rpcRequests.filter((r) => r.method === 'eth_call').length;
    expect(calls).toBeGreaterThan(0);
    const list = screen.getByRole('region', { name: 'The list' });
    await within(list).findByText('2');
  });

  it('refuses a referrer who is not on the list and an incomplete address', async () => {
    const { mock } = installHarness();
    mock.setBalance(ACCOUNT, 5_000n * INVT);
    mock.setAllowance(ACCOUNT, mock.contracts.referralList, JOIN_FEE);
    await renderApp();
    const user = userEvent.setup();
    await connect(user);
    const input = screen.getByLabelText('Referrer address');
    await user.type(input, STRANGER);
    await screen.findByText(/This address has not joined, so joining with it would fail/);
    expect(screen.getByRole('button', { name: /Join for 1,000 INVT/ })).toBeDisabled();

    await user.clear(input);
    await user.type(input, '0x1234');
    await screen.findByText('An address is 0x followed by 40 hexadecimal characters.');
    await waitFor(() => expect(screen.getByRole('button', { name: /Join for 1,000 INVT/ })).toBeEnabled());
    await user.keyboard('{Enter}');
    expect(mock.walletRequests.some((r) => r.method === 'eth_sendTransaction')).toBe(false);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Enter a full 0x address/);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveFocus();

    await user.clear(input);
    await user.type(input, ACCOUNT);
    await screen.findByText(/You cannot be your own referrer/);
  });

  it('explains an insufficient balance and does not offer approval', async () => {
    const { mock } = installHarness();
    mock.setBalance(ACCOUNT, 10n * INVT);
    await renderApp();
    const user = userEvent.setup();
    await connect(user);
    await screen.findByText('You need 1,000 INVT to join; this wallet has 10 INVT.');
    expect(screen.getByRole('button', { name: /Approve 1,000 INVT/ })).toBeDisabled();
  });

  it('joins without a referrer, burning the whole fee', async () => {
    const { mock } = installHarness();
    mock.setBalance(ACCOUNT, 1_000n * INVT);
    mock.setAllowance(ACCOUNT, mock.contracts.referralList, JOIN_FEE);
    await renderApp();
    const user = userEvent.setup();
    await connect(user);
    const join = screen.getByRole('button', { name: /Join for 1,000 INVT/ });
    await waitFor(() => expect(join).toBeEnabled(), { timeout: 10_000 });
    expect(screen.getByText('Pays 1,000 INVT, all of it burned.')).toBeInTheDocument();
    await user.click(join);
    await screen.findByRole('region', { name: 'You are on the list' }, { timeout: 10_000 });
    expect(screen.getByText(/with no referrer/)).toBeInTheDocument();
    expect(mock.balanceOf('0x000000000000000000000000000000000000dEaD')).toBe(JOIN_FEE);
    expect(mock.balanceOf(ACCOUNT)).toBe(0n);
  });

  it('shows a wallet rejection as a recoverable error', async () => {
    const { mock } = installHarness({ rejectSend: true });
    mock.setBalance(ACCOUNT, 5_000n * INVT);
    await renderApp();
    const user = userEvent.setup();
    await connect(user);
    const approve = screen.getByRole('button', { name: /Approve 1,000 INVT/ });
    await waitFor(() => expect(approve).toBeEnabled());
    await user.click(approve);
    expect(await screen.findByRole('alert', undefined, { timeout: 10_000 })).toHaveTextContent('You rejected the request in your wallet. Nothing was sent.');
    expect(screen.getByRole('button', { name: /Approve 1,000 INVT/ })).toBeEnabled();
  });
});

describe('members', () => {
  it('shows earnings, claims them, lists referrals from events and copies the link', async () => {
    // 3,001 blocks since deployment; the provider rejects ranges over 1,500, like a public RPC.
    const { mock } = installHarness({ maxLogRange: 1500, headOffset: 3000 });
    mock.seedMember(ACCOUNT);
    mock.seedMember(REFERRER, ACCOUNT, 2);
    mock.seedMember(OTHER, ACCOUNT, 3);
    mock.seedMember(STRANGER, REFERRER, 4);
    await renderApp();
    const user = userEvent.setup();
    await connect(user);

    const earnings = screen.getByRole('region', { name: 'Referral credit' });
    await within(earnings).findByText('400 INVT');
    expect(within(earnings).getByText('2')).toBeInTheDocument();

    const referrals = screen.getByRole('region', { name: 'Your referrals' });
    await within(referrals).findByText('0x2222…2222', undefined, { timeout: 10_000 });
    expect(within(referrals).getByText('0x3333…3333')).toBeInTheDocument();
    expect(within(referrals).queryByText('0x4444…4444')).not.toBeInTheDocument();
    expect(within(referrals).getAllByText('depth 1')).toHaveLength(2);
    // The 3,001-block range was split into chunks of at most 1,250 blocks after the provider's rejections.
    const logCalls = mock.rpcRequests.filter((r) => r.method === 'eth_getLogs');
    expect(logCalls.length).toBeGreaterThanOrEqual(3);

    const link = screen.getByRole('region', { name: 'Your referral link' });
    const input = within(link).getByLabelText(/Link with your address/) as HTMLInputElement;
    expect(input.value).toBe(`http://localhost:3000/?ref=${getAddress(ACCOUNT)}`);
    const copy = within(link).getByRole('button', { name: 'Copy link' });
    expect(copy).toBeEnabled();
    await user.click(copy);
    await within(link).findByText('Link copied.');
    expect(await navigator.clipboard.readText()).toBe(input.value);

    const claim = within(earnings).getByRole('button', { name: 'Claim 400 INVT' });
    await user.click(claim);
    await within(earnings).findByText(/Credit claimed and sent to your wallet\./, undefined, { timeout: 10_000 });
    expect(mock.balanceOf(ACCOUNT)).toBe(400n * INVT);
    expect(mock.claimableOf(ACCOUNT)).toBe(0n);
    await within(earnings).findByText('0 INVT');
    expect(within(earnings).getByRole('button', { name: 'Claim INVT' })).toBeDisabled();
  });

  it('keeps the copy control disabled for a non-member and says why', async () => {
    const { mock } = installHarness();
    mock.setBalance(ACCOUNT, 10n * INVT);
    await renderApp();
    const user = userEvent.setup();
    await connect(user);
    const link = screen.getByRole('region', { name: 'Your referral link' });
    await waitFor(() => expect(within(link).getByRole('button', { name: 'Copy link' })).toBeDisabled());
    expect(within(link).getByText(/Your link works once you are on the list/)).toBeInTheDocument();
  });

  it('offers burnExcess only when stray INVT exists', async () => {
    const { mock } = installHarness();
    mock.seedMember(ACCOUNT);
    mock.seedMember(REFERRER, ACCOUNT, 2);
    mock.setBalance(mock.contracts.referralList, mock.balanceOf(mock.contracts.referralList) + 50n * INVT);
    await renderApp();
    const user = userEvent.setup();
    await connect(user);
    const details = document.getElementById('maintenance') as HTMLDetailsElement;
    await user.click(within(details).getByText(/Maintenance: burn stray INVT/));
    await within(details).findByText('50 INVT');
    const burn = within(details).getByRole('button', { name: 'Burn stray INVT' });
    await waitFor(() => expect(burn).toBeEnabled());
    await user.click(burn);
    await within(details).findByText(/Stray INVT burned\./, undefined, { timeout: 10_000 });
    expect(mock.balanceOf(mock.contracts.referralList)).toBe(200n * INVT);
    await waitFor(() => expect(within(details).getByRole('button', { name: 'Burn stray INVT' })).toBeDisabled());
  });
});

describe('deployment configuration guard', () => {
  it('refuses an ABI whose hash does not match the manifest', async () => {
    installHarness({ tamperAbi: 'ReferralList' });
    const { render } = await import('@testing-library/react');
    const { Root } = await import('../src/Root');
    render(<Root />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/does not match the attested ABI hash for ReferralList/);
    expect(screen.getByRole('button', { name: 'Retry loading' })).toBeInTheDocument();
  });

  it('refuses a manifest whose network chain disagrees with chainId', async () => {
    installHarness({ manifestOverride: (m) => ({ ...m, network: { ...m.network, chainId: 1 } }) });
    const { render } = await import('@testing-library/react');
    const { Root } = await import('../src/Root');
    render(<Root />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/network.chainId 1 does not match chainId 11155111/);
  });
});
