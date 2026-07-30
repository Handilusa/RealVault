// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/IRwaPriceOracle.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title SignedNavOracleAdapter
 * @notice Oracle adapter for NAV-based RWA assets using ECDSA-signed submissions
 * @dev Implements IRwaPriceOracle to provide verified NAV data for private RWAs
 * like tokenized credit funds (rCREDIT) using authorized publisher signatures.
 *
 * ## Design Philosophy
 * Unlike market-priced assets that use continuous Chainlink feeds, NAV-based assets
 * (private credit funds, real estate funds, etc.) are valued periodically by authorized
 * entities (fund administrators, appraisers). This adapter validates ECDSA signatures
 * from pre-authorized publishers to ensure NAV authenticity.
 *
 * ## Security Model
 * Each assetId has ONE authorized publisher address. The publisher signs NAV submissions
 * off-chain using their private key. The signature proves:
 * 1. The NAV value (navE8) is authentic
 * 2. The publisher identity is verified
 * 3. The submission has not been tampered with
 * 4. The time window (publishedAt → validUntil) is enforced
 *
 * ## Signature Scheme
 * Message hash = keccak256(abi.encodePacked(assetId, navE8, publishedAt, validUntil, nonce))
 * Ethereum Signed Message = "\x19Ethereum Signed Message:\n32" + messageHash
 * Recovered signer = ECDSA.recover(ethSignedMessageHash, signature)
 * Valid if: recoveredSigner == authorizedPublishers[assetId]
 *
 * ## Nonce Mechanism
 * Nonces prevent replay attacks and ensure monotonic progression:
 * - Each submission must have nonce > lastNonce[assetId]
 * - Nonces do not need to be consecutive, allowing for rejected submissions
 * - Once a nonce is accepted, all smaller nonces are permanently invalid
 *
 * ## Time Window Validation
 * Settlement is gated by the publishedAt → validUntil window:
 * - publishedAt: When the NAV was calculated (typically end of business day)
 * - validUntil: Expiry timestamp after which NAV is stale
 * - settlementEnabled = (block.timestamp >= publishedAt && block.timestamp <= validUntil)
 *
 * ## Example Usage
 * ```solidity
 * // 1. Configure authorized publisher for rCREDIT
 * bytes32 assetId = keccak256("rCREDIT");
 * address publisher = 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb; // Fund administrator
 * adapter.setAuthorizedPublisher(assetId, publisher);
 *
 * // 2. Publisher signs NAV off-chain (using web3.js or ethers.js)
 * // Message: assetId + navE8 + publishedAt + validUntil + nonce
 * // Signature: publisher.sign(messageHash)
 *
 * // 3. Submit signed NAV on-chain
 * adapter.submitNav(
 *     assetId,
 *     1023000000,    // $10.23 NAV
 *     1704067200,    // publishedAt (2024-01-01 00:00:00 UTC)
 *     1704153600,    // validUntil (2024-01-02 00:00:00 UTC)
 *     1,             // nonce
 *     signature
 * );
 *
 * // 4. Query latest price (returns settlementEnabled=true if within time window)
 * (uint256 priceE8, uint256 updatedAt, bytes32 sourceId, uint8 confidence, bool settlementEnabled)
 *   = adapter.latestPrice(assetId);
 * ```
 *
 * @custom:security-note This adapter uses ECDSA signature verification to authenticate
 * NAV submissions. The security relies on:
 * 1. Private key protection by authorized publishers
 * 2. Monotonic nonce validation to prevent replay attacks
 * 3. Time window enforcement to prevent stale NAV usage
 * 4. One publisher per asset to maintain clear responsibility
 */
contract SignedNavOracleAdapter is IRwaPriceOracle, Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    /**
     * @notice Structure representing a signed NAV submission
     * @dev Contains all data required for NAV verification and settlement gating
     *
     * @param navE8 NAV value in 8 decimal precision (e.g., $10.23 = 1023000000)
     * @param publishedAt Timestamp when NAV was calculated (typically EOD)
     * @param validUntil Expiry timestamp after which NAV cannot be used for settlement
     * @param nonce Monotonically increasing submission counter for replay prevention
     * @param signature ECDSA signature from authorized publisher over (assetId, navE8, publishedAt, validUntil, nonce)
     */
    struct NavSubmission {
        uint256 navE8;
        uint256 publishedAt;
        uint256 validUntil;
        uint256 nonce;
        bytes signature;
    }

    /// @notice Mapping from assetId to authorized publisher address
    /// @dev Only this address can submit valid NAV signatures for the asset
    /// Requirement 5.1: One publisher per asset for clear responsibility
    mapping(bytes32 => address) private authorizedPublishers;

    /// @notice Mapping from assetId to latest accepted NAV submission
    /// @dev Stores complete submission data including signature for audit trail
    /// Requirement 5.2: Latest NAV storage for retrieval by latestPrice()
    mapping(bytes32 => NavSubmission) private latestNav;

    /// @notice Mapping from assetId to last accepted nonce
    /// @dev Used to enforce monotonic nonce progression and prevent replay attacks
    /// Requirement 5.3: Nonce tracking for replay prevention
    mapping(bytes32 => uint256) private lastNonce;

    /// @notice Fixed confidence score for signed NAV submissions
    /// @dev NAV submissions from authorized publishers receive high confidence
    uint8 private constant SIGNED_NAV_CONFIDENCE = 90;

    /// @notice Emitted when an authorized publisher is configured for an asset
    /// @param assetId Unique identifier for the RWA asset
    /// @param publisher Address authorized to sign NAV submissions
    event PublisherConfigured(bytes32 indexed assetId, address indexed publisher);

    /// @notice Emitted when a new NAV is successfully submitted and verified
    /// @param assetId Unique identifier for the RWA asset
    /// @param navE8 NAV value in 8 decimal precision
    /// @param publishedAt Timestamp when NAV was calculated
    /// @param validUntil Expiry timestamp
    /// @param nonce Submission nonce
    /// @param publisher Address that signed the submission
    event NavSubmitted(
        bytes32 indexed assetId,
        uint256 navE8,
        uint256 publishedAt,
        uint256 validUntil,
        uint256 nonce,
        address indexed publisher
    );

    /// @notice Error thrown when no publisher is configured for an asset
    error PublisherNotConfigured(bytes32 assetId);

    /// @notice Error thrown when signature verification fails
    error InvalidSignature();

    /// @notice Error thrown when nonce is not greater than last accepted nonce
    error InvalidNonce(uint256 providedNonce, uint256 lastNonce);

    /// @notice Error thrown when publisher address is zero
    error InvalidPublisherAddress();

    /**
     * @notice Constructs the SignedNavOracleAdapter
     * @param initialOwner Address that will own the contract and can configure publishers
     */
    constructor(address initialOwner) Ownable(initialOwner) {}

    /**
     * @notice Configures the authorized publisher for a specific RWA asset
     * @dev Only callable by contract owner. Sets the publisher address that can submit
     * valid NAV signatures for this asset. Requirement 5.1
     *
     * @param assetId Unique identifier for the RWA asset (e.g., keccak256("rCREDIT"))
     * @param publisher Address authorized to sign NAV submissions
     *                 Example: Fund administrator's Ethereum address
     *
     * @custom:requirements 5.1
     * @custom:example Configure rCREDIT with fund administrator:
     *   assetId = keccak256("rCREDIT")
     *   publisher = 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
     */
    function setAuthorizedPublisher(bytes32 assetId, address publisher) external onlyOwner {
        if (publisher == address(0)) revert InvalidPublisherAddress();

        authorizedPublishers[assetId] = publisher;
        emit PublisherConfigured(assetId, publisher);
    }

    /**
     * @notice Submits a signed NAV for an RWA asset
     * @dev Validates ECDSA signature, enforces monotonic nonce, and stores NAV data.
     * This function implements the complete signature verification flow as per
     * Requirements 5.4 and 5.5.
     *
     * ## Validation Flow
     * 1. Check publisher is configured (Requirement 5.4)
     * 2. Validate nonce > lastNonce[assetId] (Requirement 5.5, monotonic nonce)
     * 3. Reconstruct message hash from submission data (Requirement 5.4)
     * 4. Create Ethereum signed message hash with prefix (Requirement 5.4)
     * 5. Recover signer using ECDSA.recover() (Requirement 5.4)
     * 6. Verify signer == authorizedPublishers[assetId] (Requirement 5.4)
     * 7. Update latestNav[assetId] and lastNonce[assetId] (Requirement 5.5)
     * 8. Emit NavSubmitted event (Requirement 5.5)
     *
     * ## Message Hash Construction
     * messageHash = keccak256(abi.encodePacked(assetId, navE8, publishedAt, validUntil, nonce))
     * ethSignedMessageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash))
     * recoveredSigner = ECDSA.recover(ethSignedMessageHash, signature)
     *
     * @param assetId Unique identifier for the RWA asset
     * @param navE8 NAV value in 8 decimal precision (e.g., $10.23 = 1023000000)
     * @param publishedAt Timestamp when NAV was calculated
     * @param validUntil Expiry timestamp after which NAV is stale
     * @param nonce Monotonically increasing submission counter (must be > lastNonce)
     * @param signature ECDSA signature from authorized publisher
     *
     * @custom:requirements 5.4, 5.5
     * @custom:example Submit NAV for rCREDIT:
     *   assetId = keccak256("rCREDIT")
     *   navE8 = 1023000000 ($10.23)
     *   publishedAt = 1704067200 (2024-01-01 00:00:00 UTC)
     *   validUntil = 1704153600 (2024-01-02 00:00:00 UTC)
     *   nonce = 1
     *   signature = 0x... (ECDSA signature from publisher)
     */
    function submitNav(
        bytes32 assetId,
        uint256 navE8,
        uint256 publishedAt,
        uint256 validUntil,
        uint256 nonce,
        bytes calldata signature
    ) external {
        address publisher = authorizedPublishers[assetId];

        // Requirement 5.4: Check publisher is configured
        if (publisher == address(0)) {
            revert PublisherNotConfigured(assetId);
        }

        // Requirement 5.5: Validate nonce > lastNonce[assetId] (monotonic increase)
        uint256 currentNonce = lastNonce[assetId];
        if (nonce <= currentNonce) {
            revert InvalidNonce(nonce, currentNonce);
        }

        // Requirement 5.4: Reconstruct message hash
        bytes32 messageHash = keccak256(
            abi.encodePacked(assetId, navE8, publishedAt, validUntil, nonce)
        );

        // Requirement 5.4: Create Ethereum signed message hash with prefix
        bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();

        // Requirement 5.4: Recover signer using ECDSA.recover()
        address recoveredSigner = ethSignedMessageHash.recover(signature);

        // Requirement 5.4: Verify signer == authorizedPublishers[assetId]
        if (recoveredSigner != publisher) {
            revert InvalidSignature();
        }

        // Requirement 5.5: Update latestNav[assetId] and lastNonce[assetId]
        latestNav[assetId] = NavSubmission({
            navE8: navE8,
            publishedAt: publishedAt,
            validUntil: validUntil,
            nonce: nonce,
            signature: signature
        });

        lastNonce[assetId] = nonce;

        // Requirement 5.5: Emit NavSubmitted event
        emit NavSubmitted(assetId, navE8, publishedAt, validUntil, nonce, publisher);
    }

    /**
     * @notice Retrieves the latest verified NAV for the specified RWA asset
     * @dev Implements time window validation as per Requirements 5.6 and 5.7.
     * Returns settlementEnabled=true only when current timestamp is within the
     * publishedAt → validUntil window.
     *
     * ## Validation Flow
     * 1. Load latestNav[assetId] (Requirement 5.6)
     * 2. Check navE8 > 0 (indicates NAV exists) (Requirement 5.6)
     * 3. Calculate settlementEnabled based on time window (Requirement 5.7)
     *    settlementEnabled = (block.timestamp >= publishedAt && block.timestamp <= validUntil)
     * 4. Compute sourceId from publisher address (Requirement 5.6)
     *    sourceId = keccak256(abi.encodePacked("SignedNAV", authorizedPublishers[assetId]))
     * 5. Return (navE8, publishedAt, sourceId, 90, settlementEnabled) (Requirement 5.6)
     *
     * @param assetId Unique identifier for the RWA asset
     *
     * @return priceE8 NAV value in 8 decimal precision (0 if no NAV submitted)
     * @return updatedAt Timestamp when NAV was published (publishedAt from submission)
     * @return sourceId Publisher identity hash for audit trail
     *         Format: keccak256(abi.encodePacked("SignedNAV", publisherAddress))
     * @return confidence Confidence score (fixed at 90 for signed NAV)
     * @return settlementEnabled Whether NAV can be used for position settlement
     *         - false if navE8 == 0 (no NAV submitted)
     *         - false if block.timestamp < publishedAt (NAV not yet valid)
     *         - false if block.timestamp > validUntil (NAV expired)
     *         - true only if within publishedAt → validUntil window (Requirement 5.7)
     *
     * @custom:requirements 5.6, 5.7
     * @custom:example For rCREDIT with NAV=$10.23, published 12 hours ago, valid for 24h:
     *   priceE8 = 1023000000
     *   updatedAt = publishedAt timestamp
     *   sourceId = keccak256(abi.encodePacked("SignedNAV", publisherAddress))
     *   confidence = 90
     *   settlementEnabled = true (if within time window)
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
        // Requirement 5.6: Load latestNav[assetId]
        NavSubmission storage nav = latestNav[assetId];

        // Requirement 5.6: Check if NAV exists
        if (nav.navE8 == 0) {
            return (0, 0, bytes32(0), 0, false);
        }

        // Requirement 5.7: Calculate settlementEnabled with time window validation
        // Settlement enabled = (block.timestamp >= publishedAt && block.timestamp <= validUntil)
        bool isWithinTimeWindow = (block.timestamp >= nav.publishedAt) && 
                                  (block.timestamp <= nav.validUntil);

        // Requirement 5.6: Compute sourceId from publisher address
        address publisher = authorizedPublishers[assetId];
        bytes32 _sourceId = keccak256(abi.encodePacked("SignedNAV", publisher));

        // Requirement 5.6: Return (navE8, publishedAt, sourceId, 90, settlementEnabled)
        return (
            nav.navE8,
            nav.publishedAt,
            _sourceId,
            SIGNED_NAV_CONFIDENCE,
            isWithinTimeWindow
        );
    }

    /**
     * @notice Returns the authorized publisher address for an asset
     * @param assetId Unique identifier for the RWA asset
     * @return publisher Address authorized to sign NAV submissions (0 if not configured)
     */
    function getAuthorizedPublisher(bytes32 assetId) external view returns (address) {
        return authorizedPublishers[assetId];
    }

    /**
     * @notice Returns the last accepted nonce for an asset
     * @param assetId Unique identifier for the RWA asset
     * @return nonce Last accepted nonce value (0 if no submissions yet)
     */
    function getLastNonce(bytes32 assetId) external view returns (uint256) {
        return lastNonce[assetId];
    }

    /**
     * @notice Returns the complete NAV submission data for an asset
     * @param assetId Unique identifier for the RWA asset
     * @return nav Complete NavSubmission struct including signature
     */
    function getLatestNav(bytes32 assetId) external view returns (NavSubmission memory) {
        return latestNav[assetId];
    }
}
