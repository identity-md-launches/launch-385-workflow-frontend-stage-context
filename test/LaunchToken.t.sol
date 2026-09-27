// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {LaunchToken} from "../src/LaunchToken.sol";

contract LaunchTokenTest is Test {
    uint256 internal constant SUPPLY = 1_000_000_000e18;

    address internal deployer = makeAddr("deployer");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    LaunchToken internal token;

    function setUp() public {
        vm.prank(deployer);
        token = new LaunchToken();
    }

    function test_metadata() public view {
        assertEq(token.name(), "Invite");
        assertEq(token.symbol(), "INVT");
        assertEq(token.decimals(), 18);
    }

    function test_supplyIsExactlyOneBillionMintedToDeployer() public view {
        assertEq(SUPPLY, 10 ** 27, "supply constant");
        assertEq(token.TOTAL_SUPPLY(), SUPPLY);
        assertEq(token.totalSupply(), SUPPLY);
        assertEq(token.balanceOf(deployer), SUPPLY);
    }

    function test_transferMovesExactAmount() public {
        vm.prank(deployer);
        assertTrue(token.transfer(alice, 1_234e18));
        assertEq(token.balanceOf(alice), 1_234e18);
        assertEq(token.balanceOf(deployer), SUPPLY - 1_234e18);
        assertEq(token.totalSupply(), SUPPLY);
    }

    function test_transferMoreThanBalanceReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, alice, 0, 1));
        token.transfer(bob, 1);
    }

    function test_approveAndTransferFrom() public {
        vm.prank(deployer);
        token.transfer(alice, 500e18);

        vm.prank(alice);
        token.approve(bob, 200e18);
        assertEq(token.allowance(alice, bob), 200e18);

        vm.prank(bob);
        assertTrue(token.transferFrom(alice, bob, 150e18));
        assertEq(token.balanceOf(bob), 150e18);
        assertEq(token.balanceOf(alice), 350e18);
        assertEq(token.allowance(alice, bob), 50e18);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, bob, 50e18, 51e18));
        token.transferFrom(alice, bob, 51e18);
    }

    function test_noMintOrAdminSelectorsChangeSupply() public {
        string[8] memory signatures = [
            "mint(address,uint256)",
            "mint(uint256)",
            "burn(uint256)",
            "transferOwnership(address)",
            "upgradeTo(address)",
            "initialize(address)",
            "pause()",
            "setMinter(address)"
        ];
        for (uint256 i; i < signatures.length; ++i) {
            vm.prank(deployer);
            (bool ok,) = address(token).call(abi.encodeWithSignature(signatures[i], deployer, uint256(1)));
            assertFalse(ok, signatures[i]);
            assertEq(token.totalSupply(), SUPPLY, signatures[i]);
        }
    }

    function test_runtimeHasNoDelegatecallCallcodeOrSelfdestruct() public view {
        bytes memory code = address(token).code;
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

    function testFuzz_transferConservesSupply(uint256 amount) public {
        amount = bound(amount, 0, SUPPLY);
        vm.prank(deployer);
        token.transfer(alice, amount);
        assertEq(token.balanceOf(alice) + token.balanceOf(deployer), SUPPLY);
    }
}
