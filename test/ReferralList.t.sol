// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {LaunchToken} from "../src/LaunchToken.sol";
import {ReferralList} from "../src/ReferralList.sol";
import {DeployScript} from "../script/Deploy.s.sol";
import {ReenteringToken} from "./mocks/ReenteringToken.sol";

/// @dev Attacker contract used for the re-entrancy tests. It is a member/referrer and, when
///      called back by the hostile token during a payout, tries to call ReferralList again.
contract Reenterer {
    ReferralList internal immutable list;
    bytes internal reenterCall;
    uint256 public reentered;

    constructor(ReferralList list_) {
        list = list_;
    }

    function setReenterCall(bytes calldata data) external {
        reenterCall = data;
    }

    function approveList(address token, uint256 amount) external {
        LaunchToken(token).approve(address(list), amount);
    }

    function join(address referrer) external {
        list.join(referrer);
    }

    function claim() external {
        list.claim();
    }

    function reenter() external {
        reentered += 1;
        (bool ok,) = address(list).call(reenterCall);
        require(ok, "reentrant call rejected");
    }
}

contract ReferralListTest is Test {
    uint256 internal constant FEE = 1_000e18;
    uint256 internal constant REF_SHARE = 200e18;
    uint256 internal constant BURN_WITH_REF = 800e18;
    address internal constant DEAD = 0x000000000000000000000000000000000000dEaD;

    address internal factory = makeAddr("factory");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal dave = makeAddr("dave");
    address internal erin = makeAddr("erin");
    address internal frank = makeAddr("frank");

    LaunchToken internal token;
    ReferralList internal list;

    event Joined(address indexed member, address indexed referrer, uint256 depth);
    event Claimed(address indexed referrer, uint256 amount);
    event ExcessBurned(uint256 amount);

    function setUp() public {
        // The factory deploys both, exactly as on Sepolia: the token mints to the factory, and
        // ReferralList receives only the token address.
        vm.startPrank(factory);
        token = new LaunchToken();
        list = new ReferralList(address(token));
        vm.stopPrank();

        address[6] memory users = [alice, bob, carol, dave, erin, frank];
        for (uint256 i; i < users.length; ++i) {
            vm.prank(factory);
            token.transfer(users[i], 10_000e18);
        }
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    function _approveAndJoin(address who, address referrer) internal {
        vm.startPrank(who);
        token.approve(address(list), FEE);
        list.join(referrer);
        vm.stopPrank();
    }

    function _assertBalanceInvariant() internal view {
        assertEq(token.balanceOf(address(list)), list.totalClaimable(), "balance != totalClaimable");
    }

    // ---------------------------------------------------------------------
    // Deployment
    // ---------------------------------------------------------------------

    function test_constructorStoresTokenAndHoldsNothing() public view {
        assertEq(address(list.token()), address(token));
        assertEq(token.balanceOf(address(list)), 0);
        assertEq(address(list).balance, 0);
        assertEq(list.memberCount(), 0);
        assertEq(list.maxDepth(), 0);
        assertEq(list.totalClaimable(), 0);
        assertEq(list.JOIN_FEE(), FEE);
        assertEq(list.REFERRER_SHARE(), REF_SHARE);
        assertEq(list.BURN_SHARE_WITH_REFERRER(), BURN_WITH_REF);
        assertEq(list.BURN_ADDRESS(), DEAD);
    }

    function test_constructorRejectsZeroToken() public {
        vm.expectRevert(ReferralList.ZeroToken.selector);
        new ReferralList(address(0));
    }

    function test_deployScriptWiresTokenIntoList() public {
        DeployScript script = new DeployScript();
        (LaunchToken t, ReferralList l) = script.deploy();
        assertEq(address(l.token()), address(t));
        assertEq(t.balanceOf(address(script)), t.TOTAL_SUPPLY());
        assertEq(t.balanceOf(address(l)), 0);
    }

    function test_contractRejectsEth() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool ok,) = address(list).call{value: 1 ether}("");
        assertFalse(ok, "plain ETH transfer must fail");
        vm.prank(alice);
        (ok,) = address(list).call{value: 1 ether}(abi.encodeWithSignature("join(address)", address(0)));
        assertFalse(ok, "ETH with a call must fail");
        assertEq(address(list).balance, 0);
    }

    function test_runtimeHasNoForbiddenOpcodesAndFitsEip170() public view {
        bytes memory code = address(list).code;
        assertGt(code.length, 0);
        assertLe(code.length, 24_576);
        for (uint256 i; i < code.length; ++i) {
            uint8 op = uint8(code[i]);
            if (op >= 0x60 && op <= 0x7f) {
                i += op - 0x5f;
                continue;
            }
            assertTrue(op != 0xf4 && op != 0xf2 && op != 0xff, "forbidden opcode");
        }
    }

    // ---------------------------------------------------------------------
    // join: success paths and exact splits
    // ---------------------------------------------------------------------

    function test_joinWithoutReferrerBurnsWholeFee() public {
        uint256 deadBefore = token.balanceOf(DEAD);
        vm.warp(1_700_000_000);

        vm.startPrank(alice);
        token.approve(address(list), FEE);
        vm.expectEmit(true, true, true, true, address(list));
        emit Joined(alice, address(0), 0);
        list.join(address(0));
        vm.stopPrank();

        assertEq(token.balanceOf(alice), 10_000e18 - FEE, "joiner paid exactly the fee");
        assertEq(token.balanceOf(DEAD) - deadBefore, FEE, "whole fee burned");
        assertEq(token.balanceOf(address(list)), 0, "list holds nothing");
        assertEq(list.totalClaimable(), 0);

        assertTrue(list.isMember(alice));
        assertEq(list.joinedAt(alice), 1_700_000_000);
        assertEq(list.referrerOf(alice), address(0));
        assertEq(list.depth(alice), 0);
        assertEq(list.referralCount(alice), 0);
        assertEq(list.memberCount(), 1);
        assertEq(list.memberAt(0), alice);
        assertEq(list.maxDepth(), 0);
        _assertBalanceInvariant();
    }

    function test_joinWithReferrerSplits200And800() public {
        _approveAndJoin(alice, address(0));
        uint256 deadBefore = token.balanceOf(DEAD);

        vm.startPrank(bob);
        token.approve(address(list), FEE);
        vm.expectEmit(true, true, true, true, address(list));
        emit Joined(bob, alice, 1);
        list.join(alice);
        vm.stopPrank();

        assertEq(token.balanceOf(bob), 10_000e18 - FEE, "joiner paid exactly the fee");
        assertEq(token.balanceOf(DEAD) - deadBefore, BURN_WITH_REF, "800 burned");
        assertEq(list.claimable(alice), REF_SHARE, "200 credited");
        assertEq(token.balanceOf(address(list)), REF_SHARE, "list holds the credit");
        assertEq(list.totalClaimable(), REF_SHARE);
        assertEq(token.balanceOf(alice), 10_000e18 - FEE, "referrer not paid until claim");

        assertEq(list.referrerOf(bob), alice);
        assertEq(list.depth(bob), 1);
        assertEq(list.referralCount(alice), 1);
        assertEq(list.memberCount(), 2);
        assertEq(list.memberAt(1), bob);
        assertEq(list.maxDepth(), 1);
        _assertBalanceInvariant();
    }

    function test_feeSplitSumsToFee() public pure {
        assertEq(REF_SHARE + BURN_WITH_REF, FEE);
        assertEq(REF_SHARE * 5, FEE, "referrer share is exactly 20%");
    }

    function test_multipleReferralsAccumulateCredit() public {
        _approveAndJoin(alice, address(0));
        _approveAndJoin(bob, alice);
        _approveAndJoin(carol, alice);
        _approveAndJoin(dave, alice);

        assertEq(list.claimable(alice), 3 * REF_SHARE);
        assertEq(list.referralCount(alice), 3);
        assertEq(list.totalClaimable(), 3 * REF_SHARE);
        assertEq(list.maxDepth(), 1);
        _assertBalanceInvariant();
    }

    function test_fiveLevelChainGivesDepthsZeroToFour() public {
        _approveAndJoin(alice, address(0));
        _approveAndJoin(bob, alice);
        _approveAndJoin(carol, bob);
        _approveAndJoin(dave, carol);
        _approveAndJoin(erin, dave);

        assertEq(list.depth(alice), 0);
        assertEq(list.depth(bob), 1);
        assertEq(list.depth(carol), 2);
        assertEq(list.depth(dave), 3);
        assertEq(list.depth(erin), 4);
        assertEq(list.maxDepth(), 4);

        // A later shallow join must not lower maxDepth.
        _approveAndJoin(frank, alice);
        assertEq(list.depth(frank), 1);
        assertEq(list.maxDepth(), 4);

        // Each intermediate referrer got exactly one 200 INVT credit.
        assertEq(list.claimable(alice), 2 * REF_SHARE);
        assertEq(list.claimable(bob), REF_SHARE);
        assertEq(list.claimable(carol), REF_SHARE);
        assertEq(list.claimable(dave), REF_SHARE);
        assertEq(list.claimable(erin), 0);
        assertEq(list.totalClaimable(), 5 * REF_SHARE);
        assertEq(list.memberCount(), 6);
        _assertBalanceInvariant();
    }

    function test_membersEnumeration() public {
        _approveAndJoin(alice, address(0));
        _approveAndJoin(bob, alice);
        _approveAndJoin(carol, alice);

        address[] memory all = list.members(0, 10);
        assertEq(all.length, 3);
        assertEq(all[0], alice);
        assertEq(all[1], bob);
        assertEq(all[2], carol);

        address[] memory page = list.members(1, 1);
        assertEq(page.length, 1);
        assertEq(page[0], bob);

        assertEq(list.members(3, 5).length, 0);
        assertEq(list.members(1, type(uint256).max).length, 2);

        vm.expectRevert(abi.encodeWithSelector(ReferralList.IndexOutOfBounds.selector, 3, 3));
        list.memberAt(3);
    }

    // ---------------------------------------------------------------------
    // join: failure paths
    // ---------------------------------------------------------------------

    function test_joinRevertsWhenReferrerNotOnList() public {
        vm.startPrank(alice);
        token.approve(address(list), FEE);
        vm.expectRevert(abi.encodeWithSelector(ReferralList.ReferrerNotMember.selector, bob));
        list.join(bob);
        vm.stopPrank();

        assertFalse(list.isMember(alice));
        assertEq(token.balanceOf(alice), 10_000e18, "nothing pulled on revert");
    }

    function test_joinRevertsOnDoubleJoin() public {
        _approveAndJoin(alice, address(0));
        _approveAndJoin(bob, address(0));

        vm.startPrank(alice);
        token.approve(address(list), FEE);
        vm.expectRevert(abi.encodeWithSelector(ReferralList.AlreadyJoined.selector, alice));
        list.join(address(0));
        // Also with a valid referrer: membership is checked before anything else.
        vm.expectRevert(abi.encodeWithSelector(ReferralList.AlreadyJoined.selector, alice));
        list.join(bob);
        vm.stopPrank();

        assertEq(list.memberCount(), 2);
        assertEq(token.balanceOf(alice), 10_000e18 - FEE, "paid only once");
    }

    function test_joinRevertsOnSelfReferral() public {
        vm.startPrank(alice);
        token.approve(address(list), FEE);
        vm.expectRevert(ReferralList.SelfReferral.selector);
        list.join(alice);
        vm.stopPrank();
        assertFalse(list.isMember(alice));
    }

    function test_joinRevertsWithoutApproval() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(list), 0, FEE));
        list.join(address(0));
        assertFalse(list.isMember(alice));
        assertEq(list.memberCount(), 0);
    }

    function test_joinRevertsWithInsufficientBalance() public {
        address poor = makeAddr("poor");
        vm.prank(factory);
        token.transfer(poor, FEE - 1);

        vm.startPrank(poor);
        token.approve(address(list), FEE);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, poor, FEE - 1, FEE));
        list.join(address(0));
        vm.stopPrank();
        assertFalse(list.isMember(poor));
    }

    function test_burnAddressCannotBeReferrerUnlessItJoined() public {
        vm.startPrank(alice);
        token.approve(address(list), FEE);
        vm.expectRevert(abi.encodeWithSelector(ReferralList.ReferrerNotMember.selector, DEAD));
        list.join(DEAD);
        vm.stopPrank();
    }

    function test_cyclesAreImpossible() public {
        // Any referrer must already be a member and any joiner must not be, so walking
        // referrerOf from any member strictly decreases depth until it hits address(0).
        _approveAndJoin(alice, address(0));
        _approveAndJoin(bob, alice);
        _approveAndJoin(carol, bob);

        address cursor = carol;
        uint256 steps;
        while (cursor != address(0)) {
            address next = list.referrerOf(cursor);
            if (next != address(0)) assertEq(list.depth(next) + 1, list.depth(cursor));
            cursor = next;
            ++steps;
        }
        assertEq(steps, 3);
    }

    // ---------------------------------------------------------------------
    // claim
    // ---------------------------------------------------------------------

    function test_claimPaysWholeBalanceAndTwiceRevertsSecondTime() public {
        _approveAndJoin(alice, address(0));
        _approveAndJoin(bob, alice);
        _approveAndJoin(carol, alice);
        uint256 aliceBefore = token.balanceOf(alice);

        vm.expectEmit(true, true, true, true, address(list));
        emit Claimed(alice, 2 * REF_SHARE);
        vm.prank(alice);
        list.claim();

        assertEq(token.balanceOf(alice) - aliceBefore, 2 * REF_SHARE, "paid once, in full");
        assertEq(list.claimable(alice), 0);
        assertEq(list.totalClaimable(), 0);
        assertEq(token.balanceOf(address(list)), 0);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ReferralList.NothingToClaim.selector, alice));
        list.claim();
        assertEq(token.balanceOf(alice) - aliceBefore, 2 * REF_SHARE, "second claim paid nothing");
        _assertBalanceInvariant();
    }

    function test_claimByNonReferrerReverts() public {
        _approveAndJoin(alice, address(0));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ReferralList.NothingToClaim.selector, alice));
        list.claim();

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ReferralList.NothingToClaim.selector, bob));
        list.claim();
    }

    function test_claimOnlyPaysCallerNotOthers() public {
        _approveAndJoin(alice, address(0));
        _approveAndJoin(bob, alice);
        _approveAndJoin(carol, bob);

        vm.prank(alice);
        list.claim();
        assertEq(list.claimable(bob), REF_SHARE, "bob's credit untouched");
        assertEq(token.balanceOf(address(list)), REF_SHARE);
        _assertBalanceInvariant();
    }

    function test_creditKeepsAccruingAfterClaim() public {
        _approveAndJoin(alice, address(0));
        _approveAndJoin(bob, alice);
        vm.prank(alice);
        list.claim();

        _approveAndJoin(carol, alice);
        assertEq(list.claimable(alice), REF_SHARE);
        vm.prank(alice);
        list.claim();
        assertEq(token.balanceOf(alice), 10_000e18 - FEE + 2 * REF_SHARE);
        _assertBalanceInvariant();
    }

    // ---------------------------------------------------------------------
    // Re-entrancy
    // ---------------------------------------------------------------------

    function test_claimReentrancyIsBlockedByGuard() public {
        // INVT has no transfer hooks, so this uses a hostile token to prove the guard holds
        // even against a token that calls back during the payout.
        ReenteringToken hostile = new ReenteringToken();
        ReferralList hostileList = new ReferralList(address(hostile));
        Reenterer attacker = new Reenterer(hostileList);
        hostile.transfer(address(attacker), FEE);
        hostile.transfer(bob, FEE);

        attacker.approveList(address(hostile), FEE);
        attacker.join(address(0));
        vm.startPrank(bob);
        hostile.approve(address(hostileList), FEE);
        hostileList.join(address(attacker));
        vm.stopPrank();
        assertEq(hostileList.claimable(address(attacker)), REF_SHARE);

        hostile.setAttacker(address(attacker));
        attacker.setReenterCall(abi.encodeWithSelector(ReferralList.claim.selector));

        // The inner claim hits the guard, the attacker's callback reverts, and the whole outer
        // claim unwinds: the credit stays intact and nothing is paid.
        vm.expectRevert("reentrant call rejected");
        attacker.claim();
        assertEq(hostileList.claimable(address(attacker)), REF_SHARE, "credit intact after failed attack");
        assertEq(hostile.balanceOf(address(hostileList)), REF_SHARE);
        assertEq(hostileList.totalClaimable(), REF_SHARE);
    }

    function test_joinReentrancyDuringClaimIsBlocked() public {
        ReenteringToken hostile = new ReenteringToken();
        ReferralList hostileList = new ReferralList(address(hostile));
        Reenterer attacker = new Reenterer(hostileList);
        hostile.transfer(address(attacker), 2 * FEE);
        hostile.transfer(bob, FEE);

        attacker.approveList(address(hostile), 2 * FEE);
        attacker.join(address(0));
        vm.startPrank(bob);
        hostile.approve(address(hostileList), FEE);
        hostileList.join(address(attacker));
        vm.stopPrank();

        hostile.setAttacker(address(attacker));
        attacker.setReenterCall(abi.encodeWithSelector(ReferralList.join.selector, address(0)));

        vm.expectRevert("reentrant call rejected");
        attacker.claim();
        assertEq(hostileList.memberCount(), 2);
    }

    function test_guardSelectorIsWhatBlocksTheReentry() public {
        // Direct proof that the inner call reverts with ReentrancyGuardReentrantCall by making the
        // attacker swallow the failure and record it.
        ReenteringToken hostile = new ReenteringToken();
        ReferralList hostileList = new ReferralList(address(hostile));
        SwallowingReenterer attacker = new SwallowingReenterer(hostileList);
        hostile.transfer(address(attacker), FEE);
        hostile.transfer(bob, FEE);

        attacker.approveList(address(hostile), FEE);
        attacker.join(address(0));
        vm.startPrank(bob);
        hostile.approve(address(hostileList), FEE);
        hostileList.join(address(attacker));
        vm.stopPrank();
        hostile.setAttacker(address(attacker));

        attacker.claim();
        assertEq(attacker.reentered(), 1);
        assertEq(bytes4(attacker.lastError()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(hostile.balanceOf(address(attacker)), REF_SHARE, "paid exactly once");
        assertEq(hostileList.claimable(address(attacker)), 0);
        assertEq(hostileList.totalClaimable(), 0);
    }

    // ---------------------------------------------------------------------
    // Stranded tokens
    // ---------------------------------------------------------------------

    function test_burnExcessForwardsOnlyUnsolicitedTokens() public {
        _approveAndJoin(alice, address(0));
        _approveAndJoin(bob, alice);

        vm.prank(carol);
        token.transfer(address(list), 5e18);
        assertEq(token.balanceOf(address(list)), REF_SHARE + 5e18);
        assertGt(token.balanceOf(address(list)), list.totalClaimable(), "invariant broken by direct transfer");

        uint256 deadBefore = token.balanceOf(DEAD);
        vm.expectEmit(true, true, true, true, address(list));
        emit ExcessBurned(5e18);
        vm.prank(dave);
        list.burnExcess();

        assertEq(token.balanceOf(DEAD) - deadBefore, 5e18);
        assertEq(list.claimable(alice), REF_SHARE, "credit untouched");
        _assertBalanceInvariant();

        vm.prank(alice);
        list.claim();
        assertEq(token.balanceOf(address(list)), 0);
    }

    function test_burnExcessRevertsWhenNothingIsStranded() public {
        _approveAndJoin(alice, address(0));
        _approveAndJoin(bob, alice);
        vm.expectRevert(ReferralList.NoExcess.selector);
        list.burnExcess();
        assertEq(list.claimable(alice), REF_SHARE);
    }

    // ---------------------------------------------------------------------
    // Fuzz: conservation
    // ---------------------------------------------------------------------

    function testFuzz_conservationAcrossRandomJoinsAndClaims(uint256 seed) public {
        address[6] memory users = [alice, bob, carol, dave, erin, frank];
        uint256 deadBefore = token.balanceOf(DEAD);
        uint256 paidIn;
        uint256 paidOut;

        for (uint256 i; i < users.length; ++i) {
            address who = users[i];
            uint256 r = uint256(keccak256(abi.encode(seed, i)));
            address referrer = address(0);
            uint256 count = list.memberCount();
            if (count > 0 && r % 3 != 0) referrer = list.memberAt(r % count);

            _approveAndJoin(who, referrer);
            paidIn += FEE;
            _assertBalanceInvariant();

            if (referrer != address(0) && (r >> 8) % 2 == 0) {
                uint256 before = token.balanceOf(referrer);
                vm.prank(referrer);
                list.claim();
                paidOut += token.balanceOf(referrer) - before;
                _assertBalanceInvariant();
            }
        }

        uint256 burned = token.balanceOf(DEAD) - deadBefore;
        assertEq(paidIn, burned + paidOut + list.totalClaimable(), "every unit is burned, paid or claimable");
        assertEq(list.memberCount(), users.length);
        assertLe(list.maxDepth(), users.length - 1);
    }
}

/// @dev Variant that records the inner failure instead of bubbling it, so the test can inspect
///      the exact error the guard produced.
contract SwallowingReenterer {
    ReferralList internal immutable list;
    uint256 public reentered;
    bytes public lastError;

    constructor(ReferralList list_) {
        list = list_;
    }

    function approveList(address token, uint256 amount) external {
        LaunchToken(token).approve(address(list), amount);
    }

    function join(address referrer) external {
        list.join(referrer);
    }

    function claim() external {
        list.claim();
    }

    function reenter() external {
        reentered += 1;
        (bool ok, bytes memory err) = address(list).call(abi.encodeWithSelector(ReferralList.claim.selector));
        require(!ok, "reentry unexpectedly succeeded");
        lastError = err;
    }
}
