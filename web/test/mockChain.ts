/**
 * An in-memory ReferralList + INVT + v4 quoter that answers both the injected wallet (EIP-1193)
 * and the public HTTP JSON-RPC endpoints from one state, so interaction tests need no funds and
 * no network. Behaviour mirrors src/ReferralList.sol and OpenZeppelin ERC20 closely enough for
 * the frontend: same custom errors, same 1,000 / 200 / 800 split, same events.
 */
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeErrorResult,
  encodeEventTopics,
  encodeFunctionResult,
  getAddress,
  keccak256,
  numberToHex,
  hexToBigInt,
  toHex,
  zeroAddress,
  type Abi,
  type Address,
  type Hex,
} from 'viem';

export const JOIN_FEE = 1_000n * 10n ** 18n;
export const REFERRER_SHARE = 200n * 10n ** 18n;
export const BURN_ADDRESS: Address = '0x000000000000000000000000000000000000dEaD';
export const DEPLOYMENT_BLOCK = 11791675n;

export interface MockOptions {
  /** Chain the wallet starts on. Defaults to the deployment chain. */
  walletChainId?: number;
  accounts?: Address[];
  /** How wallet_switchEthereumChain behaves for the deployment chain. */
  switchBehavior?: 'ok' | 'unknown-then-ok' | 'reject';
  /** Reject eth_sendTransaction with EIP-1193 code 4001. */
  rejectSend?: boolean;
  /** Reject eth_getLogs ranges larger than this many blocks, like a public RPC. */
  maxLogRange?: number;
  /** Quoter output for the sample input, or null to make the quoter revert. */
  quoteOut?: bigint | null;
  /** Blocks after the deployment block at which the chain head starts. */
  headOffset?: number;
}

export interface MockContracts {
  referralList: Address;
  token: Address;
  quoter: Address;
  referralListAbi: Abi;
  tokenAbi: Abi;
  quoterAbi: Abi;
}

class RpcError extends Error {
  constructor(
    public code: number,
    message: string,
    public data?: unknown,
  ) {
    super(message);
  }
}

class Revert extends Error {
  constructor(
    public errorName: string,
    public args: unknown[] = [],
  ) {
    super(`revert ${errorName}`);
  }
}

interface RpcLog {
  address: Address;
  topics: Hex[];
  data: Hex;
  blockNumber: Hex;
  transactionHash: Hex;
  transactionIndex: Hex;
  blockHash: Hex;
  logIndex: Hex;
  removed: boolean;
}

interface Member {
  joinedAt: bigint;
  referrer: Address;
  depth: bigint;
}

interface State {
  balances: Map<string, bigint>;
  allowances: Map<string, bigint>;
  members: Map<string, Member>;
  memberList: Address[];
  referralCount: Map<string, bigint>;
  claimable: Map<string, bigint>;
  totalClaimable: bigint;
  maxDepth: bigint;
}

type Listener = (payload: unknown) => void;

const lower = (a: string) => a.toLowerCase();

export class MockChain {
  readonly chainId = 11155111;
  head: bigint;
  walletChainId: number;
  accounts: Address[];
  connected = false;
  knownChains = new Set<number>([1]);
  state: State = {
    balances: new Map(),
    allowances: new Map(),
    members: new Map(),
    memberList: [],
    referralCount: new Map(),
    claimable: new Map(),
    totalClaimable: 0n,
    maxDepth: 0n,
  };
  ethBalances = new Map<string, bigint>();
  logs: RpcLog[] = [];
  receipts = new Map<Hex, Record<string, unknown>>();
  txs = new Map<Hex, Record<string, unknown>>();
  walletRequests: Array<{ method: string; params?: unknown[] }> = [];
  rpcRequests: Array<{ method: string; params?: unknown[] }> = [];
  private listeners = new Map<string, Set<Listener>>();
  private txCounter = 0;
  readonly provider: {
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    on: (event: string, fn: Listener) => void;
    removeListener: (event: string, fn: Listener) => void;
    isMock: boolean;
  };

  constructor(
    readonly contracts: MockContracts,
    readonly opts: MockOptions = {},
  ) {
    this.walletChainId = opts.walletChainId ?? this.chainId;
    this.accounts = opts.accounts ?? ['0x1111111111111111111111111111111111111111'];
    this.head = DEPLOYMENT_BLOCK + BigInt(opts.headOffset ?? 100);
    this.knownChains.add(this.walletChainId);
    if (opts.switchBehavior !== 'unknown-then-ok') this.knownChains.add(this.chainId);
    this.provider = {
      request: (args) => this.walletRequest(args),
      on: (event, fn) => {
        if (!this.listeners.has(event)) this.listeners.set(event, new Set());
        this.listeners.get(event)!.add(fn);
      },
      removeListener: (event, fn) => this.listeners.get(event)?.delete(fn),
      isMock: true,
    };
  }

  // ----------------------------------------------------------------- state seeding
  setBalance(account: Address, amount: bigint) {
    this.state.balances.set(lower(account), amount);
  }
  setEthBalance(account: Address, amount: bigint) {
    this.ethBalances.set(lower(account), amount);
  }
  setAllowance(owner: Address, spender: Address, amount: bigint) {
    this.state.allowances.set(`${lower(owner)}:${lower(spender)}`, amount);
  }
  balanceOf(account: Address): bigint {
    return this.state.balances.get(lower(account)) ?? 0n;
  }
  claimableOf(account: Address): bigint {
    return this.state.claimable.get(lower(account)) ?? 0n;
  }
  isMember(account: Address): boolean {
    return this.state.members.has(lower(account));
  }

  /** Put a member on the list directly (as if joined earlier), emitting the Joined event. */
  seedMember(account: Address, referrer: Address = zeroAddress, blockOffset = 1) {
    const ref = referrer === zeroAddress ? undefined : this.state.members.get(lower(referrer));
    const depth = ref ? ref.depth + 1n : 0n;
    this.state.members.set(lower(account), { joinedAt: 1_758_900_000n + BigInt(blockOffset) * 12n, referrer, depth });
    this.state.memberList.push(account);
    if (referrer !== zeroAddress) {
      this.state.referralCount.set(lower(referrer), (this.state.referralCount.get(lower(referrer)) ?? 0n) + 1n);
      this.state.claimable.set(lower(referrer), this.claimableOf(referrer) + REFERRER_SHARE);
      this.state.totalClaimable += REFERRER_SHARE;
      this.setBalance(this.contracts.referralList, this.balanceOf(this.contracts.referralList) + REFERRER_SHARE);
    }
    if (depth > this.state.maxDepth) this.state.maxDepth = depth;
    const block = DEPLOYMENT_BLOCK + BigInt(blockOffset);
    const txHash = this.nextTxHash();
    this.logs.push(this.joinedLog(account, referrer, depth, block, txHash, 0));
  }

  emit(event: string, payload: unknown) {
    for (const fn of this.listeners.get(event) ?? []) fn(payload);
  }

  // ----------------------------------------------------------------- wallet (EIP-1193)
  private async walletRequest({ method, params }: { method: string; params?: unknown[] | undefined }): Promise<unknown> {
    this.walletRequests.push(params === undefined ? { method } : { method, params });
    switch (method) {
      case 'eth_chainId':
        return numberToHex(this.walletChainId);
      case 'eth_accounts':
        return this.connected ? this.accounts : [];
      case 'eth_requestAccounts':
        this.connected = true;
        return this.accounts;
      case 'wallet_switchEthereumChain': {
        const target = Number(hexToBigInt((params?.[0] as { chainId: Hex }).chainId));
        if (this.opts.switchBehavior === 'reject') throw new RpcError(4001, 'User rejected the request.');
        if (!this.knownChains.has(target)) throw new RpcError(4902, 'Unrecognized chain ID. Try adding the chain first.');
        this.walletChainId = target;
        this.emit('chainChanged', numberToHex(target));
        return null;
      }
      case 'wallet_addEthereumChain': {
        const p = params?.[0] as { chainId: Hex };
        this.knownChains.add(Number(hexToBigInt(p.chainId)));
        return null;
      }
      case 'eth_sendTransaction': {
        if (this.opts.rejectSend) throw new RpcError(4001, 'User rejected the request.');
        const tx = params?.[0] as { from: Address; to: Address; data?: Hex; value?: Hex };
        return this.sendTransaction(tx);
      }
      default:
        return this.rpc(method, params);
    }
  }

  // ----------------------------------------------------------------- HTTP JSON-RPC
  async handleHttp(body: unknown): Promise<unknown> {
    if (Array.isArray(body)) return Promise.all(body.map((b) => this.handleOne(b as { id: number; method: string; params?: unknown[] })));
    return this.handleOne(body as { id: number; method: string; params?: unknown[] });
  }

  private async handleOne(req: { id: number; method: string; params?: unknown[] }) {
    try {
      const result = await this.rpc(req.method, req.params);
      return { jsonrpc: '2.0', id: req.id, result };
    } catch (err) {
      if (err instanceof RpcError) return { jsonrpc: '2.0', id: req.id, error: { code: err.code, message: err.message, data: err.data } };
      return { jsonrpc: '2.0', id: req.id, error: { code: -32603, message: err instanceof Error ? err.message : String(err) } };
    }
  }

  private async rpc(method: string, params?: unknown[]): Promise<unknown> {
    this.rpcRequests.push(params === undefined ? { method } : { method, params });
    switch (method) {
      case 'eth_chainId':
        return numberToHex(this.chainId);
      case 'net_version':
        return String(this.chainId);
      case 'eth_blockNumber':
        return numberToHex(this.head);
      case 'eth_getBalance': {
        const [addr] = params as [Address];
        return numberToHex(this.ethBalances.get(lower(addr)) ?? 10n ** 18n);
      }
      case 'eth_getTransactionCount':
        return '0x1';
      case 'eth_gasPrice':
      case 'eth_maxPriorityFeePerGas':
        return '0x3b9aca00';
      case 'eth_estimateGas':
        return '0x186a0';
      case 'eth_feeHistory':
        return { oldestBlock: numberToHex(this.head), baseFeePerGas: ['0x3b9aca00', '0x3b9aca00'], gasUsedRatio: [0.5], reward: [['0x3b9aca00']] };
      case 'eth_getBlockByNumber':
        return this.block(this.head);
      case 'eth_call': {
        const [call] = params as [{ from?: Address; to: Address; data: Hex; value?: Hex }];
        return this.call(call, false).result;
      }
      case 'eth_getLogs':
        return this.getLogs((params as [Record<string, unknown>])[0]);
      case 'eth_getTransactionReceipt': {
        const [hash] = params as [Hex];
        return this.receipts.get(hash) ?? null;
      }
      case 'eth_getTransactionByHash': {
        const [hash] = params as [Hex];
        return this.txs.get(hash) ?? null;
      }
      default:
        throw new RpcError(-32601, `Method ${method} not supported by the mock`);
    }
  }

  private block(number: bigint) {
    return {
      number: numberToHex(number),
      hash: keccak256(toHex(`block-${number}`)),
      parentHash: keccak256(toHex(`block-${number - 1n}`)),
      timestamp: numberToHex(1_758_900_000n + number * 12n),
      baseFeePerGas: '0x3b9aca00',
      gasLimit: '0x1c9c380',
      gasUsed: '0x5208',
      miner: zeroAddress,
      nonce: '0x0000000000000000',
      difficulty: '0x0',
      extraData: '0x',
      logsBloom: '0x' + '0'.repeat(512),
      mixHash: keccak256('0x'),
      receiptsRoot: keccak256('0x'),
      sha3Uncles: keccak256('0x'),
      size: '0x100',
      stateRoot: keccak256('0x'),
      totalDifficulty: '0x0',
      transactions: [],
      transactionsRoot: keccak256('0x'),
      uncles: [],
    };
  }

  private getLogs(filter: Record<string, unknown>) {
    const from = filter.fromBlock ? hexToBigInt(filter.fromBlock as Hex) : 0n;
    const to = filter.toBlock && filter.toBlock !== 'latest' ? hexToBigInt(filter.toBlock as Hex) : this.head;
    if (to > this.head) throw new RpcError(-32602, 'block range extends beyond current head block');
    if (this.opts.maxLogRange !== undefined && to - from + 1n > BigInt(this.opts.maxLogRange)) {
      throw new RpcError(-32701, `exceed maximum block range: ${this.opts.maxLogRange}`);
    }
    const address = filter.address ? lower(filter.address as string) : undefined;
    const topics = (filter.topics as Array<Hex | Hex[] | null> | undefined) ?? [];
    return this.logs.filter((log) => {
      const bn = hexToBigInt(log.blockNumber);
      if (bn < from || bn > to) return false;
      if (address && lower(log.address) !== address) return false;
      return topics.every((t, i) => {
        if (t === null || t === undefined) return true;
        const want = Array.isArray(t) ? t.map(lower) : [lower(t)];
        const have = log.topics[i];
        return have !== undefined && want.includes(lower(have));
      });
    });
  }

  // ----------------------------------------------------------------- execution
  private nextTxHash(): Hex {
    this.txCounter += 1;
    return keccak256(toHex(`tx-${this.txCounter}`));
  }

  private joinedLog(member: Address, referrer: Address, depth: bigint, block: bigint, txHash: Hex, logIndex: number): RpcLog {
    const topics = encodeEventTopics({ abi: this.contracts.referralListAbi, eventName: 'Joined', args: { member, referrer } });
    return {
      address: this.contracts.referralList,
      topics: topics as Hex[],
      data: encodeAbiParameters([{ type: 'uint256' }], [depth]),
      blockNumber: numberToHex(block),
      transactionHash: txHash,
      transactionIndex: '0x0',
      blockHash: keccak256(toHex(`block-${block}`)),
      logIndex: numberToHex(logIndex),
      removed: false,
    };
  }

  private claimedLog(referrer: Address, amount: bigint, block: bigint, txHash: Hex, logIndex: number): RpcLog {
    const topics = encodeEventTopics({ abi: this.contracts.referralListAbi, eventName: 'Claimed', args: { referrer } });
    return {
      address: this.contracts.referralList,
      topics: topics as Hex[],
      data: encodeAbiParameters([{ type: 'uint256' }], [amount]),
      blockNumber: numberToHex(block),
      transactionHash: txHash,
      transactionIndex: '0x0',
      blockHash: keccak256(toHex(`block-${block}`)),
      logIndex: numberToHex(logIndex),
      removed: false,
    };
  }

  private snapshot(): State {
    const s = this.state;
    return {
      balances: new Map(s.balances),
      allowances: new Map(s.allowances),
      members: new Map(s.members),
      memberList: [...s.memberList],
      referralCount: new Map(s.referralCount),
      claimable: new Map(s.claimable),
      totalClaimable: s.totalClaimable,
      maxDepth: s.maxDepth,
    };
  }

  private sendTransaction(tx: { from: Address; to: Address; data?: Hex; value?: Hex }): Hex {
    const hash = this.nextTxHash();
    const { logs } = this.call({ from: tx.from, to: tx.to, data: tx.data ?? '0x' }, true, hash);
    this.head += 1n;
    const blockNumber = numberToHex(this.head);
    const blockHash = keccak256(toHex(`block-${this.head}`));
    for (const log of logs) {
      log.blockNumber = blockNumber;
      log.blockHash = blockHash;
      this.logs.push(log);
    }
    this.txs.set(hash, {
      hash,
      nonce: '0x1',
      blockHash,
      blockNumber,
      transactionIndex: '0x0',
      from: tx.from,
      to: tx.to,
      value: tx.value ?? '0x0',
      gas: '0x186a0',
      gasPrice: '0x3b9aca00',
      maxFeePerGas: '0x3b9aca00',
      maxPriorityFeePerGas: '0x3b9aca00',
      input: tx.data ?? '0x',
      type: '0x2',
      chainId: numberToHex(this.chainId),
      v: '0x0',
      r: '0x0',
      s: '0x0',
    });
    this.receipts.set(hash, {
      transactionHash: hash,
      transactionIndex: '0x0',
      blockHash,
      blockNumber,
      from: tx.from,
      to: tx.to,
      cumulativeGasUsed: '0x5208',
      gasUsed: '0x5208',
      contractAddress: null,
      logs,
      logsBloom: '0x' + '0'.repeat(512),
      status: '0x1',
      effectiveGasPrice: '0x3b9aca00',
      type: '0x2',
    });
    return hash;
  }

  /** Execute a call. When `commit` is false the state is restored afterwards (eth_call). */
  private call(call: { from?: Address; to: Address; data: Hex; value?: Hex }, commit: boolean, txHash: Hex = '0x00'): { result: Hex; logs: RpcLog[] } {
    const before = this.snapshot();
    const logs: RpcLog[] = [];
    try {
      const result = this.execute(call.from ?? zeroAddress, call.to, call.data, logs, txHash);
      if (!commit) this.state = before;
      return { result, logs };
    } catch (err) {
      this.state = before;
      if (err instanceof Revert) {
        const abi = [...this.contracts.referralListAbi, ...this.contracts.tokenAbi] as Abi;
        let data: Hex | undefined;
        try {
          data = encodeErrorResult({ abi, errorName: err.errorName, args: err.args });
        } catch {
          data = undefined;
        }
        throw new RpcError(3, `execution reverted: ${err.errorName}`, data);
      }
      throw err;
    }
  }

  private execute(from: Address, to: Address, data: Hex, logs: RpcLog[], txHash: Hex): Hex {
    const target = lower(to);
    if (target === lower(this.contracts.token)) return this.executeToken(from, data);
    if (target === lower(this.contracts.referralList)) return this.executeReferralList(from, data, logs, txHash);
    if (target === lower(this.contracts.quoter)) return this.executeQuoter(data);
    throw new RpcError(3, 'execution reverted');
  }

  private allowance(owner: Address, spender: Address): bigint {
    return this.state.allowances.get(`${lower(owner)}:${lower(spender)}`) ?? 0n;
  }

  private transfer(from: Address, to: Address, amount: bigint) {
    const bal = this.balanceOf(from);
    if (bal < amount) throw new Revert('ERC20InsufficientBalance', [from, bal, amount]);
    this.setBalance(from, bal - amount);
    this.setBalance(to, this.balanceOf(to) + amount);
  }

  private executeToken(from: Address, data: Hex): Hex {
    const abi = this.contracts.tokenAbi;
    const { functionName, args = [] } = decodeFunctionData({ abi, data });
    const ret = (value: unknown) => encodeFunctionResult({ abi, functionName, result: value as never });
    switch (functionName) {
      case 'symbol':
        return ret('INVT');
      case 'name':
        return ret('Invite');
      case 'decimals':
        return ret(18);
      case 'totalSupply':
        return ret(10n ** 27n);
      case 'balanceOf':
        return ret(this.balanceOf(args[0] as Address));
      case 'allowance':
        return ret(this.allowance(args[0] as Address, args[1] as Address));
      case 'approve': {
        this.setAllowance(from, args[0] as Address, args[1] as bigint);
        return ret(true);
      }
      case 'transfer': {
        this.transfer(from, args[0] as Address, args[1] as bigint);
        return ret(true);
      }
      case 'transferFrom': {
        const [owner, to, amount] = args as [Address, Address, bigint];
        const allowed = this.allowance(owner, from);
        if (allowed < amount) throw new Revert('ERC20InsufficientAllowance', [from, allowed, amount]);
        this.setAllowance(owner, from, allowed - amount);
        this.transfer(owner, to, amount);
        return ret(true);
      }
      default:
        throw new RpcError(3, `execution reverted: token.${functionName} unsupported`);
    }
  }

  private executeReferralList(from: Address, data: Hex, logs: RpcLog[], txHash: Hex): Hex {
    const abi = this.contracts.referralListAbi;
    const { functionName, args = [] } = decodeFunctionData({ abi, data });
    const ret = (value: unknown) => encodeFunctionResult({ abi, functionName, result: value as never });
    const s = this.state;
    const me = lower(from);
    switch (functionName) {
      case 'JOIN_FEE':
        return ret(JOIN_FEE);
      case 'REFERRER_SHARE':
        return ret(REFERRER_SHARE);
      case 'BURN_SHARE_WITH_REFERRER':
        return ret(JOIN_FEE - REFERRER_SHARE);
      case 'BURN_ADDRESS':
        return ret(BURN_ADDRESS);
      case 'token':
        return ret(this.contracts.token);
      case 'joinedAt':
        return ret(s.members.get(lower(args[0] as string))?.joinedAt ?? 0n);
      case 'referrerOf':
        return ret(s.members.get(lower(args[0] as string))?.referrer ?? zeroAddress);
      case 'referralCount':
        return ret(s.referralCount.get(lower(args[0] as string)) ?? 0n);
      case 'depth':
        return ret(s.members.get(lower(args[0] as string))?.depth ?? 0n);
      case 'claimable':
        return ret(s.claimable.get(lower(args[0] as string)) ?? 0n);
      case 'maxDepth':
        return ret(s.maxDepth);
      case 'totalClaimable':
        return ret(s.totalClaimable);
      case 'isMember':
        return ret(s.members.has(lower(args[0] as string)));
      case 'memberCount':
        return ret(BigInt(s.memberList.length));
      case 'memberAt': {
        const i = Number(args[0] as bigint);
        if (i >= s.memberList.length) throw new Revert('IndexOutOfBounds', [args[0], BigInt(s.memberList.length)]);
        return ret(s.memberList[i]);
      }
      case 'members': {
        const start = Number(args[0] as bigint);
        const limit = Number(args[1] as bigint);
        return ret(s.memberList.slice(start, start + limit));
      }
      case 'join': {
        const referrer = getAddress(args[0] as Address);
        if (s.members.has(me)) throw new Revert('AlreadyJoined', [from]);
        if (lower(referrer) === me) throw new Revert('SelfReferral');
        let depth = 0n;
        let burn = JOIN_FEE;
        if (referrer !== zeroAddress) {
          const ref = s.members.get(lower(referrer));
          if (!ref) throw new Revert('ReferrerNotMember', [referrer]);
          depth = ref.depth + 1n;
          burn = JOIN_FEE - REFERRER_SHARE;
          s.claimable.set(lower(referrer), (s.claimable.get(lower(referrer)) ?? 0n) + REFERRER_SHARE);
          s.totalClaimable += REFERRER_SHARE;
          s.referralCount.set(lower(referrer), (s.referralCount.get(lower(referrer)) ?? 0n) + 1n);
        }
        s.members.set(me, { joinedAt: 1_758_900_000n + this.head * 12n, referrer, depth });
        s.memberList.push(from);
        if (depth > s.maxDepth) s.maxDepth = depth;
        logs.push(this.joinedLog(from, referrer, depth, this.head + 1n, txHash, logs.length));
        // Interactions: pull the fee through the token, then burn.
        const allowed = this.allowance(from, this.contracts.referralList);
        if (allowed < JOIN_FEE) throw new Revert('ERC20InsufficientAllowance', [this.contracts.referralList, allowed, JOIN_FEE]);
        this.setAllowance(from, this.contracts.referralList, allowed - JOIN_FEE);
        this.transfer(from, this.contracts.referralList, JOIN_FEE);
        this.transfer(this.contracts.referralList, BURN_ADDRESS, burn);
        return '0x';
      }
      case 'claim': {
        const amount = s.claimable.get(me) ?? 0n;
        if (amount === 0n) throw new Revert('NothingToClaim', [from]);
        s.claimable.set(me, 0n);
        s.totalClaimable -= amount;
        logs.push(this.claimedLog(from, amount, this.head + 1n, txHash, logs.length));
        this.transfer(this.contracts.referralList, from, amount);
        return '0x';
      }
      case 'burnExcess': {
        const balance = this.balanceOf(this.contracts.referralList);
        if (balance <= s.totalClaimable) throw new Revert('NoExcess');
        this.transfer(this.contracts.referralList, BURN_ADDRESS, balance - s.totalClaimable);
        return '0x';
      }
      default:
        throw new RpcError(3, `execution reverted: referralList.${functionName} unsupported`);
    }
  }

  private executeQuoter(data: Hex): Hex {
    const abi = this.contracts.quoterAbi;
    const { functionName } = decodeFunctionData({ abi, data });
    if (functionName !== 'quoteExactInputSingle') throw new RpcError(3, 'execution reverted');
    const out = this.opts.quoteOut === undefined ? 50_000n * 10n ** 18n : this.opts.quoteOut;
    if (out === null) throw new RpcError(3, 'execution reverted: NotEnoughLiquidity');
    return encodeFunctionResult({ abi, functionName, result: [out, 60_000n] as never });
  }
}
