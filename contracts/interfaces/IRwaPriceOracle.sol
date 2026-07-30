// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IRwaPriceOracle
 * @notice Interface for RWA (Real World Asset) price oracle adapters
 * @dev This interface defines a pluggable oracle architecture that supports multiple
 * price verification methodologies appropriate for different RWA asset classes.
 *
 * ## Design Philosophy
 * Unlike cryptocurrency oracles that report market prices from CEXs/DEXs, RWA price
 * sources must match the real-world valuation methodology of the underlying asset:
 * - Market-priced assets (tokenized gold) → Real-time market feeds (Chainlink XAU/USD)
 * - NAV-based assets (private credit funds) → Signed NAV submissions from authorized publishers
 *
 * ## Expected Implementations
 * 1. **ChainlinkRwaOracleAdapter**: Wraps Chainlink Data Feeds for market-priced RWAs
 *    - Uses updatedAt and answeredInRound for staleness detection
 *    - Maps feed-specific confidence intervals to 0-100 scale
 *    - Example: rGOLD using XAU/USD feed with 1-hour heartbeat
 *
 * 2. **SignedNavOracleAdapter**: Validates ECDSA-signed NAV submissions
 *    - Verifies signature against authorized publisher address per asset
 *    - Uses publishedAt/validUntil window for settlement gating
 *    - Example: rCREDIT with fund administrator as authorized publisher
 *
 * ## Oracle Adapter Registry
 * The RwaPerpEngine maintains a mapping from assetId → oracle adapter address.
 * Each adapter implementation is responsible for:
 * - Fetching/storing price data appropriate to its verification methodology
 * - Performing staleness checks and returning settlementEnabled=false when stale
 * - Returning sourceId for audit trail (feed address, publisher hash, etc.)
 *
 * @custom:security-note Adapters MUST perform comprehensive validation before
 * returning settlementEnabled=true, as settlement cannot be reversed.
 */
interface IRwaPriceOracle {
    /**
     * @notice Retrieves the latest verified price for the specified RWA asset
     * @dev This function MUST NOT revert under normal conditions. If price data is
     * unavailable, stale, or unverified, return settlementEnabled=false instead.
     *
     * @param assetId Unique identifier for the RWA asset (e.g., keccak256("rGOLD"))
     *
     * @return priceE8 Asset price in 8 decimal precision (e.g., $1,850.50 = 185050000000)
     *         MUST be > 0 when returning valid price data
     *         Encoding: priceE8 = priceUSD × 10^8
     *
     * @return updatedAt Timestamp (block.timestamp) when price was last updated
     *         - For Chainlink: answeredInRound timestamp from latestRoundData()
     *         - For SignedNAV: publishedAt timestamp from signed submission
     *         Used for staleness detection by RwaPerpEngine
     *
     * @return sourceId Unique identifier for the price source, used for audit and verification
     *         - For Chainlink: keccak256(abi.encodePacked("Chainlink", feedAddress))
     *         - For SignedNAV: keccak256(abi.encodePacked("SignedNAV", publisherAddress))
     *         Stored in position records to enable price source traceability
     *
     * @return confidence Confidence score ranging from 0-100, where 100 = highest confidence
     *         - For Chainlink: Derived from price deviation and update frequency
     *           Example: 95 for feeds with <1% deviation and regular updates
     *         - For SignedNAV: Fixed score based on publisher trust level (e.g., 90)
     *         Used for risk metrics and potential future settlement thresholds
     *
     * @return settlementEnabled Whether this price can be used for position settlement
     *         - MUST be false if priceE8 == 0 (no data available)
     *         - MUST be false if price exceeds asset-specific staleness threshold
     *         - MUST be false if price failed adapter-specific validation checks
     *         - For SignedNAV: MUST be false if block.timestamp > validUntil
     *         RwaPerpEngine MUST reject position open/close operations when false
     *
     * @custom:example-chainlink For rGOLD with price=$1,850.50, updated 30min ago:
     *   priceE8 = 185050000000
     *   updatedAt = block.timestamp - 30 minutes
     *   sourceId = keccak256(abi.encodePacked("Chainlink", 0x214eD9Da11D2fbe465a6fc601a91E62EbEc1a0D6))
     *   confidence = 95
     *   settlementEnabled = true (within 1-hour staleness threshold)
     *
     * @custom:example-signednav For rCREDIT with NAV=$10.23, published 12 hours ago:
     *   priceE8 = 1023000000
     *   updatedAt = block.timestamp - 12 hours
     *   sourceId = keccak256(abi.encodePacked("SignedNAV", 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb))
     *   confidence = 90
     *   settlementEnabled = true (if block.timestamp <= validUntil, false otherwise)
     */
    function latestPrice(bytes32 assetId)
        external
        view
        returns (
            uint256 priceE8,
            uint256 updatedAt,
            bytes32 sourceId,
            uint8 confidence,
            bool settlementEnabled
        );
}
