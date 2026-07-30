const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n====================================================");
  console.log("🔄 Redeploying FundVault + RwaPerpEngine (ACL Fix)");
  console.log("   Network:", hre.network.name);
  console.log("====================================================\n");

  // Load existing deployments
  const sepoliaPath = path.join(__dirname, "../deployments/sepolia.json");
  const rwaPath = path.join(__dirname, "../deployments/sepolia-rwa-perp-engine.json");

  const sepoliaDeployment = JSON.parse(fs.readFileSync(sepoliaPath));
  const rwaDeployment = JSON.parse(fs.readFileSync(rwaPath));

  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("   Deployer:", deployer.address);
  console.log("   Balance:", hre.ethers.formatEther(balance), "ETH");

  // Addresses we'll reuse
  const mockUSDCAddress = sepoliaDeployment.contracts.MockUSDC;
  const wrappedUSDCAddress = sepoliaDeployment.contracts.WrappedUSDC;
  const disclosureManagerAddress = sepoliaDeployment.contracts.DisclosureManager;
  const navAggregatorAddress = sepoliaDeployment.contracts.NAVAggregator;
  const treasuryAddress = deployer.address;

  // Reuse existing oracle adapters (no need to redeploy)
  const chainlinkAdapterAddress = rwaDeployment.contracts.ChainlinkRwaOracleAdapter;
  const signedNavAdapterAddress = rwaDeployment.contracts.SignedNavOracleAdapter;

  console.log("\n📦 Reusing existing contracts:");
  console.log("   MockUSDC:", mockUSDCAddress);
  console.log("   WrappedUSDC:", wrappedUSDCAddress);
  console.log("   DisclosureManager:", disclosureManagerAddress);
  console.log("   NAVAggregator:", navAggregatorAddress);
  console.log("   ChainlinkAdapter:", chainlinkAdapterAddress);
  console.log("   SignedNavAdapter:", signedNavAdapterAddress);

  // ============================================
  // Step 1: Deploy new FundVault (with ACL fix)
  // ============================================
  console.log("\n[1/6] Deploying new FundVault with ACL fix...");
  const FundVault = await hre.ethers.getContractFactory("FundVault");
  const fundVault = await FundVault.deploy(mockUSDCAddress, wrappedUSDCAddress);
  await fundVault.waitForDeployment();
  const fundVaultAddress = await fundVault.getAddress();
  console.log("   ✅ FundVault deployed at:", fundVaultAddress);

  // ============================================
  // Step 2: Link satellite contracts to FundVault
  // ============================================
  console.log("\n[2/6] Linking satellite contracts to FundVault...");
  
  let tx = await fundVault.setDisclosureManager(disclosureManagerAddress);
  await tx.wait();
  console.log("   ✅ DisclosureManager linked");

  tx = await fundVault.setNavAggregator(navAggregatorAddress);
  await tx.wait();
  console.log("   ✅ NAVAggregator linked");

  // ============================================
  // Step 3: Deploy new RwaPerpEngine (needs new FundVault in constructor)
  // ============================================
  console.log("\n[3/6] Deploying new RwaPerpEngine (pointing to new FundVault)...");
  const RwaPerpEngine = await hre.ethers.getContractFactory("RwaPerpEngine");
  const rwaPerpEngine = await RwaPerpEngine.deploy(fundVaultAddress, treasuryAddress);
  await rwaPerpEngine.waitForDeployment();
  const rwaPerpEngineAddress = await rwaPerpEngine.getAddress();
  console.log("   ✅ RwaPerpEngine deployed at:", rwaPerpEngineAddress);

  // ============================================
  // Step 4: Authorize RwaPerpEngine in FundVault
  // ============================================
  console.log("\n[4/6] Authorizing RwaPerpEngine in FundVault...");
  tx = await fundVault.setAuthorizedContract(rwaPerpEngineAddress, true);
  await tx.wait();
  console.log("   ✅ RwaPerpEngine authorized");

  // Verify the authorizedContractList was populated
  const isAuthorized = await fundVault.authorizedContracts(rwaPerpEngineAddress);
  const firstAuthorized = await fundVault.authorizedContractList(0);
  console.log("   Mapping check:", isAuthorized);
  console.log("   Array check:", firstAuthorized);

  // ============================================
  // Step 5: Re-configure Oracle Adapters on new RwaPerpEngine
  // ============================================
  console.log("\n[5/6] Re-configuring Oracle Adapters on new RwaPerpEngine...");

  const ASSET_ID_RGOLD = hre.ethers.id("rGOLD");
  const ASSET_ID_RUSTB = hre.ethers.id("rUSTB");
  const ASSET_ID_RCRE = hre.ethers.id("rCRE");
  const HEARTBEAT_1_HOUR = 3600;

  // Register oracle adapters
  tx = await rwaPerpEngine.registerOracleAdapter(ASSET_ID_RGOLD, chainlinkAdapterAddress);
  await tx.wait();
  console.log("   ✅ Registered Chainlink adapter for rGOLD");

  tx = await rwaPerpEngine.registerOracleAdapter(ASSET_ID_RUSTB, signedNavAdapterAddress);
  await tx.wait();
  console.log("   ✅ Registered SignedNav adapter for rUSTB");

  tx = await rwaPerpEngine.registerOracleAdapter(ASSET_ID_RCRE, signedNavAdapterAddress);
  await tx.wait();
  console.log("   ✅ Registered SignedNav adapter for rCRE");

  // Configure asset parameters
  tx = await rwaPerpEngine.configureAsset({
    assetId: ASSET_ID_RGOLD,
    symbol: "rGOLD",
    oracleAdapter: chainlinkAdapterAddress,
    maxStaleness: HEARTBEAT_1_HOUR,
    valuationMethod: "Market",
    description: "Tokenized Gold"
  });
  await tx.wait();
  console.log("   ✅ Configured asset: rGOLD");

  tx = await rwaPerpEngine.configureAsset({
    assetId: ASSET_ID_RUSTB,
    symbol: "rUSTB",
    oracleAdapter: signedNavAdapterAddress,
    maxStaleness: 86400,
    valuationMethod: "NAV",
    description: "US Treasury Bills"
  });
  await tx.wait();
  console.log("   ✅ Configured asset: rUSTB");

  tx = await rwaPerpEngine.configureAsset({
    assetId: ASSET_ID_RCRE,
    symbol: "rCRE",
    oracleAdapter: signedNavAdapterAddress,
    maxStaleness: 604800,
    valuationMethod: "NAV",
    description: "Commercial Real Estate"
  });
  await tx.wait();
  console.log("   ✅ Configured asset: rCRE");

  // Set position limits (same as Phase 0)
  tx = await rwaPerpEngine.setPositionLimits(2, 100_000000); // 2 positions, $100 max margin
  await tx.wait();
  console.log("   ✅ Position limits set (2 positions, $100 max margin)");

  // ============================================
  // Step 6: Update deployment manifests
  // ============================================
  console.log("\n[6/6] Updating deployment manifests...");

  // Update sepolia.json
  sepoliaDeployment.contracts.FundVault = fundVaultAddress;
  sepoliaDeployment.timestamp = new Date().toISOString();
  sepoliaDeployment.redeployReason = "ACL fix - authorizedContractList for FHE handle grants";
  fs.writeFileSync(sepoliaPath, JSON.stringify(sepoliaDeployment, null, 2));
  console.log("   ✅ Updated sepolia.json");

  // Update sepolia-rwa-perp-engine.json
  rwaDeployment.contracts.RwaPerpEngine = rwaPerpEngineAddress;
  rwaDeployment.contracts.FundVault = fundVaultAddress;
  rwaDeployment.deployer = deployer.address;
  rwaDeployment.treasury = treasuryAddress;
  rwaDeployment.timestamp = new Date().toISOString();
  rwaDeployment.redeployReason = "RwaPerpEngine redeployed with new FundVault (ACL fix)";
  fs.writeFileSync(rwaPath, JSON.stringify(rwaDeployment, null, 2));
  console.log("   ✅ Updated sepolia-rwa-perp-engine.json");

  console.log("\n====================================================");
  console.log("🎉 Full Redeployment Complete!");
  console.log("====================================================");
  console.log("\n📦 New Addresses:");
  console.log("   FundVault:", fundVaultAddress);
  console.log("   RwaPerpEngine:", rwaPerpEngineAddress);
  console.log("\n📋 Next Steps:");
  console.log("   1. Fund treasury: npm run nox:fund-treasury");
  console.log("   2. Test full flow: npm run nox:test-flow");
  console.log("   3. Verify contracts on Etherscan\n");
}

main().catch((error) => {
  console.error("❌ Redeployment failed:", error);
  process.exitCode = 1;
});
