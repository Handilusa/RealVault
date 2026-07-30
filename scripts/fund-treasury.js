const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n====================================================");
  console.log("🏦 Initializing RwaPerpEngine Treasury");
  console.log("====================================================\n");

  console.log("⚠️  IMPORTANT: This script uses dummy bytes32 handle");
  console.log("   For production, use real Nox SDK encryption:\n");
  console.log("   const treasuryHandle = await Nox.fromPlaintext(treasuryAmount);");
  console.log("   const inputHandle = Nox.toExternal(treasuryHandle);");
  console.log("   const proof = Nox.getProof(treasuryHandle);\n");

  const deployment = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../deployments/sepolia-rwa-perp-engine.json"))
  );

  const rwaPerpEngine = await hre.ethers.getContractAt(
    "RwaPerpEngine",
    deployment.contracts.RwaPerpEngine
  );

  // Initialize with $100,000 USDC (6 decimals)
  const treasuryAmount = 100000_000000n;
  const treasuryHandle = hre.ethers.zeroPadValue(hre.ethers.toBeHex(treasuryAmount), 32);

  console.log("💰 Treasury Configuration:");
  console.log("   Amount: $100,000 USDC");
  console.log("   Treasury Address:", deployment.treasury);
  console.log("   Initializing...\n");

  const tx = await rwaPerpEngine.initializeTreasury(treasuryHandle, "0x");
  await tx.wait();

  console.log("   ✅ Treasury initialized successfully!");
  console.log("   Transaction:", tx.hash);
  
  console.log("\n====================================================");
  console.log("✅ Treasury Initialization Complete");
  console.log("====================================================\n");
}

main().catch((error) => {
  console.error("❌ Failed:", error);
  process.exitCode = 1;
});
