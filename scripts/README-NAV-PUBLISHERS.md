# SignedNav Publishers Guide

## Overview

This document explains how the SignedNav publisher system works and how to submit NAV updates for rUSTB and rCRE assets.

## Architecture

### Off-Chain Signing, On-Chain Submission

```
┌─────────────────────────────────────────────────────────────────┐
│                    NAV Publishing Flow                          │
└─────────────────────────────────────────────────────────────────┘

1. Publisher (Off-Chain)                    2. Deployer (On-Chain)
   ┌──────────────────┐                        ┌──────────────────┐
   │ Generate NAV     │                        │ Read Signature   │
   │ Create Hash      │                        │ Submit Tx        │
   │ Sign with PK     │ ──────────────────────>│ Pay Gas          │
   └──────────────────┘                        └──────────────────┘
        │                                              │
        │ Private Key (off-chain)                     │ Signature (on-chain)
        ▼                                              ▼
   [nav-publishers.json]                    [SignedNavOracleAdapter]
```

### Key Principle

- **Publishers**: Sign NAV data off-chain (no ETH needed, no gas costs)
- **Deployer**: Submits signed NAV on-chain (pays gas fees)
- **Smart Contract**: Verifies signature came from authorized publisher

## Publisher Configuration

### Current Publishers

```json
{
  "rUSTB": {
    "publisher": "0x9B44C206f39e2b66fFdD48A3A2FdAf79f7b8288C",
    "role": "US Treasury Fund Administrator",
    "navFrequency": "Daily (24 hours)",
    "validityWindow": 86400
  },
  "rCRE": {
    "publisher": "0xb959daC2e51c247276eCc5Ea1295Ccd6a39b6624",
    "role": "Commercial RE Appraiser",
    "navFrequency": "Weekly (7 days)",
    "validityWindow": 604800
  }
}
```

### Asset Configuration

- **rUSTB**: maxStaleness = 86400s (24 hours, daily NAV updates)
- **rCRE**: maxStaleness = 604800s (7 days, weekly appraisals)

## How to Submit NAV Updates

### Step 1: Load Publisher Credentials

```javascript
const publisherInfo = JSON.parse(
  fs.readFileSync("./deployments/nav-publishers.json")
);

const rustbPublisher = new ethers.Wallet(publisherInfo.rUSTB.privateKey);
```

### Step 2: Create NAV Data

```javascript
const assetId = ethers.id("rUSTB"); // or "rCRE"
const navE8 = 100500000n; // $1.005 in 8 decimals
const publishedAt = Math.floor(Date.now() / 1000);
const validUntil = publishedAt + 86400; // 24h for rUSTB
const nonce = 2n; // Increment from previous submission
```

### Step 3: Sign Off-Chain

```javascript
const messageHash = ethers.solidityPackedKeccak256(
  ["bytes32", "uint256", "uint256", "uint256", "uint256"],
  [assetId, navE8, publishedAt, validUntil, nonce]
);

const signature = await rustbPublisher.signMessage(
  ethers.getBytes(messageHash)
);
```

### Step 4: Submit On-Chain (Deployer Pays Gas)

```javascript
const [deployer] = await ethers.getSigners();

const signedNavAdapter = await ethers.getContractAt(
  "SignedNavOracleAdapter",
  "0xca2665F6c54607B8Bc9Ba037203701f9D94B13f5"
);

const tx = await signedNavAdapter.connect(deployer).submitNav(
  assetId,
  navE8,
  publishedAt,
  validUntil,
  nonce,
  signature
);

await tx.wait();
```

## Example: Update rUSTB NAV

```javascript
// File: scripts/update-rustb-nav.js
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const publisherInfo = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../deployments/nav-publishers.json"))
  );
  
  const deployment = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../deployments/sepolia-rwa-perp-engine.json"))
  );

  const [deployer] = await hre.ethers.getSigners();
  const rustbPublisher = new hre.ethers.Wallet(publisherInfo.rUSTB.privateKey);

  // New NAV data
  const ASSET_ID_RUSTB = hre.ethers.id("rUSTB");
  const navE8 = 100500000n; // $1.005 (treasury fund gains)
  const publishedAt = Math.floor(Date.now() / 1000);
  const validUntil = publishedAt + 86400; // 24h validity
  const nonce = 2n; // Track this - must increment

  // Sign off-chain
  const messageHash = hre.ethers.solidityPackedKeccak256(
    ["bytes32", "uint256", "uint256", "uint256", "uint256"],
    [ASSET_ID_RUSTB, navE8, publishedAt, validUntil, nonce]
  );

  const signature = await rustbPublisher.signMessage(
    hre.ethers.getBytes(messageHash)
  );

  // Submit on-chain
  const signedNavAdapter = await hre.ethers.getContractAt(
    "SignedNavOracleAdapter",
    deployment.contracts.SignedNavOracleAdapter
  );

  const tx = await signedNavAdapter.connect(deployer).submitNav(
    ASSET_ID_RUSTB,
    navE8,
    publishedAt,
    validUntil,
    nonce,
    signature
  );

  await tx.wait();

  console.log("✅ rUSTB NAV Updated!");
  console.log("   New NAV: $1.005");
  console.log("   Transaction:", tx.hash);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

## Example: Update rCRE NAV

```javascript
// File: scripts/update-rcre-nav.js
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const publisherInfo = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../deployments/nav-publishers.json"))
  );
  
  const deployment = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../deployments/sepolia-rwa-perp-engine.json"))
  );

  const [deployer] = await hre.ethers.getSigners();
  const rcrePublisher = new hre.ethers.Wallet(publisherInfo.rCRE.privateKey);

  // New appraisal data
  const ASSET_ID_RCRE = hre.ethers.id("rCRE");
  const navE8 = 102000000000n; // $1,020.00 (property appreciation)
  const publishedAt = Math.floor(Date.now() / 1000);
  const validUntil = publishedAt + 604800; // 7 days validity
  const nonce = 2n; // Track this - must increment

  // Sign off-chain
  const messageHash = hre.ethers.solidityPackedKeccak256(
    ["bytes32", "uint256", "uint256", "uint256", "uint256"],
    [ASSET_ID_RCRE, navE8, publishedAt, validUntil, nonce]
  );

  const signature = await rcrePublisher.signMessage(
    hre.ethers.getBytes(messageHash)
  );

  // Submit on-chain
  const signedNavAdapter = await hre.ethers.getContractAt(
    "SignedNavOracleAdapter",
    deployment.contracts.SignedNavOracleAdapter
  );

  const tx = await signedNavAdapter.connect(deployer).submitNav(
    ASSET_ID_RCRE,
    navE8,
    publishedAt,
    validUntil,
    nonce,
    signature
  );

  await tx.wait();

  console.log("✅ rCRE NAV Updated!");
  console.log("   New NAV: $1,020.00");
  console.log("   Transaction:", tx.hash);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

## NAV Update Schedule

### rUSTB (Treasury Bills)
- **Frequency**: Daily
- **Validity**: 24 hours
- **Typical NAV**: $1.00 - $1.01 (par value + accrued interest)
- **Update Time**: End of trading day

### rCRE (Commercial Real Estate)
- **Frequency**: Weekly
- **Validity**: 7 days
- **Typical NAV**: $900 - $1,200 (per unit, based on appraisals)
- **Update Time**: Weekly appraisal completion

## Security Notes

### ⚠️ Critical Security Practices

1. **Protect nav-publishers.json**
   - Contains private keys
   - Added to .gitignore
   - Never commit to version control
   - Store securely (encrypted vault recommended)

2. **Nonce Tracking**
   - Each NAV submission requires incrementing nonce
   - Prevents replay attacks
   - Track nonce in separate file or database

3. **Validity Windows**
   - rUSTB: 24h validity (must update daily)
   - rCRE: 7 day validity (update weekly)
   - Settlement fails if NAV is stale

4. **Publisher Rotation**
   - To change publisher: call `setAuthorizedPublisher()` (owner only)
   - Generate new wallet, authorize on-chain
   - Update nav-publishers.json

## Monitoring NAV Status

```javascript
// Check current NAV
const signedNavAdapter = await ethers.getContractAt(
  "SignedNavOracleAdapter",
  "0xca2665F6c54607B8Bc9Ba037203701f9D94B13f5"
);

const assetId = ethers.id("rUSTB");
const [price, updatedAt, , , enabled] = await signedNavAdapter.latestPrice(assetId);

console.log("Current NAV:", Number(price) / 1e8, "USD");
console.log("Updated At:", new Date(Number(updatedAt) * 1000));
console.log("Settlement Enabled:", enabled);

// Check staleness
const now = Math.floor(Date.now() / 1000);
const age = now - Number(updatedAt);
console.log("NAV Age:", age, "seconds");
```

## Troubleshooting

### NAV Submission Fails

1. **"Unauthorized publisher"**
   - Check publisher address matches authorized address
   - Verify signature is from correct private key

2. **"Invalid signature"**
   - Ensure message hash matches exactly
   - Check all parameters (assetId, navE8, timestamps, nonce)
   - Verify signature format

3. **"Nonce too low"**
   - Use higher nonce than previous submission
   - Nonces must strictly increase

4. **"Invalid validity window"**
   - publishedAt must be ≤ current time
   - validUntil must be > current time
   - validUntil - publishedAt should match expected window

### Settlement Fails

1. **"Stale NAV"**
   - NAV older than maxStaleness
   - Submit fresh NAV update
   - rUSTB: update within 24h
   - rCRE: update within 7 days

2. **Settlement disabled**
   - Check `settlementEnabled` flag in latestPrice()
   - If false, NAV may be invalid or stale

## Files Reference

- `scripts/configure-signed-nav-publishers.js` - Initial setup script
- `deployments/nav-publishers.json` - Publisher credentials (SECURE!)
- `deployments/sepolia-rwa-perp-engine.json` - Contract addresses
- `contracts/oracles/SignedNavOracleAdapter.sol` - NAV oracle contract

## Contact & Support

For NAV update issues or publisher management, contact the system administrator or refer to the RwaPerpEngine deployment documentation.
