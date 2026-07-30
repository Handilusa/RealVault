# Requirements Document

## Introduction

This document specifies requirements for RealVault — a Confidential RWA Synthetic Exposure Engine that provides private margin, verifiable settlement, and transparent RWA reference pricing. The system enables institutional investors to gain leveraged exposure to real-world assets through synthetic perpetual positions while maintaining full privacy via iExec Nox FHE encryption. The architecture implements pluggable oracle adapters that match each RWA asset class's genuine valuation methodology rather than mapping crypto price feeds to RWA labels.

## Glossary

- **RwaPerpEngine**: The smart contract that manages synthetic perpetual positions for RWA assets with pluggable oracle adapters
- **FundVault**: The existing ERC-7984 confidential vault contract that holds encrypted mUSDC balances
- **Nox**: The iExec Nox Fully Homomorphic Encryption (FHE) library for confidential computation
- **IRwaPriceOracle**: Interface for pluggable RWA price oracle adapters that provide asset-specific valuation methodologies
- **ChainlinkRwaOracleAdapter**: Oracle adapter for market-priced RWAs with verified on-chain Chainlink feeds specific to the RWA asset class
- **SignedNavOracleAdapter**: Oracle adapter for NAV-priced or appraisal-priced RWAs using ECDSA-signed off-chain valuations from authorized publishers
- **Position**: A data structure representing a perpetual position with encrypted margin, entry price, entry source verification data, size, direction, and status
- **Margin**: The encrypted collateral (euint256 handle) debited from a user's FundVault balance to open a position
- **PnL**: Profit and Loss calculated as the difference between entry price and exit price multiplied by position size
- **Vault_Treasury**: The protocol-owned treasury that acts as counterparty and absorbs position profits/losses
- **Handle**: An encrypted data reference (euint256) managed by Nox for confidential operations
- **ACL**: Access Control List managed by Nox for granting computation permissions on encrypted handles
- **Investor_Frontend**: The web interface at /investor for user interaction with the synthetic exposure engine
- **rGOLD**: Market-priced RWA representing tokenized gold exposure using XAU/USD or gold-specific verified oracle
- **rUSTB**: NAV-priced RWA representing US Treasury Bill exposure using authorized signed NAV from issuer or fund administrator
- **rCRE**: Appraisal-priced RWA representing commercial real estate exposure using signed NAV/appraisal from authorized valuator
- **mUSDC**: The stablecoin used as collateral in the FundVault system
- **Sepolia**: Ethereum testnet used for deployment with explicit testnet oracle source labeling
- **Settlement_Window**: The time period during which a NAV-priced or appraisal-priced RWA has valid pricing for position actions
- **Source_ID**: Immutable identifier recording the methodology, feed address, or publisher identity used for price verification
- **Entry_Round_Or_Nonce**: Immutable snapshot identifier (Chainlink roundId or signed NAV nonce) recorded at position opening for verification

## Requirements

### Requirement 1: Perpetual Position Management with Verifiable Price Snapshots

**User Story:** As an institutional investor, I want to open and close leveraged synthetic perpetual positions on RWA assets with immutable price verification, so that I can gain price exposure with transparent settlement.

#### Acceptance Criteria

1. THE RwaPerpEngine SHALL store positions using a mapping from user address to Position array
2. WHEN a position is created, THE RwaPerpEngine SHALL record encrypted margin handle (euint256), entry price (uint128 priceE8), position size, direction (isLong boolean), opened timestamp (uint64), entry source verification (entryRoundOrNonce uint80, entrySourceId bytes32), and isOpen status flag
3. THE RwaPerpEngine SHALL support multiple concurrent positions per user address
4. WHEN a position is closed, THE RwaPerpEngine SHALL set the isOpen flag to false
5. THE RwaPerpEngine SHALL maintain position history with immutable price snapshots for audit and compliance purposes
6. THE Position structure SHALL include assetId (bytes32), leverage (uint8), entryPriceE8 (uint128), entryRoundOrNonce (uint80), entrySourceId (bytes32), marginHandle (euint256), openedAt (uint64), isLong (bool), and isOpen (bool)

### Requirement 2: Confidential Margin Management via Nox FHE

**User Story:** As an institutional investor, I want my collateral to remain encrypted on-chain, so that my financial positions are not exposed to competitors or the public.

#### Acceptance Criteria

1. WHEN a user opens a position, THE RwaPerpEngine SHALL debit the margin amount from the user's encrypted FundVault balance using Nox.sub()
2. THE RwaPerpEngine SHALL store the margin as an encrypted handle (euint256) without exposing plaintext values
3. WHEN a position is closed with profit, THE RwaPerpEngine SHALL credit the user's FundVault balance using Nox.add()
4. WHEN a position is closed with loss, THE RwaPerpEngine SHALL debit the loss amount from the user's FundVault balance using Nox.sub()
5. THE RwaPerpEngine SHALL perform all arithmetic operations (margin debits, PnL settlement) using Nox FHE handles
6. THE RwaPerpEngine SHALL NOT expose any plaintext balance information on-chain during position lifecycle
7. THE RwaPerpEngine SHALL call Nox.allowThis() on all newly computed encrypted handles to enable contract operations
8. THE RwaPerpEngine SHALL call Nox.allow(handle, owner) after balance updates to maintain user decryption capability
9. WHEN accepting margin deposits from frontend, THE RwaPerpEngine SHALL use externalEuint256 with inputProof pattern converted via Nox.fromExternal()

### Requirement 3: Pluggable RWA Price Oracle Architecture

**User Story:** As a system architect, I want each RWA asset class to use appropriate verified price sources matching its real-world valuation methodology, so that the system provides genuine RWA exposure rather than crypto-labeled synthetic instruments.

#### Acceptance Criteria

1. THE RwaPerpEngine SHALL define an IRwaPriceOracle interface with latestPrice(bytes32 assetId) returning (uint256 priceE8, uint256 updatedAt, bytes32 sourceId, uint8 confidence, bool settlementEnabled)
2. THE RwaPerpEngine SHALL maintain a mapping from assetId (bytes32) to approved IRwaPriceOracle adapter contract addresses
3. WHEN querying price for an asset, THE RwaPerpEngine SHALL call the configured oracle adapter's latestPrice() function
4. THE RwaPerpEngine SHALL reject price data if priceE8 is zero or negative
5. THE RwaPerpEngine SHALL reject price data if updatedAt timestamp exceeds the asset-specific maximum staleness window
6. THE RwaPerpEngine SHALL reject price data if settlementEnabled is false
7. THE RwaPerpEngine SHALL record sourceId and updatedAt in position records for verification and audit
8. THE RwaPerpEngine SHALL support registering new oracle adapters only through privileged administrative function

### Requirement 4: Market-Priced RWA Oracle Adapter (rGOLD)

**User Story:** As a system operator, I want rGOLD to use verified gold-specific price oracles when available, so that the asset represents genuine tokenized gold exposure rather than ETH-labeled as gold.

#### Acceptance Criteria

1. THE ChainlinkRwaOracleAdapter SHALL implement IRwaPriceOracle interface
2. WHEN configured for rGOLD, THE ChainlinkRwaOracleAdapter SHALL use a verified XAU/USD or gold-backed RWA token oracle feed if available on the deployment network
3. THE ChainlinkRwaOracleAdapter SHALL call Chainlink AggregatorV3Interface.latestRoundData() to obtain (roundId, answer, updatedAt, answeredInRound)
4. THE ChainlinkRwaOracleAdapter SHALL validate that answer is positive and updatedAt is within configured heartbeat window
5. THE ChainlinkRwaOracleAdapter SHALL validate answeredInRound is greater than or equal to roundId to detect stale round data
6. THE ChainlinkRwaOracleAdapter SHALL reject answers where answeredInRound equals zero
7. THE ChainlinkRwaOracleAdapter SHALL compare (block.timestamp minus updatedAt) against configured heartbeat to detect staleness
8. THE ChainlinkRwaOracleAdapter SHALL return settlementEnabled as true only when price data is fresh and verified
9. THE ChainlinkRwaOracleAdapter SHALL return sourceId containing the feed contract address for verification
10. THE System documentation SHALL explicitly state "rGOLD uses XAU/USD or gold RWA-specific oracle; ETH/USD SHALL NEVER be used as gold price proxy"
11. WHERE no verified gold-specific oracle exists on Sepolia, THE System SHALL use SignedNavOracleAdapter with explicit testnet disclaimer

### Requirement 5: NAV-Priced RWA Oracle Adapter (rUSTB)

**User Story:** As a system operator, I want rUSTB to use authorized signed NAV from T-Bill fund administrators, so that the asset represents genuine treasury exposure with verifiable official valuation.

#### Acceptance Criteria

1. THE SignedNavOracleAdapter SHALL implement IRwaPriceOracle interface
2. WHEN configured for rUSTB, THE SignedNavOracleAdapter SHALL store authorized publisher address per assetId on-chain
3. THE SignedNavOracleAdapter SHALL accept signed NAV submissions containing (uint256 navE8, uint256 publishedAt, uint256 validUntil, uint256 nonce, bytes signature)
4. THE SignedNavOracleAdapter SHALL verify ECDSA signature against registered authorizedPublisher[assetId] on-chain
5. THE SignedNavOracleAdapter SHALL reject replay attacks by enforcing monotonically increasing nonce per assetId
6. THE SignedNavOracleAdapter SHALL return settlementEnabled as true only during validUntil window
7. THE SignedNavOracleAdapter SHALL return sourceId containing keccak256(abi.encodePacked("SignedNAV", publisherAddress, methodologyId))
8. THE System documentation SHALL explicitly state "rUSTB uses authorized signed NAV from T-Bill issuer/administrator; BTC/USD SHALL NEVER be used as treasury bond price proxy"
9. THE Investor_Frontend SHALL display publisher identity, NAV publication timestamp, validity window, and methodology for rUSTB positions

### Requirement 6: Appraisal-Priced RWA Oracle Adapter (rCRE)

**User Story:** As a system operator, I want rCRE to use authorized signed appraisals from real estate valuators with appropriate cadence, so that the asset represents genuine commercial real estate exposure without inappropriate intraday trading.

#### Acceptance Criteria

1. THE SignedNavOracleAdapter SHALL support rCRE configuration with weekly or monthly NAV publication cadence
2. WHEN configured for rCRE, THE SignedNavOracleAdapter SHALL enforce minimum time intervals between NAV updates matching real-world appraisal frequency
3. THE SignedNavOracleAdapter SHALL accept signed appraisal submissions from registered valuator or administrator addresses
4. THE RwaPerpEngine SHALL NOT allow position opening or closing for rCRE outside valid appraisal windows
5. THE System documentation SHALL explicitly state "rCRE uses authorized signed appraisals; NO continuous pricing, NO intraday liquidation, NO 1-minute candles"
6. THE Investor_Frontend SHALL display NAV/appraisal value, valuator/administrator identity, valuation date, and expiry for rCRE
7. THE Investor_Frontend SHALL display "Settlement available only during valid appraisal window" message for rCRE
8. THE Investor_Frontend SHALL NOT display live price tickers, order books, trade tape, or funding rates for rCRE

### Requirement 7: Position Opening with Verified Price Snapshot

**User Story:** As an institutional investor, I want to open a perpetual position using my real encrypted mUSDC balance with immutable price verification, so that I can establish leveraged exposure with transparent entry pricing.

#### Acceptance Criteria

1. WHEN a user opens a position, THE RwaPerpEngine SHALL verify the user has granted ACL permission via Nox.allow()
2. WHEN opening a position, THE RwaPerpEngine SHALL debit the specified margin amount from the user's FundVault encrypted balance using Nox.sub()
3. WHEN opening a position, THE RwaPerpEngine SHALL query the configured IRwaPriceOracle adapter for the assetId
4. WHEN opening a position, THE RwaPerpEngine SHALL validate that priceE8 is positive, updatedAt is within maximum staleness, and settlementEnabled is true
5. WHEN opening a position, THE RwaPerpEngine SHALL create a Position record storing assetId, encrypted margin handle, entryPriceE8, entryRoundOrNonce (Chainlink roundId or signed NAV nonce), entrySourceId, leverage, direction (long/short), openedAt timestamp, and isOpen set to true
6. WHEN opening a position, THE RwaPerpEngine SHALL append the Position to the user's position array
7. WHEN accepting margin input from frontend, THE RwaPerpEngine SHALL convert externalEuint256 with inputProof to euint256 using Nox.fromExternal()
8. AFTER any Nox.add or Nox.sub operation producing a new handle, THE RwaPerpEngine SHALL call Nox.allowThis(handle) to enable contract usage
9. AFTER updating user balance handles, THE RwaPerpEngine SHALL call Nox.allow(handle, user) to enable user decryption
10. IF the user has insufficient encrypted balance, THEN THE RwaPerpEngine SHALL revert the transaction
11. IF the configured oracle returns settlementEnabled as false, THEN THE RwaPerpEngine SHALL revert with message "Asset not available for settlement"

### Requirement 8: Position Closing with PnL Settlement and Verification

**User Story:** As an institutional investor, I want to close my perpetual position and have profits or losses automatically settled to my encrypted balance with verifiable exit pricing, so that I can realize gains or losses transparently.

#### Acceptance Criteria

1. WHEN a user requests to close a position, THE RwaPerpEngine SHALL verify the position exists and isOpen is true
2. WHEN closing a position, THE RwaPerpEngine SHALL query the configured IRwaPriceOracle adapter for the assetId to obtain exit price
3. WHEN closing a position, THE RwaPerpEngine SHALL validate that exit priceE8 is positive, updatedAt is within maximum staleness, and settlementEnabled is true
4. WHEN closing a position, THE RwaPerpEngine SHALL calculate PnL as (exit price minus entry price) multiplied by position size for long positions
5. WHEN closing a position, THE RwaPerpEngine SHALL calculate PnL as (entry price minus exit price) multiplied by position size for short positions
6. WHEN closing a profitable position, THE RwaPerpEngine SHALL credit the profit to the user's FundVault balance using Nox.add() and debit from Vault_Treasury
7. WHEN closing a losing position, THE RwaPerpEngine SHALL debit the loss from the user's FundVault balance using Nox.sub() and credit to Vault_Treasury
8. WHEN closing a position, THE RwaPerpEngine SHALL return the original encrypted margin to the user's FundVault balance using Nox.add()
9. WHEN closing a position, THE RwaPerpEngine SHALL set the isOpen flag to false
10. AFTER computing new balance handles via Nox.add or Nox.sub settlement, THE RwaPerpEngine SHALL call Nox.allowThis(newHandle) and Nox.allow(newHandle, user)
11. IF the configured oracle returns settlementEnabled as false, THEN THE RwaPerpEngine SHALL revert with message "Asset not available for settlement at current time"

### Requirement 9: Protocol Counterparty Treasury Management

**User Story:** As a protocol operator, I want the Vault_Treasury to act as counterparty for all positions, so that the system can absorb profits and losses without external liquidity providers.

#### Acceptance Criteria

1. THE RwaPerpEngine SHALL define a Vault_Treasury address that holds protocol-owned encrypted collateral
2. WHEN a position closes with profit, THE RwaPerpEngine SHALL debit the profit amount from Vault_Treasury encrypted balance using Nox.sub()
3. WHEN a position closes with loss, THE RwaPerpEngine SHALL credit the loss amount to Vault_Treasury encrypted balance using Nox.add()
4. THE RwaPerpEngine SHALL grant Vault_Treasury appropriate ACL permissions for encrypted balance operations
5. THE Vault_Treasury SHALL maintain sufficient encrypted collateral to cover potential position profits
6. IF Vault_Treasury has insufficient balance to cover a winning position, THEN THE RwaPerpEngine SHALL revert with error message "Treasury insufficient funds"

### Requirement 10: ACL and Permission Model

**User Story:** As a security architect, I want the permission model to follow the existing FundVault ACL pattern, so that encrypted balance operations remain secure and auditable.

#### Acceptance Criteria

1. THE RwaPerpEngine SHALL require users to grant ACL permission via Nox.allow(balanceHandle, address(RwaPerpEngine)) before opening positions
2. THE RwaPerpEngine SHALL be granted computation access to user encrypted handles for margin debits and PnL settlement operations
3. THE RwaPerpEngine SHALL NOT have decryption access to user balances
4. WHEN a user revokes ACL permission, THE RwaPerpEngine SHALL be unable to operate on the user's encrypted handles
5. THE RwaPerpEngine SHALL respect the same ACL security boundaries as FundVault

### Requirement 11: Decryption and Auditor Access

**User Story:** As a compliance officer, I want to decrypt position data for audit purposes using proper authorization, so that the system meets regulatory requirements while preserving investor privacy.

#### Acceptance Criteria

1. THE System SHALL support balance decryption via user's own Nox SDK with EIP-712 signature authorization
2. WHERE an auditor has been granted explicit access, THE System SHALL allow decryption of user position data via DisclosureManager integration
3. THE System SHALL NOT allow decryption without proper cryptographic authorization
4. THE System SHALL maintain audit logs of all decryption requests for compliance review

### Requirement 12: Investor Frontend Trading Interface for Market-Priced RWAs

**User Story:** As an institutional investor, I want a web interface to open and close positions on market-priced RWAs with appropriate data cadence, so that I can manage my synthetic exposure activity.

#### Acceptance Criteria

1. THE Investor_Frontend SHALL provide a single trading panel per user
2. THE Investor_Frontend SHALL include an asset selector for choosing between rGOLD, rUSTB, and rCRE
3. THE Investor_Frontend SHALL include a long/short direction toggle
4. THE Investor_Frontend SHALL include a leverage selector (1x-10x) for position sizing
5. THE Investor_Frontend SHALL include a margin input field that sources from the user's real encrypted FundVault balance
6. WHEN rGOLD is selected, THE Investor_Frontend SHALL display reference price from configured oracle, source identity, timestamp, and fresh/stale status indicator
7. WHEN rGOLD is selected, THE Investor_Frontend SHALL enable "Open Position" and "Close Position" buttons only when oracle settlementEnabled is true
8. THE Investor_Frontend SHALL include an "Open Position" button that triggers the openPosition() contract function with verified oracle price
9. THE Investor_Frontend SHALL display asset-specific data cadence matching the underlying RWA valuation methodology

### Requirement 13: Investor Frontend for NAV-Priced and Appraisal-Priced RWAs

**User Story:** As an institutional investor, I want appropriate UI behavior for NAV-priced and appraisal-priced RWAs that respects their valuation cadence, so that I receive accurate expectations about settlement timing.

#### Acceptance Criteria

1. WHEN rUSTB is selected, THE Investor_Frontend SHALL display NAV or reference price/yield, publisher identity, publication timestamp, and next NAV window
2. WHEN rUSTB is selected, THE Investor_Frontend SHALL NOT display intraday candles, live trade tape, or per-minute funding rates
3. WHEN rUSTB is selected, THE Investor_Frontend SHALL enable trading actions only during valid NAV settlement windows
4. WHEN rUSTB is selected, THE Investor_Frontend SHALL display message "Trading available only during valid NAV window; PnL settled at verifiable opening/closing NAV"
5. WHEN rCRE is selected, THE Investor_Frontend SHALL display NAV/appraisal value, administrator/publisher identity, valuation date, and expiry
6. WHEN rCRE is selected, THE Investor_Frontend SHALL NOT display intraday charts, live tickers, order books, or funding rates
7. WHEN rCRE is selected, THE Investor_Frontend SHALL display maximum historical NAV series only
8. WHEN rCRE is selected, THE Investor_Frontend SHALL provide "Request Exposure" and "Settle at Next Verified NAV" actions instead of "Market Buy/Sell"
9. WHEN rCRE is selected, THE Investor_Frontend SHALL display message "No automatic liquidation; settlement available only during valid appraisal window"

### Requirement 14: Position Monitoring and Display with Price Verification

**User Story:** As an institutional investor, I want to view my open positions with current prices and PnL including price source verification, so that I can monitor my exposure and make informed closing decisions.

#### Acceptance Criteria

1. THE Investor_Frontend SHALL display a positions table showing all user positions
2. WHEN displaying positions, THE Investor_Frontend SHALL show asset name, entry price, entry source ID, entry timestamp, current oracle price, direction (long/short), leverage, and position size
3. WHEN displaying positions, THE Investor_Frontend SHALL calculate and display real-time PnL based on current oracle price snapshot
4. WHEN displaying positions, THE Investor_Frontend SHALL show oracle source identity, last update timestamp, and settlementEnabled status
5. THE Investor_Frontend SHALL include a "Close Position" button for each open position, enabled only when oracle settlementEnabled is true
6. THE Investor_Frontend SHALL explicitly label the system as "Protocol-backed synthetic exposure, settled against Vault Treasury with verifiable RWA reference pricing"
7. THE Investor_Frontend SHALL NOT display fake order books, simulated market data, Brownian price feeds, or local shadow balances
8. THE Investor_Frontend SHALL update displayed prices when oracle data is refreshed according to asset-specific cadence

### Requirement 15: Multi-Wallet Sovereign State

**User Story:** As a system architect, I want the system to support 10,000+ independent wallets with isolated positions, so that the system scales to institutional requirements without centralized operator privileges.

#### Acceptance Criteria

1. THE RwaPerpEngine SHALL isolate position state per wallet address using mapping(address => Position[])
2. THE RwaPerpEngine SHALL support concurrent operation by 10,000 or more independent wallet addresses
3. THE RwaPerpEngine SHALL NOT include single-operator privileges that bypass normal user flows
4. WHEN Wallet_A opens a position, THE RwaPerpEngine SHALL NOT affect Wallet_B's positions or balances
5. THE RwaPerpEngine SHALL maintain cryptographic isolation between user encrypted balances via Nox ACL

### Requirement 16: Deployment and Network Configuration with Testnet Oracle Labeling

**User Story:** As a deployment engineer, I want the system deployed on Sepolia testnet with explicit oracle source labeling, so that testing accurately reflects mainnet architecture while transparently disclosing testnet limitations.

#### Acceptance Criteria

1. THE RwaPerpEngine SHALL be deployed on Ethereum Sepolia testnet
2. WHERE verified gold-specific or T-Bill RWA oracles exist on Sepolia, THE RwaPerpEngine SHALL use those feeds with ChainlinkRwaOracleAdapter
3. WHERE no verified RWA-specific oracles exist on Sepolia, THE RwaPerpEngine SHALL use SignedNavOracleAdapter with explicit disclaimer "Testnet signed oracle, not institutional production source"
4. THE RwaPerpEngine SHALL integrate with existing deployed FundVault contract on Sepolia
5. THE deployment scripts SHALL verify successful integration with configured oracle adapters after deployment
6. THE deployment configuration SHALL document which oracle adapters are configured per asset and their verification status
7. THE System documentation SHALL explicitly state "On mainnet, only verified RWA-specific oracles SHALL be configured; crypto asset price feeds SHALL NEVER proxy for RWA assets"

### Requirement 17: Multi-Wallet Testing Scenarios with Oracle Verification

**User Story:** As a QA engineer, I want to test profit and loss scenarios across multiple wallets with verified oracle price movements, so that I can verify the system correctly handles winning and losing positions with transparent pricing.

#### Acceptance Criteria

1. WHEN Wallet_A opens and closes a profitable long position, THE System SHALL credit profit to Wallet_A and debit from Vault_Treasury using verified oracle price snapshots
2. WHEN Wallet_B opens and closes a losing short position, THE System SHALL debit loss from Wallet_B and credit to Vault_Treasury using verified oracle price snapshots
3. WHEN multiple wallets have concurrent open positions, THE System SHALL correctly isolate PnL calculations per wallet using independent oracle queries
4. WHEN testing market-priced RWAs, THE System SHALL use real Chainlink oracle price movements on Sepolia testnet
5. WHEN testing NAV-priced or appraisal-priced RWAs, THE System SHALL use signed NAV submissions with cryptographic signature verification
6. THE test suite SHALL verify encrypted balance changes using Nox decryption with proper authorization
7. THE test suite SHALL verify immutability of entry price snapshots (entryPriceE8, entryRoundOrNonce, entrySourceId) across position lifecycle

### Requirement 18: Production Code Quality Standards with RWA Architecture Integrity

**User Story:** As a code reviewer, I want all mock and demo code removed from production flows and genuine RWA-oracle architecture enforced, so that the system maintains institutional-grade integrity without crypto-labeled RWA proxies.

#### Acceptance Criteria

1. THE codebase SHALL NOT include "demo", "mock", or "fake" references in production contract code
2. THE codebase SHALL NOT include synthetic price generators, Math.random() calls, or Brownian motion simulators in production flows
3. THE codebase SHALL NOT include test-only code paths in production contracts
4. THE codebase SHALL NOT map ETH/USD to rGOLD or BTC/USD to rUSTB in production configuration
5. THE codebase SHALL NOT implement fake order books, simulated trade tape, or artificial volume generation
6. THE codebase SHALL NOT implement 1-minute candles or continuous funding rates for NAV-priced or appraisal-priced RWAs
7. WHERE test doubles are needed, THE test suite SHALL use separate test-only contract files clearly labeled as non-production
8. THE code review checklist SHALL include verification that each assetId uses appropriate oracle adapter matching its real-world valuation methodology

### Requirement 19: Oracle Adapter Configuration and Verification

**User Story:** As a system operator, I want clear oracle adapter registration and verification per RWA asset class, so that pricing logic is transparent, verifiable, and matches each asset's genuine valuation methodology.

#### Acceptance Criteria

1. THE RwaPerpEngine SHALL maintain a mapping from bytes32 assetId to approved IRwaPriceOracle adapter contract addresses
2. THE RwaPerpEngine SHALL provide an administrative function to register oracle adapters per assetId with access control
3. THE RwaPerpEngine SHALL emit an OracleAdapterRegistered event when an oracle adapter is configured for an assetId
4. THE RwaPerpEngine SHALL include documentation comments for each asset explaining its economic identity, valuation methodology, and configured oracle adapter type
5. THE RwaPerpEngine SHALL revert position open/close operations if no oracle adapter is configured for the requested assetId
6. THE System documentation SHALL include a verification guide explaining how to validate oracle adapter authenticity (Chainlink feed address verification, signed NAV publisher identity verification)
7. WHERE multiple RWA assets share the same valuation methodology, THE System MAY reuse oracle adapter contracts with different configuration parameters per assetId

### Requirement 20: Error Handling and Transaction Reversion with Oracle Validation

**User Story:** As a smart contract developer, I want clear error handling for invalid operations including oracle validation failures, so that users receive actionable feedback when transactions fail.

#### Acceptance Criteria

1. IF a user attempts to open a position without sufficient encrypted balance, THEN THE RwaPerpEngine SHALL revert with error message "Insufficient margin balance"
2. IF a user attempts to close a position that does not exist, THEN THE RwaPerpEngine SHALL revert with error message "Position not found"
3. IF a user attempts to close a position that is already closed, THEN THE RwaPerpEngine SHALL revert with error message "Position already closed"
4. IF a user attempts to open a position without granting ACL permission, THEN THE RwaPerpEngine SHALL revert with error message "ACL permission not granted"
5. IF the oracle adapter returns priceE8 as zero or negative, THEN THE RwaPerpEngine SHALL revert with error message "Invalid oracle price"
6. IF the oracle adapter returns stale price data exceeding maximum staleness window, THEN THE RwaPerpEngine SHALL revert with error message "Price data is stale"
7. IF the oracle adapter returns settlementEnabled as false, THEN THE RwaPerpEngine SHALL revert with error message "Asset not available for settlement at current time"
8. IF Vault_Treasury has insufficient balance to cover a winning position, THEN THE RwaPerpEngine SHALL revert with error message "Treasury insufficient funds"
9. IF no oracle adapter is configured for the requested assetId, THEN THE RwaPerpEngine SHALL revert with error message "No oracle configured for asset"

### Requirement 21: Gas Optimization and Efficiency

**User Story:** As a cost-conscious investor, I want transaction costs minimized through efficient contract design, so that small positions remain economically viable.

#### Acceptance Criteria

1. THE RwaPerpEngine SHALL use storage-efficient data structures for Position records
2. THE RwaPerpEngine SHALL batch Nox operations where possible to reduce computational overhead
3. THE RwaPerpEngine SHALL avoid redundant storage reads within single transaction execution
4. THE RwaPerpEngine SHALL use memory variables for intermediate calculations to reduce SLOAD operations
5. THE RwaPerpEngine SHALL emit events for position open/close operations without storing redundant data on-chain

### Requirement 22: Event Emission for Indexing and Monitoring with Price Verification

**User Story:** As a system operator, I want comprehensive event logs for position lifecycle including oracle verification data, so that off-chain systems can index and monitor trading activity with transparent pricing.

#### Acceptance Criteria

1. WHEN a position is opened, THE RwaPerpEngine SHALL emit a PositionOpened event with user address, position index, assetId, direction, leverage, encrypted margin handle, entryPriceE8, entryRoundOrNonce, entrySourceId, and timestamp
2. WHEN a position is closed, THE RwaPerpEngine SHALL emit a PositionClosed event with user address, position index, exitPriceE8, exitSourceId, PnL direction (profit/loss), and timestamp
3. WHEN margin is debited, THE RwaPerpEngine SHALL emit a MarginDebited event with user address and encrypted margin handle
4. WHEN PnL is settled, THE RwaPerpEngine SHALL emit a PnLSettled event with user address, encrypted PnL handle, and settlement direction
5. WHEN an oracle adapter is registered, THE RwaPerpEngine SHALL emit an OracleAdapterRegistered event with assetId, adapter contract address, and configuration parameters
6. THE RwaPerpEngine SHALL emit events with indexed parameters for efficient filtering by user address and assetId

### Requirement 23: Integration with Existing FundVault Architecture

**User Story:** As a system architect, I want RwaPerpEngine to seamlessly integrate with existing FundVault contracts, so that users have unified encrypted balance management.

#### Acceptance Criteria

1. THE RwaPerpEngine SHALL reference the deployed FundVault contract address for all margin and settlement operations
2. THE RwaPerpEngine SHALL use FundVault's encrypted mUSDC balance handles for all collateral operations
3. THE RwaPerpEngine SHALL NOT maintain separate shadow balances or duplicate state from FundVault
4. THE RwaPerpEngine SHALL respect FundVault's existing ACL and permission model via Nox
5. WHEN positions are settled, THE RwaPerpEngine SHALL update FundVault balances atomically within the same transaction

### Requirement 24: Leverage and Position Sizing Logic

**User Story:** As an institutional investor, I want to specify leverage multipliers, so that I can control my risk exposure and capital efficiency.

#### Acceptance Criteria

1. THE RwaPerpEngine SHALL accept a leverage parameter (1x to 10x) when opening positions
2. WHEN calculating position size, THE RwaPerpEngine SHALL multiply margin by leverage multiplier (position size = margin × leverage)
3. THE RwaPerpEngine SHALL NOT multiply by leverage again when calculating PnL, as position size already incorporates leverage
4. THE RwaPerpEngine SHALL enforce a maximum leverage of 10x to limit risk exposure
5. THE RwaPerpEngine SHALL enforce a minimum leverage of 1x (no leverage)
6. THE RwaPerpEngine SHALL store leverage as uint8 in Position structure
7. THE RwaPerpEngine SHALL clearly document that position size already incorporates leverage, and PnL calculations SHALL NOT multiply by leverage again


