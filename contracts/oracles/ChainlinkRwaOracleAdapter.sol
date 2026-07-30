// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/IRwaPriceOracle.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AggregatorV3Interface
 * @notice Interface for Chainlink Data Feeds
 * @dev Standard Chainlink AggregatorV3 interface for accessing price feed data
 */
interface AggregatorV3Interface {
    function decimals() external view returns (uint8);

    function description() external view returns (string memory);

    function version() external view returns (uint256);

    function getRoundData(uint80 _roundId)
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

/**
 * @title ChainlinkRwaOracleAdapter
 * @notice Oracle adapter for market-priced RWA assets using Chainlink Data Feeds
 * @dev Implements IRwaPriceOracle to provide verified price data for market-priced RWAs
 * like tokenized gold (rGOLD) using Chainlink XAU/USD or similar feeds.
 *
 * ## Design Philosophy
 * This adapter wraps Chainlink Data Feeds to provide price data appropriate for
 * Real-World Assets that trade on public markets. Unlike direct cryptocurrency
 * price feeds, this adapter performs comprehensive validation to ensure data
 * integrity before enabling settlement operations.
 *
 * ## Validation Strategy
 * The adapter implements multiple layers of validation as per Requirements 4.3-4.9:
 * 1. **Positive Price Check**: Rejects zero or negative prices
 * 2. **Round Validation**: Ensures answeredInRound >= roundId (detects incomplete rounds)
 * 3. **Round Existence Check**: Ensures answeredInRound > 0 (detects invalid data)
 * 4. **Staleness Detection**: Compares (block.timestamp - updatedAt) against heartbeat
 * 5. **Settlement Gating**: Returns settlementEnabled=true only when ALL checks pass
 *
 * ## Heartbeat Configuration
 * Each asset has a configured heartbeat (maximum acceptable data age). For example:
 * - XAU/USD feed: 3600 seconds (1 hour)
 * - Other commodity feeds: 3600-7200 seconds depending on market hours
 *
 * Settlement operations are blocked when price data exceeds the heartbeat threshold,
 * protecting users from executing trades based on stale market data.
 *
 * ## Example Usage
 * ```solidity
 * // Configure rGOLD to use XAU/USD feed (Chainlink Sepolia testnet)
 * bytes32 assetId = keccak256("rGOLD");
 * address xauUsdFeed = 0x...; // Chainlink XAU/USD feed address
 * uint256 heartbeat = 3600; // 1 hour
 * adapter.configureFeed(assetId, xauUsdFeed, heartbeat);
 *
 * // Query latest price
 * (uint256 priceE8, uint256 updatedAt, bytes32 sourceId, uint8 confidence, bool settlementEnabled) 
 *   = adapter.latestPrice(assetId);
 * ```
 *
 * @custom:security-note This contract performs non-reverting validation. When price
 * data fails validation, the contract returns settlementEnabled=false rather than
 * reverting. This allows the RwaPerpEngine to gracefully handle oracle outages.
 */
contract ChainlinkRwaOracleAdapter is IRwaPriceOracle, Ownable {
    /// @notice Mapping from assetId to Chainlink feed address
    /// @dev Feed address must implement AggregatorV3Interface
    mapping(bytes32 => address) private feeds;

    /// @notice Mapping from assetId to heartbeat (maximum acceptable staleness in seconds)
    /// @dev Heartbeat should match the feed's update frequency (e.g., 3600 for hourly updates)
    mapping(bytes32 => uint256) private heartbeats;

    /// @notice Fixed confidence score for Chainlink feeds
    /// @dev Chainlink feeds with regular updates and low deviation receive high confidence
    uint8 private constant CHAINLINK_CONFIDENCE = 95;

    /// @notice Emitted when a new feed is configured or updated for an asset
    /// @param assetId Unique identifier for the RWA asset
    /// @param feedAddress Address of the Chainlink AggregatorV3 feed
    /// @param heartbeat Maximum acceptable data age in seconds
    event FeedConfigured(
        bytes32 indexed assetId,
        address indexed feedAddress,
        uint256 heartbeat
    );

    /// @notice Error thrown when feed address is zero
    error InvalidFeedAddress();

    /// @notice Error thrown when heartbeat is zero
    error InvalidHeartbeat();

    /// @notice Error thrown when no feed is configured for the requested asset
    error FeedNotConfigured(bytes32 assetId);

    /**
     * @notice Constructs the ChainlinkRwaOracleAdapter
     * @param initialOwner Address that will own the contract and can configure feeds
     */
    constructor(address initialOwner) Ownable(initialOwner) {}

    /**
     * @notice Configures a Chainlink feed for a specific RWA asset
     * @dev Only callable by contract owner. Requirements 4.1, 4.2
     *
     * @param assetId Unique identifier for the RWA asset (e.g., keccak256("rGOLD"))
     * @param feedAddress Address of the Chainlink AggregatorV3Interface feed
     *                   Example: XAU/USD feed address for rGOLD
     * @param heartbeat Maximum acceptable data age in seconds
     *                 Example: 3600 for feeds with hourly updates
     *
     * @custom:requirements 4.1, 4.2
     * @custom:example Configure rGOLD with XAU/USD feed:
     *   assetId = keccak256("rGOLD")
     *   feedAddress = 0x214eD9Da11D2fbe465a6fc601a91E62EbEc1a0D6 (Sepolia XAU/USD)
     *   heartbeat = 3600 (1 hour)
     */
    function configureFeed(
        bytes32 assetId,
        address feedAddress,
        uint256 heartbeat
    ) external onlyOwner {
        if (feedAddress == address(0)) revert InvalidFeedAddress();
        if (heartbeat == 0) revert InvalidHeartbeat();

        feeds[assetId] = feedAddress;
        heartbeats[assetId] = heartbeat;

        emit FeedConfigured(assetId, feedAddress, heartbeat);
    }

    /**
     * @notice Retrieves the latest verified price for the specified RWA asset
     * @dev Implements comprehensive validation as per Requirements 4.3-4.9.
     * This function does NOT revert on validation failures; instead it returns
     * settlementEnabled=false to allow graceful degradation.
     *
     * ## Validation Flow
     * 1. Check feed is configured (returns default values if not)
     * 2. Call feed.latestRoundData() (Requirement 4.3)
     * 3. Validate answer > 0 (Requirement 4.4)
     * 4. Validate answeredInRound >= roundId (Requirement 4.5)
     * 5. Validate answeredInRound > 0 (Requirement 4.6)
     * 6. Check staleness: (block.timestamp - updatedAt) <= heartbeat (Requirement 4.7)
     * 7. Return settlementEnabled=true only if ALL checks pass (Requirement 4.8)
     *
     * @param assetId Unique identifier for the RWA asset
     *
     * @return priceE8 Asset price in 8 decimal precision (e.g., $1,850.50 = 185050000000)
     *         Returns 0 if validation fails
     * @return updatedAt Timestamp when price was last updated on-chain
     *         Returns 0 if validation fails
     * @return sourceId Feed contract address encoded as bytes32 (Requirement 4.9)
     *         Format: bytes32(uint256(uint160(feedAddress)))
     *         Returns bytes32(0) if validation fails
     * @return confidence Confidence score (fixed at 95 for Chainlink feeds)
     *         Returns 0 if validation fails
     * @return settlementEnabled Whether this price can be used for position settlement
     *         - false if feed not configured
     *         - false if any validation check fails
     *         - true only when ALL validation checks pass (Requirement 4.8)
     *
     * @custom:requirements 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9
     * @custom:example For rGOLD with price=$1,850.50, updated 30min ago:
     *   priceE8 = 185050000000 (if feed uses 8 decimals)
     *   updatedAt = block.timestamp - 1800
     *   sourceId = bytes32(uint256(uint160(feedAddress)))
     *   confidence = 95
     *   settlementEnabled = true (if within heartbeat and all checks pass)
     */
    function latestPrice(bytes32 assetId)
        external
        view
        override
        returns (
            uint256 priceE8,
            uint256 updatedAt,
            bytes32 sourceId,
            uint8 confidence,
            bool settlementEnabled
        )
    {
        address feedAddress = feeds[assetId];
        uint256 heartbeat = heartbeats[assetId];

        // Return default values if feed not configured
        if (feedAddress == address(0)) {
            return (0, 0, bytes32(0), 0, false);
        }

        AggregatorV3Interface feed = AggregatorV3Interface(feedAddress);

        // Requirement 4.3: Call feed.latestRoundData()
        try feed.latestRoundData() returns (
            uint80 roundId,
            int256 answer,
            uint256 /* startedAt */,
            uint256 _updatedAt,
            uint80 _answeredInRound
        ) {
            // Requirement 4.4: Validate answer > 0
            if (answer <= 0) {
                return (0, 0, bytes32(0), 0, false);
            }

            // Requirement 4.5: Validate answeredInRound >= roundId (detect stale rounds)
            if (_answeredInRound < roundId) {
                return (0, 0, bytes32(0), 0, false);
            }

            // Requirement 4.6: Validate answeredInRound > 0 (detect invalid rounds)
            if (_answeredInRound == 0) {
                return (0, 0, bytes32(0), 0, false);
            }

            // Requirement 4.7: Check staleness
            bool isFresh = (block.timestamp - _updatedAt) <= heartbeat;

            // Convert answer to priceE8 format
            // Note: Chainlink feeds typically use 8 decimals for USD pairs
            // but this may vary. For production, consider reading decimals()
            uint256 _priceE8 = uint256(answer);

            // Get feed decimals to ensure proper conversion
            try feed.decimals() returns (uint8 decimals) {
                // Convert to 8 decimal format if feed uses different precision
                if (decimals < 8) {
                    _priceE8 = _priceE8 * (10 ** (8 - decimals));
                } else if (decimals > 8) {
                    _priceE8 = _priceE8 / (10 ** (decimals - 8));
                }
            } catch {
                // If decimals() call fails, assume 8 decimals (standard for USD pairs)
                _priceE8 = uint256(answer);
            }

            // Requirement 4.9: Return sourceId as feed address
            bytes32 _sourceId = bytes32(uint256(uint160(feedAddress)));

            // Requirement 4.8: Return settlementEnabled=true only when all checks pass
            return (
                _priceE8,
                _updatedAt,
                _sourceId,
                CHAINLINK_CONFIDENCE,
                isFresh // settlementEnabled = true only if fresh
            );
        } catch {
            // If latestRoundData() reverts, return default values with settlementEnabled=false
            return (0, 0, bytes32(0), 0, false);
        }
    }

    /**
     * @notice Returns the configured feed address for an asset
     * @param assetId Unique identifier for the RWA asset
     * @return feedAddress Address of the configured Chainlink feed (0 if not configured)
     */
    function getFeedAddress(bytes32 assetId) external view returns (address) {
        return feeds[assetId];
    }

    /**
     * @notice Returns the configured heartbeat for an asset
     * @param assetId Unique identifier for the RWA asset
     * @return heartbeat Maximum acceptable data age in seconds (0 if not configured)
     */
    function getHeartbeat(bytes32 assetId) external view returns (uint256) {
        return heartbeats[assetId];
    }
}
