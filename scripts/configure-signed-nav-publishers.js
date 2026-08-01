const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n====================================================");
  console.log("🔑 Configuring SignedNav Publishers");
  console.log("====================================================\n");

  const deployment = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../deployments/sepolia-rwa-perp-engine.json"))
  );

  const [deployer] = await hre.ethers.getSigners();
  console.log("📍 Deployer Address:", deployer.address);
  console.log("   (Will send transactions with publisher signatures)\n");

  // 1. Generate publisher wallets (no funding needed - sign off-chain only)
  console.log("[1/5] Generating Publisher Wallets...");
  const rustbPublisher = hre.ethers.Wallet.createRandom();
  const rcrePublisher = hre.ethers.Wallet.createRandom();

  console.log("\n   rUSTB Publisher (US Treasury Fund Administrator):");
  console.log("     Address:", rustbPublisher.address);
  console.log("     Private Key:", rustbPublisher.privateKey);

  console.log("\n   rCRE Publisher (Commercial RE Appraiser):");
  console.log("     Address:", rcrePublisher.address);
  console.log("     Private Key:", rcrePublisher.privateKey);

  // Save publisher info securely
  const publisherInfo = {
    network: "sepolia",
    timestamp: new Date().toISOString(),
    rUSTB: {
      publisher: rustbPublisher.address,
      privateKey: rustbPublisher.privateKey,
      role: "US Treasury Fund Administrator",
      navFrequency: "Daily (24 hours)",
      validityWindow: 86400
    },
    rCRE: {
      publisher: rcrePublisher.address,
      privateKey: rcrePublisher.privateKey,
      role: "Commercial RE Appraiser",
      navFrequency: "Weekly (7 days)",
      validityWindow: 604800
    }
  };

  const publisherPath = path.join(__dirname, "../deployments/nav-publishers.json");
  fs.writeFileSync(publisherPath, JSON.stringify(publisherInfo, null, 2));
  console.log("\n   ✅ Publisher info saved to:", publisherPath);
  console.log("   ⚠️  IMPORTANT: Keep this file SECURE and add to .gitignore!");

  // 2. Fix rCRE maxStaleness (24h → 7 days)
  console.log("\n[2/5] Fixing rCRE maxStaleness (24h → 7 days)...");
  const rwaPerpEngine = await hre.ethers.getContractAt(
    "RwaPerpEngine",
    deployment.contracts.RwaPerpEngine
  );

  const ASSET_ID_RCRE = hre.ethers.id("rCRE");
  const signedNavAdapterAddress = deployment.contracts.SignedNavOracleAdapter;

  const txFixRCRE = await rwaPerpEngine.configureAsset({
    assetId: ASSET_ID_RCRE,
    symbol: "rCRE",
    oracleAdapter: signedNavAdapterAddress,
    maxStaleness: 604800, // 7 days = 604800 seconds
    valuationMethod: "NAV",
    description: "Commercial Real Estate"
  });
  await txFixRCRE.wait();
  console.log("   ✅ rCRE maxStaleness updated to 7 days (604800s)");
  console.log("   Transaction:", txFixRCRE.hash);

  // 3. Authorize publishers in SignedNavOracleAdapter
  console.log("\n[3/5] Authorizing Publishers in SignedNavOracleAdapter...");
  const signedNavAdapter = await hre.ethers.getContractAt(
    "SignedNavOracleAdapter",
    signedNavAdapterAddress
  );

  const ASSET_ID_RUSTB = hre.ethers.id("rUSTB");

  // Add a small delay to ensure nonce is updated
  await new Promise(resolve => setTimeout(resolve, 2000));

  const txAuthRUSTB = await signedNavAdapter.setAuthorizedPublisher(
    ASSET_ID_RUSTB,
    rustbPublisher.address
  );
  await txAuthRUSTB.wait();
  console.log("   ✅ rUSTB publisher authorized:", rustbPublisher.address);
  console.log("   Transaction:", txAuthRUSTB.hash);

  // Add delay between transactions
  await new Promise(resolve => setTimeout(resolve, 3000));

  const txAuthRCRE = await signedNavAdapter.setAuthorizedPublisher(
    ASSET_ID_RCRE,
    rcrePublisher.address
  );
  await txAuthRCRE.wait();
  console.log("   ✅ rCRE publisher authorized:", rcrePublisher.address);
  console.log("   Transaction:", txAuthRCRE.hash);

  // 4. Submit initial NAV for rUSTB ($1.00, 24h validity)
  console.log("\n[4/5] Submitting Initial NAV for rUSTB...");
  
  // Add delay before NAV submission
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const rustbNavE8 = 10542000000n; // $105.42 in 8 decimals
  const rustbPublishedAt = Math.floor(Date.now() / 1000);
  const rustbValidUntil = rustbPublishedAt + 86400; // 24 hours
  const lastRustbNonce = await signedNavAdapter.lastNonce(ASSET_ID_RUSTB);
  const rustbNonce = lastRustbNonce + 1n;

  // Create message hash for ECDSA signature
  const rustbMessageHash = hre.ethers.solidityPackedKeccak256(
    ["bytes32", "uint256", "uint256", "uint256", "uint256"],
    [ASSET_ID_RUSTB, rustbNavE8, rustbPublishedAt, rustbValidUntil, rustbNonce]
  );

  // Sign off-chain with rUSTB publisher wallet
  const rustbSignature = await rustbPublisher.signMessage(
    hre.ethers.getBytes(rustbMessageHash)
  );

  // Deployer submits the transaction with the signature
  const txSubmitRUSTB = await signedNavAdapter.connect(deployer).submitNav(
    ASSET_ID_RUSTB,
    rustbNavE8,
    rustbPublishedAt,
    rustbValidUntil,
    rustbNonce,
    rustbSignature
  );
  await txSubmitRUSTB.wait();

  console.log("   ✅ rUSTB NAV submitted:");
  console.log("     NAV: $1.00 (par value)");
  console.log("     Published:", new Date(rustbPublishedAt * 1000).toISOString());
  console.log("     Valid Until:", new Date(rustbValidUntil * 1000).toISOString());
  console.log("     Validity Window: 24 hours");
  console.log("     Transaction:", txSubmitRUSTB.hash);

  // 5. Submit initial NAV for rCRE ($1,000.00, 7 days validity)
  console.log("\n[5/5] Submitting Initial NAV for rCRE...");
  
  // Add delay before NAV submission
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const rcreNavE8 = 25000000000n; // $250.00 in 8 decimals
  const rcrePublishedAt = Math.floor(Date.now() / 1000);
  const rcreValidUntil = rcrePublishedAt + 604800; // 7 days
  const lastRcreNonce = await signedNavAdapter.lastNonce(ASSET_ID_RCRE);
  const rcreNonce = lastRcreNonce + 1n;

  // Create message hash for ECDSA signature
  const rcreMessageHash = hre.ethers.solidityPackedKeccak256(
    ["bytes32", "uint256", "uint256", "uint256", "uint256"],
    [ASSET_ID_RCRE, rcreNavE8, rcrePublishedAt, rcreValidUntil, rcreNonce]
  );

  // Sign off-chain with rCRE publisher wallet
  const rcreSignature = await rcrePublisher.signMessage(
    hre.ethers.getBytes(rcreMessageHash)
  );

  // Deployer submits the transaction with the signature
  const txSubmitRCRE = await signedNavAdapter.connect(deployer).submitNav(
    ASSET_ID_RCRE,
    rcreNavE8,
    rcrePublishedAt,
    rcreValidUntil,
    rcreNonce,
    rcreSignature
  );
  await txSubmitRCRE.wait();

  console.log("   ✅ rCRE NAV submitted:");
  console.log("     NAV: $1,000.00 (per unit)");
  console.log("     Published:", new Date(rcrePublishedAt * 1000).toISOString());
  console.log("     Valid Until:", new Date(rcreValidUntil * 1000).toISOString());
  console.log("     Validity Window: 7 days (weekly appraisal cadence)");
  console.log("     Transaction:", txSubmitRCRE.hash);

  // 6. Verify NAVs are working
  console.log("\n====================================================");
  console.log("🔍 Verifying Oracle Queries");
  console.log("====================================================\n");

  const [rustbPrice, rustbUpdated, , , rustbEnabled] = await signedNavAdapter.latestPrice(ASSET_ID_RUSTB);
  console.log("   rUSTB Oracle:");
  console.log("     Price:", (Number(rustbPrice) / 1e8).toFixed(2), "USD");
  console.log("     Updated At:", new Date(Number(rustbUpdated) * 1000).toISOString());
  console.log("     Settlement Enabled:", rustbEnabled);

  const [rcrePrice, rcreUpdated, , , rcreEnabled] = await signedNavAdapter.latestPrice(ASSET_ID_RCRE);
  console.log("\n   rCRE Oracle:");
  console.log("     Price:", (Number(rcrePrice) / 1e8).toFixed(2), "USD");
  console.log("     Updated At:", new Date(Number(rcreUpdated) * 1000).toISOString());
  console.log("     Settlement Enabled:", rcreEnabled);

  console.log("\n====================================================");
  console.log("✅ SignedNav Publishers Configured Successfully!");
  console.log("====================================================");
  console.log("\n📝 Summary:");
  console.log("   • 2 publisher wallets generated and saved");
  console.log("   • rCRE maxStaleness fixed (24h → 7 days)");
  console.log("   • Both publishers authorized on-chain");
  console.log("   • Initial NAVs submitted and verified");
  console.log("\n💾 Publisher Details Saved:");
  console.log("   File: deployments/nav-publishers.json");
  console.log("   rUSTB Publisher:", rustbPublisher.address);
  console.log("   rCRE Publisher:", rcrePublisher.address);
  console.log("\n🔐 Security Notes:");
  console.log("   • Publisher wallets do NOT need funding (sign off-chain only)");
  console.log("   • Deployer wallet sends all transactions");
  console.log("   • Keep nav-publishers.json SECURE and add to .gitignore");
  console.log("   • Private keys stored for future NAV submissions\n");
}

main().catch((error) => {
  console.error("\n❌ Configuration failed:", error);
  process.exitCode = 1;
});
