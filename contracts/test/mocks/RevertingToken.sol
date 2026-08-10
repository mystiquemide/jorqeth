// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title RevertingToken — test double whose transfer can be toggled to fail
/// @notice Used only to prove settlement fails closed (no state corruption) when
///         the escrow token's transfer reverts. Not part of the product.
contract RevertingToken is ERC20 {
    bool public failTransfers;

    constructor() ERC20("Reverting", "RVT") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setFailTransfers(bool v) external {
        failTransfers = v;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        require(!failTransfers, "RVT: transfer disabled");
        return super.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        require(!failTransfers, "RVT: transfer disabled");
        return super.transferFrom(from, to, amount);
    }
}
