// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ReferralList
/// @notice A Sepolia test toy for on-chain referral tracking, paid in INVT. It is not an
///         investment or earning scheme.
///
///         Joining costs exactly 1,000 INVT, pulled with `safeTransferFrom` after the joiner
///         approved this contract. With a referrer, 200 INVT (20%) is credited to the referrer's
///         claimable balance and 800 INVT is forwarded to the dead address. Without a referrer
///         the whole 1,000 INVT is forwarded to the dead address. Referrers withdraw their
///         credit with `claim()` (pull payment).
///
///         The contract holds only unclaimed referral credit. It has no owner, no admin, no
///         pause and no upgrade path, no payable function and no receive/fallback, so it never
///         holds ETH.
/// @dev Fully configured in the constructor with a single address argument so it can be
///      deployed by the project factory (constructorArgs ["$token"]). The factory is
///      `msg.sender` in the constructor and is given no role.
contract ReferralList is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    /// @notice Fee pulled from every joiner: 1,000 INVT.
    uint256 public constant JOIN_FEE = 1_000e18;

    /// @notice Share credited to the referrer when one is given: 200 INVT (20%).
    uint256 public constant REFERRER_SHARE = 200e18;

    /// @notice Share burned when a referrer is given: 800 INVT (80%).
    uint256 public constant BURN_SHARE_WITH_REFERRER = JOIN_FEE - REFERRER_SHARE;

    /// @notice Burns are plain transfers to this address.
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    // ---------------------------------------------------------------------
    // Immutable configuration
    // ---------------------------------------------------------------------

    /// @notice The INVT token used for fees and payouts.
    IERC20 public immutable token;

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    /// @notice Block timestamp at which an address joined, 0 if it has not.
    mapping(address member => uint256 timestamp) public joinedAt;

    /// @notice The referrer given at join time, address(0) if none.
    mapping(address member => address referrer) public referrerOf;

    /// @notice Number of members who named this address as their referrer.
    mapping(address member => uint256 count) public referralCount;

    /// @notice 0 for a member without a referrer, else the referrer's depth + 1.
    mapping(address member => uint256 level) public depth;

    /// @notice Unclaimed referral credit in INVT minor units.
    mapping(address referrer => uint256 amount) public claimable;

    /// @notice Largest depth any member has reached.
    uint256 public maxDepth;

    /// @notice Sum of all `claimable` balances. Equals this contract's INVT balance after
    ///         every protocol action; only unsolicited direct transfers can push the balance above it.
    uint256 public totalClaimable;

    mapping(address member => bool joined) private _isMember;
    address[] private _members;

    // ---------------------------------------------------------------------
    // Events and errors
    // ---------------------------------------------------------------------

    /// @notice Emitted once per member when it joins.
    event Joined(address indexed member, address indexed referrer, uint256 depth);

    /// @notice Emitted when a referrer withdraws its whole claimable balance.
    event Claimed(address indexed referrer, uint256 amount);

    /// @notice Emitted when INVT sent to this contract outside `join` is forwarded to the burn address.
    event ExcessBurned(uint256 amount);

    error ZeroToken();
    error AlreadyJoined(address member);
    error SelfReferral();
    error ReferrerNotMember(address referrer);
    error NothingToClaim(address caller);
    error NoExcess();
    error IndexOutOfBounds(uint256 index, uint256 count);

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    /// @param token_ The INVT token address. Supplied by the factory as `$token`.
    constructor(address token_) {
        if (token_ == address(0)) revert ZeroToken();
        token = IERC20(token_);
    }

    // ---------------------------------------------------------------------
    // Actions
    // ---------------------------------------------------------------------

    /// @notice Join the list, paying exactly 1,000 INVT. The caller must have approved this
    ///         contract for at least `JOIN_FEE` beforehand.
    /// @param referrer address(0) for no referrer, otherwise an address already on the list.
    ///        The caller cannot be its own referrer, and because the caller is not yet a member
    ///        no chain of referrers can ever loop back to it.
    function join(address referrer) external nonReentrant {
        address member = msg.sender;
        if (_isMember[member]) revert AlreadyJoined(member);
        if (referrer == member) revert SelfReferral();

        uint256 memberDepth = 0;
        uint256 burnAmount = JOIN_FEE;

        if (referrer != address(0)) {
            if (!_isMember[referrer]) revert ReferrerNotMember(referrer);
            memberDepth = depth[referrer] + 1;
            burnAmount = BURN_SHARE_WITH_REFERRER;

            // Effects for the referrer.
            claimable[referrer] += REFERRER_SHARE;
            totalClaimable += REFERRER_SHARE;
            referralCount[referrer] += 1;
        }

        // Effects for the member.
        _isMember[member] = true;
        _members.push(member);
        joinedAt[member] = block.timestamp;
        referrerOf[member] = referrer;
        depth[member] = memberDepth;
        if (memberDepth > maxDepth) maxDepth = memberDepth;

        emit Joined(member, referrer, memberDepth);

        // Interactions: pull the fee, then forward the burn share.
        token.safeTransferFrom(member, address(this), JOIN_FEE);
        token.safeTransfer(BURN_ADDRESS, burnAmount);
    }

    /// @notice Withdraw the caller's whole claimable balance.
    function claim() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NothingToClaim(msg.sender);

        claimable[msg.sender] = 0;
        totalClaimable -= amount;

        emit Claimed(msg.sender, amount);

        token.safeTransfer(msg.sender, amount);
    }

    /// @notice Forward any INVT that reached this contract outside `join` to the burn address.
    ///         Such tokens belong to nobody and could never be claimed; burning them restores
    ///         the invariant `balance == totalClaimable`. Anyone may call this. It can never
    ///         touch referral credit.
    function burnExcess() external nonReentrant {
        uint256 balance = token.balanceOf(address(this));
        uint256 owed = totalClaimable;
        if (balance <= owed) revert NoExcess();

        uint256 excess = balance - owed;
        emit ExcessBurned(excess);
        token.safeTransfer(BURN_ADDRESS, excess);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice True if `account` has joined.
    function isMember(address account) external view returns (bool) {
        return _isMember[account];
    }

    /// @notice Number of members on the list.
    function memberCount() external view returns (uint256) {
        return _members.length;
    }

    /// @notice Member at `index` in join order.
    function memberAt(uint256 index) external view returns (address) {
        uint256 count = _members.length;
        if (index >= count) revert IndexOutOfBounds(index, count);
        return _members[index];
    }

    /// @notice Members in join order from `start` (inclusive), at most `limit` entries.
    ///         Returns an empty array when `start` is past the end. Intended for paged reads
    ///         from a frontend.
    function members(uint256 start, uint256 limit) external view returns (address[] memory page) {
        uint256 count = _members.length;
        if (start >= count) return page;
        uint256 remaining = count - start;
        uint256 size = limit < remaining ? limit : remaining;
        uint256 end = start + size;
        page = new address[](size);
        for (uint256 i = start; i < end; ++i) {
            page[i - start] = _members[i];
        }
    }
}
