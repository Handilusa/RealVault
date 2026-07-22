const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n====================================================");
  console.log("🧪 RealVault — End-to-End Testnet Simulator (Sepolia)");
  console.log("   Network:", hre.network.name);
  console.log("====================================================\n");

  const manifestPath = path.join(__dirname, `../deployments/${hre.network.name}.json`);
  if (!fs.existsSync(manifestPath)) {
    console.error(`❌ Deployment manifest not found at ${manifestPath}. Please run deploy script first:`);
    console.error(`   npm run deploy:sepolia`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  console.log("📄 Loaded contract manifest from:", manifestPath);

  const [deployer] = await hre.ethers.getSigners();
  console.log("👤 Execution Signer:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("💰 Wallet Balance:", hre.ethers.formatEther(balance), "ETH\n");

  const mockUSDC = await hre.ethers.getContractAt("MockUSDC", manifest.contracts.MockUSDC);
  const fundVault = await hre.ethers.getContractAt("FundVault", manifest.contracts.FundVault);
  const navAggregator = await hre.ethers.getContractAt("NAVAggregator", manifest.contracts.NAVAggregator);
  const disclosureManager = await hre.ethers.getContractAt("DisclosureManager", manifest.contracts.DisclosureManager);

  // 1. Mint MockUSDC
  console.log("1️⃣ Minting MockUSDC to deployer...");
  const mintAmount = hre.ethers.parseUnits("10000", 18);
  const txMint = await mockUSDC.mint(deployer.address, mintAmount);
  await txMint.wait();
  console.log("   ✅ Minted 10,000 mUSDC. Tx:", txMint.hash);

  // 2. FundVault status check
  console.log("\n2️⃣ Checking FundVault state...");
  const investorCount = await fundVault.investorCount();
  console.log("   Current Investors:", investorCount.toString());

  // 3. Grant & Revoke Auditor Access (Handle Rotation Gas Measurement)
  console.log("\n3️⃣ Testing DisclosureManager ACL Grant & Revoke (Handle Rotation)...");
  const dummyAuditor = "0x000000000000000000000000000000000000dEaD";

  console.log("   Granting auditor access to:", dummyAuditor);
  const txGrant = await disclosureManager.grantAuditorAccess(dummyAuditor);
  const receiptGrant = await txGrant.wait();
  console.log("   ✅ Auditor Granted! Gas used:", receiptGrant.gasUsed.toString());

  console.log("   Revoking auditor access via Handle Rotation...");
  const txRevoke = await disclosureManager.revokeAuditorAccess(dummyAuditor);
  const receiptRevoke = await txRevoke.wait();
  console.log("   ✅ Auditor Revoked via Handle Rotation!");
  console.log("   📊 Gas used for O(n) Handle Rotation:", receiptRevoke.gasUsed.toString(), "units");

  // 4. Trigger FHE NAV Aggregation
  console.log("\n4️⃣ Testing FHE Homomorphic NAV Aggregation...");
  const txAgg = await navAggregator.aggregateAll();
  const receiptAgg = await txAgg.wait();
  console.log("   ✅ NAV Aggregation Complete!");
  console.log("   📊 Gas used for NAV Aggregation:", receiptAgg.gasUsed.toString(), "units");

  const publicNavHandle = await navAggregator.aggregatedNav();
  const lastBlock = await navAggregator.lastUpdateBlock();
  console.log("   Public NAV Handle:", publicNavHandle);
  console.log("   Aggregated Block:", lastBlock.toString());

  console.log("\n====================================================");
  console.log("🎉 End-to-End Testnet Simulation Completed Successfully!");
  console.log("====================================================\n");
}

main().catch((error) => {
  console.error("❌ Simulation failed:", error);
  process.exitCode = 1;
});
