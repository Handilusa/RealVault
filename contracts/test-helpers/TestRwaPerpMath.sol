// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {Nox, euint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import {RwaPerpTypes} from "../RwaPerpTypes.sol";
import {RwaPerpMath} from "../RwaPerpMath.sol";

/// @title TestRwaPerpMath — Test Wrapper for RwaPerpMath Library
/// @notice Exposes internal library functions for testing
/// @dev This contract is ONLY for testing purposes and should NOT be deployed to production
contract TestRwaPerpMath {
    /// @notice Test wrapper for _calculatePnL function
    /// @dev Exposes internal pure function for unit and property-based testing
    /// @param pos Position struct with entry price, leverage, and direction
    /// @param exitPriceE8 Exit price in 8 decimal precision
    /// @return pnlScalar Profit/loss percentage in basis points (positive = profit, negative = loss)
    function testCalculatePnL(
        RwaPerpTypes.Position memory pos,
        uint256 exitPriceE8
    ) external pure returns (int256 pnlScalar) {
        return RwaPerpMath._calculatePnL(pos, exitPriceE8);
    }

    /// @notice Test wrapper for _scaledAmount function
    /// @dev Exposes internal function for testing encrypted amount scaling
    /// @param baseHandle Encrypted amount to scale
    /// @param scalarE8 Plaintext scalar in basis points (8 decimals)
    /// @return Resulting euint256 handle after scaling
    /// @custom:phase-two Phase 2 implementation - returns unmodified handle (stub)
    function testScaledAmount(
        euint256 baseHandle,
        uint256 scalarE8
    ) external view returns (euint256) {
        return RwaPerpMath._scaledAmount(baseHandle, scalarE8);
    }
}
