const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n====================================================");
  console.log("📈 Publishing NAV Price Updates (rUSTB & rCRE)");
  console.log("====================================================\n");

  const deployment = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../deployments/sepolia-rwa-perp-engine.json"))
  );
  const publishers = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../deployments/nav-publishers.json"))
  );

  const [deployer] = await hre.ethers.getSigners();
  const signedNavAddr = deployment.contracts.SignedNavOracleAdapter;
  const signedNavAdapter = await hre.ethers.getContractAt("SignedNavOracleAdapter", signedNavAddr);

  const ASSET_ID_RUSTB = hre.ethers.id("rUSTB");
  const ASSET_ID_RCRE = hre.ethers.id("rCRE");

  // Load existing publisher wallets (they're already authorized on-chain)
  const rustbPublisher = new hre.ethers.Wallet(publishers.rUSTB.privateKey);
  const rcrePublisher = new hre.ethers.Wallet(publishers.rCRE.privateKey);

  console.log("   rUSTB publisher:", rustbPublisher.address);
  console.log("   rCRE publisher: ", rcrePublisher.address);

  // --- rUSTB: $105.42 USD ---
  console.log("\n[1/2] Publishing rUSTB NAV ($105.42 USD)...");
  const rustbNavE8 = 10542000000n; // $105.42
  const rustbPublishedAt = Math.floor(Date.now() / 1000);
  const rustbValidUntil = rustbPublishedAt + 86400;
  const lastRustbNonce = await signedNavAdapter.getLastNonce(ASSET_ID_RUSTB);
  const rustbNonce = lastRustbNonce + 1n;

  const rustbMessageHash = hre.ethers.solidityPackedKeccak256(
    ["bytes32", "uint256", "uint256", "uint256", "uint256"],
    [ASSET_ID_RUSTB, rustbNavE8, rustbPublishedAt, rustbValidUntil, rustbNonce]
  );
  const rustbSignature = await rustbPublisher.signMessage(hre.ethers.getBytes(rustbMessageHash));

  const txRUSTB = await signedNavAdapter.connect(deployer).submitNav(
    ASSET_ID_RUSTB, rustbNavE8, rustbPublishedAt, rustbValidUntil, rustbNonce, rustbSignature
  );
  await txRUSTB.wait();
  console.log("   ✅ rUSTB NAV published! Tx:", txRUSTB.hash);

  // --- rCRE: $250.00 USD ---
  console.log("\n[2/2] Publishing rCRE NAV ($250.00 USD)...");
  await new Promise(r => setTimeout(r, 2000));

  const rcreNavE8 = 25000000000n; // $250.00
  const rcrePublishedAt = Math.floor(Date.now() / 1000);
  const rcreValidUntil = rcrePublishedAt + 604800;
  const lastRcreNonce = await signedNavAdapter.getLastNonce(ASSET_ID_RCRE);
  const rcreNonce = lastRcreNonce + 1n;

  const rcreMessageHash = hre.ethers.solidityPackedKeccak256(
    ["bytes32", "uint256", "uint256", "uint256", "uint256"],
    [ASSET_ID_RCRE, rcreNavE8, rcrePublishedAt, rcreValidUntil, rcreNonce]
  );
  const rcreSignature = await rcrePublisher.signMessage(hre.ethers.getBytes(rcreMessageHash));

  const txRCRE = await signedNavAdapter.connect(deployer).submitNav(
    ASSET_ID_RCRE, rcreNavE8, rcrePublishedAt, rcreValidUntil, rcreNonce, rcreSignature
  );
  await txRCRE.wait();
  console.log("   ✅ rCRE NAV published! Tx:", txRCRE.hash);

  // --- Verify ---
  console.log("\n--- Verification ---");
  const rustbRes = await signedNavAdapter.latestPrice(ASSET_ID_RUSTB);
  console.log("   rUSTB:", hre.ethers.formatUnits(rustbRes.priceE8, 8), "USD | settlement:", rustbRes.settlementEnabled);

  const rcreRes = await signedNavAdapter.latestPrice(ASSET_ID_RCRE);
  console.log("   rCRE: ", hre.ethers.formatUnits(rcreRes.priceE8, 8), "USD | settlement:", rcreRes.settlementEnabled);

  console.log("\n🎉 NAV prices published successfully!\n");
}

main().catch((error) => {
  console.error("❌ Failed:", error);
  process.exitCode = 1;
});
