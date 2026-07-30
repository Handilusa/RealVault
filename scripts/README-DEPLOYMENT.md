# RwaPerpEngine Deployment Guide

This guide walks through deploying the RwaPerpEngine system on Sepolia testnet.

## Overview

The deployment includes:
1. **ChainlinkRwaOracleAdapter** - Provides market prices for liquid RWAs (e.g., tokenized gold)
2. **SignedNavOracleAdapter** - Provides NAV-based prices for private RWAs (e.g., credit funds)
3. **RwaPerpEngine** - Main perpetual engine managing positions and settlements
4. **Oracle Configuration** - Setting up price feeds and asset parameters
5. **FundVault Integration** - Authorizing the engine to manage encrypted balances

## Prerequisites

1. **Environment Setup**
   ```bash
   # Ensure .env file has SEPOLIA_RPC_URL and PRIVATE_KEY
   cp .env.example .env
   # Edit .env with your Sepolia RPC URL and private key
   ```

2. **Existing Deployments**
   - FundVault must already be deployed (from `scripts/deploy.js`)
   - Verify `deployments/sepolia.json` exists and contains FundVault address

3. **Testnet ETH**
   - Get Sepolia ETH from faucet: https://sepoliafaucet.com/
   - Recommended: 0.5 ETH for deployment

## Quick Start (NPM Scripts)

For convenience, use these npm scripts:

```bash
# Deploy RwaPerpEngine system
npm run deploy:rwa-perp

# Check deployment status
npm run check:deployment

# Fund treasury
npm run fund:treasury

# Test oracle queries
npm run test:oracles
```

## Deployment Steps

### Step 1: Deploy Core Contracts

Run the main deployment script:

```bash
npx hardhat run scripts/deploy-rwa-perp-engine.js --network sepolia
# OR use npm script:
npm run deploy:rwa-perp
```

This script will:
- Deploy ChainlinkRwaOracleAdapter
- Deploy SignedNavOracleAdapter
- Deploy RwaPerpEngine with FundVault integration
- Configure Chainlink XAU/USD feed for rGOLD (Sepolia: `0xC5981F461d74c46eB4b0CF3f4Ec79f025573B0Ea`)
- Register oracle adapters for rGOLD, rUSTB, rCRE
- Configure asset parameters (staleness thresholds, valuation methods)
- Authorize RwaPerpEngine in FundVault
- Save deployment info to `deployments/sepolia-rwa-perp-engine.json`

**Expected Output:**
```
====================================================
🚀 RwaPerpEngine — Deployment Script
   Network: sepolia
====================================================

📦 Using existing FundVault: 0x...
   Deployer Address: 0x...
   Deployer Balance: 0.5 ETH

[1/4] Deploying ChainlinkRwaOracleAdapter...
   ✅ ChainlinkRwaOracleAdapter: 0x...

[2/4] Deploying SignedNavOracleAdapter...
   ✅ SignedNavOracleAdapter: 0x...

[3/4] Deploying RwaPerpEngine...
   ✅ RwaPerpEngine: 0x...

[4/4] Configuring Oracle Adapters...
   📡 Configuring rGOLD -> Chainlink XAU/USD feed...
   ✅ Chainlink feed configured for rGOLD

🔗 Registering Oracle Adapters in RwaPerpEngine...
   ✅ Registered Chainlink adapter for rGOLD
   ✅ Registered SignedNav adapter for rUSTB
   ✅ Registered SignedNav adapter for rCRE

⚙️  Configuring Asset Parameters...
   ✅ Configured asset: rGOLD
   ✅ Configured asset: rUSTB
   ✅ Configured asset: rCRE

🔐 Authorizing RwaPerpEngine in FundVault...
   ✅ RwaPerpEngine authorized in FundVault

📄 Deployment manifest saved to: deployments/sepolia-rwa-perp-engine.json

====================================================
🎉 RwaPerpEngine Deployment Complete!
====================================================
```

### Step 2: Verify Deployment

Check that all contracts deployed correctly:

```bash
npx hardhat run scripts/check-deployment.js --network sepolia
# OR use npm script:
npm run check:deployment
```

**Expected Output:**
```
🔍 RwaPerpEngine Deployment Status Check

📄 Deployment Info:
   Network: sepolia
   Chain ID: 11155111
   Deployed At: 2024-01-15T12:30:45.000Z
   Deployer: 0x...
   Treasury: 0x...

📦 Deployed Contracts:
   RwaPerpEngine: 0x...
   ChainlinkRwaOracleAdapter: 0x...
   SignedNavOracleAdapter: 0x...
   FundVault: 0x...

👤 Contract Owner: 0x...

🔗 Integration:
   FundVault Address: 0x...
   Treasury Address: 0x...
   Match Expected: true

📡 Oracle Adapters:
   rGOLD: 0x...
     Expected Chainlink: true
   rUSTB: 0x...
     Expected SignedNav: true
   rCRE: 0x...
     Expected SignedNav: true

⚙️  Asset Configurations:
   [Asset details...]

🧪 Testing rGOLD Oracle Query:
   ✅ Oracle query successful!
   Price (USD): $1850.50
   Settlement Enabled: true

✅ Deployment Status Check Complete!
```

### Step 3: Initialize Treasury

Fund the RwaPerpEngine treasury with initial capital:

```bash
npx hardhat run scripts/fund-treasury.js --network sepolia
# OR use npm script:
npm run fund:treasury
```

This initializes the treasury with $100,000 USDC (simulated).

**Expected Output:**
```
🏦 Initializing RwaPerpEngine Treasury...

   Amount: $100,000 USDC
   Initializing...
   ✅ Treasury initialized!
   Transaction: 0x...
```

### Step 4: Test Oracle Queries

Verify oracle integration is working:

```bash
npx hardhat run scripts/test-oracle-queries.js --network sepolia
# OR use npm script:
npm run test:oracles
```

This queries the rGOLD price from Chainlink XAU/USD feed.

**Expected Output:**
```
📡 Testing Oracle Price Queries...

🔍 Querying rGOLD price (Chainlink XAU/USD)...
   Oracle Adapter: 0x...

📊 Oracle Response:
   Price (E8): 185050000000 ($1850.50)
   Updated At: 2024-01-15T12:30:45.000Z
   Source ID: 0x...
   Confidence: 95
   Settlement Enabled: true

⚙️  Asset Config:
   Symbol: rGOLD
   Valuation Method: Market
   Max Staleness: 3600 seconds
```

### Step 5: Verify Contracts (Optional)

Verify contracts on Etherscan for transparency:

```bash
# Verify RwaPerpEngine
npx hardhat verify --network sepolia <RWAPERPENGINE_ADDRESS> \
  <FUNDVAULT_ADDRESS> <TREASURY_ADDRESS>

# Verify ChainlinkRwaOracleAdapter
npx hardhat verify --network sepolia <CHAINLINK_ADAPTER_ADDRESS> \
  <DEPLOYER_ADDRESS>

# Verify SignedNavOracleAdapter
npx hardhat verify --network sepolia <SIGNED_NAV_ADAPTER_ADDRESS> \
  <DEPLOYER_ADDRESS>
```

Replace addresses from `deployments/sepolia-rwa-perp-engine.json`.

## Deployed Assets

### rGOLD (Tokenized Gold)
- **Oracle**: ChainlinkRwaOracleAdapter
- **Price Feed**: XAU/USD (Sepolia: `0xC5981F461d74c46eB4b0CF3f4Ec79f025573B0Ea`)
- **Heartbeat**: 3600 seconds (1 hour)
- **Valuation**: Market-based
- **Settlement**: Enabled when price is fresh (< 1 hour old)

### rUSTB (US Treasury Bills)
- **Oracle**: SignedNavOracleAdapter
- **Price Feed**: Signed NAV submissions from authorized publisher
- **Max Staleness**: 86400 seconds (24 hours)
- **Valuation**: NAV-based
- **Settlement**: Enabled within publishedAt → validUntil window

### rCRE (Commercial Real Estate)
- **Oracle**: SignedNavOracleAdapter
- **Price Feed**: Signed NAV submissions from authorized publisher
- **Max Staleness**: 86400 seconds (24 hours)
- **Valuation**: NAV-based
- **Settlement**: Enabled within publishedAt → validUntil window

## Post-Deployment Configuration

### Configure NAV Publishers (for rUSTB and rCRE)

To submit NAV prices for rUSTB or rCRE, you need to authorize a publisher:

```javascript
// In Hardhat console
const adapter = await ethers.getContractAt(
  "SignedNavOracleAdapter",
  "<SIGNED_NAV_ADAPTER_ADDRESS>"
);

const assetId = ethers.id("rUSTB");
const publisherAddress = "0x..."; // Fund administrator address

await adapter.setAuthorizedPublisher(assetId, publisherAddress);
```

### Submit NAV Price

Publishers can submit NAV prices using ECDSA signatures:

```javascript
const assetId = ethers.id("rUSTB");
const navE8 = 102300000; // $1.023 NAV
const publishedAt = Math.floor(Date.now() / 1000);
const validUntil = publishedAt + 86400; // Valid for 24 hours
const nonce = 1;

// Sign message
const messageHash = ethers.solidityPackedKeccak256(
  ["bytes32", "uint256", "uint256", "uint256", "uint256"],
  [assetId, navE8, publishedAt, validUntil, nonce]
);

const signature = await publisher.signMessage(
  ethers.getBytes(messageHash)
);

// Submit on-chain
await adapter.submitNav(
  assetId,
  navE8,
  publishedAt,
  validUntil,
  nonce,
  signature
);
```

## Troubleshooting

### Issue: "Price data is stale"
- **Cause**: Chainlink feed hasn't updated within heartbeat window
- **Solution**: Wait for Chainlink oracle update or increase `maxStaleness` in asset config

### Issue: "Asset not available for settlement"
- **Cause**: Oracle validation failed (stale data, invalid rounds, or expired NAV)
- **Solution**: Check oracle output with `test-oracle-queries.js` and verify settlementEnabled

### Issue: "No oracle configured for asset"
- **Cause**: Asset not registered in RwaPerpEngine
- **Solution**: Call `rwaPerpEngine.registerOracleAdapter(assetId, adapterAddress)`

### Issue: "Invalid signature" (SignedNavOracleAdapter)
- **Cause**: Signature doesn't match authorized publisher
- **Solution**: Verify publisher address is authorized and signature is correct

## Network Addresses

### Sepolia Testnet

**Chainlink Price Feeds:**
- XAU/USD: `0xC5981F461d74c46eB4b0CF3f4Ec79f025573B0Ea`
- ETH/USD: `0x694AA1769357215DE4FAC081bf1f309aDC325306`

**Deployed Contracts:**
See `deployments/sepolia-rwa-perp-engine.json` for contract addresses.

## Security Considerations

1. **Treasury Management**: Treasury address should be a multisig in production
2. **Oracle Publishers**: Use hardware wallets for NAV signing keys
3. **Feed Staleness**: Monitor Chainlink feeds for update frequency
4. **Access Control**: Only owner can configure adapters and assets

## Next Steps

After deployment, you can:
1. Test position opening with `openPositionTest()` in RwaPerpEngine
2. Integrate frontend for encrypted position management
3. Set up monitoring for oracle staleness
4. Configure additional RWA assets with appropriate oracle adapters

## Support

For issues or questions:
- Check Hardhat logs: `npx hardhat node` console output
- Review deployment manifest: `deployments/sepolia-rwa-perp-engine.json`
- Verify oracle responses: Run `test-oracle-queries.js`
