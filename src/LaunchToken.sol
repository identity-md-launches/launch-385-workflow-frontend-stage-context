// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title Invite (INVT) launch token
/// @notice Fixed-supply ERC-20 for the Invite project launch. The whole supply of
///         1,000,000,000 INVT (10^27 minor units, 18 decimals) is minted once to the
///         deployer, which is the project factory. There is no owner, no mint, no burn
///         entry point, no pause, no blocklist, no fee and no upgrade path.
/// @dev No constructor arguments: the factory deploys the creation code as-is and
///      expects to hold the entire supply afterwards.
contract LaunchToken is ERC20 {
    /// @notice Exactly one billion tokens in minor units.
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 10 ** 18;

    constructor() ERC20("Invite", "INVT") {
        _mint(msg.sender, TOTAL_SUPPLY);
    }
}
