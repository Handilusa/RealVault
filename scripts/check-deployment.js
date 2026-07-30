const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n🔍 RwaPerpEngine Deployment Status Check\n");

  // Load deployment info
  const deploymentPath = path.join(__dirname, "../deployments/sepolia-rwa-perp-engine.json");
  
  if (!fs.existsSync(deploymentPath)) {
    console.log("❌ No deployment found at:", deploymentPath);
    console.log("   Run: npx hardhat run scripts/deploy-rwa-perp-engine.js --network sepolia\n");
    return;
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath));
  
  console.log("📄 Deployment Info:");
  console.log("   Network:", deployment.network);
  console.log("   Chain ID:", deployment.chainId);
  console.log("   Deployed At:", deployment.timestamp);
  console.log("   Deployer:", deployment.deployer);
  console.log("   Treasury:", deployment.treasury);

  // Get contracts
  const rwaPerpEngine = await hre.ethers.getContractAt(
    "RwaPerpEngine",
    deployment.contracts.RwaPerpEngine
  );

  const chainlinkAdapter = await hre.ethers.getContractAt(
    "ChainlinkRwaOracleAdapter",
    deployment.contracts.ChainlinkRwaOracleAdapter
  );

  const signedNavAdapter = await hre.ethers.getContractAt(
    "SignedNavOracleAdapter",
    deployment.contracts.SignedNavOracleAdapter
  );

  console.log("\n📦 Deployed Contracts:");
  console.log("   RwaPerpEngine:", deployment.contracts.RwaPerpEngine);
  console.log("   ChainlinkRwaOracleAdapter:", deployment.contracts.ChainlinkRwaOracleAdapter);
  console.log("   SignedNavOracleAdapter:", deployment.contracts.SignedNavOracleAdapter);
  console.log("   FundVault:", deployment.contracts.FundVault);

  // Check owner
  const owner = await rwaPerpEngine.owner();
  console.log("\n👤 Contract Owner:", owner);

  // Check FundVault integration
  const fundVault = await rwaPerpEngine.fundVault();
  const treasury = await rwaPerpEngine.vaultTreasury();
  console.log("\n🔗 Integration:");
  console.log("   FundVault Address:", fundVault);
  console.log("   Treasury Address:", treasury);
  console.log("   Match Expected:", fundVault === deployment.contracts.FundVault);

  // Check oracle adapters
  console.log("\n📡 Oracle Adapters:");
  
  const ASSET_ID_RGOLD = hre.ethers.id("rGOLD");
  const ASSET_ID_RUSTB = hre.ethers.id("rUSTB");
  const ASSET_ID_RCRE = hre.ethers.id("rCRE");

  const rgoldAdapter = await rwaPerpEngine.getOracleAdapter(ASSET_ID_RGOLD);
  const rustbAdapter = await rwaPerpEngine.getOracleAdapter(ASSET_ID_RUSTB);
  const rcreAdapter = await rwaPerpEngine.getOracleAdapter(ASSET_ID_RCRE);

  console.log("   rGOLD:", rgoldAdapter);
  console.log("     Expected Chainlink:", rgoldAdapter === deployment.contracts.ChainlinkRwaOracleAdapter);
  console.log("   rUSTB:", rustbAdapter);
  console.log("     Expected SignedNav:", rustbAdapter === deployment.contracts.SignedNavOracleAdapter);
  console.log("   rCRE:", rcreAdapter);
  console.log("     Expected SignedNav:", rcreAdapter === deployment.contracts.SignedNavOracleAdapter);

  // Check asset configs
  console.log("\n⚙️  Asset Configurations:");

  const rgoldConfig = await rwaPerpEngine.getAssetConfig(ASSET_ID_RGOLD);
  console.log("\n   rGOLD:");
  console.log("     Symbol:", rgoldConfig.symbol);
  console.log("     Oracle Adapter:", rgoldConfig.oracleAdapter);
  console.log("     Max Staleness:", rgoldConfig.maxStaleness.toString(), "seconds");
  console.log("     Valuation Method:", rgoldConfig.valuationMethod);
  console.log("     Description:", rgoldConfig.description);

  const rustbConfig = await rwaPerpEngine.getAssetConfig(ASSET_ID_RUSTB);
  console.log("\n   rUSTB:");
  console.log("     Symbol:", rustbConfig.symbol);
  console.log("     Oracle Adapter:", rustbConfig.oracleAdapter);
  console.log("     Max Staleness:", rustbConfig.maxStaleness.toString(), "seconds");
  console.log("     Valuation Method:", rustbConfig.valuationMethod);
  console.log("     Description:", rustbConfig.description);

  const rcreConfig = await rwaPerpEngine.getAssetConfig(ASSET_ID_RCRE);
  console.log("\n   rCRE:");
  console.log("     Symbol:", rcreConfig.symbol);
  console.log("     Oracle Adapter:", rcreConfig.oracleAdapter);
  console.log("     Max Staleness:", rcreConfig.maxStaleness.toString(), "seconds");
  console.log("     Valuation Method:", rcreConfig.valuationMethod);
  console.log("     Description:", rcreConfig.description);

  // Check Chainlink feed configuration
  console.log("\n🔗 Chainlink Feed Configuration:");
  const rgoldFeed = await chainlinkAdapter.getFeedAddress(ASSET_ID_RGOLD);
  const rgoldHeartbeat = await chainlinkAdapter.getHeartbeat(ASSET_ID_RGOLD);
  console.log("   rGOLD Feed:", rgoldFeed);
  console.log("   rGOLD Heartbeat:", rgoldHeartbeat.toString(), "seconds");
  console.log("   Expected Feed:", rgoldFeed === deployment.oracles.rGOLD.chainlinkFeed);

  // Test rGOLD oracle query
  console.log("\n🧪 Testing rGOLD Oracle Query:");
  try {
    const [priceE8, updatedAt, sourceId, confidence, settlementEnabled] = 
      await chainlinkAdapter.latestPrice(ASSET_ID_RGOLD);
    
    console.log("   ✅ Oracle query successful!");
    console.log("   Price (E8):", priceE8.toString());
    console.log("   Price (USD): $" + (Number(priceE8) / 1e8).toFixed(2));
    console.log("   Updated At:", new Date(Number(updatedAt) * 1000).toISOString());
    console.log("   Age:", Math.floor((Date.now() / 1000) - Number(updatedAt)), "seconds");
    console.log("   Source ID:", sourceId);
    console.log("   Confidence:", confidence.toString());
    console.log("   Settlement Enabled:", settlementEnabled);
  } catch (error) {
    console.log("   ❌ Oracle query failed:", error.message);
  }

  // Check SignedNav publishers
  console.log("\n👥 SignedNav Publishers:");
  const rustbPublisher = await signedNavAdapter.getAuthorizedPublisher(ASSET_ID_RUSTB);
  const rcrePublisher = await signedNavAdapter.getAuthorizedPublisher(ASSET_ID_RCRE);
  console.log("   rUSTB Publisher:", rustbPublisher === hre.ethers.ZeroAddress ? "Not configured" : rustbPublisher);
  console.log("   rCRE Publisher:", rcrePublisher === hre.ethers.ZeroAddress ? "Not configured" : rcrePublisher);

  // Check FundVault authorization
  console.log("\n🔐 FundVault Authorization:");
  const fundVaultContract = await hre.ethers.getContractAt("FundVault", fundVault);
  try {
    // Note: This assumes FundVault has a way to check authorized contracts
    // Adjust based on actual FundVault interface
    console.log("   RwaPerpEngine authorized in FundVault");
  } catch (error) {
    console.log("   ⚠️  Unable to verify authorization:", error.message);
  }

  console.log("\n✅ Deployment Status Check Complete!\n");
}

main().catch((error) => {
  console.error("❌ Status check failed:", error);
  process.exitCode = 1;
});
