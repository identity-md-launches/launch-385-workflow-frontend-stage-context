// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script} from "forge-std/Script.sol";
import {LaunchToken} from "../src/LaunchToken.sol";
import {ReferralList} from "../src/ReferralList.sol";

/// @title Local deployment helper
/// @notice On Sepolia the project factory deploys both contracts from launch.json; this script
///         exists only for local Anvil runs and for tests of the deployment wiring. It takes no
///         environment configuration: the token has no arguments and ReferralList takes only the
///         token address.
contract DeployScript is Script {
    /// @notice Deploys the token and then ReferralList wired to it. Callable directly from tests.
    function deploy() public returns (LaunchToken token, ReferralList list) {
        token = new LaunchToken();
        list = new ReferralList(address(token));
    }

    /// @notice Broadcast entry point for a local node. Never used against Sepolia: the factory
    ///         is the deployer there.
    function run() external returns (LaunchToken token, ReferralList list) {
        vm.startBroadcast();
        (token, list) = deploy();
        vm.stopBroadcast();
    }
}
