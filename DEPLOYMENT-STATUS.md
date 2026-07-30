# RwaPerpEngine Deployment Status - Sepolia

## Deployment Date
January 8, 2026

## Summary
✅ **Partial Success** - Core contracts deployed and configured, authorization pending

## Deployed Contracts

### Oracle Adapters
- **ChainlinkRwaOracleAdapter**: `0x4899006C5a693c5D77411e69853F6632456735A6`
- **SignedNavOracleAdapter**: `0x1b5976425671F163a8aaf22BD37f8abA5408B406`

### RwaPerpEngine
- **RwaPerpEngine**: `0x0C1FADE8e9F997bda451b11Fa3852836233Fcc1C`
- **Treasury**: `0x1420cF8Bb9D92C3fDb674ECc5A57295c59078fDA` (deployer address)

### Existing Infrastructure
- **FundVault**: `0xE97e5d50634A3CAb3361fD91858E89B0b716Afd0`

## Configuration Status

### ✅ Completed Steps

1. **Chainlink Oracle Configuration**
   - Asset: rGOLD
   - Chainlink Feed: XAU/USD on Sepolia (`0xC5981F461d74c46eB4b0CF3f4Ec79f025573B0Ea`)
   - Heartbeat: 3600 seconds (1 hour)

2. **Oracle Adapter Registration**
   - rGOLD → ChainlinkRwaOracleAdapter
   - rUSTB → SignedNavOracleAdapter
   - rCRE → SignedNavOracleAdapter

3. **Asset Parameters Configuration**
   - rGOLD: Market valuation, max staleness 3600s
   - rUSTB: NAV valuation, max staleness 86400s
   - rCRE: NAV valuation, max staleness 86400s

### ❌ Pending Steps

4. **FundVault Authorization** (BLOCKED)
   - Status: Failed - execution reverted
   - Reason: FundVault contract deployed version incompatible with current interface
   - Impact: RwaPerpEngine cannot call `debitFrom` or `creditTo` on FundVault

## Issue Analysis

### Problem
The deployed FundVault contract at `0xE97e5d50634A3CAb3361fD91858E89B0b716Afd0` appears to be from an older version that doesn't have the `setAuthorizedContract`, `initialDeployer`, or `authorizedContracts` methods. All contract calls (including view functions) revert.

### Evidence
```bash
# All these calls revert:
- fundVault.initialDeployer()
- fundVault.authorizedContracts(address)
- fundVault.setAuthorizedContract(address, bool)
```

### Root Cause
The FundVault was deployed on July 22, 2026, likely with an earlier version that didn't include the authorization mechanism for external contracts like RwaPerpEngine.

## Resolution Options

### Option 1: Redeploy FundVault (RECOMMENDED)
**Action**: Deploy a new FundVault with the current contract version that includes authorization methods.

**Steps**:
1. Deploy new FundVault contract
2. Redeploy/reconfigure dependent contracts (NAVAggregator, DisclosureManager)
3. Update RwaPerpEngine to point to new FundVault
4. Migrate any existing deposits (if applicable)

**Pros**:
- Clean deployment with latest features
- Full authorization support
- No compromises

**Cons**:
- Requires redeployment of multiple contracts
- Higher gas costs
- Need to update all references

### Option 2: Deploy Alternative Vault Wrapper
**Action**: Create a proxy/wrapper contract around the existing FundVault that can be authorized in RwaPerpEngine.

**Pros**:
- Doesn't require FundVault redeployment
- Preserves existing infrastructure

**Cons**:
- Additional complexity
- Gas overhead for proxy calls
- Requires new contract development

### Option 3: Modify RwaPerpEngine to Work Without Authorization
**Action**: Deploy modified RwaPerpEngine that doesn't require FundVault authorization (if FundVault has open access).

**Pros**:
- Quick workaround
- No additional deployments

**Cons**:
- Security risk if FundVault doesn't have proper access controls
- Not a proper fix

## Next Steps

**RECOMMENDED**: Proceed with Option 1 (Redeploy FundVault)

1. **Update FundVault deployment**:
   ```bash
   npx hardhat run scripts/deploy.js --network sepolia
   ```

2. **Update RwaPerpEngine configuration**:
   - Deploy new RwaPerpEngine pointing to new FundVault
   - Or update existing RwaPerpEngine if it has an owner function to change vault address

3. **Complete authorization**:
   ```bash
   npx hardhat run scripts/authorize-rwa-perp-engine.js --network sepolia
   ```

4. **Verify deployment**:
   ```bash
   npx hardhat run scripts/check-deployment.js --network sepolia
   ```

5. **Test oracle queries**:
   ```bash
   npx hardhat run scripts/test-oracle-queries.js --network sepolia
   ```

## Gas Costs Summary

- ChainlinkRwaOracleAdapter deployment: ~0.02 ETH
- SignedNavOracleAdapter deployment: ~0.02 ETH
- RwaPerpEngine deployment: ~0.08 ETH
- Configuration transactions (6 txs): ~0.03 ETH
- **Total spent**: ~0.15 ETH
- **Remaining balance**: 0.544 ETH

## Deployment Manifest

See `deployments/sepolia-rwa-perp-engine.json` for complete deployment details including asset IDs and oracle configuration.

## Contact
For questions or manual authorization assistance, contact the deployer at `0x1420cF8Bb9D92C3fDb674ECc5A57295c59078fDA`.
