const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n====================================================");
  console.log("🔐 Authorizing RwaPerpEngine in FundVault");
  console.log("   Network:", hre.network.name);
  console.log("====================================================\n");

  // Load existing deployments
  const sepoliaDeployments = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../deployments/sepolia.json"))
  );
  
  const fundVaultAddress = sepoliaDeployments.contracts.FundVault;
  console.log("📦 FundVault Address:", fundVaultAddress);

  // Load RwaPerpEngine deployment
  const rwaDeploymentPath = path.join(__dirname, "../deployments/sepolia-rwa-perp-engine.json");
  if (!fs.existsSync(rwaDeploymentPath)) {
    console.error("❌ RwaPerpEngine deployment not found. Run deploy-rwa-perp-engine.js first.");
    process.exitCode = 1;
    return;
  }

  const rwaDeployments = JSON.parse(fs.readFileSync(rwaDeploymentPath));
  const rwaPerpEngineAddress = rwaDeployments.contracts.RwaPerpEngine;
  console.log("📦 RwaPerpEngine Address:", rwaPerpEngineAddress);

  const [deployer] = await hre.ethers.getSigners();
  console.log("\n   Deployer Address:", deployer.address);

  // Get FundVault contract instance
  const fundVault = await hre.ethers.getContractAt("FundVault", fundVaultAddress);

  console.log("\n🔗 Authorizing RwaPerpEngine...");
  const txAuthorize = await fundVault.setAuthorizedContract(rwaPerpEngineAddress, true);
  console.log("   Transaction hash:", txAuthorize.hash);
  
  await txAuthorize.wait();
  console.log("   ✅ RwaPerpEngine authorized in FundVault");

  // Verify authorization
  const isAuthorized = await fundVault.authorizedContracts(rwaPerpEngineAddress);
  console.log("\n📋 Verification:");
  console.log("   RwaPerpEngine authorized:", isAuthorized);

  // Update deployment manifest
  rwaDeployments.authorized = true;
  rwaDeployments.authorizedTimestamp = new Date().toISOString();
  fs.writeFileSync(rwaDeploymentPath, JSON.stringify(rwaDeployments, null, 2));
  console.log("\n📄 Updated deployment manifest");

  console.log("\n====================================================");
  console.log("🎉 Authorization Complete!");
  console.log("====================================================\n");
}

main().catch((error) => {
  console.error("❌ Authorization failed:", error);
  process.exitCode = 1;
});
