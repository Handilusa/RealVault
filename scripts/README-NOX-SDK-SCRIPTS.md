# Nox SDK Integration Scripts

Three production-ready scripts for testing and deploying the RwaPerpEngine with real Nox FHE encryption.

## Prerequisites

```bash
# Install Safe Global Protocol Kit (required for setup-multisig.js)
npm install @safe-global/protocol-kit

# Ensure .env is configured with:
# - PRIVATE_KEY (deployer wallet)
# - SEPOLIA_RPC_URL (Sepolia RPC endpoint)
```

## Scripts Overview

### 1. nox-fund-treasury.js
**Purpose:** Fund RwaPerpEngine treasury with encrypted USDC using Nox SDK

**What it does:**
- Creates Nox handle client
- Encrypts $100,000 USDC treasury amount with FHE
- Calls `fundTreasury()` with encrypted handle
- Verifies treasury balance handle (encrypted on-chain)

**Usage:**
```bash
npm run nox:fund-treasury
```

**Expected Output:**
- ✅ Handle client created
- ✅ Encrypted handle generated
- ✅ Treasury funded successfully
- ⚠️  Decryption requires disclosure manager ACL

---

### 2. nox-test-flow.js
**Purpose:** End-to-end test of deposit, trading, and privacy features

**What it does:**
1. **Deposit USDC** - Mints $500 USDC, encrypts, deposits to FundVault
2. **Open Position** - Opens 5x leveraged long position on rGOLD with encrypted margin
3. **Close Position** - Settles PnL and updates balances
4. **Decrypt Balance** - Attempts to decrypt final balance (demonstrates privacy)

**Usage:**
```bash
npm run nox:test-flow
```

**Expected Output:**
- ✅ Deposit with FHE encryption
- ✅ Open position with encrypted margin
- ✅ Close position and settle PnL
- ✅ ACL propagation (no reverts)
- ✅ Privacy preserved (euint256 handles on-chain)

**Key Validations:**
- FHE operations work end-to-end
- ACL grants propagate correctly
- Treasury can settle PnL
- User privacy maintained throughout

---

### 3. setup-multisig.js
**Purpose:** Deploy Safe multisig and transfer contract ownership for governance

**What it does:**
1. **Deploy Safe** - Creates 2-of-3 multisig wallet
2. **Transfer Ownership** - Moves ownership of all contracts to Safe:
   - FundVault
   - RwaPerpEngine
   - ChainlinkRwaOracleAdapter
   - SignedNavOracleAdapter
3. **Test Operations** - Executes pause/unpause and parameter changes via multisig
4. **Save Config** - Outputs multisig configuration to `deployments/multisig-config.json`

**Usage:**
```bash
npm run setup:multisig
```

**Expected Output:**
- ✅ Safe deployed (3 signers, 2-of-3 threshold)
- ✅ Ownership transferred to Safe
- ✅ Pause/unpause via multisig test passed
- ✅ Parameter change via multisig test passed

**Configuration Saved:**
```json
{
  "safeAddress": "0x...",
  "threshold": 2,
  "owners": ["0x...", "0x...", "0x..."],
  "network": "sepolia",
  "contracts": [...]
}
```

---

## Execution Order

For initial deployment and testing:

```bash
# Step 1: Deploy contracts (if not already deployed)
npm run deploy:rwa-perp

# Step 2: Fund treasury with encrypted USDC
npm run nox:fund-treasury

# Step 3: Run end-to-end test
npm run nox:test-flow

# Step 4: Set up multisig governance
npm run setup:multisig
```

---

## Troubleshooting

### Error: "Cannot find module '@safe-global/protocol-kit'"
**Solution:**
```bash
npm install @safe-global/protocol-kit
```

### Error: "Cannot find module '@iexec-nox/handle'"
**Solution:** Already in dependencies, run:
```bash
npm install
```

### Error: "Decryption requires disclosure manager ACL"
**Expected behavior** - This confirms privacy is working. Balances are encrypted on-chain and only accessible with proper ACL grants.

### Error: "Trading paused"
**Solution:** Check if `pauseTrading()` was called. Unpause with multisig or owner account:
```solidity
rwaPerpEngine.unpauseTrading();
```

### Safe deployment fails
**Common causes:**
- Insufficient gas (fund deployer with ETH)
- Network congestion (increase gas price)
- RPC endpoint issues (check SEPOLIA_RPC_URL)

---

## Architecture Notes

### Nox SDK Integration
- **Handle Client**: Manages FHE encryption/decryption via Nox protocol
- **encryptInput()**: Encrypts plaintext values into FHE handles
- **decryptValue()**: Decrypts handles (requires ACL permissions)

### ACL Propagation
When a user deposits:
1. `FundVault` receives encrypted balance handle
2. `RwaPerpEngine` receives ACL grant for user's balance
3. Treasury receives ACL grant to settle PnL
4. User retains decryption rights via DisclosureManager

### Safe Multisig
- 2-of-3 threshold prevents single-point-of-failure
- All admin functions require 2 signatures
- Emergency procedures documented in EMERGENCY-RUNBOOK.md

---

## Next Steps

After running all scripts:
1. ✅ Verify deployment on Sepolia Etherscan
2. ✅ Update frontend to use Nox SDK for encryption
3. ✅ Document multisig signer roles and contact info
4. ✅ Create emergency runbook for pause/unpause procedures
5. ✅ Open for judge testing and feedback

---

## Reference

- **Nox SDK Docs**: https://docs.iex.ec/nox/sdk
- **Safe Global Docs**: https://docs.safe.global/sdk/protocol-kit
- **RwaPerpEngine Spec**: `.kiro/specs/confidential-rwa-perp-engine/`
- **Deployment Info**: `deployments/sepolia-rwa-perp-engine.json`

---

**Status:** Ready for Sepolia testing ✅
