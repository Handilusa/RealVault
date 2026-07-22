// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC — ERC-20 de depósito para simular USDC en ETH Sepolia
contract MockUSDC is ERC20 {
    address public owner;

    constructor() ERC20("Mock USDC", "mUSDC") {
        owner = msg.sender;
        // Mint inicial de 1,000,000 mUSDC al deployer para pruebas
        _mint(msg.sender, 1_000_000 * 10**decimals());
    }

    /// @notice Permite a cualquiera obtener mUSDC para pruebas en testnet (faucet)
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
