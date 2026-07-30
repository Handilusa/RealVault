const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n📡 Testing Oracle Price Queries...\n");

  const deployment = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../deployments/sepolia-rwa-perp-engine.json"))
  );

  const rwaPerpEngine = await hre.ethers.getContractAt(
    "RwaPerpEngine",
    deployment.contracts.RwaPerpEngine
  );

  const ASSET_ID_RGOLD = hre.ethers.id("rGOLD");

  console.log("🔍 Querying rGOLD price (Chainlink XAU/USD)...");
  
  const oracleAdapter = await rwaPerpEngine.getOracleAdapter(ASSET_ID_RGOLD);
  console.log("   Oracle Adapter:", oracleAdapter);

  const adapter = await hre.ethers.getContractAt("ChainlinkRwaOracleAdapter", oracleAdapter);
  const [priceE8, updatedAt, sourceId, confidence, settlementEnabled] = await adapter.latestPrice(ASSET_ID_RGOLD);

  console.log("\n📊 Oracle Response:");
  console.log("   Price (E8):", priceE8.toString(), "($" + (Number(priceE8) / 1e8).toFixed(2) + ")");
  console.log("   Updated At:", new Date(Number(updatedAt) * 1000).toISOString());
  console.log("   Source ID:", sourceId);
  console.log("   Confidence:", confidence.toString());
  console.log("   Settlement Enabled:", settlementEnabled);

  const config = await rwaPerpEngine.getAssetConfig(ASSET_ID_RGOLD);
  console.log("\n⚙️  Asset Config:");
  console.log("   Symbol:", config.symbol);
  console.log("   Valuation Method:", config.valuationMethod);
  console.log("   Max Staleness:", config.maxStaleness.toString(), "seconds");
}

main().catch((error) => {
  console.error("❌ Failed:", error);
  process.exitCode = 1;
});
