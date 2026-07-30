const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n====================================================");
  console.log("🔒 Setting Phase 0 Conservative Limits");
  console.log("   Network:", hre.network.name);
  console.log("====================================================\n");

  // Load deployment info
  const deploymentPath = path.join(__dirname, "../deployments/sepolia-rwa-perp-engine.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath));
  
  const rwaPerpEngineAddress = deployment.contracts.RwaPerpEngine;
  console.log("📦 RwaPerpEngine:", rwaPerpEngineAddress);

  const [deployer] = await hre.ethers.getSigners();
  console.log("   Deployer:", deployer.address);

  const rwaPerpEngine = await hre.ethers.getContractAt("RwaPerpEngine", rwaPerpEngineAddress);

  // Phase 0 Conservative Limits:
  // - Max 2 positions per user
  // - Max $100 per position (100 * 10^6 = 100,000,000 in 6 decimals)
  const maxPositions = 2;
  const maxPositionValue = hre.ethers.parseUnits("100", 6); // $100 in USDC (6 decimals)

  console.log("\n⚙️  Setting Position Limits:");
  console.log("   - Max Positions per User:", maxPositions);
  console.log("   - Max Position Value: $100 USDC");

  const tx = await rwaPerpEngine.setPositionLimits(maxPositions, maxPositionValue);
  await tx.wait();

  console.log("   ✅ Position limits set successfully");

  // Verify limits
  const storedMaxPositions = await rwaPerpEngine.maxPositionsPerWallet();
  const storedMaxValue = await rwaPerpEngine.maxMarginPerPositionE6();
  console.log("\n🔍 Verification:");
  console.log("   - Stored Max Positions:", storedMaxPositions.toString());
  console.log("   - Stored Max Value:", hre.ethers.formatUnits(storedMaxValue, 6), "USDC");

  console.log("\n====================================================");
  console.log("✅ Phase 0 Limits Configured Successfully!");
  console.log("====================================================\n");
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exitCode = 1;
});
