# Implementation Plan: Confidential RWA Perpetual Engine

## Overview

This plan implements the Confidential RWA Perpetual Engine (RealVault) for leveraged synthetic exposure to real-world assets with full privacy via iExec Nox FHE encryption. The implementation includes:

- Smart contracts (RwaPerpEngine, oracle adapters) with safe FHE arithmetic
- Pluggable oracle architecture (Chainlink for market-priced, signed NAV for fund shares)
- Loss capping and treasury solvency checks using encrypted comparisons
- Per-investor ACL model with IDisclosureManager integration
- Frontend trading panel with asset-specific UI behavior
- Comprehensive testing (unit tests + 19 property-based tests)

**CRITICAL SECURITY REQUIREMENTS:**
- ⚠️ ALWAYS use Nox.safeAdd/safeSub - NEVER bare add/sub
- ⚠️ ALWAYS validate balance with explicit Nox.ge() BEFORE safeSub()
- ⚠️ ALWAYS cap losses to margin using Nox.select()
- ⚠️ ALWAYS use encrypted branching (Nox.select, ebool comparisons)
- ⚠️ NEVER grant blanket auditor access - query per-user ACLs

## Tasks

- [ ] 1. Set up project structure and dependencies
  - Install Hardhat, OpenZeppelin, Chainlink contracts, Nox SDK
  - Configure Sepolia network in hardhat.config.js
  - Set up TypeScript for type-safe contract interactions
  - _Requirements: 21.1, 21.2_

- [x] 2. Implement core data structures and interfaces
  - [x] 2.1 Create Position struct with encrypted margin handle
    - Define Position struct with assetId, marginHandle (euint256), entryPriceE8, entryRoundOrNonce, entrySourceId, leverage, openedAt, isLong, isOpen
    - Implement storage-efficient field packing (uint128 for price, uint80 for round, uint8 for leverage)
    - _Requirements: 1.2, 1.6_

  - [x] 2.2 Create IRwaPriceOracle interface
    - Define latestPrice() function returning (priceE8, updatedAt, sourceId, confidence, settlementEnabled)
    - Document interface with NatSpec comments for oracle adapter implementations
    - _Requirements: 3.1_

  - [x] 2.3 Create AssetConfig struct for registry
    - Define AssetConfig with assetId, symbol, oracleAdapter, maxStaleness, valuationMethod, description
    - _Requirements: 19.1, 19.4_

- [x] 3. Implement ChainlinkRwaOracleAdapter
  - [x] 3.1 Create ChainlinkRwaOracleAdapter contract implementing IRwaPriceOracle
    - Import Chainlink AggregatorV3Interface
    - Implement configureFeed() to register Chainlink feeds per assetId
    - Store heartbeat configuration per asset
    - _Requirements: 4.1, 4.2_

  - [x] 3.2 Implement latestPrice() with comprehensive Chainlink validations
    - Call feed.latestRoundData() to get (roundId, answer, updatedAt, answeredInRound)
    - Validate answeredInRound >= roundId (detect stale rounds)
    - Validate answeredInRound > 0 (detect invalid rounds)
    - Validate answer > 0 (reject zero/negative prices)
    - Calculate staleness: (block.timestamp - updatedAt) <= heartbeat
    - Return sourceId as bytes32(uint256(uint160(feedAddress)))
    - Set settlementEnabled based on staleness check
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_

  - [ ]* 3.3 Write property test for Chainlink staleness detection
    - **Property 7: Chainlink Heartbeat Staleness Detection**
    - **Validates: Requirements 4.7, 4.8**
    - Generate random (updatedAt, heartbeat) pairs
    - Verify settlementEnabled = false when (block.timestamp - updatedAt) > heartbeat
    - Minimum 100 iterations

  - [ ]* 3.4 Write unit tests for Chainlink adapter edge cases
    - Test answeredInRound < roundId rejection
    - Test zero answeredInRound rejection
    - Test negative price rejection
    - _Requirements: 4.5, 4.6_

- [ ] 4. Implement SignedNavOracleAdapter
  - [-] 4.1 Create SignedNavOracleAdapter contract implementing IRwaPriceOracle
    - Define NavSubmission struct (navE8, publishedAt, validUntil, nonce, signature)
    - Create mappings: authorizedPublishers, latestNav, lastNonce per assetId
    - Import OpenZeppelin ECDSA library for signature verification
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ] 4.2 Implement submitNav() with ECDSA verification
    - Validate nonce > lastNonce[assetId] (monotonic increase)
    - Reconstruct message hash: keccak256(abi.encodePacked(assetId, navE8, publishedAt, validUntil, nonce))
    - Create Ethereum signed message hash with "\x19Ethereum Signed Message:\n32" prefix
    - Recover signer using ECDSA.recover(ethSignedHash, signature)
    - Require signer == authorizedPublishers[assetId]
    - Update latestNav[assetId] and lastNonce[assetId]
    - Emit NavSubmitted event
    - _Requirements: 5.4, 5.5_

  - [ ] 4.3 Implement latestPrice() with time window validation
    - Load latestNav[assetId]
    - Require nav.navE8 > 0
    - Calculate settlementEnabled: (block.timestamp >= publishedAt && block.timestamp <= validUntil)
    - Compute sourceId: keccak256(abi.encodePacked("SignedNAV", authorizedPublishers[assetId]))
    - Return (navE8, publishedAt, sourceId, 90, settlementEnabled)
    - _Requirements: 5.6, 5.7_

  - [ ]* 4.4 Write property test for NAV nonce monotonicity
    - **Property 10: Signed NAV Nonce Monotonicity**
    - **Validates: Requirements 5.5**
    - Generate random nonce sequences
    - Verify submissions with nonce <= lastNonce are rejected
    - Verify submissions with nonce > lastNonce are accepted
    - Minimum 100 iterations

  - [ ]* 4.5 Write unit tests for signature verification failures
    - Test unauthorized signer rejection
    - Test invalid signature rejection
    - Test replay attack prevention via nonce
    - _Requirements: 5.4, 5.5_

- [ ] 5. Checkpoint - Verify oracle adapter implementations
  - Test Chainlink adapter on Sepolia fork with real XAU/USD feed
  - Test SignedNavOracleAdapter with ECDSA test signatures
  - Ensure all tests pass, ask the user if questions arise

- [ ] 6. Implement RwaPerpEngine core state management
  - [ ] 6.1 Create RwaPerpEngine contract with state variables
    - Define mapping(address => Position[]) public positions
    - Define mapping(bytes32 => address) public oracleAdapters
    - Define address public fundVault, vaultTreasury, disclosureManagerContract
    - Define euint256 private treasuryBalance
    - Define uint8 public constant MAX_LEVERAGE = 10
    - _Requirements: 1.1, 3.2, 9.1, 10.1_

  - [ ] 6.2 Implement oracle adapter registration function
    - Create registerOracleAdapter(bytes32 assetId, address adapter) onlyOwner
    - Validate adapter implements IRwaPriceOracle via interface check
    - Update oracleAdapters[assetId] = adapter
    - Emit OracleAdapterRegistered(assetId, adapter) event
    - _Requirements: 3.8, 19.2, 19.3_

  - [ ] 6.3 Implement asset configuration function
    - Create configureAsset(bytes32 assetId, AssetConfig memory config) onlyOwner
    - Store asset-specific parameters (maxStaleness, symbol, valuationMethod, description)
    - _Requirements: 19.4_

  - [ ]* 6.4 Write property test for oracle adapter routing
    - **Property 5: Oracle Adapter Routing**
    - **Validates: Requirements 3.3, 7.3, 8.2**
    - Register random oracle adapters per assetId
    - Verify queries route to correct adapter
    - Verify unregistered assetIds revert
    - Minimum 100 iterations

- [ ] 7. Implement Nox FHE safe arithmetic helpers
  - [ ] 7.1 Create internal _updateUserBalance() helper with per-user ACL
    - Accept (address user, euint256 newBalance) parameters
    - Call Nox.allowThis(newBalance) to grant contract access
    - Call Nox.allow(newBalance, user) to grant user decryption
    - Query IDisclosureManager(disclosureManagerContract).getAuthorizedAuditors(user)
    - Loop through returned auditors and call Nox.allow(newBalance, auditor) for each
    - Update FundVault balance via IFundVault(fundVault).updatePosition(user, newBalance)
    - **⚠️ CRITICAL: Use per-user ACL query, NOT global disclosure manager**
    - _Requirements: 2.7, 2.8, 10.1, 10.2, 11.2_

  - [ ] 7.2 Create internal _debitMargin() helper with explicit balance validation
    - Accept (address user, euint256 marginAmount) parameters
    - Load userBalance = IFundVault(fundVault).getPosition(user)
    - **⚠️ CRITICAL: Validate sufficient balance BEFORE subtraction**
    - Call ebool hasSufficientBalance = Nox.ge(userBalance, marginAmount)
    - Require(hasSufficientBalance, "Insufficient margin balance")
    - Call euint256 newBalance = Nox.safeSub(userBalance, marginAmount)
    - **⚠️ NOTE: safeSub() saturates to zero without revert per ERC-7984**
    - Call _updateUserBalance(user, newBalance)
    - Emit MarginDebited(user, marginAmount) event
    - _Requirements: 2.1, 7.2, 20.1_

  - [ ] 7.3 Create internal _creditBalance() helper with safe addition
    - Accept (address user, euint256 creditAmount) parameters
    - Load userBalance = IFundVault(fundVault).getPosition(user)
    - Call euint256 newBalance = Nox.safeAdd(userBalance, creditAmount)
    - **⚠️ CRITICAL: Use Nox.safeAdd(), NOT bare Nox.add()**
    - Call _updateUserBalance(user, newBalance)
    - _Requirements: 2.3, 8.6, 8.10_

  - [ ] 7.4 Create internal _scaledAmount() helper for PnL scalar application
    - Accept (euint256 baseHandle, uint256 scalarE8) parameters
    - Multiply encrypted value by plaintext scalar: Nox.mul(baseHandle, scalarE8)
    - Divide by scale factor 1e8 to normalize: Nox.div(scaledValue, Nox.toEuint256(1e8))
    - Return resulting euint256 handle
    - _Requirements: 8.4, 8.5, 24.3_

- [ ] 8. Implement PnL calculation logic
  - [ ] 8.1 Create internal _calculatePnL() function
    - Accept (Position memory pos, uint256 exitPriceE8) parameters
    - Calculate priceDelta: if isLong then (exitPrice - entryPrice) else (entryPrice - exitPrice)
    - Calculate pnlScalar = (priceDelta × leverage × 1e8) / entryPrice (basis points)
    - Return int256 pnlScalar (positive = profit, negative = loss)
    - **⚠️ CORRECT: This DOES multiply by leverage exactly once**
    - _Requirements: 8.4, 8.5, 24.3_

  - [ ]* 8.2 Write property test for long position PnL calculation
    - **Property 13: Long Position PnL Calculation**
    - **Validates: Requirements 8.4**
    - Generate random (entryPrice, exitPrice, margin, leverage) tuples
    - Open long positions and close at exit price
    - Verify PnL = ((exitPrice - entryPrice) × margin × leverage) / entryPrice
    - Minimum 100 iterations

  - [ ]* 8.3 Write property test for short position PnL calculation
    - **Property 14: Short Position PnL Calculation**
    - **Validates: Requirements 8.5**
    - Generate random (entryPrice, exitPrice, margin, leverage) tuples
    - Open short positions and close at exit price
    - Verify PnL = ((entryPrice - exitPrice) × margin × leverage) / entryPrice
    - Minimum 100 iterations

- [ ] 9. Implement treasury settlement logic with loss capping
  - [ ] 9.1 Create internal _settlePnL() function with encrypted loss capping
    - Accept (address user, int256 pnlScalar, euint256 marginHandle) parameters
    - Load userBalance and treasuryBalance
    - If pnlScalar > 0 (USER PROFIT):
      - Calculate profitHandle = _scaledAmount(marginHandle, uint256(pnlScalar))
      - **⚠️ CRITICAL: Check treasury solvency with explicit validation**
      - Call ebool treasuryCovers = Nox.ge(treasuryBalance, profitHandle)
      - If (!treasuryCovers) revert("Treasury insufficient funds") OR use select for graceful degradation
      - Call euint256 payout = Nox.select(treasuryCovers, profitHandle, treasuryBalance)
      - **⚠️ CRITICAL: Validate treasury balance BEFORE subtraction**
      - Call treasuryBalance = Nox.safeSub(treasuryBalance, payout)
      - Call Nox.allowThis(treasuryBalance)
      - Call newUserBalance = Nox.safeAdd(userBalance, payout)
      - Call _updateUserBalance(user, newUserBalance)
    - Else if pnlScalar < 0 (USER LOSS):
      - Calculate lossHandle = _scaledAmount(marginHandle, uint256(-pnlScalar))
      - **⚠️ CRITICAL: Cap loss to margin to prevent negative balances**
      - Call ebool lossExceedsMargin = Nox.gt(lossHandle, marginHandle)
      - Call euint256 cappedLoss = Nox.select(lossExceedsMargin, marginHandle, lossHandle)
      - **⚠️ CRITICAL: Validate sufficient balance BEFORE subtraction**
      - Call ebool hasSufficientBalance = Nox.ge(userBalance, cappedLoss)
      - Require(hasSufficientBalance, "Insufficient balance for loss")
      - Call newUserBalance = Nox.safeSub(userBalance, cappedLoss)
      - Call _updateUserBalance(user, newUserBalance)
      - Call treasuryBalance = Nox.safeAdd(treasuryBalance, cappedLoss)
      - Call Nox.allowThis(treasuryBalance)
    - Emit PnLSettled(user, pnlScalar, pnlScalar >= 0) event
    - _Requirements: 8.6, 8.7, 8.10, 9.2, 9.3, 9.6, 20.8_

  - [ ]* 9.2 Write property test for treasury debit on user profit
    - **Property 16: Treasury Debit on User Profit**
    - **Validates: Requirements 9.2**
    - Generate random profitable positions
    - Record treasury balance before settlement
    - Close positions and verify treasury decreased by profit amount
    - Minimum 100 iterations

  - [ ]* 9.3 Write property test for treasury credit on user loss
    - **Property 17: Treasury Credit on User Loss**
    - **Validates: Requirements 9.3**
    - Generate random losing positions
    - Record treasury balance before settlement
    - Close positions and verify treasury increased by loss amount
    - Minimum 100 iterations

- [ ] 10. Implement openPosition() function
  - [ ] 10.1 Create openPosition() public function with encrypted input
    - Accept parameters: (bytes32 assetId, externalEuint256 externalMargin, bytes calldata inputProof, uint8 leverage, bool isLong)
    - Validate leverage: require(leverage >= 1 && leverage <= MAX_LEVERAGE)
    - Convert external encrypted input: euint256 marginHandle = Nox.fromExternal(externalMargin, inputProof)
    - Verify oracle adapter exists: require(oracleAdapters[assetId] != address(0), "No oracle configured for asset")
    - Query oracle: (priceE8, updatedAt, sourceId, confidence, settlementEnabled) = IRwaPriceOracle(oracleAdapters[assetId]).latestPrice(assetId)
    - Validate price data: require(priceE8 > 0 && settlementEnabled, "Invalid or stale oracle price")
    - Call _debitMargin(msg.sender, marginHandle)
    - Create Position struct with immutable snapshots
    - Append position to positions[msg.sender]
    - Emit PositionOpened(...) event
    - _Requirements: 1.2, 2.9, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.9, 7.10, 7.11, 20.5, 20.6, 20.9, 24.4, 24.5_

  - [ ]* 10.2 Write property test for position creation completeness
    - **Property 1: Position Creation Completeness**
    - **Validates: Requirements 1.2, 7.5**
    - Generate random position parameters
    - Open positions and verify all fields are populated
    - Verify isOpen = true and marginHandle is valid
    - Minimum 100 iterations

  - [ ]* 10.3 Write property test for multiple concurrent positions
    - **Property 2: Multiple Concurrent Positions**
    - **Validates: Requirements 1.3, 7.6**
    - Generate N random positions per user (1-10)
    - Open all positions and verify positions array length = N
    - Verify each position is independently addressable by index
    - Minimum 100 iterations

  - [ ]* 10.4 Write unit tests for position opening error cases
    - Test insufficient balance rejection (explicit ge() validation)
    - Test invalid leverage rejection
    - Test stale oracle rejection
    - Test unregistered asset rejection
    - _Requirements: 20.1, 20.5, 20.6, 20.9_

- [ ] 11. Implement closePosition() function
  - [ ] 11.1 Create closePosition() public function with settlement
    - Accept parameter: uint256 positionIndex
    - Validate position exists: require(positionIndex < positions[msg.sender].length)
    - Load position: Position storage pos = positions[msg.sender][positionIndex]
    - Validate position open: require(pos.isOpen, "Position already closed")
    - Query oracle for exit price: (exitPriceE8, ..., exitSourceId, ..., settlementEnabled) = IRwaPriceOracle(oracleAdapters[pos.assetId]).latestPrice(pos.assetId)
    - Validate exit price: require(exitPriceE8 > 0 && settlementEnabled, "Invalid or stale exit price")
    - Calculate PnL: int256 pnlScalar = _calculatePnL(pos, exitPriceE8)
    - Settle PnL: _settlePnL(msg.sender, pnlScalar, pos.marginHandle)
    - Return margin: _creditBalance(msg.sender, pos.marginHandle)
    - Set position closed: pos.isOpen = false
    - Emit PositionClosed(...) event
    - _Requirements: 8.1, 8.2, 8.3, 8.9, 8.11, 20.2, 20.3, 20.7_

  - [ ]* 11.2 Write property test for position close state transition
    - **Property 3: Position Close State Transition**
    - **Validates: Requirements 1.4, 8.9**
    - Generate random open positions
    - Close positions and verify isOpen = false
    - Verify position remains in array (not deleted)
    - Minimum 100 iterations

  - [ ]* 11.3 Write property test for entry snapshot immutability
    - **Property 4: Entry Snapshot Immutability**
    - **Validates: Requirements 1.5**
    - Open random positions with recorded entry data
    - Perform oracle price updates
    - Close positions and verify entry fields unchanged
    - Minimum 100 iterations

  - [ ]* 11.4 Write property test for balance round-trip after position close
    - **Property 15: Balance Round-Trip After Position Close**
    - **Validates: Requirements 2.3, 2.4, 8.6, 8.7, 8.8**
    - Record initial balance B0
    - Open position with margin M
    - Close position with PnL P
    - Verify final balance = B0 + P (margin returned, PnL applied)
    - Minimum 100 iterations

  - [ ]* 11.5 Write unit tests for position closing error cases
    - Test position not found rejection
    - Test already closed rejection
    - Test stale exit price rejection
    - _Requirements: 20.2, 20.3, 20.7_

- [ ] 12. Checkpoint - Verify position lifecycle
  - Test complete open/close flow with mock oracles
  - Verify encrypted balance updates via Nox decryption
  - Test multi-wallet isolation
  - Ensure all tests pass, ask the user if questions arise

- [ ] 13. Implement treasury management functions
  - [ ] 13.1 Create initializeTreasury() function
    - Accept externalEuint256 initialBalance and inputProof
    - Convert to euint256: treasuryBalance = Nox.fromExternal(initialBalance, inputProof)
    - Call Nox.allowThis(treasuryBalance)
    - Emit TreasuryInitialized(initialBalance) event
    - Restrict to onlyOwner
    - _Requirements: 9.1, 9.5_

  - [ ] 13.2 Create getTreasuryBalance() view function for off-chain monitoring
    - Return euint256 treasuryBalance (encrypted handle)
    - Decryption requires admin EIP-712 signature off-chain
    - _Requirements: 9.5_

  - [ ]* 13.3 Write unit tests for treasury solvency edge cases
    - Test treasury insufficient funds rejection (explicit ge() validation)
    - Test partial payout via select() for graceful degradation
    - _Requirements: 9.6, 20.8_

- [ ] 14. Implement ACL and permission management
  - [ ] 14.1 Implement IDisclosureManager interface
    - Define getAuthorizedAuditors(address investor) external view returns (address[] memory)
    - Document per-user authorization model
    - _Requirements: 10.1, 10.2, 11.2_

  - [ ] 14.2 Create grantAclPermission() helper function for frontend
    - Accept user address parameter
    - Load user's balance handle from FundVault
    - Call Nox.allow(balanceHandle, address(RwaPerpEngine))
    - Emit AclPermissionGranted(user) event
    - _Requirements: 10.1, 7.1_

  - [ ]* 14.3 Write unit tests for ACL permission requirements
    - Test position opening without permission reverts
    - Test position opening with permission succeeds
    - Test permission revocation prevents operations
    - _Requirements: 10.1, 10.2, 10.4, 20.4_

- [ ] 15. Implement multi-wallet state isolation
  - [ ]* 15.1 Write property test for multi-wallet position isolation
    - **Property 18: Multi-Wallet Position Isolation**
    - **Validates: Requirements 15.4**
    - Generate random operations for wallets A and B
    - Perform operations on wallet A
    - Verify wallet B state unchanged (positions, balances)
    - Minimum 100 iterations

  - [ ]* 15.2 Write integration test for 10,000+ wallet scalability
    - Simulate 10,000 independent wallet addresses
    - Each wallet opens 1-3 positions
    - Verify contract supports concurrent operations
    - Verify gas costs scale linearly
    - _Requirements: 15.2_

- [ ] 16. Implement event emission for indexing
  - [ ] 16.1 Add comprehensive events to RwaPerpEngine
    - PositionOpened(user, positionIndex, assetId, isLong, leverage, entryPriceE8, entryRoundOrNonce, entrySourceId, timestamp)
    - PositionClosed(user, positionIndex, assetId, exitPriceE8, exitSourceId, pnlScalar, timestamp)
    - OracleAdapterRegistered(assetId, adapter, valuationMethod)
    - MarginDebited(user, marginHandle)
    - PnLSettled(user, pnlScalar, isProfit)
    - All events use indexed parameters for efficient filtering
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6_

  - [ ]* 16.2 Write unit tests for event emission
    - Test PositionOpened emitted on openPosition()
    - Test PositionClosed emitted on closePosition()
    - Test OracleAdapterRegistered emitted on adapter registration
    - Verify indexed parameters are correct
    - _Requirements: 22.1, 22.2, 22.5_

- [ ] 17. Implement leverage validation and position sizing
  - [ ]* 17.1 Write property test for no leverage double-multiplication
    - **Property 19: No Leverage Double-Multiplication**
    - **Validates: Requirements 24.3**
    - Generate random (margin, leverage) pairs
    - Verify position size = margin × leverage (implicit, not stored)
    - Verify PnL calculation uses leverage exactly once in scalar
    - Minimum 100 iterations

  - [ ]* 17.2 Write unit tests for leverage validation
    - Test leverage < 1 rejection
    - Test leverage > 10 rejection
    - Test valid leverage range acceptance (1-10)
    - _Requirements: 24.4, 24.5_

- [ ] 18. Implement FundVault integration
  - [ ] 18.1 Create IFundVault interface for RwaPerpEngine
    - Define getPosition(address investor) external view returns (euint256)
    - Define updatePosition(address investor, euint256 newBalance) external
    - Document ACL permission requirements
    - _Requirements: 2.1, 2.3, 23.1, 23.2, 23.5_

  - [ ]* 18.2 Write integration tests for FundVault interaction
    - Test margin debit from FundVault on position open (using safeSub with explicit ge() validation)
    - Test margin credit to FundVault on position close (using safeAdd)
    - Test PnL settlement updates FundVault balances atomically
    - Verify explicit ge() validation prevents insufficient balance
    - _Requirements: 23.1, 23.3, 23.5_

- [ ] 19. Frontend - Set up project structure
  - [ ] 19.1 Initialize Next.js project with TypeScript
    - Create /frontend directory with Next.js 14+
    - Install dependencies: ethers, @iexec/nox-sdk, wagmi, viem
    - Configure TypeScript for type-safe contract interactions
    - Set up Tailwind CSS for styling
    - _Requirements: 12.1_

  - [ ] 19.2 Generate TypeScript types from contract ABIs
    - Use TypeChain to generate types from RwaPerpEngine, oracle adapters, FundVault
    - Configure ethers-v6 plugin for contract factories
    - _Requirements: 12.1_

- [ ] 20. Frontend - Implement core React hooks
  - [ ] 20.1 Create useOraclePrice hook
    - Accept assetId parameter
    - Query oracle adapter address from RwaPerpEngine
    - Call IRwaPriceOracle.latestPrice(assetId)
    - Return { priceE8, updatedAt, sourceId, confidence, settlementEnabled, priceFormatted }
    - Implement asset-specific refresh intervals (30s for rGOLD, 5min for rUSTB, 1hr for rCRE)
    - _Requirements: 12.6, 12.9_

  - [ ] 20.2 Create useEncryptedBalance hook
    - Query FundVault.getPosition(userAddress)
    - Return encrypted euint256 handle
    - Provide decryption function using Nox SDK with EIP-712 signature
    - _Requirements: 11.1_

  - [ ] 20.3 Create usePositionManagement hook
    - Implement openPosition(assetId, marginPlaintext, leverage, isLong) function
      - Encrypt margin using Nox SDK: encryptInput(marginPlaintext, userAddress)
      - Generate input proof for externalEuint256
      - Check ACL permission granted
      - Call RwaPerpEngine.openPosition(assetId, externalMargin, proof, leverage, isLong)
    - Implement closePosition(positionIndex) function
      - Call RwaPerpEngine.closePosition(positionIndex)
    - Implement getPositions() function
      - Call RwaPerpEngine.getPositions(userAddress)
    - _Requirements: 12.5, 12.8_

- [ ] 21. Frontend - Implement asset-specific UI components
  - [ ] 21.1 Create AssetSelector component
    - Radio buttons or dropdown for rGOLD, rUSTB, rCRE
    - Display asset symbol and description
    - Update oracle display when asset changes
    - _Requirements: 12.2_

  - [ ] 21.2 Create OracleDisplay component for market-priced RWAs (rGOLD)
    - Display current price with currency formatting ($X,XXX.XX per oz)
    - Display oracle source with Etherscan link
    - Display last update timestamp with freshness indicator
    - Display "Trading Active" or "Stale Price - Trading Paused" badge
    - Include intraday price chart (1H timeframe)
    - _Requirements: 12.6_

  - [ ] 21.3 Create OracleDisplay component for NAV-priced RWAs (rUSTB)
    - Display NAV value with currency formatting
    - Display publisher identity with verification badge
    - Display publication timestamp and validity window
    - Display "Settlement Available" or "Outside Settlement Window" badge
    - Include alert: "NAV-Priced Asset - Trading available only during valid NAV window"
    - Include historical NAV series chart (NO intraday candles)
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 5.9_

  - [ ] 21.4 Create OracleDisplay component for appraisal-priced RWAs (rCRE)
    - Display appraisal value with currency formatting
    - Display valuator/administrator identity
    - Display valuation date and expiry
    - Include warning alert: "Appraisal-Priced Real Estate - No automatic liquidation. Settlement available only during valid appraisal window."
    - Include maximum historical appraisal series chart (NO live tickers)
    - _Requirements: 13.5, 13.6, 13.7, 13.8, 6.5, 6.6, 6.7, 6.8_

  - [ ] 21.5 Create PositionForm component
    - DirectionToggle for long/short selection
    - LeverageSlider for 1x-10x range
    - MarginInput with encrypted input handling
    - "Open Position" button (enabled only when settlementEnabled = true)
    - _Requirements: 12.3, 12.4, 12.5, 12.7_

  - [ ] 21.6 Create PositionTable component
    - Display columns: Asset, Direction, Leverage, Entry Price, Current Price, Entry Source, Unrealized PnL, Actions
    - Calculate real-time unrealized PnL using current oracle price
    - Display entry source ID with verification link tooltip
    - "Close Position" button (enabled only when settlementEnabled = true)
    - Display message: "Protocol-backed synthetic exposure, settled against Vault Treasury with verifiable RWA reference pricing"
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8_

  - [ ] 21.7 Create GrantPermissionButton component
    - Check if ACL permission already granted
    - Display info alert explaining permission requirement
    - "Grant Permission" button calling Nox.allow(balanceHandle, RwaPerpEngineAddress)
    - Display success toast after permission granted
    - _Requirements: 10.1_

- [ ] 22. Frontend - Implement main trading page at /investor route
  - [ ] 22.1 Create /investor/page.tsx
    - Connect wallet with wagmi
    - Display GrantPermissionButton if permission not granted
    - Display AssetSelector
    - Display asset-specific OracleDisplay
    - Display PositionForm
    - Display PositionTable
    - _Requirements: 12.1, 12.2_

  - [ ]* 22.2 Write frontend integration tests
    - Test wallet connection
    - Test asset switching updates oracle display
    - Test position opening with encrypted margin
    - Test position closing
    - _Requirements: 12.1_

- [ ] 23. Deployment - Create deployment scripts
  - [ ] 23.1 Create deploy-rwa-perp-engine.js script
    - Deploy RwaPerpEngine with fundVaultAddress and treasuryAddress parameters
    - Deploy ChainlinkRwaOracleAdapter
    - Deploy SignedNavOracleAdapter
    - Configure Chainlink feed for rGOLD (Sepolia XAU/USD or testnet disclaimer)
    - Set authorized publishers for rUSTB and rCRE
    - Register oracle adapters in RwaPerpEngine
    - Configure asset parameters (maxStaleness, symbol, valuationMethod, description)
    - Save deployment addresses to deployments/sepolia-rwa-perp-engine.json
    - _Requirements: 16.1, 16.2, 16.3, 16.5, 16.6, 16.7, 4.10, 4.11_

  - [ ] 23.2 Create test-oracle-queries.js script
    - Query each configured oracle adapter
    - Display current prices, timestamps, source IDs, settlement status
    - Verify oracle data freshness
    - _Requirements: 16.5_

  - [ ] 23.3 Create fund-treasury.js script
    - Initialize treasury with test mUSDC collateral
    - Call initializeTreasury() with encrypted balance
    - Verify treasury balance via getTreasuryBalance()
    - _Requirements: 9.1, 9.5, 16.5_

- [ ] 24. Deployment - Execute Sepolia deployment
  - [ ] 24.1 Configure environment variables
    - SEPOLIA_RPC_URL, PRIVATE_KEY
    - FUND_VAULT_ADDRESS (existing contract)
    - SEPOLIA_GOLD_FEED (Chainlink XAU/USD or testnet substitute)
    - USTB_PUBLISHER_ADDRESS, CRE_PUBLISHER_ADDRESS (testnet wallets)
    - VAULT_TREASURY_ADDRESS
    - _Requirements: 16.1, 16.3_

  - [ ] 24.2 Run deployment script
    - npx hardhat run scripts/deploy-rwa-perp-engine.js --network sepolia
    - Verify all contracts deployed successfully
    - Verify oracle adapters registered
    - _Requirements: 16.1_

  - [ ] 24.3 Verify contracts on Etherscan
    - npx hardhat verify --network sepolia for each contract
    - _Requirements: 16.5_

  - [ ] 24.4 Initialize treasury and test integration
    - Run scripts/fund-treasury.js
    - Run scripts/test-oracle-queries.js
    - Verify integration successful
    - _Requirements: 16.5_

- [ ] 25. Multi-wallet testing scenarios
  - [ ]* 25.1 Write integration test for profit scenario
    - **Validates: Requirements 17.1**
    - Wallet A opens long position at entry price
    - Oracle price increases
    - Wallet A closes position with profit
    - Verify Wallet A balance increased, treasury decreased
    - Use verified oracle price snapshots

  - [ ]* 25.2 Write integration test for loss scenario
    - **Validates: Requirements 17.2**
    - Wallet B opens short position at entry price
    - Oracle price increases (adverse movement)
    - Wallet B closes position with loss
    - Verify Wallet B balance decreased, treasury increased
    - Use verified oracle price snapshots

  - [ ]* 25.3 Write integration test for concurrent multi-wallet positions
    - **Validates: Requirements 17.3**
    - Wallet A, B, C open concurrent positions with different assets
    - Oracle prices update independently per asset
    - Close positions and verify isolated PnL calculations
    - Verify encrypted balance changes via Nox decryption

  - [ ]* 25.4 Write integration test for Chainlink oracle price movements
    - **Validates: Requirements 17.4**
    - Use real Chainlink oracle on Sepolia testnet
    - Open positions at recorded entry roundId
    - Wait for oracle price update
    - Close positions at new roundId
    - Verify immutable entry snapshot preserved

  - [ ]* 25.5 Write integration test for signed NAV submissions
    - **Validates: Requirements 17.5**
    - Generate ECDSA-signed NAV for rUSTB
    - Submit NAV via SignedNavOracleAdapter
    - Open position during valid window
    - Submit new NAV with higher nonce
    - Close position at new NAV
    - Verify signature verification and nonce monotonicity

- [ ] 26. Property-based tests - Chainlink validation properties
  - [ ]* 26.1 Write property test for Chainlink round freshness validation
    - **Property 6: Chainlink Round Freshness Validation**
    - **Validates: Requirements 4.5**
    - Generate random (roundId, answeredInRound) pairs
    - Verify adapter rejects answeredInRound < roundId
    - Verify adapter accepts answeredInRound >= roundId
    - Minimum 100 iterations

  - [ ]* 26.2 Write property test for Chainlink source identification
    - **Property 8: Chainlink Source Identification**
    - **Validates: Requirements 4.9**
    - Generate random Chainlink feed addresses
    - Query adapter for price data
    - Verify sourceId = bytes32(uint256(uint160(feedAddress)))
    - Minimum 100 iterations

- [ ] 27. Property-based tests - Signed NAV validation properties
  - [ ]* 27.1 Write property test for signed NAV signature verification
    - **Property 9: Signed NAV Signature Verification**
    - **Validates: Requirements 5.4**
    - Generate random NAV submissions with valid and invalid signatures
    - Verify adapter accepts only authorized publisher signatures
    - Verify adapter rejects unauthorized signatures
    - Minimum 100 iterations

  - [ ]* 27.2 Write property test for signed NAV time window validation
    - **Property 11: Signed NAV Time Window Validation**
    - **Validates: Requirements 5.6**
    - Generate random (publishedAt, validUntil, block.timestamp) tuples
    - Verify settlementEnabled = true only when publishedAt <= block.timestamp <= validUntil
    - Minimum 100 iterations

  - [ ]* 27.3 Write property test for signed NAV source identification
    - **Property 12: Signed NAV Source Identification**
    - **Validates: Requirements 5.7**
    - Generate random authorized publisher addresses per assetId
    - Submit NAVs and query sourceId
    - Verify sourceId = keccak256(abi.encodePacked("SignedNAV", publisherAddress))
    - Minimum 100 iterations

- [ ] 28. Code quality and documentation
  - [ ] 28.1 Add comprehensive NatSpec comments to all contracts
    - Document all public/external functions with @notice, @param, @return
    - Document security-critical patterns (safe arithmetic, loss capping, ACL model)
    - Include @dev notes for implementation details
    - _Requirements: 18.1, 18.2_

  - [ ] 28.2 Remove all mock/demo code from production contracts
    - Verify no "demo", "mock", "fake" references in contracts
    - Verify no synthetic price generators or Math.random() calls
    - Verify no test-only code paths in production
    - Verify no crypto-to-RWA price feed mapping (ETH/USD → rGOLD, BTC/USD → rUSTB)
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6_

  - [ ] 28.3 Generate API documentation
    - Use Hardhat docgen to generate contract API reference from NatSpec
    - Create user guide for trading interface
    - Create oracle adapter integration guide
    - Document asset-specific behavior (market vs NAV vs appraisal pricing)
    - _Requirements: Documentation requirements from design.md_

  - [ ] 28.4 Run code coverage analysis
    - npx hardhat coverage
    - Verify 90%+ line coverage for core contracts
    - Verify 85%+ branch coverage including error paths
    - _Requirements: Testing Strategy from design.md_

- [ ] 29. Final checkpoint - Complete integration verification
  - [ ] 29.1 Run complete test suite
    - Execute all unit tests
    - Execute all property-based tests (100+ iterations each)
    - Execute all integration tests
    - Verify all 19 correctness properties pass
    - _Requirements: All testing requirements_

  - [ ] 29.2 Verify Sepolia deployment
    - Verify contracts on Etherscan
    - Test position open/close flow with real wallet
    - Verify oracle price queries return valid data
    - Test frontend /investor route with deployed contracts
    - _Requirements: 16.1, 16.5_

  - [ ] 29.3 Verify security patterns implemented
    - Audit code for bare Nox.add/sub usage (must be zero)
    - Audit code for explicit Nox.ge() validation before safeSub()
    - Audit code for loss capping via Nox.select()
    - Audit code for encrypted branching (no decryption in comparisons)
    - Audit code for per-user ACL queries (no global disclosure manager)
    - _Requirements: Security Considerations from design.md_

  - [ ] 29.4 Performance benchmarking
    - Measure gas costs for openPosition() (target: < 500k gas)
    - Measure gas costs for closePosition() (target: < 600k gas)
    - Verify gas costs scale linearly with position count
    - _Requirements: 21.1, 21.2, 21.3_

  - [ ] 29.5 Final user acceptance
    - Ensure all tests pass, ask the user if questions arise

## Notes

- **Tasks marked with `*` are optional test-related sub-tasks** and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at logical breakpoints
- **Property tests validate universal correctness properties (19 total, 100+ iterations each)**
- **Unit tests validate specific examples, edge cases, and error conditions**
- **All FHE arithmetic MUST use safe functions** (safeAdd/safeSub) with explicit validation
- **All balance operations MUST validate with Nox.ge() BEFORE safeSub()** (ERC-7984 spec)
- **All losses MUST be capped to margin** using Nox.select() to prevent negative balances
- **All branching MUST use encrypted comparisons** (ebool, select) without decryption
- **All auditor access MUST query per-user ACLs** via IDisclosureManager, NOT global manager

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 2, "tasks": ["3.1", "4.1", "6.1"] },
    { "id": 3, "tasks": ["3.2", "4.2", "6.2", "6.3"] },
    { "id": 4, "tasks": ["3.3", "3.4", "4.3", "4.4", "4.5", "6.4"] },
    { "id": 5, "tasks": ["7.1", "7.2", "7.3", "7.4"] },
    { "id": 6, "tasks": ["8.1", "8.2", "8.3"] },
    { "id": 7, "tasks": ["9.1", "9.2", "9.3"] },
    { "id": 8, "tasks": ["10.1", "10.2", "10.3", "10.4"] },
    { "id": 9, "tasks": ["11.1", "11.2", "11.3", "11.4", "11.5"] },
    { "id": 10, "tasks": ["13.1", "13.2", "13.3"] },
    { "id": 11, "tasks": ["14.1", "14.2", "14.3"] },
    { "id": 12, "tasks": ["15.1", "15.2"] },
    { "id": 13, "tasks": ["16.1", "16.2"] },
    { "id": 14, "tasks": ["17.1", "17.2"] },
    { "id": 15, "tasks": ["18.1", "18.2"] },
    { "id": 16, "tasks": ["19.1", "19.2"] },
    { "id": 17, "tasks": ["20.1", "20.2", "20.3"] },
    { "id": 18, "tasks": ["21.1", "21.2", "21.3", "21.4", "21.5", "21.6", "21.7"] },
    { "id": 19, "tasks": ["22.1", "22.2"] },
    { "id": 20, "tasks": ["23.1", "23.2", "23.3"] },
    { "id": 21, "tasks": ["24.1", "24.2"] },
    { "id": 22, "tasks": ["24.3", "24.4"] },
    { "id": 23, "tasks": ["25.1", "25.2", "25.3", "25.4", "25.5"] },
    { "id": 24, "tasks": ["26.1", "26.2"] },
    { "id": 25, "tasks": ["27.1", "27.2", "27.3"] },
    { "id": 26, "tasks": ["28.1", "28.2", "28.3", "28.4"] },
    { "id": 27, "tasks": ["29.1", "29.2", "29.3", "29.4", "29.5"] }
  ]
}
```
