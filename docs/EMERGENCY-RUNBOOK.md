# Emergency Runbook

**Purpose:** Step-by-step incident response procedures for RealVault protocol emergencies.

**Network:** Sepolia Testnet  
**Last Updated:** 2025  
**On-Call Contacts:** [Fill in team contacts]

---

## 🚨 Quick Reference

### Circuit Breaker (Stop All Trading)
```bash
# Via Hardhat console
npx hardhat console --network sepolia
const engine = await ethers.getContractAt("RwaPerpEngine", "0xEa4091B187f7b0543910Ee153f2c0E4cb07084CA");
await engine.pauseTrading();
```

### Emergency Contacts
- **Lead Developer:** [Name] - [Phone/Telegram]
- **Operations Lead:** [Name] - [Phone/Telegram]
- **Security Advisor:** [Name] - [Phone/Telegram]
- **Community Manager:** [Name] - [Discord/Twitter]

### Contract Addresses (Sepolia)
- **RwaPerpEngine:** `0xEa4091B187f7b0543910Ee153f2c0E4cb07084CA`
- **FundVault:** `0xAA768DACFd3a649d5776e1E4a1C54a35F970F573`
- **ChainlinkOracle:** `0x5e515fF92C77B9A06DfE09818930e8aFDaFa432E`
- **SignedNavOracle:** `0xb8725f00342cC7AcBfdc38E16F45CCF7741D8F26`

### Monitoring Dashboard
- **Etherscan:** https://sepolia.etherscan.io/
- **Safe UI:** https://app.safe.global/
- **Status Page:** [Link when available]

---

## Incident Classification

### 🔴 **Severity 1: Critical**
System down, funds at risk, exploit in progress.  
**Response Time:** < 5 minutes  
**Actions:** Pause trading immediately, assess impact, communicate

### 🟠 **Severity 2: High**
Partial service degradation, potential fund risk.  
**Response Time:** < 15 minutes  
**Actions:** Investigate, consider pause, prepare hotfix

### 🟡 **Severity 3: Medium**
Service degraded but functional, no fund risk.  
**Response Time:** < 1 hour  
**Actions:** Investigate, schedule fix, monitor

### 🟢 **Severity 4: Low**
Minor issue, cosmetic bug, performance degradation.  
**Response Time:** < 4 hours  
**Actions:** Log issue, add to backlog

---

## Incident Response Procedures

### Incident Type 1: ACL Failure

**Symptoms:**
- Users can't open positions (transaction reverts)
- Users can't close positions (transaction reverts)
- Error: "Unauthorized" or "Not authorized contract"

**Diagnosis:**
```bash
# Check if RwaPerpEngine is authorized in FundVault
cast call 0xAA768DACFd3a649d5776e1E4a1C54a35F970F573 \
  "authorizedContracts(address)(bool)" \
  0xEa4091B187f7b0543910Ee153f2c0E4cb07084CA \
  --rpc-url $SEPOLIA_RPC_URL

# Should return: true
# If false, authorization was removed
```

**Root Causes:**
1. Accidental `setAuthorizedContract(engine, false)` call
2. FundVault redeployed without re-authorizing engine
3. ACL manager misconfiguration

**Response (< 5 minutes):**

**Step 1: Verify State**
```bash
# Check current authorization
cast call 0xAA768DACFd3a649d5776e1E4a1C54a35F970F573 \
  "authorizedContracts(address)(bool)" \
  0xEa4091B187f7b0543910Ee153f2c0E4cb07084CA \
  --rpc-url $SEPOLIA_RPC_URL
```

**Step 2: Re-Authorize (if needed)**
```javascript
// Via Hardhat console (if EOA owner) or Safe (if multisig)
const fundVault = await ethers.getContractAt("FundVault", "0xAA768DACFd3a649d5776e1E4a1C54a35F970F573");
await fundVault.setAuthorizedContract("0xEa4091B187f7b0543910Ee153f2c0E4cb07084CA", true);
```

**Step 3: Verify Fix**
```bash
# Test openPosition with small amount
# Via frontend or Hardhat console
```

**Step 4: Communicate**
```
Status: RESOLVED
Issue: Users temporarily unable to trade due to access control configuration.
Resolution: Access restored. All positions remain safe.
Timeline: [Start time] - [End time]
```

**DO NOT:**
- ❌ Change disclosure manager during incident
- ❌ Authorize unknown contracts
- ❌ Redeploy contracts with active positions

---

### Incident Type 2: Oracle Failure

**Symptoms:**
- Positions can't settle (closePosition reverts)
- Prices not updating
- Error: "Stale price" or "Oracle unavailable"

**Diagnosis:**

**For Chainlink Oracle:**
```bash
# Check latest price
cast call 0x5e515fF92C77B9A06DfE09818930e8aFDaFa432E \
  "getPrice(bytes32)(uint256)" \
  0x72474f4c440000000000000000000000000000000000000000000000000000 \
  --rpc-url $SEPOLIA_RPC_URL

# Check Chainlink feed directly
cast call <CHAINLINK_FEED_ADDRESS> "latestRoundData()(uint80,int256,uint256,uint256,uint80)" \
  --rpc-url $SEPOLIA_RPC_URL
```

**For SignedNav Oracle:**
```bash
# Check last NAV submission
cast call 0xb8725f00342cC7AcBfdc38E16F45CCF7741D8F26 \
  "getPrice(bytes32)(uint256)" \
  0x7245535441544500000000000000000000000000000000000000000000000000 \
  --rpc-url $SEPOLIA_RPC_URL
```

**Root Causes:**
1. Chainlink feed paused/deprecated
2. SignedNav publisher stopped submitting
3. Wrong oracle adapter configured
4. Network congestion (RPC issues)

**Response (< 15 minutes):**

**Step 1: Pause Trading (Precautionary)**
```javascript
const engine = await ethers.getContractAt("RwaPerpEngine", "0xEa4091B187f7b0543910Ee153f2c0E4cb07084CA");
await engine.pauseTrading();
```

**Step 2: Diagnose Oracle**

**If Chainlink Feed Dead:**
```javascript
// Option A: Switch to backup feed (if available)
const chainlinkOracle = await ethers.getContractAt("ChainlinkRwaOracleAdapter", "0x5e515fF92C77B9A06DfE09818930e8aFDaFa432E");
await chainlinkOracle.configureFeed(assetId, backupFeedAddress);

// Option B: Switch to SignedNav temporarily
const engine = await ethers.getContractAt("RwaPerpEngine", "0xEa4091B187f7b0543910Ee153f2c0E4cb07084CA");
await engine.registerOracleAdapter(2, "0xb8725f00342cC7AcBfdc38E16F45CCF7741D8F26"); // OracleType.SignedNav
```

**If SignedNav Not Submitting:**
```bash
# Check last submission timestamp (requires custom view function)
# Manually submit NAV if publisher offline
npx hardhat run scripts/submitNav.js --network sepolia
```

**Step 3: Verify Oracle Working**
```javascript
// Test getPrice
const price = await engine.getAssetPrice(assetId);
console.log("Current price:", price.toString());

// Try closing a test position (if you have one)
```

**Step 4: Unpause & Communicate**
```javascript
await engine.unpauseTrading();
```

```
Status: RESOLVED
Issue: Oracle temporarily unavailable for [asset].
Resolution: Switched to backup oracle. Prices now updating.
Impact: Trading paused for [duration]. No positions affected.
```

**DO NOT:**
- ❌ Change oracle adapters with active positions without testing
- ❌ Submit fake NAV prices to "fix" oracle
- ❌ Unpause before verifying oracle works

---

### Incident Type 3: Treasury Insolvency

**Symptoms:**
- Profitable positions can't close (transaction reverts)
- Error: "Insufficient treasury balance"
- Treasury balance near zero

**Diagnosis:**
```bash
# Check treasury balance
cast call 0xAA768DACFd3a649d5776e1E4a1C54a35F970F573 \
  "getTreasuryBalance()(euint256)" \
  --rpc-url $SEPOLIA_RPC_URL

# Decrypt treasury balance (requires disclosure manager)
# Via frontend or Hardhat with FHE SDK
```

**Root Causes:**
1. More winners than losers (normal variance)
2. Treasury not funded adequately at launch
3. Large profitable position liquidated
4. Treasury balance tracking bug

**Response (< 10 minutes):**

**Step 1: Pause Trading**
```javascript
const engine = await ethers.getContractAt("RwaPerpEngine", "0xEa4091B187f7b0543910Ee153f2c0E4cb07084CA");
await engine.pauseTrading();
```

**Step 2: Assess Liability**
```javascript
// Calculate total open positions PnL
// This requires iterating positions (may need custom script)
npx hardhat run scripts/calculateOpenInterest.js --network sepolia

// Example output:
// Total Long Positions: $5,000
// Total Short Positions: $3,000
// Estimated PnL if all closed now: -$1,200 (treasury pays)
// Current Treasury: $500
// Shortfall: $700
```

**Step 3: Fund Treasury**
```javascript
// Get USDC
const usdc = await ethers.getContractAt("MockUSDC", "0x68eb02e7c218e91919E6E56A06F4cF0365E9e20c");

// Approve engine
await usdc.approve("0xEa4091B187f7b0543910Ee153f2c0E4cb07084CA", ethers.parseUnits("1000", 6));

// Fund treasury (requires owner)
await engine.fundTreasury(ethers.parseUnits("1000", 6)); // Add $1000
```

**Step 4: Verify & Unpause**
```javascript
// Verify treasury balance increased
const newBalance = await fundVault.getTreasuryBalance();

// Test closing a profitable position
await engine.closePosition(positionId);

// Unpause
await engine.unpauseTrading();
```

**Step 5: Communicate**
```
Status: RESOLVED
Issue: Treasury balance depleted due to profitable positions.
Resolution: Treasury replenished with $1000. All withdrawals now processing.
Impact: Trading paused for [duration]. Positions remain safe.
Next Steps: Implementing automated treasury monitoring.
```

**Prevention:**
```javascript
// Set up monitoring script (run every 5 minutes)
const treasuryBalance = await fundVault.getTreasuryBalance();
// Decrypt via disclosure manager
if (treasuryBalance < MINIMUM_BALANCE) {
  // Alert team via Telegram/Discord
  console.log("⚠️ ALERT: Treasury balance low!");
}
```

**DO NOT:**
- ❌ Tell users "treasury is insolvent" (causes panic)
- ❌ Close profitable positions forcibly
- ❌ Modify position PnL calculations to reduce payouts

---

### Incident Type 4: Unexpected Reverts

**Symptoms:**
- All transactions revert with generic error
- Frontend shows "Transaction failed"
- No obvious cause in contract state

**Diagnosis:**
```bash
# Check if paused
cast call 0xEa4091B187f7b0543910Ee153f2c0E4cb07084CA "paused()(bool)" --rpc-url $SEPOLIA_RPC_URL

# Check position limits
cast call 0xEa4091B187f7b0543910Ee153f2c0E4cb07084CA "maxPositionsPerUser()(uint256)" --rpc-url $SEPOLIA_RPC_URL
cast call 0xEa4091B187f7b0543910Ee153f2c0E4cb07084CA "maxMarginPerPosition()(uint256)" --rpc-url $SEPOLIA_RPC_URL

# Check user position count
cast call 0xEa4091B187f7b0543910Ee153f2c0E4cb07084CA \
  "userPositionCount(address)(uint256)" \
  <USER_ADDRESS> \
  --rpc-url $SEPOLIA_RPC_URL
```

**Common Causes:**
1. Trading paused (forgot to unpause after test)
2. Position limits reached (user has 2/2 positions)
3. Margin too high (exceeds $100 limit)
4. FHE computation timeout (Nox network issue)
5. Gas limit too low

**Response (< 5 minutes):**

**Step 1: Quick Checks**
```javascript
const engine = await ethers.getContractAt("RwaPerpEngine", "0xEa4091B187f7b0543910Ee153f2c0E4cb07084CA");

// Is paused?
console.log("Paused:", await engine.paused());

// Check limits
console.log("Max positions:", await engine.maxPositionsPerUser());
console.log("Max margin:", await engine.maxMarginPerPosition());
```

**Step 2: Try Manual Transaction**
```javascript
// Try opening position manually with exact parameters
const tx = await engine.openPosition(
  "0x72474f4c440000000000000000000000000000000000000000000000000000", // rGOLD
  true, // isLong
  ethers.parseUnits("50", 6), // $50 margin
  5 // 5x leverage
);
await tx.wait();

// If this works, issue is in frontend
// If this fails, issue is in contract
```

**Step 3: Check Recent Events**
```bash
# Get recent transactions to contract
# Via Etherscan or:
cast logs --from-block -1000 --address 0xEa4091B187f7b0543910Ee153f2c0E4cb07084CA --rpc-url $SEPOLIA_RPC_URL
```

**Step 4: Escalate if Exploit Suspected**
If you see:
- Unusual transaction patterns
- Positions opened with extreme parameters
- Balance changes that don't match position PnL

**→ PAUSE IMMEDIATELY and investigate**

**Step 5: Communicate**
```
Status: INVESTIGATING
Issue: Users experiencing transaction failures.
Actions: Team investigating. Positions remain safe.
ETA: Update in 15 minutes.
```

---

### Incident Type 5: Suspected Exploit

**Symptoms:**
- Unusual contract calls
- Rapid position opening/closing
- Unexpected balance changes
- Large profits with small margin

**Response (< 1 minute):**

**Step 1: PAUSE IMMEDIATELY**
```javascript
const engine = await ethers.getContractAt("RwaPerpEngine", "0xEa4091B187f7b0543910Ee153f2c0E4cb07084CA");
await engine.pauseTrading();
```

**Step 2: Do NOT communicate details publicly yet**
```
Status: MAINTENANCE
Message: Trading temporarily paused for system maintenance. All funds are safe.
```

**Step 3: Gather Evidence**
```bash
# Get all recent transactions
# Via Etherscan: filter by contract address, last 1 hour

# Identify suspicious addresses
# Look for: same address opening/closing rapidly, unusual patterns

# Export transaction list for analysis
```

**Step 4: Contact Security Advisor**
- Share transaction hashes
- Share suspected exploit vector
- DO NOT discuss publicly until patched

**Step 5: Assess Damage**
```javascript
// Calculate losses
// Check treasury balance
// Identify affected users
```

**Step 6: Hotfix or Temporary Measures**
- If exploit is in frontend: disable frontend, keep contracts paused
- If exploit is in contract: keep paused, prepare migration plan
- If exploit is in oracle: switch oracle, verify prices

**Step 7: Public Communication (after fix)**
```
Status: RESOLVED
Issue: Security vulnerability discovered and patched.
Impact: [X users affected, $Y at risk, $Z recovered]
Resolution: [Brief technical explanation]
Compensation: [If applicable]
Audit: [Link to post-mortem]
```

**DO NOT:**
- ❌ Unpause until exploit is patched and tested
- ❌ Reveal exploit details before patch deployed
- ❌ Blame users or claim "social engineering"

---

## How to Pause Trading (< 1 Minute)

### Option 1: Via Hardhat Console (Fastest)

```bash
# Open console
npx hardhat console --network sepolia

# Execute pause
const engine = await ethers.getContractAt("RwaPerpEngine", "0xEa4091B187f7b0543910Ee153f2c0E4cb07084CA");
await engine.pauseTrading();

# Verify
console.log("Paused:", await engine.paused());
```

### Option 2: Via Cast (Command Line)

```bash
# Requires private key in environment
cast send 0xEa4091B187f7b0543910Ee153f2c0E4cb07084CA \
  "pauseTrading()" \
  --private-key $PRIVATE_KEY \
  --rpc-url $SEPOLIA_RPC_URL
```

### Option 3: Via Safe (If Multisig)

1. Go to https://app.safe.global/
2. Select your Safe
3. New Transaction → Contract Interaction
4. Address: `0xEa4091B187f7b0543910Ee153f2c0E4cb07084CA`
5. Function: `pauseTrading()`
6. Sign with 2 signers (2-of-3 threshold)

**Note:** Multisig is slower (5-10 minutes). Use Hardhat/cast for emergencies.

---

## Communication Templates

### Banner Text (Frontend)

**During Incident:**
```
⚠️ Trading temporarily paused. Your positions are safe. Updates: [Discord]
```

**After Resolution:**
```
✅ Trading resumed. Issue resolved. Details: [Link to post-mortem]
```

### Discord Announcement

**Initial Notification:**
```
🚨 **INCIDENT ALERT**

We've temporarily paused trading on RealVault while we investigate [brief issue description].

**Status:** Investigating
**Your Funds:** Safe and secure
**closePosition():** Still available (you can exit positions)
**ETA:** Updates every 15 minutes

We'll keep you posted. Thank you for your patience.
```

**Resolution:**
```
✅ **INCIDENT RESOLVED**

Trading has been resumed on RealVault.

**Issue:** [Brief technical explanation]
**Resolution:** [What we did to fix it]
**Timeline:** Paused [X minutes/hours]
**Impact:** [Number of users affected, if any]

**Next Steps:** We're conducting a full post-mortem and will share findings within 24 hours.

Thank you for your patience and understanding.
```

### Twitter/X Post

**During Incident:**
```
⚠️ RealVault trading temporarily paused while we investigate an issue. All funds are safe. Updates: [Discord link]
```

**After Resolution:**
```
✅ RealVault trading resumed. Issue resolved in [X] minutes. Full post-mortem: [Link]
```

---

## What NOT to Do During Incidents

### ❌ Never Do These (Can Make Things Worse)

1. **Change Oracle Adapters with Active Positions**
   - Risk: Position valuations become inconsistent
   - Alternative: Pause first, test thoroughly, then switch

2. **Modify ACL (`setAuthorizedContract`) Without Testing**
   - Risk: Break all trading functionality
   - Alternative: Test in staging environment first

3. **Transfer Ownership During Incident**
   - Risk: Lose ability to execute emergency actions
   - Alternative: Wait until incident resolved

4. **Make Code Changes in Production Without Review**
   - Risk: Introduce new bugs, make exploit worse
   - Alternative: Deploy to staging, test thoroughly

5. **Redeploy Contracts with Active Positions**
   - Risk: Users lose access to their positions
   - Alternative: Implement migration plan first

6. **Force Close User Positions**
   - Risk: Legal liability, user anger, reputation damage
   - Alternative: Let users close voluntarily, offer incentives

7. **Panic and Over-Communicate**
   - Risk: Cause user panic, give attackers information
   - Alternative: Pause, investigate, then communicate facts

---

## Post-Incident Checklist

After every incident, complete this checklist:

### Immediate (< 24 hours)
- [ ] Incident resolved and verified
- [ ] Trading resumed (if appropriate)
- [ ] Public communication sent
- [ ] All team members notified

### Short-term (< 1 week)
- [ ] Post-mortem document created
  - What happened
  - Root cause analysis
  - Timeline of events
  - What we did right
  - What we did wrong
  - Action items
- [ ] Update runbook with lessons learned
- [ ] Implement monitoring to detect similar issues
- [ ] Test fix thoroughly in staging

### Long-term (< 1 month)
- [ ] Deploy preventative measures
- [ ] Conduct team training on incident
- [ ] Update documentation
- [ ] Consider third-party audit if security issue
- [ ] Implement requested user features (if applicable)

---

## Testing Emergency Procedures

### Monthly Drill: Pause/Unpause

**Purpose:** Ensure team can pause quickly in emergency

**Steps:**
1. Schedule drill with team (announce in advance)
2. Simulate incident: "Oracle failure detected"
3. Time how long to pause (target: < 2 minutes)
4. Verify pause worked (test transaction reverts)
5. Unpause after drill
6. Debrief: What went well? What needs improvement?

**Acceptance Criteria:**
- [ ] Pause executed in < 2 minutes
- [ ] All team members knew their role
- [ ] Communication template sent
- [ ] Unpause successful

### Quarterly Drill: Full Incident Response

**Purpose:** Test full incident response, including multisig coordination

**Steps:**
1. Simulate Sev 1 incident (e.g., "Exploit detected")
2. Execute full runbook
3. Include multisig signers in drill
4. Practice communication (send to test channel)
5. Measure response time
6. Debrief with all participants

---

## Monitoring Setup

### Critical Metrics to Monitor

**1. Treasury Balance**
```javascript
// Alert if below $1000
const balance = await fundVault.getTreasuryBalance();
if (balance < 1000e6) alert("Treasury low!");
```

**2. Oracle Staleness**
```javascript
// Alert if price older than 24h
const lastUpdate = await oracle.lastUpdateTimestamp(assetId);
if (Date.now() / 1000 - lastUpdate > 86400) alert("Stale price!");
```

**3. Position Concentration**
```javascript
// Alert if single user has >50% of open interest
// Requires custom calculation
```

**4. Contract Pause Status**
```javascript
// Alert if paused for >1 hour (unless planned)
const isPaused = await engine.paused();
```

### Recommended Monitoring Tools

- **Tenderly:** Real-time alerts, transaction simulation
- **Defender:** OpenZeppelin monitoring and automation
- **Custom Script:** Node.js script running every 5 minutes

---

## Escalation Path

**Level 1:** On-call developer
- Can pause/unpause
- Can re-authorize contracts
- Can fund treasury

**Level 2:** Security advisor
- Reviews Level 1 actions
- Approves oracle changes
- Conducts exploit analysis

**Level 3:** Multisig signers
- Required for major changes
- Final authority on incident response

**Level 4:** External audit firm
- Called for serious exploits
- Provides independent analysis

---

## Recovery Procedures

### After System Down

1. **Verify Fix:**
   - Test in staging environment
   - Deploy to production
   - Monitor for 10 minutes

2. **Gradual Resume:**
   - Announce 5-minute warning
   - Unpause trading
   - Monitor first transactions closely
   - Be ready to re-pause if issues

3. **Communication:**
   - Send "all clear" message
   - Thank users for patience
   - Share post-mortem link

### After Data Loss

(Not applicable for blockchain - data is immutable)

If oracle data lost:
1. Re-fetch historical prices from Chainlink
2. Verify against other sources
3. Resubmit missing NAV prices

---

## Questions to Ask During Incidents

1. **Is this actually an emergency?**
   - Are funds at risk?
   - Are users unable to access positions?
   - Is exploit active?

2. **Should we pause?**
   - Can users still lose money?
   - Do we need time to investigate?
   - Is fix ready to deploy?

3. **What's the blast radius?**
   - How many users affected?
   - How much money at risk?
   - Which features broken?

4. **What caused this?**
   - Human error?
   - Bug in code?
   - External dependency failure?

5. **How do we prevent recurrence?**
   - Better testing?
   - Monitoring alerts?
   - Code changes?

---

## Resources

**Internal:**
- Contract Source Code: `/contracts/`
- Test Suite: `/test/`
- Deployment Scripts: `/scripts/`

**External:**
- Sepolia Etherscan: https://sepolia.etherscan.io/
- Chainlink Docs: https://docs.chain.link/
- iExec Nox Docs: https://docs.iex.ec/

**Support:**
- Team Discord: [Link]
- Security Email: security@realvault.example

---

**This runbook is a living document. Update after every incident with lessons learned.**
