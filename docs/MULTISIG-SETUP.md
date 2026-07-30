# Multisig Deployment Guide

**Purpose:** Step-by-step guide to transfer protocol ownership from EOA to Safe multisig wallet for production security.

**Network:** Sepolia Testnet (for demo) → Mainnet (for production)  
**Recommended Setup:** 2-of-3 multisig (2 signatures required out of 3 signers)

---

## Why Multisig?

**Current Risk (EOA Ownership):**
- Single private key controls all protocol parameters
- Key compromise = total protocol control
- No transparency on governance actions
- No ability to revoke individual access

**Multisig Benefits:**
- Requires multiple approvals for sensitive operations
- Prevents single point of failure
- Transparent governance (all actions on-chain)
- Can revoke individual signers without re-deploying

---

## Prerequisites

### 1. Choose Signers

**Recommended:** 3 signers from different roles (2 required to execute)

Example setup:
- **Signer 1:** Lead Developer (hardware wallet)
- **Signer 2:** Operations Lead (hardware wallet)
- **Signer 3:** Security Advisor (hardware wallet)

**Signer Requirements:**
- Each must have a separate hardware wallet (Ledger, Trezor, or Lattice)
- Each must securely backup their seed phrase
- At least 2 signers must be available 24/7 for emergencies

### 2. Fund Signers for Gas

Each signer needs ~0.1 ETH on Sepolia for transaction signing:

```bash
# Check signer balances
cast balance <SIGNER_1_ADDRESS> --rpc-url $SEPOLIA_RPC_URL
cast balance <SIGNER_2_ADDRESS> --rpc-url $SEPOLIA_RPC_URL
cast balance <SIGNER_3_ADDRESS> --rpc-url $SEPOLIA_RPC_URL
```

### 3. Gather Contract Addresses

From deployment:
- **FundVault:** `0xAA768DACFd3a649d5776e1E4a1C54a35F970F573`
- **RwaPerpEngine:** `0xEa4091B187f7b0543910Ee153f2c0E4cb07084CA`
- **ChainlinkRwaOracleAdapter:** `0x5e515fF92C77B9A06DfE09818930e8aFDaFa432E`
- **SignedNavOracleAdapter:** `0xb8725f00342cC7AcBfdc38E16F45CCF7741D8F26`

---

## Step 1: Create Safe Wallet

### Option A: Via Safe Web App (Recommended for Non-Technical)

1. Go to https://app.safe.global/
2. Connect wallet (use Signer 1)
3. Click "Create Safe"
4. Select network: **Sepolia**
5. Name your Safe: "RealVault Protocol Safe"
6. Add signer addresses:
   - Signer 1: `0x...`
   - Signer 2: `0x...`
   - Signer 3: `0x...`
7. Set threshold: **2** (out of 3)
8. Review and deploy
9. Copy Safe address (e.g., `0x1234...abcd`)

### Option B: Via Hardhat Script (For Technical Users)

Create `scripts/deploySafe.js`:

```javascript
const { ethers } = require("hardhat");
const SafeFactory = require("@safe-global/protocol-kit").default;

async function main() {
  const [deployer] = await ethers.getSigners();
  
  const safeFactory = await SafeFactory.init({
    provider: deployer.provider,
    signer: deployer
  });

  const signers = [
    "0x...", // Signer 1
    "0x...", // Signer 2
    "0x..."  // Signer 3
  ];

  const safeAccountConfig = {
    owners: signers,
    threshold: 2, // 2-of-3
  };

  const safe = await safeFactory.deploySafe({ safeAccountConfig });
  const safeAddress = await safe.getAddress();

  console.log("Safe deployed at:", safeAddress);
}

main().catch(console.error);
```

Run:
```bash
npx hardhat run scripts/deploySafe.js --network sepolia
```

---

## Step 2: Fund Safe with Gas

The Safe needs ETH to execute transactions:

```bash
# Send 0.5 ETH to Safe for gas
cast send <SAFE_ADDRESS> --value 0.5ether --private-key $PRIVATE_KEY --rpc-url $SEPOLIA_RPC_URL
```

Verify:
```bash
cast balance <SAFE_ADDRESS> --rpc-url $SEPOLIA_RPC_URL
```

---

## Step 3: Transfer Contract Ownership

### 3.1 Prepare Ownership Transfer Transactions

Create `scripts/transferToMultisig.js`:

```javascript
const { ethers } = require("hardhat");

async function main() {
  const SAFE_ADDRESS = process.env.SAFE_ADDRESS;
  
  // Contract addresses
  const FUND_VAULT = "0xAA768DACFd3a649d5776e1E4a1C54a35F970F573";
  const RWA_PERP_ENGINE = "0xEa4091B187f7b0543910Ee153f2c0E4cb07084CA";
  const CHAINLINK_ORACLE = "0x5e515fF92C77B9A06DfE09818930e8aFDaFa432E";
  const SIGNED_NAV_ORACLE = "0xb8725f00342cC7AcBfdc38E16F45CCF7741D8F26";

  // Get contract instances
  const fundVault = await ethers.getContractAt("FundVault", FUND_VAULT);
  const rwaPerpEngine = await ethers.getContractAt("RwaPerpEngine", RWA_PERP_ENGINE);
  const chainlinkOracle = await ethers.getContractAt("ChainlinkRwaOracleAdapter", CHAINLINK_ORACLE);
  const signedNavOracle = await ethers.getContractAt("SignedNavOracleAdapter", SIGNED_NAV_ORACLE);

  console.log("Transferring ownership to Safe:", SAFE_ADDRESS);
  console.log("\n--- Current Owners ---");
  console.log("FundVault:", await fundVault.owner());
  console.log("RwaPerpEngine:", await rwaPerpEngine.owner());
  console.log("ChainlinkOracle:", await chainlinkOracle.owner());
  console.log("SignedNavOracle:", await signedNavOracle.owner());

  console.log("\n--- Transferring Ownership ---");
  
  // Transfer FundVault
  let tx = await fundVault.transferOwnership(SAFE_ADDRESS);
  await tx.wait();
  console.log("✅ FundVault ownership transferred");

  // Transfer RwaPerpEngine
  tx = await rwaPerpEngine.transferOwnership(SAFE_ADDRESS);
  await tx.wait();
  console.log("✅ RwaPerpEngine ownership transferred");

  // Transfer ChainlinkOracle
  tx = await chainlinkOracle.transferOwnership(SAFE_ADDRESS);
  await tx.wait();
  console.log("✅ ChainlinkOracle ownership transferred");

  // Transfer SignedNavOracle
  tx = await signedNavOracle.transferOwnership(SAFE_ADDRESS);
  await tx.wait();
  console.log("✅ SignedNavOracle ownership transferred");

  console.log("\n--- New Owners ---");
  console.log("FundVault:", await fundVault.owner());
  console.log("RwaPerpEngine:", await rwaPerpEngine.owner());
  console.log("ChainlinkOracle:", await chainlinkOracle.owner());
  console.log("SignedNavOracle:", await signedNavOracle.owner());

  console.log("\n✅ All contracts now owned by Safe multisig");
}

main().catch(console.error);
```

### 3.2 Execute Transfer

```bash
# Set Safe address
export SAFE_ADDRESS=0x... # Your Safe address from Step 1

# Run transfer script
npx hardhat run scripts/transferToMultisig.js --network sepolia
```

### 3.3 Verify Ownership

```bash
# Check FundVault owner
cast call 0xAA768DACFd3a649d5776e1E4a1C54a35F970F573 "owner()(address)" --rpc-url $SEPOLIA_RPC_URL

# Check RwaPerpEngine owner
cast call 0xEa4091B187f7b0543910Ee153f2c0E4cb07084CA "owner()(address)" --rpc-url $SEPOLIA_RPC_URL

# All should return your Safe address
```

---

## Step 4: Test Multisig Operation

### 4.1 Test Transaction: Update Position Limits

We'll test the multisig by updating position limits (non-critical operation).

**Via Safe Web App:**

1. Go to https://app.safe.global/
2. Select your Safe
3. Click "New Transaction" → "Contract Interaction"
4. Enter contract address: `0xEa4091B187f7b0543910Ee153f2c0E4cb07084CA` (RwaPerpEngine)
5. Select ABI (upload from `artifacts/contracts/RwaPerpEngine.sol/RwaPerpEngine.json`)
6. Select function: `setPositionLimits`
7. Enter parameters:
   - `_maxPositionsPerUser`: `3` (was 2)
   - `_maxMarginPerPosition`: `150` (was 100, in USDC with 6 decimals = 150000000)
8. Click "Add transaction"
9. **Signer 1:** Review and sign
10. **Signer 2:** Review and sign (transaction executes after 2nd signature)
11. Verify: Check new limits with `cast call`

**Via Hardhat Console (Advanced):**

```javascript
// Connect to Safe (requires @safe-global/protocol-kit)
const Safe = require("@safe-global/protocol-kit").default;
const { ethers } = require("hardhat");

const [signer1] = await ethers.getSigners();

const safe = await Safe.init({
  provider: signer1.provider,
  signer: signer1,
  safeAddress: "0x..." // Your Safe address
});

// Create transaction to update limits
const rwaPerpEngine = await ethers.getContractAt(
  "RwaPerpEngine",
  "0xEa4091B187f7b0543910Ee153f2c0E4cb07084CA"
);

const txData = rwaPerpEngine.interface.encodeFunctionData("setPositionLimits", [
  3,        // maxPositionsPerUser
  150000000 // maxMarginPerPosition (150 USDC with 6 decimals)
]);

const safeTransaction = await safe.createTransaction({
  transactions: [{
    to: "0xEa4091B187f7b0543910Ee153f2c0E4cb07084CA",
    value: "0",
    data: txData
  }]
});

// Signer 1 signs
const signedTx = await safe.signTransaction(safeTransaction);

// Propose transaction (other signers review in Safe UI)
const txHash = await safe.getTransactionHash(signedTx);
console.log("Transaction proposed:", txHash);
console.log("Other signers: approve in Safe UI");
```

---

## Operations That ALWAYS Require Multisig

### Critical Operations (NEVER do without multisig)

#### 1. Oracle Management
```javascript
// Register new oracle adapter
rwaPerpEngine.registerOracleAdapter(oracleType, adapterAddress);

// Configure Chainlink feed
chainlinkOracle.configureFeed(assetId, feedAddress);

// Set authorized NAV publisher
signedNavOracle.setAuthorizedPublisher(publisherAddress, true);
```

#### 2. Access Control Changes
```javascript
// Authorize contract to debit/credit balances
fundVault.setAuthorizedContract(contractAddress, true);

// Change disclosure manager
fundVault.setDisclosureManager(newManager);
rwaPerpEngine.setDisclosureManager(newManager);
```

#### 3. Treasury Operations
```javascript
// Fund treasury
rwaPerpEngine.fundTreasury(amount);

// Initialize treasury (one-time)
rwaPerpEngine.initializeTreasury();
```

#### 4. Circuit Breaker
```javascript
// Pause trading
rwaPerpEngine.pauseTrading();

// Unpause trading
rwaPerpEngine.unpauseTrading();
```

#### 5. Risk Parameters
```javascript
// Update position limits
rwaPerpEngine.setPositionLimits(maxPositions, maxMargin);

// Configure new asset
rwaPerpEngine.configureAsset(assetId, name, oracleType, unit);
```

### Example Multisig Workflow

**Scenario:** Need to add new RWA asset (rREIT - real estate)

1. **Proposer** (can be anyone):
   - Documents proposal: asset details, oracle source, risk assessment
   - Posts to governance forum/Discord

2. **Signer 1:**
   - Reviews proposal
   - Tests oracle in staging environment
   - Creates Safe transaction via UI
   - Signs transaction

3. **Signer 2:**
   - Independent review of proposal
   - Verifies oracle address matches documentation
   - Verifies transaction calldata
   - Signs transaction (executes on 2nd signature)

4. **Verification:**
   - Check asset registered: `getAssetConfig(assetId)`
   - Test openPosition() with small amount
   - Monitor for 24h before announcing

---

## Emergency Procedures via Multisig

### Scenario: Need to pause trading immediately

**Fast Path (< 5 minutes):**

1. **Signer 1** (on call):
   - Go to Safe UI
   - Create transaction: `rwaPerpEngine.pauseTrading()`
   - Sign immediately

2. **Signer 2** (on call):
   - Receives alert (via Telegram/Discord)
   - Reviews incident report
   - Signs within 2 minutes

3. **Communication:**
   - Post banner on UI: "Trading paused. Investigating issue."
   - Update Discord/Twitter

**Verification:**
```bash
# Check if paused
cast call 0xEa4091B187f7b0543910Ee153f2c0E4cb07084CA "paused()(bool)" --rpc-url $SEPOLIA_RPC_URL
# Should return: true
```

---

## Monitoring & Alerts

### Set Up Safe Notifications

**Via Safe UI:**
1. Go to Settings → Notifications
2. Enable email/webhook notifications for:
   - New transaction proposed
   - Transaction requires your signature
   - Transaction executed

**Via Safe Transaction Service API:**

```javascript
// Subscribe to Safe events
const SAFE_SERVICE_URL = "https://safe-transaction-sepolia.safe.global";

// Poll for pending transactions
async function checkPendingTxs() {
  const response = await fetch(
    `${SAFE_SERVICE_URL}/api/v1/safes/${SAFE_ADDRESS}/multisig-transactions/?executed=false`
  );
  const data = await response.json();
  
  if (data.count > 0) {
    console.log("⚠️ Pending transactions require signature:", data.count);
    // Send alert to Telegram/Discord
  }
}

// Run every 5 minutes
setInterval(checkPendingTxs, 5 * 60 * 1000);
```

---

## Signer Responsibilities

### Signer 1 (Lead Developer)
- **Primary:** Propose technical changes (oracle configs, ACL updates)
- **Review:** Security implications, contract interactions
- **Availability:** 24/7 on-call rotation

### Signer 2 (Operations Lead)
- **Primary:** Treasury operations, risk parameter updates
- **Review:** Economic impact, treasury solvency
- **Availability:** Business hours + emergency on-call

### Signer 3 (Security Advisor)
- **Primary:** Emergency pause/unpause decisions
- **Review:** Security audit of all proposals
- **Availability:** Advisory role + emergency on-call

### Signing Checklist

Before signing ANY transaction:
- [ ] Read full proposal/incident report
- [ ] Verify transaction calldata matches intent
- [ ] Check contract address is correct
- [ ] Ensure no other pending transactions conflict
- [ ] Verify transaction doesn't brick contracts
- [ ] Document rationale for signing

---

## Mainnet Differences

When deploying to mainnet:

1. **Higher Threshold:**
   - Consider 3-of-5 or 4-of-7 for mainnet
   - More signers = more security, slower execution

2. **Timelock:**
   - Add 48h timelock for non-emergency operations
   - Gives community time to detect malicious proposals

3. **Hardware Requirements:**
   - All signers MUST use hardware wallets (no software wallets)
   - Store hardware wallets in different physical locations

4. **Insurance:**
   - Consider multisig insurance (e.g., Nexus Mutual coverage)
   - Protects against signer collusion or key compromise

5. **Governance:**
   - Document all transactions in public forum
   - Implement governance voting for major changes

---

## Troubleshooting

### Problem: Transaction won't execute after 2 signatures

**Cause:** Insufficient gas in Safe

**Solution:**
```bash
cast send <SAFE_ADDRESS> --value 0.1ether --private-key $PRIVATE_KEY --rpc-url $SEPOLIA_RPC_URL
```

### Problem: Signer lost access to wallet

**Solution:**
1. Other signers create transaction: `swapOwner(old, new)`
2. Replace old signer with new address
3. No need to re-deploy contracts

### Problem: Need to reduce threshold temporarily

**Solution:**
```javascript
// Change threshold from 2-of-3 to 1-of-3 (emergency only)
safe.changeThreshold(1);
// Requires 2 signatures to execute this change
```

---

## Checklist: Multisig Setup Complete

- [ ] Safe deployed on Sepolia
- [ ] 3 signers added with 2-of-3 threshold
- [ ] Safe funded with 0.5 ETH for gas
- [ ] FundVault ownership transferred to Safe
- [ ] RwaPerpEngine ownership transferred to Safe
- [ ] ChainlinkOracle ownership transferred to Safe
- [ ] SignedNavOracle ownership transferred to Safe
- [ ] Ownership verified via cast/etherscan
- [ ] Test transaction executed successfully
- [ ] All signers have Safe UI access
- [ ] Notification alerts configured
- [ ] Emergency procedures documented
- [ ] Signer responsibilities assigned

---

## Next Steps

1. ✅ Complete multisig setup
2. 📋 Review ACCESS-CONTROL-AUDIT.md
3. 🚨 Set up EMERGENCY-RUNBOOK.md procedures
4. 🎯 Test full protocol flow with multisig ownership
5. 📊 Set up monitoring dashboard

**Questions?** Contact team lead or security advisor before proceeding.
