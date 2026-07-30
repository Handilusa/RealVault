# Access Control Audit Checklist

**Purpose:** This document audits all sensitive functions in the RealVault protocol to ensure proper access control before production deployment.

**Deployment Network:** Sepolia Testnet  
**Audit Date:** 2025  
**Status Legend:**
- ✅ **OK** - Safe for demo with current setup
- ⚠️ **Requires Multisig** - Must transfer to multisig before production
- ❌ **Do Not Use in Demo** - Too risky without additional safeguards

---

## FundVault Contract

**Deployed at:** `0xAA768DACFd3a649d5776e1E4a1C54a35F970F573`

| Function | Modifier | What Can Break if Abused | Risk Level | Status | Recommended Action |
|----------|----------|--------------------------|------------|--------|-------------------|
| `setDisclosureManager()` | `onlyOwner` | Can grant/revoke ACL permissions for balance decryption. Malicious manager could expose all user balances. | **CRITICAL** | ⚠️ Requires Multisig | Transfer ownership to Safe multisig. Never call this in production without governance vote. |
| `setNavAggregator()` | `onlyOwner` | Changes the NAV price feed source. Wrong aggregator = wrong position valuations = user losses. | **HIGH** | ⚠️ Requires Multisig | Test thoroughly in staging. Verify aggregator address before deployment. |
| `setAuthorizedContract()` | `onlyOwner` | Grants contracts permission to debit/credit user balances. Malicious contract = drain all funds. | **CRITICAL** | ⚠️ Requires Multisig | Only authorize audited contracts. Use timelock for changes. |
| `debitFrom()` | `onlyAuthorizedContract` | Debits user balance. If unauthorized contract gets access, can drain users. | **CRITICAL** | ✅ OK | Protected by ACL. Monitor authorization list carefully. |
| `creditTo()` | `onlyAuthorizedContract` | Credits user balance. If unauthorized contract gets access, can inflate balances (mint tokens). | **CRITICAL** | ✅ OK | Protected by ACL. Monitor authorization list carefully. |
| `deposit()` | Public | User deposits USDC. Over-deposit could lock funds if withdrawal fails. | **LOW** | ✅ OK | Normal user function. Ensure withdrawal works before launch. |
| `withdraw()` | Public | User withdraws USDC. Withdrawal bug = users can't access funds. | **MEDIUM** | ✅ OK | Test thoroughly with encrypted balances. |

**Key Risks:**
1. Owner account compromise = attacker controls ACL and pricing
2. Unauthorized contract authorization = complete fund drain
3. Disclosure manager compromise = privacy breach

**Production Requirements:**
- [ ] Transfer ownership to 2/3 multisig
- [ ] Document all authorized contracts
- [ ] Set up monitoring for authorization changes
- [ ] Test emergency withdrawal path

---

## RwaPerpEngine Contract

**Deployed at:** `0xEa4091B187f7b0543910Ee153f2c0E4cb07084CA`

| Function | Modifier | What Can Break if Abused | Risk Level | Status | Recommended Action |
|----------|----------|--------------------------|------------|--------|-------------------|
| `registerOracleAdapter()` | `onlyOwner` | Registers price oracle for asset. Wrong oracle = wrong prices = unfair settlements. | **CRITICAL** | ⚠️ Requires Multisig | Verify oracle addresses. Test with small positions first. |
| `configureAsset()` | `onlyOwner` | Sets asset parameters (name, oracle, unit). Wrong config = broken trading. | **HIGH** | ⚠️ Requires Multisig | Double-check oracle mapping. Ensure unit (e.g., 1e8) matches oracle decimals. |
| `setDisclosureManager()` | `onlyOwner` | Changes ACL manager. Wrong manager = users lose access to their positions. | **CRITICAL** | ⚠️ Requires Multisig | Must match FundVault disclosure manager. Never change during active positions. |
| `initializeTreasury()` | `onlyOwner` | One-time setup of treasury. Calling twice could break accounting. | **MEDIUM** | ✅ OK | Already called in deployment. Protected by initialization check. |
| `fundTreasury()` | `onlyOwner` | Adds funds to treasury. Under-funding = profitable positions can't settle. | **HIGH** | ⚠️ Requires Multisig | Monitor treasury balance. Alert if < $10k. Fund proactively. |
| `pauseTrading()` | `onlyOwner` | Stops openPosition(). Use during emergencies. | **MEDIUM** | ⚠️ Requires Multisig | Test pause/unpause flow. Ensure closePosition still works when paused. |
| `unpauseTrading()` | `onlyOwner` | Resumes trading. Unpausing without fixing issue = users lose money. | **MEDIUM** | ⚠️ Requires Multisig | Only unpause after root cause fixed and tested. |
| `setPositionLimits()` | `onlyOwner` | Changes max positions per user and max margin. Removing limits = users over-leverage. | **MEDIUM** | ⚠️ Requires Multisig | Demo limits: 2 positions, $100 margin. Production: adjust based on treasury size. |
| `openPosition()` | Public (when not paused) | Opens leveraged position. Bug = user loses margin. | **MEDIUM** | ✅ OK | Protected by position limits. Test edge cases (max leverage, min margin). |
| `closePosition()` | Public | Closes position and settles PnL. Settlement bug = wrong payout. | **HIGH** | ✅ OK | Test with profit/loss scenarios. Verify treasury balance updates. |

**Key Risks:**
1. Oracle manipulation = unfair settlements
2. Treasury insolvency = profitable traders can't withdraw
3. Pausing failure = can't stop exploit
4. Position limit removal = protocol insolvency

**Production Requirements:**
- [ ] Transfer ownership to 2/3 multisig
- [ ] Set up treasury balance monitoring (alert if < 10% of open interest)
- [ ] Document pause procedure in runbook
- [ ] Test oracle failover

---

## SignedNavOracleAdapter Contract

**Deployed at:** `0xb8725f00342cC7AcBfdc38E16F45CCF7741D8F26`

| Function | Modifier | What Can Break if Abused | Risk Level | Status | Recommended Action |
|----------|----------|--------------------------|------------|--------|-------------------|
| `setAuthorizedPublisher()` | `onlyOwner` | Authorizes address to submit NAV prices. Malicious publisher = fake prices. | **CRITICAL** | ⚠️ Requires Multisig | Use hardware wallet or multisig for publisher. Rotate keys quarterly. |
| `submitNav()` | `onlyAuthorizedPublisher` | Submits signed NAV price. Wrong price = wrong settlements. | **CRITICAL** | ✅ OK | Protected by publisher ACL. Monitor for stale prices (>24h). |

**Key Risks:**
1. Publisher key compromise = attacker controls prices for illiquid RWAs
2. Stale price acceptance = users trade on outdated data
3. No price = positions can't settle

**Production Requirements:**
- [ ] Transfer ownership to 2/3 multisig
- [ ] Store publisher key in HSM or hardware wallet
- [ ] Implement price staleness check (reject prices >24h old)
- [ ] Set up monitoring for missed NAV submissions

---

## ChainlinkRwaOracleAdapter Contract

**Deployed at:** `0x5e515fF92C77B9A06DfE09818930e8aFDaFa432E`

| Function | Modifier | What Can Break if Abused | Risk Level | Status | Recommended Action |
|----------|----------|--------------------------|------------|--------|-------------------|
| `configureFeed()` | `onlyOwner` | Maps asset to Chainlink price feed. Wrong feed = wrong prices. | **CRITICAL** | ⚠️ Requires Multisig | Verify feed address on Chainlink docs. Test with getPrice() before enabling trading. |
| `getPrice()` | Public (view) | Reads price from Chainlink. Feed failure = reverts, positions can't settle. | **HIGH** | ✅ OK | Monitor feed health. Have backup oracle ready. |

**Key Risks:**
1. Wrong feed address = wrong prices for all trades
2. Feed goes offline = trading stops
3. Feed returns stale price = outdated settlement

**Production Requirements:**
- [ ] Transfer ownership to 2/3 multisig
- [ ] Document all feed addresses with verification links
- [ ] Implement circuit breaker if feed price deviates >10% in 1 block
- [ ] Set up monitoring for Chainlink feed uptime

---

## Mock Contracts (Testnet Only)

### MockUSDC
**Deployed at:** `0x68eb02e7c218e91919E6E56A06F4cF0365E9e20c`

| Function | Modifier | What Can Break if Abused | Risk Level | Status | Recommended Action |
|----------|----------|--------------------------|------------|--------|-------------------|
| `mint()` | Public | Anyone can mint USDC. | **N/A** | ✅ OK | Testnet only. Replace with real USDC on mainnet. |

**Production:** Use real USDC contract. Never deploy mock tokens to mainnet.

---

## Summary: Critical Actions Before Production

### Immediate (Before Demo)
1. ✅ Verify all contracts deployed correctly
2. ✅ Test full user flow (deposit → open → close → withdraw)
3. ✅ Verify position limits enforced (2 positions, $100 margin)
4. ✅ Test pauseTrading() circuit breaker

### Before Production Launch
1. ⚠️ **Transfer all ownership to 2/3 multisig** (FundVault, RwaPerpEngine, both oracle adapters)
2. ⚠️ **Audit all authorized contracts** - ensure only audited contracts can debit/credit
3. ⚠️ **Implement timelock** - 48h delay on critical parameter changes
4. ⚠️ **Set up monitoring** - treasury balance, oracle staleness, position metrics
5. ⚠️ **Document emergency procedures** - see EMERGENCY-RUNBOOK.md

### Security Recommendations
- **Multisig Threshold:** 2-of-3 signers minimum
- **Signer Distribution:** Different hardware wallets, different physical locations
- **Key Rotation:** Quarterly rotation of publisher keys
- **Monitoring:** 24/7 alerts for treasury balance, oracle failures, pause events
- **Incident Response:** Document roles and communication channels

---

## Audit Sign-Off

**Auditor:** [Your Name]  
**Date:** [Date]  
**Result:** PASS for testnet demo with noted production requirements

**Attestation:**
> I have reviewed all access control mechanisms in the RealVault protocol. The current testnet deployment is suitable for hackathon demonstration with the documented position limits. Production deployment REQUIRES transfer of ownership to multisig and implementation of the noted safeguards.

**Next Steps:**
1. Review this checklist with team
2. Implement multisig setup (see MULTISIG-SETUP.md)
3. Document emergency procedures (see EMERGENCY-RUNBOOK.md)
4. Create judge demo guide (see JUDGE-DEMO-GUIDE.md)
