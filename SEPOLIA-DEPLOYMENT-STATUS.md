# Sepolia Deployment Status - Phase 0

## Deployment Date: 2026-07-29

---

## ✅ Phase 1: Deploy Hardened Contracts (COMPLETE)

### Step 1: Update Deploy Script ✅
- **Status:** COMPLETE
- **Changes:** Updated `maxStaleness` for rCRE from 24h to 7 days (604800s)
- **File:** `scripts/deploy-rwa-perp-engine.js`

### Step 2: Deploy RwaPerpEngine ✅
- **Status:** COMPLETE
- **Network:** Sepolia (ChainID: 11155111)
- **Deployment Timestamp:** 2026-07-29T20:19:36.593Z

**Deployed Contracts:**
- **RwaPerpEngine:** `0xEa4091B187f7b0543910Ee153f2c0E4cb07084CA`
- **ChainlinkRwaOracleAdapter:** `0x5e515fF92C77B9A06DfE09818930e8aFDaFa432E`
- **SignedNavOracleAdapter:** `0xb8725f00342cC7AcBfdc38E16F45CCF7741D8F26`
- **FundVault (Existing):** `0xAA768DACFd3a649d5776e1E4a1C54a35F970F573`

**Oracle Configuration:**
- **rGOLD:** Chainlink XAU/USD (heartbeat: 1 hour, feed: `0xC5981F461d74c46eB4b0CF3f4Ec79f025573B0Ea`)
- **rUSTB:** SignedNav (staleness: 24 hours)
- **rCRE:** SignedNav (staleness: 7 days) ✅ **FIXED**

### Step 3: Set Conservative Limits for Phase 0 ✅
- **Status:** COMPLETE
- **Max Positions per Wallet:** 2
- **Max Margin per Position:** $100 USDC

**Verification:**
- `maxPositionsPerWallet`: 2 ✅
- `maxMarginPerPositionE6`: 100,000,000 ($100) ✅

---

## ✅ Phase 2: Configure NAV Publishers (COMPLETE)

### NAV Publisher Configuration ✅
- **Status:** COMPLETE
- **Execution Timestamp:** 2026-07-29T20:21:52Z

**Publisher Wallets:**
- **rUSTB Publisher:** `0x11D7562A36A8d4b6a0024fCfD2860902F0c9610c`
  - Role: US Treasury Fund Administrator
  - NAV Frequency: Daily (24 hours)
  - Initial NAV: $1.00 (par value)
  - Valid Until: 2026-07-30T20:21:39Z
  - Transaction: `0x8ee49c524565931ee3b71bf08a8989c1e683211ab2b7c4aa5a80156d645e7f6e`

- **rCRE Publisher:** `0xbfDb9Ff527e2720235e28CA6e23559A38f9316f3`
  - Role: Commercial RE Appraiser
  - NAV Frequency: Weekly (7 days)
  - Initial NAV: $1,000.00
  - Valid Until: 2026-08-05T20:21:52Z
  - Transaction: `0xab448a0e4c6bb6492dce52678a472c75fdc2eaa3865f14f5ac81ddcf17daf66e`

**Oracle Verification:**
- rUSTB Price: $1.00 ✅
- rCRE Price: $1,000.00 ✅
- Both oracles settlement-enabled ✅

---

## ✅ Phase 3: ACL Validation Checklist (PARTIAL)

### Contract-Level Tests: PASSED ✅

**✅ Positive Cases:**
1. **Authorization Check:** ✅ PASS
   - RwaPerpEngine is authorized in FundVault
   
2. **User Balance Query:** ⏭️ SKIP (No deposits yet)
   - Contract-level access: Functional
   - Full validation: Requires Nox SDK integration

**✅ Negative Cases:**
1. **Unauthorized Contract Access:** ✅ PASS
   - Authorization mapping enforced correctly
   
2. **Pre-Authorization Deposit:** ✅ ARCHITECTURAL - Good
   - Authorization set during deployment (before any deposits)

**✅ Circuit Breaker Tests:**
1. **Pause/Unpause:** ✅ PASS
   - Trading can be paused ✅
   - Trading can be unpaused ✅
   - `whenNotPaused` modifier enforced ✅

**✅ Position Limits Tests:**
1. **Position Limits:** ✅ PASS
   - Max positions: 2 ✅
   - Max margin: $100 USDC ✅

### 🟡 PENDING: Full End-to-End Validation with Nox SDK

**Required Tests (NOT YET EXECUTED):**
1. **Basic Flow Test:**
   - User deposit → openPosition → closePosition
   - Verify no ACL revert
   
2. **ACL Propagation After Mutation:**
   - After deposit, verify RwaPerpEngine can read balance
   - After debitFrom, verify RwaPerpEngine can still read balance
   - After creditTo, verify RwaPerpEngine can still read balance
   
3. **User Decryption Test:**
   - User queries their balance after full cycle
   - Verify decryption works (proves ACL granted to user)
   
4. **Multi-Position Stress Test:**
   - Open 2 positions (at limit)
   - Try to open 3rd → must revert "Max positions reached"
   - Close 1 position
   - Open new position → must succeed

---

## 🔴 Phase 4: Fund Treasury (BLOCKED)

### Treasury Initialization ❌
- **Status:** BLOCKED - Requires Nox SDK Integration
- **Issue:** `initializeTreasury()` requires `externalEuint256` type, not bytes32
- **Current Script:** Uses dummy bytes32 handle (incompatible)

**Required for Production:**
```javascript
// Correct Nox SDK usage:
const treasuryHandle = await Nox.fromPlaintext(treasuryAmount);
const inputHandle = Nox.toExternal(treasuryHandle);
const proof = Nox.getProof(treasuryHandle);
await rwaPerpEngine.initializeTreasury(inputHandle, proof);
```

**Workaround Options:**
1. Wait for Nox SDK integration in scripts
2. Use Hardhat test environment with mocked Nox
3. Deploy with zero treasury and fund later

---

## 📊 Deployment Summary

### ✅ Completed Items
- [x] RwaPerpEngine deployed with hardening (pause/unpause, position limits)
- [x] rCRE maxStaleness fixed (7 days)
- [x] Conservative Phase 0 limits set (2 positions, $100 max)
- [x] NAV publishers configured and authorized
- [x] Initial NAVs submitted and verified
- [x] Contract-level ACL checks passed
- [x] Circuit breaker operational
- [x] Position limits verified

### 🟡 Pending Items
- [ ] Full end-to-end ACL validation with Nox SDK
- [ ] Multi-position stress test
- [ ] User decryption test
- [ ] Treasury initialization (requires Nox SDK)

### 🔴 Blockers for Public Launch
1. **CRITICAL:** Full ACL validation with real Nox SDK required
2. **CRITICAL:** Treasury initialization blocked (Nox SDK dependency)
3. **HIGH:** End-to-end flow test needed (deposit → trade → close)

---

## 🔐 Security Notes

### Phase 0 Risk Mitigation (ACTIVE)
- ✅ Trading can be paused instantly (circuit breaker)
- ✅ Max 2 positions per user
- ✅ Max $100 per position
- ✅ RwaPerpEngine properly authorized in FundVault
- ⚠️  Treasury not yet funded (ACL propagation untested)

### Known Limitations
1. **No Nox SDK Integration:** Scripts use dummy handles
2. **ACL Testing Incomplete:** Contract-level only (not FHE-level)
3. **Treasury Unfunded:** Cannot test counterparty settlement flow
4. **No User Deposits:** Cannot test full position lifecycle

---

## 📝 Recommended Next Steps

### Immediate Actions
1. **Integrate Nox SDK into deployment scripts**
   - Update `fund-treasury.js` with real FHE encryption
   - Update test scripts with Nox SDK calls
   
2. **Execute full ACL validation suite**
   - Fund test user wallet
   - Execute deposit → openPosition → closePosition
   - Verify ACL propagation at every mutation
   - Test user decryption capability
   
3. **Multi-position stress test**
   - Open 2 positions (hit limit)
   - Verify 3rd position rejects
   - Test position closure and re-opening

### Before Public Launch
- [ ] All ACL tests must PASS
- [ ] Treasury must be funded with real Nox encryption
- [ ] End-to-end flow must complete without ACL errors
- [ ] User decryption must work
- [ ] Circuit breaker must be tested under load
- [ ] Monitor initial positions closely

---

## 📄 Deployment Artifacts

### Files Generated
- `deployments/sepolia-rwa-perp-engine.json` (updated)
- `deployments/nav-publishers.json` (new, **KEEP SECURE**)
- `scripts/set-phase0-limits.js` (new)
- `scripts/acl-validation-checklist.js` (new)

### Transactions
- Deploy RwaPerpEngine: [View on Sepolia](https://sepolia.etherscan.io/address/0xEa4091B187f7b0543910Ee153f2c0E4cb07084CA)
- Set Position Limits: Check deployer transactions
- Authorize Publishers: Multiple txs in Phase 2
- Submit NAVs: rUSTB and rCRE initial NAVs set

---

## ⚠️ IMPORTANT WARNINGS

1. **DO NOT OPEN TO PUBLIC** until all ACL tests pass with real Nox SDK
2. **KEEP `nav-publishers.json` SECURE** - contains private keys
3. **Treasury unfunded** - counterparty settlement will fail
4. **Phase 0 limits active** - carefully monitor first positions
5. **No external liquidity** - protocol acts as sole counterparty

---

**Deployment Status:** **🟡 PARTIAL - Awaiting Nox SDK Integration**

**Deployment Environment:** Sepolia Testnet  
**Production Ready:** ❌ NO - ACL validation incomplete  
**Next Milestone:** Complete Phase 4 (Treasury Funding) with Nox SDK
