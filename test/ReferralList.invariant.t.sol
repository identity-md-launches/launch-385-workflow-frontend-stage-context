// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {LaunchToken} from "../src/LaunchToken.sol";
import {ReferralList} from "../src/ReferralList.sol";

/// @dev Drives ReferralList with random joins, claims, and unsolicited transfers. Reverts are
///      expected on invalid actions and are tolerated (fail_on_revert = false), but the handler
///      tracks what actually happened so the invariants can be exact.
contract ReferralListHandler is Test {
    LaunchToken public immutable token;
    ReferralList public immutable list;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    address[] public actors;
    uint256 public totalPaidIn;
    uint256 public totalClaimedOut;
    uint256 public totalStrandedBurned;
    uint256 public totalStranded;

    constructor(LaunchToken token_, ReferralList list_) {
        token = token_;
        list = list_;
        for (uint256 i; i < 12; ++i) {
            actors.push(makeAddr(string.concat("actor", vm.toString(i))));
        }
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function join(uint256 actorSeed, uint256 refSeed, bool useReferrer) external {
        address who = _actor(actorSeed);
        address referrer;
        if (useReferrer) {
            uint256 count = list.memberCount();
            referrer = count == 0 ? _actor(refSeed) : list.memberAt(refSeed % (count + 1));
            if (refSeed % (count + 1) == count) referrer = _actor(refSeed); // sometimes a non-member
        }
        vm.startPrank(who);
        token.approve(address(list), list.JOIN_FEE());
        try list.join(referrer) {
            totalPaidIn += list.JOIN_FEE();
        } catch {}
        vm.stopPrank();
    }

    function claim(uint256 actorSeed) external {
        address who = _actor(actorSeed);
        uint256 before = token.balanceOf(who);
        vm.prank(who);
        try list.claim() {
            totalClaimedOut += token.balanceOf(who) - before;
        } catch {}
    }

    function strand(uint256 actorSeed, uint256 amount) external {
        address who = _actor(actorSeed);
        amount = bound(amount, 1, 50e18);
        if (token.balanceOf(who) < amount) return;
        vm.prank(who);
        token.transfer(address(list), amount);
        totalStranded += amount;
    }

    function burnExcess() external {
        uint256 before = token.balanceOf(address(list));
        try list.burnExcess() {
            totalStrandedBurned += before - token.balanceOf(address(list));
        } catch {}
    }
}

contract ReferralListInvariantTest is Test {
    LaunchToken internal token;
    ReferralList internal list;
    ReferralListHandler internal handler;
    uint256 internal deadAtStart;

    function setUp() public {
        token = new LaunchToken();
        list = new ReferralList(address(token));
        handler = new ReferralListHandler(token, list);
        for (uint256 i; i < 12; ++i) {
            token.transfer(handler.actors(i), 20_000e18);
        }
        deadAtStart = token.balanceOf(handler.DEAD());
        targetContract(address(handler));
    }

    /// @notice The contract's INVT balance equals the sum of claimable balances plus whatever was
    ///         sent to it outside `join` and not yet burned.
    function invariant_balanceEqualsClaimablePlusStranded() public view {
        uint256 stranded = handler.totalStranded() - handler.totalStrandedBurned();
        assertEq(token.balanceOf(address(list)), list.totalClaimable() + stranded);
        // `totalClaimable` is the exact sum over every actor.
        uint256 sum;
        for (uint256 i; i < 12; ++i) {
            sum += list.claimable(handler.actors(i));
        }
        assertEq(sum, list.totalClaimable());
    }

    /// @notice Every unit paid as a join fee is burned, claimed, or still claimable.
    function invariant_feesAreBurnedClaimedOrClaimable() public view {
        uint256 burned = token.balanceOf(handler.DEAD()) - deadAtStart - handler.totalStrandedBurned();
        assertEq(handler.totalPaidIn(), burned + handler.totalClaimedOut() + list.totalClaimable());
    }

    /// @notice Membership structure: unique members, depth strictly derived from the referrer,
    ///         maxDepth is the true maximum, referral counts match referrerOf.
    function invariant_membershipStructure() public view {
        uint256 count = list.memberCount();
        uint256 observedMax;
        for (uint256 i; i < count; ++i) {
            address m = list.memberAt(i);
            assertTrue(list.isMember(m));
            assertGt(list.joinedAt(m), 0);
            address r = list.referrerOf(m);
            if (r == address(0)) {
                assertEq(list.depth(m), 0);
            } else {
                assertTrue(list.isMember(r));
                assertEq(list.depth(m), list.depth(r) + 1);
            }
            if (list.depth(m) > observedMax) observedMax = list.depth(m);
            for (uint256 j = i + 1; j < count; ++j) {
                assertTrue(list.memberAt(j) != m, "duplicate member");
            }
        }
        assertEq(list.maxDepth(), observedMax);

        for (uint256 i; i < 12; ++i) {
            address a = handler.actors(i);
            uint256 referred;
            for (uint256 k; k < count; ++k) {
                if (list.referrerOf(list.memberAt(k)) == a) ++referred;
            }
            assertEq(list.referralCount(a), referred);
        }
    }

    /// @notice The contract never holds ETH and the supply is untouched.
    function invariant_noEthAndFixedSupply() public view {
        assertEq(address(list).balance, 0);
        assertEq(token.totalSupply(), token.TOTAL_SUPPLY());
    }
}
