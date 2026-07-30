// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {Nox, euint256, externalEuint256, ebool} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {RwaPerpTypes} from "./RwaPerpTypes.sol";
import {RwaPerpMath} from "./RwaPerpMath.sol";
import {IRwaPriceOracle} from "./interfaces/IRwaPriceOracle.sol";

/// @title IFundVault Interface for RwaPerpEngine integration
/// @notice Defines required functions for encrypted balance management
interface IFundVault {
    function getPosition(address investor) external view returns (euint256);
    function debitFrom(address investor, euint256 amount) external returns (euint256 newBalance);
    function creditTo(address investor, euint256 amount) external returns (euint256 newBalance);
}

/// @title IDisclosureManager Interface for per-user ACL queries
/// @notice Provides per-investor auditor authorization lists
interface IDisclosureManager {
    function getAuthorizedAuditors(address investor) external view returns (address[] memory);
}

/// @title RwaPerpEngine — Confidential RWA Perpetual Engine
/// @notice Manages synthetic perpetual positions on RWA assets with full privacy via iExec Nox FHE
/// @dev Phase 3 implementation with complete FHE integration, safe arithmetic, loss capping, and per-user ACLs
/// @custom:security CRITICAL PATTERNS:
/// @custom:security - ALWAYS use Nox.safeAdd/safeSub (NEVER bare add/sub)
/// @custom:security - ALWAYS validate balance with Nox.ge() BEFORE safeSub()
/// @custom:security - ALWAYS cap losses to margin using Nox.select()
/// @custom:security - ALWAYS use encrypted branching (Nox.select, ebool)
/// @custom:security - NEVER grant blanket auditor access (query per-user ACLs)
contract RwaPerpEngine is Ownable {
    // ============================================
    // STATE VARIABLES
    // ============================================

    /// @notice FundVault contract managing encrypted mUSDC balances
    /// @dev Integration point for margin debit/credit operations
    address public fundVault;

    /// @notice Protocol treasury acting as counterparty for all positions
    /// @dev Absorbs position PnL without external liquidity providers
    address public vaultTreasury;

    /// @notice Encrypted treasury balance handle
    /// @dev Updated on every position settlement (profit: debit, loss: credit)
    euint256 private treasuryBalanceHandle;

    /// @notice DisclosureManager contract for per-user auditor authorization
    /// @dev Queries authorized auditors per investor for ACL grants
    address public disclosureManagerContract;

    /// @notice Maximum leverage multiplier allowed (10x)
    /// @dev Enforced on position opening to limit risk exposure
    uint8 public constant MAX_LEVERAGE = 10;

    /// @notice Maximum auditors per user (gas optimization)
    /// @dev Prevents excessive gas costs in ACL grant loops
    uint256 public constant MAX_AUDITORS = 10;

    /// @notice Trading pause flag for emergency circuit breaker
    bool public tradingPaused;

    /// @notice Maximum positions allowed per wallet (default: 10)
    uint256 public maxPositionsPerWallet = 10;

    /// @notice Maximum margin per individual position in USDC (6 decimals, default: $1000)
    uint256 public maxMarginPerPositionE6 = 1000_000000;

    /// @notice Mapping from user address to array of positions
    /// @dev Supports multiple concurrent positions per user
    mapping(address => RwaPerpTypes.Position[]) public positions;

    /// @notice Mapping from assetId to approved IRwaPriceOracle adapter address
    /// @dev Pluggable oracle architecture per RWA asset class
    mapping(bytes32 => address) public oracleAdapters;

    /// @notice Mapping from assetId to asset configuration parameters
    /// @dev Stores oracle adapter, staleness threshold, valuation methodology
    mapping(bytes32 => RwaPerpTypes.AssetConfig) public assetConfigs;

    // ============================================
    // EVENTS
    // ============================================

    /// @notice Emitted when a position is opened
    /// @param user Address of the position owner
    /// @param positionIndex Index in the user's positions array
    /// @param assetId Asset identifier (e.g., keccak256("rGOLD"))
    /// @param isLong Position direction (true = long, false = short)
    /// @param leverage Leverage multiplier (1x-10x)
    /// @param entryPriceE8 Entry price in 8 decimal precision
    /// @param entryRoundOrNonce Chainlink roundId or signed NAV nonce at entry
    /// @param entrySourceId Oracle source identifier for verification
    /// @param timestamp Block timestamp of position opening
    event PositionOpened(
        address indexed user,
        uint256 indexed positionIndex,
        bytes32 indexed assetId,
        bool isLong,
        uint8 leverage,
        uint128 entryPriceE8,
        uint80 entryRoundOrNonce,
        bytes32 entrySourceId,
        uint64 timestamp
    );

    /// @notice Emitted when a position is closed
    /// @param user Address of the position owner
    /// @param positionIndex Index in the user's positions array
    /// @param assetId Asset identifier
    /// @param exitPriceE8 Exit price in 8 decimal precision
    /// @param exitSourceId Oracle source identifier at exit
    /// @param pnlScalar PnL percentage (positive = profit, negative = loss)
    /// @param timestamp Block timestamp of position closing
    event PositionClosed(
        address indexed user,
        uint256 indexed positionIndex,
        bytes32 indexed assetId,
        uint128 exitPriceE8,
        bytes32 exitSourceId,
        int256 pnlScalar,
        uint64 timestamp
    );

    /// @notice Emitted when an oracle adapter is registered for an asset
    /// @param assetId Asset identifier
    /// @param adapter Address of the IRwaPriceOracle implementation
    event OracleAdapterRegistered(
        bytes32 indexed assetId,
        address indexed adapter
    );

    /// @notice Emitted when margin is debited from user balance
    /// @param user Address of the user
    /// @param marginHandle Encrypted margin handle
    event MarginDebited(
        address indexed user,
        euint256 marginHandle
    );

    /// @notice Emitted when PnL is settled
    /// @param user Address of the user
    /// @param pnlScalar PnL percentage (basis points)
    /// @param isProfit Whether the settlement is profit (true) or loss (false)
    event PnLSettled(
        address indexed user,
        int256 pnlScalar,
        bool isProfit
    );

    /// @notice Emitted when treasury is funded
    /// @param by Address that funded the treasury
    /// @param timestamp Block timestamp of funding
    event TreasuryFunded(address indexed by, uint256 timestamp);

    /// @notice Emitted when trading is paused
    event TradingPaused(address indexed by, uint256 timestamp);

    /// @notice Emitted when trading is resumed
    event TradingResumed(address indexed by, uint256 timestamp);

    /// @notice Emitted when position limits are updated
    event PositionLimitsUpdated(uint256 maxPositions, uint256 maxMarginE6);

    /// @notice Emitted when a position limit is reached
    event PositionLimitReached(address indexed user, uint256 currentPositions, uint256 limit);

    /// @notice Emitted when margin limit is exceeded
    event MarginLimitExceeded(address indexed user, uint256 attemptedMarginE6, uint256 limit);

    // ============================================
    // CONSTRUCTOR
    // ============================================

    /// @notice Ensures trading is not paused
    modifier whenNotPaused() {
        require(!tradingPaused, "Trading is paused");
        _;
    }

    /// @notice Initializes the RwaPerpEngine with FundVault and treasury addresses
    /// @param _fundVault Address of the FundVault contract
    /// @param _vaultTreasury Address of the protocol treasury
    constructor(address _fundVault, address _vaultTreasury) Ownable(msg.sender) {
        require(_fundVault != address(0), "Invalid FundVault address");
        require(_vaultTreasury != address(0), "Invalid treasury address");
        
        fundVault = _fundVault;
        vaultTreasury = _vaultTreasury;
        
        // Initialize treasury balance to zero (will be funded separately)
        treasuryBalanceHandle = Nox.toEuint256(0);
        Nox.allowThis(treasuryBalanceHandle);
    }

    // ============================================
    // ADMIN FUNCTIONS
    // ============================================

    /// @notice Register an oracle adapter for a specific asset
    /// @dev Only owner can register oracle adapters
    /// @param assetId Asset identifier (e.g., keccak256("rGOLD"))
    /// @param adapter Address of the IRwaPriceOracle implementation
    function registerOracleAdapter(bytes32 assetId, address adapter) external onlyOwner {
        require(adapter != address(0), "Invalid adapter address");
        require(assetId != bytes32(0), "Invalid assetId");
        
        oracleAdapters[assetId] = adapter;
        emit OracleAdapterRegistered(assetId, adapter);
    }

    /// @notice Configure asset-specific parameters
    /// @dev Only owner can configure assets
    /// @param config AssetConfig struct with asset parameters
    function configureAsset(RwaPerpTypes.AssetConfig memory config) external onlyOwner {
        require(config.assetId != bytes32(0), "Invalid assetId");
        require(config.oracleAdapter != address(0), "Invalid oracle adapter");
        require(config.maxStaleness > 0, "Invalid staleness threshold");
        
        assetConfigs[config.assetId] = config;
    }

    /// @notice Set the DisclosureManager contract address
    /// @dev Only owner can set the disclosure manager
    /// @param _disclosureManager Address of the DisclosureManager contract
    function setDisclosureManager(address _disclosureManager) external onlyOwner {
        require(_disclosureManager != address(0), "Invalid address");
        disclosureManagerContract = _disclosureManager;
    }

    /// @notice Initialize or update treasury balance
    /// @dev Only owner can initialize treasury
    /// @param initialBalance Encrypted balance handle from external source
    /// @param inputProof Input proof for external encrypted value
    function initializeTreasury(externalEuint256 initialBalance, bytes calldata inputProof) external onlyOwner {
        euint256 amount = Nox.fromExternal(initialBalance, inputProof);
        (ebool addOk, euint256 newTreasury) = Nox.safeAdd(treasuryBalanceHandle, amount);
        treasuryBalanceHandle = Nox.select(addOk, newTreasury, treasuryBalanceHandle);  // Fallback: keep current treasury if overflow
        Nox.allowThis(treasuryBalanceHandle);
    }

    /// @notice Fund treasury with encrypted amount (owner only, production flow)
    /// @dev Uses same Nox SDK pipeline as user deposits (no backdoors)
    /// @param externalAmount Encrypted amount handle from Nox SDK
    /// @param inputProof Input proof for external encrypted value
    function fundTreasury(externalEuint256 externalAmount, bytes calldata inputProof) external onlyOwner {
        euint256 amount = Nox.fromExternal(externalAmount, inputProof);
        (ebool addOk, euint256 newTreasury) = Nox.safeAdd(treasuryBalanceHandle, amount);
        treasuryBalanceHandle = Nox.select(addOk, newTreasury, treasuryBalanceHandle);
        Nox.allowThis(treasuryBalanceHandle);
        
        emit TreasuryFunded(msg.sender, block.timestamp);
    }

    /// @notice Pause all trading operations (emergency circuit breaker)
    /// @dev Owner only. Affects openPosition and potentially other sensitive operations
    function pauseTrading() external onlyOwner {
        tradingPaused = true;
        emit TradingPaused(msg.sender, block.timestamp);
    }

    /// @notice Resume trading operations
    /// @dev Owner only
    function unpauseTrading() external onlyOwner {
        tradingPaused = false;
        emit TradingResumed(msg.sender, block.timestamp);
    }

    /// @notice Set position and margin limits for risk management
    /// @dev Owner only. Used for phased rollout and risk control
    /// @param _maxPositions Maximum positions per wallet
    /// @param _maxMarginE6 Maximum margin per position (USDC 6 decimals)
    function setPositionLimits(uint256 _maxPositions, uint256 _maxMarginE6) external onlyOwner {
        require(_maxPositions > 0, "Invalid max positions");
        require(_maxMarginE6 > 0, "Invalid max margin");
        
        maxPositionsPerWallet = _maxPositions;
        maxMarginPerPositionE6 = _maxMarginE6;
        
        emit PositionLimitsUpdated(_maxPositions, _maxMarginE6);
    }

    // ============================================
    // INTERNAL HELPER FUNCTIONS - FHE INTEGRATION
    // ============================================

    /// @notice Debits margin from user's FundVault balance with graceful degradation
    /// @dev CRITICAL: Caps margin to available balance BEFORE calling debitFrom to prevent underflow
    /// @param user Address of the user
    /// @param marginHandle Encrypted margin amount requested
    /// @return actualMargin The actual margin debited (capped to available balance)
    function _debitMargin(address user, euint256 marginHandle) internal returns (euint256 actualMargin) {
        // Get user balance from FundVault
        euint256 userBalance = IFundVault(fundVault).getPosition(user);
        
        // Cap margin to available balance BEFORE debit (prevents underflow)
        ebool hasSufficientBalance = Nox.ge(userBalance, marginHandle);
        actualMargin = Nox.select(hasSufficientBalance, marginHandle, userBalance);
        
        // Grant FundVault ACL on the handle before cross-contract call
        // (handle was created in RwaPerpEngine's context via Nox.select)
        Nox.allow(actualMargin, fundVault);
        
        // Debit the capped amount (can never underflow now)
        IFundVault(fundVault).debitFrom(user, actualMargin);
        
        // Emit with actual amount debited
        emit MarginDebited(user, actualMargin);
        
        return actualMargin;
    }

    /// @notice Credit balance to user
    /// @dev FundVault handles safe arithmetic and ACL grants internally
    /// @param user Address of the user
    /// @param creditAmount Encrypted amount to credit
    function _creditBalance(address user, euint256 creditAmount) internal {
        // FundVault.creditTo() handles:
        // 1. Safe addition with ebool validation
        // 2. Overflow protection
        // 3. ACL grants to user, disclosureManager, navAggregator
        // 4. Returns new balance after credit
        IFundVault(fundVault).creditTo(user, creditAmount);
    }

    /// @notice Settle profit PnL (treasury pays user)
    /// @dev Internal helper to reduce stack depth in _settlePnL
    /// @param user Address of the user
    /// @param marginHandle Encrypted margin handle
    /// @param pnlScalar PnL percentage (positive value)
    /// @param treasuryBalance Current treasury balance
    function _settleProfitPnL(
        address user,
        euint256 marginHandle,
        uint256 pnlScalar,
        euint256 treasuryBalance
    ) internal {
        // Calculate profit amount
        euint256 profitHandle = RwaPerpMath._scaledAmount(marginHandle, pnlScalar);
        
        // Check treasury solvency and cap payout
        ebool treasuryCovers = Nox.ge(treasuryBalance, profitHandle);
        euint256 actualPayout = Nox.select(treasuryCovers, profitHandle, treasuryBalance);
        
        // Update treasury balance (safe subtraction)
        (ebool subOk, euint256 newTreasuryBalance) = Nox.safeSub(treasuryBalance, actualPayout);
        treasuryBalanceHandle = Nox.select(subOk, newTreasuryBalance, treasuryBalance);
        Nox.allowThis(treasuryBalanceHandle);
        
        // Credit profit AND return margin to user
        (ebool addProfitOk, euint256 marginPlusProfit) = Nox.safeAdd(marginHandle, actualPayout);
        euint256 totalCredit = Nox.select(addProfitOk, marginPlusProfit, marginHandle);
        Nox.allow(totalCredit, fundVault);  // Grant FundVault ACL before cross-contract call
        IFundVault(fundVault).creditTo(user, totalCredit);
    }

    /// @notice Settle loss PnL (user pays treasury)
    /// @dev Internal helper to reduce stack depth in _settlePnL
    /// @param user Address of the user
    /// @param marginHandle Encrypted margin handle
    /// @param lossScalar Loss percentage (positive value representing loss magnitude)
    /// @param treasuryBalance Current treasury balance
    function _settleLossPnL(
        address user,
        euint256 marginHandle,
        uint256 lossScalar,
        euint256 treasuryBalance
    ) internal {
        // Calculate loss amount
        euint256 lossHandle = RwaPerpMath._scaledAmount(marginHandle, lossScalar);
        
        // Cap loss to margin deposited
        ebool lossExceedsMargin = Nox.gt(lossHandle, marginHandle);
        euint256 cappedLoss = Nox.select(lossExceedsMargin, marginHandle, lossHandle);
        
        // Return (margin - capped loss) to user
        (ebool subOk, euint256 marginReturned) = Nox.safeSub(marginHandle, cappedLoss);
        euint256 amountToReturn = Nox.select(subOk, marginReturned, marginHandle);
        Nox.allow(amountToReturn, fundVault);  // Grant FundVault ACL before cross-contract call
        IFundVault(fundVault).creditTo(user, amountToReturn);
        
        // Credit loss to treasury
        (ebool treasuryAddOk, euint256 newTreasuryBalance) = Nox.safeAdd(treasuryBalance, cappedLoss);
        treasuryBalanceHandle = Nox.select(treasuryAddOk, newTreasuryBalance, treasuryBalance);
        Nox.allowThis(treasuryBalanceHandle);
    }

    /// @notice Settle PnL with graceful degradation and net settlement
    /// @dev CRITICAL: Implements loss capping and treasury solvency checks with encrypted branching
    /// @param user Address of the user
    /// @param pnlScalar PnL percentage in basis points (positive = profit, negative = loss)
    /// @param marginHandle Encrypted margin handle for THIS position
    function _settlePnL(address user, int256 pnlScalar, euint256 marginHandle) internal {
        euint256 treasuryBalance = treasuryBalanceHandle;
        
        if (pnlScalar > 0) {
            _settleProfitPnL(user, marginHandle, uint256(pnlScalar), treasuryBalance);
        } else if (pnlScalar < 0) {
            _settleLossPnL(user, marginHandle, uint256(-pnlScalar), treasuryBalance);
        } else {
            // ZERO PnL: Return margin only
            Nox.allow(marginHandle, fundVault);  // Grant FundVault ACL before cross-contract call
            IFundVault(fundVault).creditTo(user, marginHandle);
        }
        
        // Emit settlement event
        emit PnLSettled(user, pnlScalar, pnlScalar >= 0);
    }

    // ============================================
    // PUBLIC POSITION MANAGEMENT FUNCTIONS
    // ============================================

    /// @notice Open a new perpetual position with encrypted margin
    /// @dev Uses encrypted input pattern with Nox.fromExternal()
    /// @param assetId Asset identifier (e.g., keccak256("rGOLD"))
    /// @param externalMargin Encrypted margin from frontend
    /// @param inputProof Input proof for external encrypted value
    /// @param leverage Leverage multiplier (1x-10x)
    /// @param isLong Position direction (true = long, false = short)
    function openPosition(
        bytes32 assetId,
        externalEuint256 externalMargin,
        bytes calldata inputProof,
        uint8 leverage,
        bool isLong
    ) external whenNotPaused {
        // Validate leverage
        require(leverage >= 1 && leverage <= MAX_LEVERAGE, "Invalid leverage");
        
        // Check position count limit (only count open positions)
        uint256 openPositionCount = 0;
        for (uint256 i = 0; i < positions[msg.sender].length; i++) {
            if (positions[msg.sender][i].isOpen) {
                openPositionCount++;
            }
        }
        require(openPositionCount < maxPositionsPerWallet, "Max positions reached");
        
        // Convert external encrypted input to internal handle
        euint256 marginHandle = Nox.fromExternal(externalMargin, inputProof);
        
        // Verify oracle adapter is registered
        require(oracleAdapters[assetId] != address(0), "No oracle configured for asset");
        
        // Query oracle for entry price
        (
            uint256 priceE8,
            uint256 updatedAt,
            bytes32 sourceId,
            ,  // confidence (unused)
            bool settlementEnabled
        ) = IRwaPriceOracle(oracleAdapters[assetId]).latestPrice(assetId);
        
        // Validate price data
        require(priceE8 > 0, "Invalid oracle price");
        require(settlementEnabled, "Asset not available for settlement");
        
        // Check staleness against asset config
        RwaPerpTypes.AssetConfig memory config = assetConfigs[assetId];
        if (config.maxStaleness > 0) {
            require(block.timestamp - updatedAt <= config.maxStaleness, "Price data is stale");
        }
        
        // Debit margin from user balance (uses select pattern for graceful degradation)
        euint256 actualMargin = _debitMargin(msg.sender, marginHandle);
        
        // CRITICAL: Ensure this contract retains ACL on the margin handle
        // so closePosition can later operate on it during PnL settlement
        Nox.allowThis(actualMargin);
        
        // Create position with immutable entry snapshots
        RwaPerpTypes.Position memory newPosition = RwaPerpTypes.Position({
            assetId: assetId,
            marginHandle: actualMargin,  // CRITICAL: Store ACTUAL margin, not requested
            entryPriceE8: uint128(priceE8),
            entryRoundOrNonce: uint80(updatedAt),  // Use updatedAt as nonce for simplicity
            entrySourceId: sourceId,
            leverage: leverage,
            openedAt: uint64(block.timestamp),
            isLong: isLong,
            isOpen: true
        });
        
        // Append position to user's array
        positions[msg.sender].push(newPosition);
        
        // Emit position opened event
        emit PositionOpened(
            msg.sender,
            positions[msg.sender].length - 1,
            assetId,
            isLong,
            leverage,
            uint128(priceE8),
            uint80(updatedAt),
            sourceId,
            uint64(block.timestamp)
        );
    }

    /// @notice Testing helper - accepts bytes32 handle directly
    /// @dev ONLY FOR LOCAL TESTING - bypasses Nox.fromExternal() and FundVault debit
    function openPositionTest(
        bytes32 assetId,
        bytes32 marginHandle,
        uint8 leverage,
        bool isLong
    ) external whenNotPaused {
        require(leverage >= 1 && leverage <= MAX_LEVERAGE, "Invalid leverage");
        
        // Check position count limit (only count open positions)
        uint256 openPositionCount = 0;
        for (uint256 i = 0; i < positions[msg.sender].length; i++) {
            if (positions[msg.sender][i].isOpen) {
                openPositionCount++;
            }
        }
        require(openPositionCount < maxPositionsPerWallet, "Max positions reached");
        
        euint256 margin = euint256.wrap(marginHandle);
        require(oracleAdapters[assetId] != address(0), "No oracle configured for asset");
        
        (uint256 priceE8, uint256 updatedAt, bytes32 sourceId,, bool settlementEnabled) = IRwaPriceOracle(oracleAdapters[assetId]).latestPrice(assetId);
        require(priceE8 > 0, "Invalid oracle price");
        require(settlementEnabled, "Asset not available for settlement");
        
        RwaPerpTypes.AssetConfig memory config = assetConfigs[assetId];
        if (config.maxStaleness > 0) {
            require(block.timestamp - updatedAt <= config.maxStaleness, "Price data is stale");
        }
        
        // For testing: use margin directly without FundVault interaction
        positions[msg.sender].push(RwaPerpTypes.Position({
            assetId: assetId,
            marginHandle: margin,
            entryPriceE8: uint128(priceE8),
            entryRoundOrNonce: uint80(updatedAt),
            entrySourceId: sourceId,
            leverage: leverage,
            openedAt: uint64(block.timestamp),
            isLong: isLong,
            isOpen: true
        }));
        
        emit PositionOpened(msg.sender, positions[msg.sender].length - 1, assetId, isLong, leverage, uint128(priceE8), uint80(updatedAt), sourceId, uint64(block.timestamp));
    }

    /// @notice Testing helper - closes position without FundVault interaction
    /// @dev ONLY FOR LOCAL TESTING - bypasses _settlePnL() and FundVault credit
    function closePositionTest(uint256 positionIndex) external {
        require(positionIndex < positions[msg.sender].length, "Position not found");
        
        RwaPerpTypes.Position storage pos = positions[msg.sender][positionIndex];
        require(pos.isOpen, "Position already closed");
        
        (uint256 exitPriceE8, uint256 exitUpdatedAt, bytes32 exitSourceId,, bool settlementEnabled) = IRwaPriceOracle(oracleAdapters[pos.assetId]).latestPrice(pos.assetId);
        require(exitPriceE8 > 0, "Invalid exit oracle price");
        require(settlementEnabled, "Asset not available for settlement");
        
        RwaPerpTypes.AssetConfig memory config = assetConfigs[pos.assetId];
        if (config.maxStaleness > 0) {
            require(block.timestamp - exitUpdatedAt <= config.maxStaleness, "Exit price data is stale");
        }
        
        int256 pnlScalar = RwaPerpMath._calculatePnL(pos, exitPriceE8);
        
        // For testing: skip FundVault interaction, just mark closed
        pos.isOpen = false;
        
        emit PositionClosed(msg.sender, positionIndex, pos.assetId, uint128(exitPriceE8), exitSourceId, pnlScalar, uint64(block.timestamp));
    }

    /// @notice Close an existing position with PnL settlement
    /// @dev Queries oracle for exit price and settles profit/loss
    /// @param positionIndex Index in the user's positions array
    function closePosition(uint256 positionIndex) external {
        // Validate position exists
        require(positionIndex < positions[msg.sender].length, "Position not found");
        
        // Load position from storage
        RwaPerpTypes.Position storage pos = positions[msg.sender][positionIndex];
        
        // Validate position is open
        require(pos.isOpen, "Position already closed");
        
        // Query oracle for exit price
        (
            uint256 exitPriceE8,
            uint256 exitUpdatedAt,
            bytes32 exitSourceId,
            ,  // confidence (unused)
            bool settlementEnabled
        ) = IRwaPriceOracle(oracleAdapters[pos.assetId]).latestPrice(pos.assetId);
        
        // Validate exit price data
        require(exitPriceE8 > 0, "Invalid exit oracle price");
        require(settlementEnabled, "Asset not available for settlement");
        
        // Check staleness against asset config
        RwaPerpTypes.AssetConfig memory config = assetConfigs[pos.assetId];
        if (config.maxStaleness > 0) {
            require(block.timestamp - exitUpdatedAt <= config.maxStaleness, "Exit price data is stale");
        }
        
        // Calculate PnL scalar
        int256 pnlScalar = RwaPerpMath._calculatePnL(pos, exitPriceE8);
        
        // CRITICAL: Re-assert ACL on margin handle from storage before settlement
        // Handle was created in a prior transaction; must ensure this contract can still operate on it
        Nox.allowThis(pos.marginHandle);
        
        // Settle PnL (includes margin return)
        _settlePnL(msg.sender, pnlScalar, pos.marginHandle);
        
        // Mark position as closed
        pos.isOpen = false;
        
        // Emit position closed event
        emit PositionClosed(
            msg.sender,
            positionIndex,
            pos.assetId,
            uint128(exitPriceE8),
            exitSourceId,
            pnlScalar,
            uint64(block.timestamp)
        );
    }

    // ============================================
    // VIEW FUNCTIONS
    // ============================================

    /// @notice Get all positions for a user
    /// @param user Address of the user
    /// @return Array of Position structs
    function getPositions(address user) external view returns (RwaPerpTypes.Position[] memory) {
        return positions[user];
    }

    /// @notice Get position count for a user
    /// @param user Address of the user
    /// @return Number of positions
    function getPositionCount(address user) external view returns (uint256) {
        return positions[user].length;
    }

    /// @notice Get a specific position for a user
    /// @param user Address of the user
    /// @param positionIndex Index in the user's positions array
    /// @return Position struct
    function getPosition(address user, uint256 positionIndex) external view returns (RwaPerpTypes.Position memory) {
        require(positionIndex < positions[user].length, "Position not found");
        return positions[user][positionIndex];
    }

    /// @notice Get treasury balance handle for off-chain monitoring
    /// @dev Decryption requires admin EIP-712 signature off-chain
    /// @return Encrypted treasury balance handle
    function getTreasuryBalance() external view returns (euint256) {
        return treasuryBalanceHandle;
    }

    /// @notice Get asset configuration
    /// @param assetId Asset identifier
    /// @return AssetConfig struct
    function getAssetConfig(bytes32 assetId) external view returns (RwaPerpTypes.AssetConfig memory) {
        return assetConfigs[assetId];
    }

    /// @notice Get oracle adapter address for an asset
    /// @param assetId Asset identifier
    /// @return Address of the oracle adapter
    function getOracleAdapter(bytes32 assetId) external view returns (address) {
        return oracleAdapters[assetId];
    }
}
