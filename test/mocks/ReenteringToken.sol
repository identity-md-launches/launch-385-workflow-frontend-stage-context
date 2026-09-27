// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IReenterTarget {
    function reenter() external;
}

/// @notice A hostile ERC-20 used only in tests. On every transfer to a registered attacker it
///         calls back into the attacker, which then tries to re-enter ReferralList. INVT itself
///         has no hooks, so this models a token that could exist, not the launch token.
contract ReenteringToken is ERC20 {
    address public attacker;

    constructor() ERC20("Hostile", "HST") {
        _mint(msg.sender, 1_000_000_000e18);
    }

    function setAttacker(address attacker_) external {
        attacker = attacker_;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (to == attacker && attacker != address(0)) {
            IReenterTarget(attacker).reenter();
        }
    }
}
