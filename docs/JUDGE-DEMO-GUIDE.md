# Judge Demo Guide

**Purpose:** Frontend banner copy and recommended demonstration flow for hackathon judges.

**Project:** RealVault - Confidential RWA Perpetuals on iExec Nox  
**Network:** Sepolia Testnet  
**Demo URL:** [Your frontend URL]

---

## 🎯 Banner Copy (For UI)

### Main Banner (Always Visible)

```
🎯 Hackathon Demo - Confidential RWA Perpetuals on iExec Nox

This is an experimental testnet deployment showcasing:
• Fully Homomorphic Encryption (FHE) for private balances
• Synthetic perpetuals on Real-World Assets (Gold, T-Bills, Real Estate)
• Zero-knowledge position management

⚠️ Testnet Only | Not Financial Advice | Max 2 Positions | $100 Limit per Position

[Learn More] [Risk Disclosure ▼]
```

**Design Notes:**
- Fixed banner at top
- Yellow/orange background (#FFF3CD)
- Dark text (#856404)
- Collapsible risk disclosure below

---

### Risk Disclosure (Collapsible Section)

```
📋 Important Information

✅ What This Demo Does:
• Deployed on Sepolia testnet (not real money)
• Uses iExec Nox FHE for balance privacy (euint256)
• Position limits: 2 positions max, $100 per position
• Oracle-based settlement (Chainlink + signed NAV)
• Circuit breaker enabled (trading can be paused)
• Loss capped at margin deposited (max loss = your margin)

❌ What This Demo Does NOT Do:
• Not audited for production use
• Not a regulated financial product
• Not legal or financial advice
• Experimental technology - use at your own risk
• Treasury-backed (protocol is counterparty, not peer-to-peer)

🔒 Privacy Features:
• All balances encrypted as euint256 (FHE)
• Only you + authorized contracts can read your balance
• Position margins and PnL are private
• On-chain observers see encrypted handles, not values

⚡ Technical Highlights:
• Smart contracts: Solidity + iExec Nox SDK
• Encryption: Fully Homomorphic Encryption (FHE)
• Oracles: Chainlink (liquid assets) + Signed NAV (illiquid RWAs)
• Access Control: ACL-based permission system
• Risk Management: Position limits, loss capping, circuit breaker

[Close]
```

**Design Notes:**
- White background
- Border: 1px solid #dee2e6
- Padding: 20px
- Font size: 14px
- Sections use emoji for visual separation

---

### Asset Selection Tooltips

When user hovers over asset:

**rGOLD (Tokenized Gold):**
```
💰 Tokenized Gold (rGOLD)
Oracle: Chainlink (real-time)
Liquidity: High
Use Case: Track gold prices with leverage
Current Price: [Live from Chainlink]
```

**rTBILL (Tokenized Treasury Bills):**
```
🏦 Tokenized T-Bills (rTBILL)
Oracle: Signed NAV (daily updates)
Liquidity: Low
Use Case: Synthetic exposure to US treasury yields
Current Price: [From NAV publisher]
```

**rREAL (Tokenized Real Estate):**
```
🏘️ Tokenized Real Estate (rREAL)
Oracle: Signed NAV (weekly updates)
Liquidity: Very Low
Use Case: Gain/lose on real estate index movements
Current Price: [From NAV publisher]
Note: Price updates weekly, suitable for long-term positions
```

---

### Position Warnings

**When opening position near limits:**
```
⚠️ Position Limit Warning

You have 1/2 positions open. This will be your maximum.
You won't be able to open more positions until you close existing ones.

[Cancel] [Open Anyway]
```

**When margin near max:**
```
⚠️ High Margin Amount

You're depositing $95 (limit: $100). This leaves only $5 for another position.
Consider a lower margin to diversify across multiple positions.

[Cancel] [Continue]
```

**When leverage is high:**
```
⚠️ High Leverage (10x)

Your $50 margin controls $500 of exposure.
A 10% price move against you = total loss of margin.

Max Loss: $50 (100% of margin)

[Reduce Leverage] [I Understand]
```

---

## 🎬 Recommended Judge Flow

### Pre-Demo Setup (Do This Before Judges Arrive)

1. **Verify Contracts Deployed:**
   ```bash
   cast call 0xEa4091B187f7b0543910Ee153f2c0E4cb07084CA "paused()(bool)" --rpc-url $SEPOLIA_RPC_URL
   # Should return: false (trading enabled)
   ```

2. **Fund Demo Wallets:**
   - Create 2-3 demo wallets with private keys
   - Fund each with 0.1 ETH for gas
   - Mint 500 USDC to each

3. **Test Full Flow:**
   - Deposit → Open Position → Monitor PnL → Close Position → Withdraw
   - Verify encrypted balances display correctly
   - Check position limits enforced

4. **Prepare Backup:**
   - Have Hardhat console ready in case frontend breaks
   - Have contract addresses handy for Etherscan verification

---

### Demo Flow (8-10 minutes)

#### **Step 1: Introduction (1 minute)**

**What to Say:**
> "This is RealVault - a protocol for trading synthetic perpetuals on Real-World Assets using Fully Homomorphic Encryption. Unlike traditional DeFi, all balances are encrypted on-chain. You can't see my balance, the blockchain can't see it - only I can decrypt it, and only authorized contracts can compute on it."

**Show on Screen:**
- Landing page with banner
- Highlight "FHE", "RWA", "Perpetuals"

---

#### **Step 2: Connect Wallet (30 seconds)**

**Actions:**
1. Click "Connect Wallet"
2. Select MetaMask (or demo wallet)
3. Switch to Sepolia network

**What to Say:**
> "I'm connecting with a fresh wallet on Sepolia testnet. This could work on mainnet with real RWAs like tokenized real estate or private credit."

**Show on Screen:**
- Wallet connected (address displayed)
- Balance: 0 USDC (encrypted)

---

#### **Step 3: Get Demo USDC (30 seconds)**

**Actions:**
1. Click "Get Demo USDC" button
2. Approve transaction (mints 500 USDC)
3. Show USDC balance (500 USDC)

**What to Say:**
> "In production, this would be real USDC or a stablecoin. For demo purposes, I'm minting testnet tokens."

**Show on Screen:**
- Transaction confirmed on Etherscan (optional)
- Wallet now has 500 USDC

---

#### **Step 4: Deposit into FundVault (1 minute)**

**Actions:**
1. Click "Deposit"
2. Enter amount: 200 USDC
3. Approve USDC spending
4. Confirm deposit transaction
5. Show encrypted balance

**What to Say:**
> "When I deposit, my balance is encrypted using Fully Homomorphic Encryption. What gets stored on-chain is a euint256 handle - essentially a reference to encrypted data. Even if you look at the contract storage on Etherscan, you'll see a handle like 0x123abc..., not the actual balance."

**Show on Screen:**
- Deposit transaction confirmed
- Balance display: `euint256(0x1234...abcd)` ← encrypted handle
- Raw balance not visible

**Bonus (If Time):**
- Open Etherscan for FundVault contract
- Show `balances` mapping
- Point out: "See? Just encrypted handles, not actual values."

---

#### **Step 5: Open Position (2 minutes)**

**Actions:**
1. Click "Open Position"
2. Select asset: **rGOLD** (tokenized gold)
3. Choose direction: **Long** (bet price goes up)
4. Set margin: **$50**
5. Set leverage: **5x**
6. Review position details:
   - Entry price: [Current gold price from Chainlink]
   - Exposure: $250 (5x leverage)
   - Max loss: $50 (margin)
   - Liquidation: N/A (loss capped by design)
7. Click "Open Position"
8. Approve transaction

**What to Say:**
> "I'm going long on tokenized gold with 5x leverage. I'm putting up $50 margin to control $250 of exposure. If gold goes up 10%, I make $25 profit (50% ROI). If gold goes down 20%, I lose my full $50 margin - but never more than that. The loss is capped."

**Technical Deep Dive (If Judge Asks):**
> "Behind the scenes, the contract:
> 1. Debits $50 from my encrypted balance in FundVault
> 2. Creates a Position struct with encrypted margin (euint256)
> 3. Grants ACL permissions so I can read my position data
> 4. Records entry price from Chainlink oracle
> 5. Treasury acts as counterparty (if I profit, treasury pays)"

**Show on Screen:**
- Position opened successfully
- Position card displays:
  - Asset: rGOLD 🏆
  - Direction: Long ↑
  - Margin: $50 (encrypted)
  - Leverage: 5x
  - Entry Price: $2,345.67
  - Current Price: $2,345.67
  - PnL: $0.00 (just opened)
  - Status: Open

**Bonus (If Time):**
- Show position count: 1/2 positions used
- Show remaining balance: ~$150 (encrypted)

---

#### **Step 6: Monitor Position (1 minute)**

**What to Say:**
> "Now we wait for price to change. In a real demo, gold price would fluctuate. For today, let me show what happens when the price moves."

**If Price Changes Naturally:**
- Show PnL update in real-time
- Explain: "Oracle updates every block, so my PnL adjusts immediately"

**If Price Doesn't Change (Use This Hack):**
> "Normally the Chainlink oracle updates every few minutes. To simulate, let me show the math: if gold goes from $2,345 to $2,380 (1.5% up), my PnL is: $250 exposure × 1.5% = $3.75 profit."

**Show on Screen:**
- Position card with updated PnL (if price moved)
- Highlight that PnL is also encrypted (computed via FHE)

**Bonus (If Judge Interested in Privacy):**
> "Notice my PnL is encrypted too. If another user looks at my position on-chain, they see encrypted values. Only I can decrypt because the ACL grants me permission. This is huge for institutions who don't want to reveal their positions."

---

#### **Step 7: Close Position (1 minute)**

**Actions:**
1. Click "Close Position"
2. Review settlement:
   - Entry: $2,345.67
   - Exit: $2,380.12 (example)
   - PnL: +$3.75
   - Final balance: $53.75
3. Confirm transaction
4. Show position closed

**What to Say:**
> "When I close, the contract settles PnL using the current oracle price. My profit of $3.75 is paid from the treasury (protocol's capital). My encrypted balance increases by $3.75, but again, this is computed homomorphically - the contract never decrypts my balance."

**Show on Screen:**
- Position closed
- Balance updated: ~$153.75 (encrypted)
- Position removed from UI

**Bonus (If Time):**
- Show position count: 0/2 positions used
- Show that user can now open 2 new positions

---

#### **Step 8: Verify Privacy (1 minute)**

**Actions:**
1. Open Etherscan: https://sepolia.etherscan.io/
2. Search for FundVault contract: `0xAA768DACFd3a649d5776e1E4a1C54a35F970F573`
3. Go to "Contract" → "Read Contract"
4. Call `balances(address)` with your wallet address
5. Show output: euint256 handle (not actual value)

**What to Say:**
> "This is the key differentiator. On any other blockchain, if you look at a token balance, you see the exact amount. With FHE, you see only an encrypted reference. Privacy is built-in at the protocol level."

**Show on Screen:**
- Etherscan contract read
- Output: `0x1234abcd...` (encrypted handle)
- Not: `153750000` (plaintext balance)

**Bonus (Advanced Judges):**
> "To decrypt this, you need the FHE key managed by iExec's Trusted Execution Environment. The key never leaves the TEE, and only addresses with ACL permissions can request decryption."

---

#### **Step 9: Withdraw (Optional, 1 minute)**

**Actions:**
1. Click "Withdraw"
2. Enter amount: 100 USDC
3. Confirm transaction
4. Show USDC back in wallet

**What to Say:**
> "Withdrawals decrypt the balance, verify I have enough funds, then transfer USDC back to my wallet. The contract performs FHE subtraction on my encrypted balance."

**Show on Screen:**
- Withdrawal transaction confirmed
- USDC balance in wallet: 400 USDC (300 existing + 100 withdrawn)
- FundVault balance now: ~$53.75

---

### After Demo: Q&A Prep

**Expected Judge Questions:**

#### **Q: How is this different from dYdX or Synthetix?**
A: 
> "Three key differences:
> 1. **Privacy:** All balances are FHE-encrypted. Traditional perps expose all positions on-chain.
> 2. **Asset Class:** We target illiquid RWAs (real estate, private credit) that can't use orderbooks. dYdX/Synthetix focus on liquid crypto.
> 3. **Counterparty:** Treasury-backed (protocol is counterparty), not peer-to-peer. This works for RWAs where there aren't many traders."

#### **Q: What's the benefit of FHE over zero-knowledge proofs?**
A:
> "ZK proofs hide computation inputs/outputs but require explicit proof generation. FHE allows computation directly on encrypted data without decryption. For a perp exchange, this means balances stay encrypted through deposits, trades, and withdrawals - no decrypt step needed. It's more composable."

#### **Q: How do you prevent oracle manipulation?**
A:
> "Two-tiered approach:
> 1. **Liquid RWAs (gold, T-bills):** Use Chainlink - decentralized, battle-tested.
> 2. **Illiquid RWAs (real estate, private credit):** Use signed NAV from trusted publishers (fund administrators, auditors). We verify signatures on-chain.
> 
> For production, we'd add circuit breakers: if price moves >10% in one block, pause trading."

#### **Q: What happens if treasury runs out of money?**
A:
> "Treasury insolvency is the main risk. Mitigations:
> 1. **Position limits:** Cap exposure (currently $100 max margin per position)
> 2. **Monitoring:** Alert when treasury < 10% of open interest
> 3. **Treasury funding:** Owner can add funds anytime
> 4. **Circuit breaker:** Pause new positions if treasury low
> 
> In production, we'd use risk models to ensure treasury is always 2x open interest."

#### **Q: Can users see each other's positions?**
A:
> "No. Positions and balances are encrypted (euint256). The blockchain sees:
> - Your address: `0xABC...`
> - Your balance: `euint256(0x123...)`
> - Your position margin: `euint256(0x456...)`
> 
> To decrypt, you need ACL permission. Only the user and authorized contracts (RwaPerpEngine) have this. Even I, as the contract owner, can't decrypt your balance without the disclosure manager granting permission."

#### **Q: Is this production-ready?**
A:
> "No. This is a hackathon demo on testnet. For production, we need:
> 1. **Security audit:** Smart contract + FHE implementation
> 2. **Regulatory compliance:** Depends on jurisdiction and asset class
> 3. **Oracle redundancy:** Multiple price feeds with consensus
> 4. **Governance:** Multisig ownership, parameter timelocks
> 5. **Insurance:** Slashing for oracle malfeasance, treasury insurance
> 6. **Mainnet deployment:** Currently Sepolia testnet only
> 
> But the core tech works. This proves FHE + RWA perps is feasible."

#### **Q: What's your business model?**
A:
> "We charge trading fees (e.g., 0.1% on position size). Revenue goes to:
> 1. **Treasury replenishment:** Cover losing traders
> 2. **Oracle costs:** Pay for price feeds
> 3. **Protocol development:** Fund team
> 
> Target customers: institutions trading illiquid RWAs who need privacy. Example: hedge fund wants to short tokenized real estate without revealing position to competitors."

#### **Q: Why iExec Nox? Why not Zama or other FHE solutions?**
A:
> "iExec Nox offers:
> 1. **EVM compatibility:** Write Solidity, deploy like normal
> 2. **Trusted Execution Environment:** Keys managed in TEE (secure hardware)
> 3. **Existing infrastructure:** Already deployed on testnet
> 
> Other FHE solutions like Zama require custom toolchains. Nox lets us build with familiar tools."

---

## 🎨 UI/UX Recommendations

### Color Scheme

**Position Types:**
- Long positions: Green (#10B981)
- Short positions: Red (#EF4444)

**Status Indicators:**
- Profit: Green background (#D1FAE5)
- Loss: Red background (#FEE2E2)
- Neutral: Gray background (#F3F4F6)

**Encryption Indicators:**
- Encrypted values: Lock icon 🔒
- Decrypted values: Unlock icon 🔓 (rare)

### Layout

**Dashboard Structure:**
```
┌─────────────────────────────────────────────┐
│ Banner (FHE Demo Warning)                   │
├─────────────────────────────────────────────┤
│ Balance: 🔒 euint256(0x123...) [Deposit]   │
├─────────────────────────────────────────────┤
│ [Open New Position] [Withdraw]              │
├─────────────────────────────────────────────┤
│ My Positions (1/2 used)                     │
│ ┌───────────────────────────────────────┐  │
│ │ rGOLD - Long ↑                        │  │
│ │ Margin: $50  Leverage: 5x             │  │
│ │ Entry: $2,345.67  Current: $2,380.12  │  │
│ │ PnL: +$3.75 (7.5%) 🔒                 │  │
│ │ [Close Position]                      │  │
│ └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

**Position Card Details:**
- Asset name + icon (🏆 gold, 🏦 T-bills, 🏘️ real estate)
- Direction with arrow (↑ Long, ↓ Short)
- Margin and leverage clearly visible
- Entry vs current price (color-coded)
- PnL with percentage (green/red)
- Lock icon 🔒 next to encrypted values
- Close button (prominent, red)

### Animations

**When Opening Position:**
1. Loading spinner: "Encrypting margin..."
2. Success: "Position opened! PnL updates every block."
3. Confetti (optional, for hackathon vibe)

**When Closing Position:**
1. Loading spinner: "Settling position..."
2. Success: "Position closed! PnL: [amount]"
3. Balance updates with animation

### Mobile Responsiveness

- Banner collapses to icon (⚠️)
- Position cards stack vertically
- All buttons full-width on mobile
- Charts hide on small screens (optional feature)

---

## 📊 Advanced Features (If You Built Them)

### Feature 1: Position History

**Show:**
- List of closed positions
- Entry/exit prices
- PnL for each
- Timestamp

**Judge Talking Point:**
> "All position history is on-chain but encrypted. Users can prove their trading performance without revealing specific positions."

---

### Feature 2: Real-Time PnL Chart

**Show:**
- Line chart of PnL over time
- X-axis: Time
- Y-axis: PnL ($)
- Updates every block

**Judge Talking Point:**
> "This chart shows my position value in real-time as oracle prices update. The computation happens on encrypted data - the contract never decrypts to calculate PnL."

---

### Feature 3: Multiple Assets

**Show:**
- Dropdown with rGOLD, rTBILL, rREAL
- Different oracle types (Chainlink vs Signed NAV)
- Price update frequencies

**Judge Talking Point:**
> "Each asset uses a different oracle. Gold uses Chainlink (high-frequency). Real estate uses signed NAV (low-frequency). The system is flexible."

---

### Feature 4: Liquidation Protection

**Show:**
- Position with max leverage
- Price moves against user
- Loss caps at margin (no liquidation)

**Judge Talking Point:**
> "Unlike traditional perps, we don't liquidate. Loss is capped at your margin. This uses FHE's `select()` function: `loss = select(calculatedLoss > margin, margin, calculatedLoss)`. This prevents users from losing more than they deposited."

---

## 🚀 Deployment Checklist (Before Demo)

### Pre-Demo (1 hour before)

- [ ] Verify all contracts deployed on Sepolia
- [ ] Test full user flow (deposit → trade → withdraw)
- [ ] Check oracle prices are updating
- [ ] Verify treasury has funds ($1000+ USDC)
- [ ] Test position limits enforced (2 max, $100 max margin)
- [ ] Verify FHE encryption working (check Etherscan for euint256 handles)
- [ ] Test circuit breaker (pause/unpause)
- [ ] Prepare 2-3 demo wallets with funded USDC
- [ ] Check frontend loads correctly
- [ ] Test on judge's device (if possible)

### During Demo

- [ ] Have backup plan if frontend breaks (Hardhat console ready)
- [ ] Keep Etherscan tabs open for verification
- [ ] Monitor contract state (check if paused accidentally)
- [ ] Take notes on judge feedback
- [ ] Record demo (video) if allowed

### After Demo

- [ ] Ask judges for questions/feedback
- [ ] Collect business cards or contacts
- [ ] Note any feature requests
- [ ] Document any bugs found during demo

---

## 🎯 Judging Criteria Alignment

Most hackathons judge on:

### 1. Innovation (25%)
**Our Pitch:**
> "First FHE-based perpetuals exchange for Real-World Assets. Combines three cutting-edge technologies: FHE, RWAs, and DeFi derivatives."

### 2. Technical Complexity (25%)
**Our Pitch:**
> "Implemented Fully Homomorphic Encryption with iExec Nox SDK. All balance operations (add, subtract, compare) happen on encrypted data without decryption. Custom oracle adapter system supports both Chainlink and signed NAV feeds."

### 3. User Experience (20%)
**Our Pitch:**
> "Intuitive UI hides complexity of FHE. Users don't need to understand euint256 or ACL permissions - they just see 'Balance: Private 🔒'. Position management is simple: pick asset, pick direction, set leverage."

### 4. Business Viability (15%)
**Our Pitch:**
> "Target market: institutional traders of illiquid RWAs. TAM: $10T+ in real estate, private credit, and tokenized securities. Revenue: trading fees + bid/ask spread on illiquid assets."

### 5. Completeness (15%)
**Our Pitch:**
> "Fully functional demo: smart contracts deployed, frontend working, oracle integration live, treasury operations functional. Not just a whitepaper - you can trade right now."

---

## 📝 One-Pager (Leave Behind)

If judges want a summary:

```
═══════════════════════════════════════════════
         REALVAULT - CONFIDENTIAL RWA PERPS
═══════════════════════════════════════════════

🎯 PROBLEM
Institutions want to trade Real-World Assets (RWAs) 
with leverage but need privacy. Current DeFi exposes
all positions on-chain.

💡 SOLUTION
FHE-based perpetuals exchange for illiquid RWAs.
All balances encrypted (euint256). Privacy-preserving
leverage on tokenized real estate, private credit, etc.

🔧 TECHNOLOGY
• iExec Nox (Fully Homomorphic Encryption)
• Chainlink + Signed NAV (Oracle flexibility)
• Solidity smart contracts (EVM-compatible)
• Treasury-backed settlement (protocol counterparty)

✨ KEY FEATURES
✓ Private balances (FHE-encrypted on-chain)
✓ Loss capping (never lose more than margin)
✓ Position limits (2 positions, $100 max margin)
✓ Circuit breaker (pause trading instantly)
✓ Multi-oracle support (liquid + illiquid assets)

📊 DEMO ASSETS
• rGOLD - Tokenized Gold (Chainlink oracle)
• rTBILL - Tokenized T-Bills (Signed NAV)
• rREAL - Tokenized Real Estate (Signed NAV)

🏆 WHY WE'LL WIN
1. Novel use of FHE (first for perps)
2. Targets underserved market (illiquid RWAs)
3. Production-grade implementation (not vaporware)
4. Real demand from institutions (privacy + leverage)

🔗 LINKS
• Demo: [Your URL]
• Contracts: https://sepolia.etherscan.io/
• Docs: [GitHub/Gitbook]
• Team: [LinkedIn/Twitter]

═══════════════════════════════════════════════
          Built for [Hackathon Name] 2025
═══════════════════════════════════════════════
```

---

## 🤝 Follow-Up Actions

After judges see the demo:

### Immediate (Within Demo)
1. Answer all questions honestly
2. Acknowledge limitations (testnet only, not audited)
3. Show genuine enthusiasm for tech
4. Thank judges for time

### Post-Demo (Same Day)
1. Send follow-up email with:
   - Demo link
   - Contract addresses
   - GitHub repo
   - One-pager PDF
2. Post demo video on Twitter (tag hackathon)
3. Share in hackathon Discord/Telegram

### Long-Term (After Hackathon)
1. Incorporate judge feedback
2. Add requested features
3. Conduct security audit (if moving to production)
4. Build community (Discord/Twitter)
5. Seek funding (if applicable)

---

**Good luck with your demo! 🚀**

**Remember:**
- Be confident but humble
- Show, don't just tell
- Handle bugs gracefully ("That's a known issue we're working on")
- Focus on what works, not what's missing
- Make it fun - judges see 50+ projects, stand out!

---

**Questions?** Refer to other docs:
- Technical details: `ACCESS-CONTROL-AUDIT.md`
- Security setup: `MULTISIG-SETUP.md`
- Incident response: `EMERGENCY-RUNBOOK.md`
