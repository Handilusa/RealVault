// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {euint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

/// @title RwaPerpTypes — Data Structures for Confidential RWA Perpetual Engine
/// @notice Defines core data structures for managing synthetic perpetual positions on RWA assets
/// @dev Storage-optimized struct with encrypted margin and immutable price snapshots
library RwaPerpTypes {
    /// @notice Represents a perpetual position with encrypted collateral and verifiable price snapshots
    /// @dev Position struct with storage-efficient field packing for gas optimization
    /// @custom:security Margin remains encrypted on-chain as euint256 handle (never exposed as plaintext)
    /// @custom:verification Entry price snapshots (entryPriceE8, entryRoundOrNonce, entrySourceId) are immutable
    struct Position {
        /// @notice Asset identifier (e.g., keccak256("rGOLD"), keccak256("rUSTB"), keccak256("rCRE"))
        /// @dev Used to route oracle adapter queries and validate asset configuration
        bytes32 assetId;

        /// @notice Encrypted collateral handle (never decrypted on-chain)
        /// @dev euint256 handle managed by Nox FHE protocol for confidential margin operations
        /// @custom:security Only accessible to user + authorized auditors via ACL permissions
        euint256 marginHandle;

        /// @notice Immutable entry price snapshot in 8 decimal precision (e.g., $1,850.25 = 185025000000)
        /// @dev uint128 supports prices up to ~$3.4 trillion (sufficient for all RWA asset classes)
        /// @custom:verification Recorded at position opening, never modified
        uint128 entryPriceE8;

        /// @notice Immutable snapshot identifier at position entry
        /// @dev For Chainlink: roundId from latestRoundData()
        /// @dev For SignedNav: nonce from authorized publisher submission
        /// @custom:verification Used to verify price source authenticity and prevent post-hoc manipulation
        uint80 entryRoundOrNonce;

        /// @notice Immutable oracle source identifier at position entry
        /// @dev For Chainlink: bytes32(uint256(uint160(feedAddress)))
        /// @dev For SignedNav: keccak256(abi.encodePacked("SignedNAV", publisherAddress, methodologyId))
        /// @custom:verification Enables post-hoc audit of price source and methodology
        bytes32 entrySourceId;

        /// @notice Leverage multiplier (1x to 10x)
        /// @dev uint8 supports 0-255 (MAX_LEVERAGE = 10 enforced by RwaPerpEngine)
        /// @custom:pnl Position size = marginPlaintext × leverage (derived, not stored)
        /// @custom:pnl PnL calculation multiplies by leverage exactly once in scalar computation
        uint8 leverage;

        /// @notice Position open timestamp (block.timestamp at creation)
        /// @dev uint64 supports timestamps until year 584,942,417,355 (sufficient for all practical use)
        /// @custom:audit Used for compliance reporting and position lifecycle tracking
        uint64 openedAt;

        /// @notice Position direction flag
        /// @dev true = long (profit when price increases), false = short (profit when price decreases)
        bool isLong;

        /// @notice Position status flag
        /// @dev true = open (active position), false = closed (historical record)
        /// @custom:lifecycle Transitions: [Does not exist] → [Open: true] → [Closed: false]
        /// @custom:lifecycle No reopening of closed positions (unidirectional state machine)
        bool isOpen;
    }

    /// @notice Configuration parameters for each RWA asset in the registry
    /// @dev Used by RwaPerpEngine to store asset-specific oracle and validation parameters
    /// @custom:validation Validates Requirements 19.1, 19.4
    struct AssetConfig {
        /// @notice Unique asset identifier (e.g., keccak256("rGOLD"), keccak256("rUSTB"), keccak256("rCRE"))
        /// @dev Primary key for asset registry lookups
        /// @custom:example rGOLD = keccak256("rGOLD") = 0x1f6c...
        bytes32 assetId;

        /// @notice Human-readable asset symbol for UI display
        /// @dev UTF-8 string without whitespace (e.g., "rGOLD", "rUSTB", "rCRE")
        /// @custom:frontend Used in trading panel asset selector and position tables
        string symbol;

        /// @notice Address of IRwaPriceOracle implementation for this asset
        /// @dev Must implement IRwaPriceOracle interface with latestPrice(bytes32) function
        /// @custom:oracle ChainlinkRwaOracleAdapter for market-priced assets (rGOLD)
        /// @custom:oracle SignedNavOracleAdapter for NAV-priced (rUSTB) or appraisal-priced (rCRE) assets
        /// @custom:verification Address immutability enforced through admin-only updates with events
        address oracleAdapter;

        /// @notice Maximum age in seconds before price data is considered stale
        /// @dev Block.timestamp - updatedAt must be <= maxStaleness for settlement
        /// @custom:example Market-priced (rGOLD): 3600 seconds (1 hour heartbeat)
        /// @custom:example NAV-priced (rUSTB): 86400 seconds (24 hours)
        /// @custom:example Appraisal-priced (rCRE): 604800 seconds (7 days)
        /// @custom:validation Enforced by RwaPerpEngine before position open/close operations
        uint256 maxStaleness;

        /// @notice Description of valuation methodology matching real-world asset pricing
        /// @dev Human-readable string explaining oracle source and update frequency
        /// @custom:example "Chainlink XAU/USD with 1-hour heartbeat"
        /// @custom:example "SignedNAV from authorized T-Bill fund administrator, daily updates"
        /// @custom:example "Signed appraisal from authorized real estate valuator, weekly updates"
        /// @custom:compliance Enables transparent disclosure of pricing methodology for audit
        string valuationMethod;

        /// @notice Asset description for frontend UI display and investor disclosure
        /// @dev Human-readable description of underlying RWA economic exposure
        /// @custom:example "Tokenized gold backed by physical reserves"
        /// @custom:example "US Treasury Bill fund shares with NAV-based valuation"
        /// @custom:example "Commercial real estate fund shares with quarterly appraisals"
        /// @custom:compliance Provides investors with clear understanding of asset class characteristics
        string description;
    }
}
