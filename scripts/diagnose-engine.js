const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n====================================================");
  console.log("🔍 RwaPerpEngine Diagnostic - Full Pre-Flight Check");
  console.log("   Network:", hre.network.name);
  console.log("====================================================\n");

  const sepoliaDeployments = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../deployments/sepolia.json"))
  );
  const rwaDeployments = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../deployments/sepolia-rwa-perp-engine.json"))
  );

  const [deployer] = await hre.ethers.getSigners();
  console.log("📍 Deployer:", deployer.address);

  const fundVaultAddr = sepoliaDeployments.contracts.FundVault;
  const engineAddr = rwaDeployments.contracts.RwaPerpEngine;
  const chainlinkAddr = rwaDeployments.contracts.ChainlinkRwaOracleAdapter;
  const signedNavAddr = rwaDeployments.contracts.SignedNavOracleAdapter;
  const mockUsdcAddr = sepoliaDeployments.contracts.MockUSDC;

  console.log("\n📦 Contract Addresses:");
  console.log("   FundVault:       ", fundVaultAddr);
  console.log("   RwaPerpEngine:   ", engineAddr);
  console.log("   ChainlinkOracle: ", chainlinkAddr);
  console.log("   SignedNavOracle: ", signedNavAddr);
  console.log("   MockUSDC:        ", mockUsdcAddr);

  // 1. Check FundVault authorization
  console.log("\n--- 1. FundVault Authorization ---");
  const fundVault = await hre.ethers.getContractAt("FundVault", fundVaultAddr);
  const isAuthorized = await fundVault.authorizedContracts(engineAddr);
  console.log("   Engine authorized in FundVault:", isAuthorized);
  
  const authList = await fundVault.authorizedContractList(0).catch(() => null);
  console.log("   authorizedContractList[0]:", authList);

  // 2. Check Engine ownership & config
  console.log("\n--- 2. RwaPerpEngine Config ---");
  const engine = await hre.ethers.getContractAt("RwaPerpEngine", engineAddr);
  const owner = await engine.owner();
  console.log("   Owner:", owner);
  console.log("   FundVault ref:", await engine.fundVault());
  console.log("   VaultTreasury:", await engine.vaultTreasury());
  console.log("   Trading paused:", await engine.tradingPaused());
  console.log("   Max positions/wallet:", (await engine.maxPositionsPerWallet()).toString());
  console.log("   Max margin/position:", (await engine.maxMarginPerPositionE6()).toString());

  // 3. Check DisclosureManager
  console.log("\n--- 3. DisclosureManager ---");
  const discMgr = await engine.disclosureManagerContract().catch(() => "NOT SET");
  console.log("   DisclosureManager on engine:", discMgr);

  // 4. Check Oracle Adapters
  console.log("\n--- 4. Oracle Adapters ---");
  const ASSET_ID_RGOLD = hre.ethers.id("rGOLD");
  const ASSET_ID_RUSTB = hre.ethers.id("rUSTB");
  const ASSET_ID_RCRE = hre.ethers.id("rCRE");

  const goldAdapter = await engine.getOracleAdapter(ASSET_ID_RGOLD);
  const ustbAdapter = await engine.getOracleAdapter(ASSET_ID_RUSTB);
  const creAdapter = await engine.getOracleAdapter(ASSET_ID_RCRE);
  console.log("   rGOLD adapter:", goldAdapter);
  console.log("   rUSTB adapter:", ustbAdapter);
  console.log("   rCRE adapter: ", creAdapter);

  // 5. Query live oracle prices
  console.log("\n--- 5. Live Oracle Prices ---");
  try {
    const chainlinkOracle = await hre.ethers.getContractAt("ChainlinkRwaOracleAdapter", chainlinkAddr);
    const goldRes = await chainlinkOracle.latestPrice(ASSET_ID_RGOLD).catch((e) => { console.log("   rGOLD oracle error:", e.message); return null; });
    if (goldRes) {
      console.log("   rGOLD price:", hre.ethers.formatUnits(goldRes.priceE8, 8), "USD");
      console.log("   rGOLD updatedAt:", new Date(Number(goldRes.updatedAt) * 1000).toISOString());
      console.log("   rGOLD settlementEnabled:", goldRes.settlementEnabled);
      const stalenessSeconds = Math.floor(Date.now() / 1000) - Number(goldRes.updatedAt);
      console.log("   rGOLD staleness:", stalenessSeconds, "seconds");
    }
  } catch (e) {
    console.log("   ❌ Chainlink oracle query failed:", e.message);
  }

  // 6. Check asset configs
  console.log("\n--- 6. Asset Configs ---");
  try {
    const goldConfig = await engine.getAssetConfig(ASSET_ID_RGOLD);
    console.log("   rGOLD config:", JSON.stringify({
      assetId: goldConfig.assetId,
      symbol: goldConfig.symbol,
      oracleAdapter: goldConfig.oracleAdapter,
      maxStaleness: goldConfig.maxStaleness.toString(),
    }, null, 2));
  } catch (e) {
    console.log("   ❌ rGOLD config error:", e.message);
  }

  // 7. Check deployer's FundVault position
  console.log("\n--- 7. Deployer FundVault Position ---");
  const posHandle = await fundVault.getPosition(deployer.address).catch(() => 0n);
  console.log("   Position handle:", posHandle.toString());
  console.log("   Is investor:", await fundVault.isInvestor(deployer.address));
  
  // 8. Check mUSDC balance of FundVault
  const mockUsdc = await hre.ethers.getContractAt("MockUSDC", mockUsdcAddr);
  const vaultBalance = await mockUsdc.balanceOf(fundVaultAddr);
  console.log("   FundVault mUSDC balance:", hre.ethers.formatUnits(vaultBalance, 18));

  // 9. Try to simulate openPosition call (static call to get revert reason)
  console.log("\n--- 8. Simulate openPosition (staticCall) ---");
  try {
    // We can't actually do a static call with encrypted input, but we can check if the basic flow would work
    const posCount = await engine.getPositionCount(deployer.address);
    console.log("   Deployer position count:", posCount.toString());
  } catch (e) {
    console.log("   ❌ getPositionCount error:", e.message);
  }

  console.log("\n====================================================");
  console.log("🏁 Diagnostic Complete");
  console.log("====================================================\n");
}

main().catch((error) => {
  console.error("❌ Diagnostic failed:", error);
  process.exitCode = 1;
});
