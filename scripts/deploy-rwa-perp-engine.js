const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n====================================================");
  console.log("🚀 RwaPerpEngine - Deployment Script");
  console.log("   Network:", hre.network.name);
  console.log("====================================================\n");

  // Load existing deployments
  const sepoliaDeployments = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../deployments/sepolia.json"))
  );
  
  const fundVaultAddress = sepoliaDeployments.contracts.FundVault;
  console.log("📦 Using existing FundVault:", fundVaultAddress);

  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("   Deployer Address:", deployer.address);
  console.log("   Deployer Balance:", hre.ethers.formatEther(balance), "ETH\n");

  // Treasury address (can be deployer or multisig)
  const treasuryAddress = deployer.address;

  // 1. Deploy ChainlinkRwaOracleAdapter
  console.log("[1/4] Deploying ChainlinkRwaOracleAdapter...");
  const ChainlinkAdapter = await hre.ethers.getContractFactory("ChainlinkRwaOracleAdapter");
  const chainlinkAdapter = await ChainlinkAdapter.deploy(deployer.address);
  await chainlinkAdapter.waitForDeployment();
  const chainlinkAdapterAddress = await chainlinkAdapter.getAddress();
  console.log("   ✅ ChainlinkRwaOracleAdapter:", chainlinkAdapterAddress);

  // 2. Deploy SignedNavOracleAdapter
  console.log("\n[2/4] Deploying SignedNavOracleAdapter...");
  const SignedNavAdapter = await hre.ethers.getContractFactory("SignedNavOracleAdapter");
  const signedNavAdapter = await SignedNavAdapter.deploy(deployer.address);
  await signedNavAdapter.waitForDeployment();
  const signedNavAdapterAddress = await signedNavAdapter.getAddress();
  console.log("   ✅ SignedNavOracleAdapter:", signedNavAdapterAddress);

  // 3. Deploy RwaPerpEngine
  console.log("\n[3/4] Deploying RwaPerpEngine...");
  const RwaPerpEngine = await hre.ethers.getContractFactory("RwaPerpEngine");
  const rwaPerpEngine = await RwaPerpEngine.deploy(
    fundVaultAddress,
    treasuryAddress
  );
  await rwaPerpEngine.waitForDeployment();
  const rwaPerpEngineAddress = await rwaPerpEngine.getAddress();
  console.log("   ✅ RwaPerpEngine:", rwaPerpEngineAddress);

  // 4. Configure Oracle Adapters
  console.log("\n[4/4] Configuring Oracle Adapters...");

  // Chainlink XAU/USD feed on Sepolia
  const SEPOLIA_XAU_USD_FEED = "0xC5981F461d74c46eB4b0CF3f4Ec79f025573B0Ea";
  const ASSET_ID_RGOLD = hre.ethers.id("rGOLD");
  const HEARTBEAT_1_HOUR = 3600;

  console.log("   📡 Configuring rGOLD -> Chainlink XAU/USD feed...");
  const txConfigFeed = await chainlinkAdapter.configureFeed(
    ASSET_ID_RGOLD,
    SEPOLIA_XAU_USD_FEED,
    HEARTBEAT_1_HOUR
  );
  await txConfigFeed.wait();
  console.log("   ✅ Chainlink feed configured for rGOLD");

  // Register oracle adapters in RwaPerpEngine
  console.log("\n🔗 Registering Oracle Adapters in RwaPerpEngine...");
  
  const txRegisterChainlink = await rwaPerpEngine.registerOracleAdapter(
    ASSET_ID_RGOLD,
    chainlinkAdapterAddress
  );
  await txRegisterChainlink.wait();
  console.log("   ✅ Registered Chainlink adapter for rGOLD");

  const ASSET_ID_RUSTB = hre.ethers.id("rUSTB");
  const txRegisterSignedNav = await rwaPerpEngine.registerOracleAdapter(
    ASSET_ID_RUSTB,
    signedNavAdapterAddress
  );
  await txRegisterSignedNav.wait();
  console.log("   ✅ Registered SignedNav adapter for rUSTB");

  const ASSET_ID_RCRE = hre.ethers.id("rCRE");
  const txRegisterCRE = await rwaPerpEngine.registerOracleAdapter(
    ASSET_ID_RCRE,
    signedNavAdapterAddress
  );
  await txRegisterCRE.wait();
  console.log("   ✅ Registered SignedNav adapter for rCRE");

  // Configure asset parameters
  console.log("\n⚙️  Configuring Asset Parameters...");
  
  const txConfigRGOLD = await rwaPerpEngine.configureAsset({
    assetId: ASSET_ID_RGOLD,
    symbol: "rGOLD",
    oracleAdapter: chainlinkAdapterAddress,
    maxStaleness: HEARTBEAT_1_HOUR,
    valuationMethod: "Market",
    description: "Tokenized Gold"
  });
  await txConfigRGOLD.wait();
  console.log("   ✅ Configured asset: rGOLD");

  const txConfigRUSTB = await rwaPerpEngine.configureAsset({
    assetId: ASSET_ID_RUSTB,
    symbol: "rUSTB",
    oracleAdapter: signedNavAdapterAddress,
    maxStaleness: 86400, // 24 hours
    valuationMethod: "NAV",
    description: "US Treasury Bills"
  });
  await txConfigRUSTB.wait();
  console.log("   ✅ Configured asset: rUSTB");

  const txConfigRCRE = await rwaPerpEngine.configureAsset({
    assetId: ASSET_ID_RCRE,
    symbol: "rCRE",
    oracleAdapter: signedNavAdapterAddress,
    maxStaleness: 604800, // 7 days (weekly RE appraisals)
    valuationMethod: "NAV",
    description: "Commercial Real Estate"
  });
  await txConfigRCRE.wait();
  console.log("   ✅ Configured asset: rCRE");

  // Authorize RwaPerpEngine in FundVault
  console.log("\n🔐 Authorizing RwaPerpEngine in FundVault...");
  const fundVault = await hre.ethers.getContractAt("FundVault", fundVaultAddress);
  const txAuthorize = await fundVault.setAuthorizedContract(rwaPerpEngineAddress, true);
  await txAuthorize.wait();
  console.log("   ✅ RwaPerpEngine authorized in FundVault");

  // Save deployment info
  const deploymentInfo = {
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    deployer: deployer.address,
    treasury: treasuryAddress,
    timestamp: new Date().toISOString(),
    contracts: {
      RwaPerpEngine: rwaPerpEngineAddress,
      ChainlinkRwaOracleAdapter: chainlinkAdapterAddress,
      SignedNavOracleAdapter: signedNavAdapterAddress,
      FundVault: fundVaultAddress
    },
    oracles: {
      rGOLD: {
        assetId: ASSET_ID_RGOLD,
        adapter: chainlinkAdapterAddress,
        chainlinkFeed: SEPOLIA_XAU_USD_FEED,
        heartbeat: HEARTBEAT_1_HOUR
      },
      rUSTB: {
        assetId: ASSET_ID_RUSTB,
        adapter: signedNavAdapterAddress,
        maxStaleness: 86400
      },
      rCRE: {
        assetId: ASSET_ID_RCRE,
        adapter: signedNavAdapterAddress,
        maxStaleness: 604800
      }
    }
  };

  const outputPath = path.join(__dirname, "../deployments/sepolia-rwa-perp-engine.json");
  fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));
  console.log("\n📄 Deployment manifest saved to:", outputPath);

  console.log("\n====================================================");
  console.log("🎉 RwaPerpEngine Deployment Complete!");
  console.log("====================================================");
  console.log("\n📋 Next Steps:");
  console.log("   1. Initialize treasury: npx hardhat run scripts/fund-treasury.js --network sepolia");
  console.log("   2. Verify contracts: npx hardhat verify --network sepolia <address>");
  console.log("   3. Test oracle queries: npx hardhat run scripts/test-oracle-queries.js --network sepolia\n");
}

main().catch((error) => {
  console.error("❌ Deployment failed:", error);
  process.exitCode = 1;
});
