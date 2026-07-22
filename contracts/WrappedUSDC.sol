// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {ERC20ToERC7984Wrapper} from "@iexec-nox/nox-confidential-contracts/contracts/token/extensions/ERC20ToERC7984Wrapper.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title WrappedUSDC — Convierte mUSDC (ERC-20 público) en wcUSDC (ERC-7984 confidencial)
contract WrappedUSDC is ERC20ToERC7984Wrapper {
    constructor(IERC20 underlyingUsdc)
        ERC20ToERC7984Wrapper("Wrapped Confidential USDC", "wcUSDC", "", underlyingUsdc)
    {}
}
