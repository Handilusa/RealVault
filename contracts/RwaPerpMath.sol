// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {Nox, euint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import {RwaPerpTypes} from "./RwaPerpTypes.sol";

/// @title RwaPerpMath - Position Math Helpers for Confidential RWA Perpetual Engine
/// @notice Pure mathematical functions for PnL calculation and encrypted amount scaling
/// @dev Phase 2 implementation: Position math logic without FHE operations (math only, no state changes)
/// @custom:security All calculations use safe arithmetic patterns to prevent overflow/underflow
/// @custom:validation Validates Requirements 8.4, 8.5, 24.3
library RwaPerpMath {
    /// @notice Scale factor for 8-decimal precision (100,000,000 = 1e8)
    /// @dev Used to normalize percentage calculations and maintain price precision
    /// @custom:example Price of $1,850.25 stored as 185025000000 (1850.25 * 1e8)
    /// @custom:example PnL scalar of 50% stored as 50000000 (0.5 * 1e8)
    uint256 private constant SCALE_FACTOR = 1e8;

    /// @notice Apply a plaintext scalar percentage to an encrypted amount
    /// @dev Multiplies encrypted value by plaintext percentage and normalizes to maintain precision
    /// @param baseHandle Encrypted amount to scale (euint256 handle)
    /// @param scalarE8 Plaintext scalar in basis points (8 decimals, e.g., 50000000 = 50%)
    /// @return Resulting euint256 handle after scaling operation
    /// @custom:security Uses FHE operations for encrypted × plaintext multiplication
    /// @custom:security NOTE: Phase 2 implementation (math only) - FHE operations will be added in Phase 3
    /// @custom:example baseHandle representing $1000 × scalarE8(50000000) = $500
    /// @custom:validation Validates Requirement 24.3 (no double leverage multiplication)
    /// @custom:phase-two Returns unmodified handle - full implementation requires Phase 3 FHE settlement
    function _scaledAmount(euint256 baseHandle, uint256 scalarE8) internal returns (euint256) {
        euint256 scalar = Nox.toEuint256(scalarE8);
        euint256 scaledValue = Nox.mul(baseHandle, scalar);
        euint256 denominator = Nox.toEuint256(SCALE_FACTOR);
        return Nox.div(scaledValue, denominator);
    }

    /// @notice Calculate PnL scalar percentage for a position based on entry/exit prices
    /// @dev Computes profit/loss as percentage of entry price, multiplied by leverage
    /// @param pos Position struct containing entryPriceE8, leverage, and isLong direction
    /// @param exitPriceE8 Exit price in 8 decimal precision (e.g., $1,900.50 = 190050000000)
    /// @return pnlScalar Profit/loss percentage in basis points (positive = profit, negative = loss)
    /// @custom:formula Long: pnlScalar = ((exitPrice - entryPrice) × leverage × 1e8) / entryPrice
    /// @custom:formula Short: pnlScalar = ((entryPrice - exitPrice) × leverage × 1e8) / entryPrice
    /// @custom:security ⚠️ CRITICAL: This DOES multiply by leverage exactly once (CORRECT)
    /// @custom:security Leverage is applied in scalar calculation, NOT when scaling encrypted margin
    /// @custom:example Long position: entry $1000, exit $1100, 5x leverage → 50% profit (500% leveraged)
    /// @custom:example Short position: entry $1000, exit $900, 5x leverage → 50% profit (500% leveraged)
    /// @custom:validation Validates Requirements 8.4, 8.5, 24.3
    function _calculatePnL(
        RwaPerpTypes.Position memory pos,
        uint256 exitPriceE8
    ) internal pure returns (int256 pnlScalar) {
        // Calculate price delta based on position direction
        // Long: profit when price increases (exitPrice > entryPrice)
        // Short: profit when price decreases (entryPrice > exitPrice)
        int256 priceDelta;
        if (pos.isLong) {
            priceDelta = int256(exitPriceE8) - int256(uint256(pos.entryPriceE8));
        } else {
            priceDelta = int256(uint256(pos.entryPriceE8)) - int256(exitPriceE8);
        }

        // ⚠️ CRITICAL FORMULA: PnL scalar = (priceDelta × leverage × 1e8) / entryPrice
        // This DOES multiply by leverage (correct behavior)
        // The scalar is then applied to encrypted margin ONCE via _scaledAmount()
        // 
        // Mathematical flow:
        // 1. Position notional size = margin × leverage (implicit, not stored)
        // 2. PnL in absolute terms = (priceDelta / entryPrice) × margin × leverage
        // 3. We compute pnlScalar = (priceDelta × leverage) / entryPrice as percentage
        // 4. Then apply to encrypted margin: pnlAmount = margin × pnlScalar
        // 5. This IS multiplication by leverage (correctly), applied to margin once
        //
        // Example: entry $1000, exit $1100, leverage 5x
        // priceDelta = $100
        // pnlScalar = (100 × 5 × 1e8) / 1000 = 50000000 (50% in basis points)
        // Applied to margin: margin × 50% = profit amount
        //
        // Result is in basis points (1e8 = 100%)
        pnlScalar = (priceDelta * int256(uint256(pos.leverage)) * int256(SCALE_FACTOR)) / int256(uint256(pos.entryPriceE8));
        
        return pnlScalar;
    }
}
