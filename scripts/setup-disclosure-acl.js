const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n====================================================");
  console.log("🔐 DisclosureManager ACL Setup for Decryption");
  console.log("   Network:", hre.network.name);
  console.log("====================================================\n");

  // Load deployments
  const sepoliaPath = path.join(__dirname, "../deployments/sepolia.json");
  const rwaPath = path.join(__dirname, "../deployments/sepolia-rwa-perp-engine.json");
  const sepoliaDeployment = JSON.parse(fs.readFileSync(sepoliaPath));
  const rwaDeployment = JSON.parse(fs.readFileSync(rwaPath));

  const [deployer] = await hre.ethers.getSigners();
  console.log("   Deployer:", deployer.address);

  const fundVaultAddress = sepoliaDeployment.contracts.FundVault;
  const oldDisclosureManager = sepoliaDeployment.contracts.DisclosureManager;

  console.log("\n📦 Current Contracts:");
  console.log("   FundVault:", fundVaultAddress);
  console.log("   Old DisclosureManager:", oldDisclosureManager);

  // ============================================
  // Step 1: Redeploy DisclosureManager with new FundVault
  // ============================================
  console.log("\n[1/3] Deploying new DisclosureManager (pointing to new FundVault)...");
  const DisclosureManager = await hre.ethers.getContractFactory("DisclosureManager");
  const disclosureManager = await DisclosureManager.deploy(fundVaultAddress);
  await disclosureManager.waitForDeployment();
  const dmAddress = await disclosureManager.getAddress();
  console.log("   ✅ DisclosureManager deployed at:", dmAddress);

  // Verify it points to correct vault
  const vaultRef = await disclosureManager.vault();
  console.log("   Vault reference:", vaultRef);
  console.log("   Matches FundVault:", vaultRef === fundVaultAddress);

  // ============================================
  // Step 2: Update FundVault to use new DisclosureManager
  // ============================================
  console.log("\n[2/3] Updating FundVault DisclosureManager reference...");
  const fundVault = await hre.ethers.getContractAt("FundVault", fundVaultAddress);
  const tx = await fundVault.setDisclosureManager(dmAddress);
  await tx.wait();
  console.log("   ✅ FundVault now uses new DisclosureManager");

  // Verify
  const currentDM = await fundVault.disclosureManager();
  console.log("   FundVault.disclosureManager:", currentDM);

  // ============================================
  // Step 3: Test ACL grant (deployer grants self as auditor for test user)
  // ============================================
  console.log("\n[3/3] Testing ACL grant flow...");

  // The test user from nox-test-flow.js
  const testUserPrivateKey = process.env.TEST_USER_PRIVATE_KEY;
  if (testUserPrivateKey) {
    const testUserWallet = new hre.ethers.Wallet(testUserPrivateKey, hre.ethers.provider);
    console.log("   Test User:", testUserWallet.address);
    console.log("   Auditor (deployer):", deployer.address);

    // Test user grants deployer as auditor
    console.log("   [3.1] Test user granting deployer as auditor...");
    try {
      const grantTx = await disclosureManager.connect(testUserWallet).grantAuditorAccess(deployer.address);
      await grantTx.wait();
      console.log("   ✅ Auditor access granted!");

      // Verify
      const isActive = await disclosureManager.isActiveAuditorFor(testUserWallet.address, deployer.address);
      console.log("   Auditor active:", isActive);
    } catch (error) {
      console.log("   ⚠️  Grant failed (user may not have deposited yet):", error.message.slice(0, 100));
      console.log("   Run nox:test-flow first, then re-run this script");
    }
  } else {
    console.log("   ⚠️  TEST_USER_PRIVATE_KEY not set, skipping ACL test");
    console.log("   To test: set TEST_USER_PRIVATE_KEY in .env");
  }

  // Update deployment manifest
  sepoliaDeployment.contracts.DisclosureManager = dmAddress;
  sepoliaDeployment.timestamp = new Date().toISOString();
  fs.writeFileSync(sepoliaPath, JSON.stringify(sepoliaDeployment, null, 2));
  console.log("\n📄 Updated sepolia.json with new DisclosureManager");

  console.log("\n====================================================");
  console.log("🎉 DisclosureManager ACL Setup Complete!");
  console.log("====================================================");
  console.log("\n📋 ACL Flow:");
  console.log("   1. Investor calls grantAuditorAccess(auditorAddress)");
  console.log("   2. Auditor can now decrypt investor's position via Nox Gateway");
  console.log("   3. Investor calls revokeAuditorAccess(auditorAddress) to revoke");
  console.log("   4. Handle rotation cryptographically invalidates old access\n");
}

main().catch((error) => {
  console.error("❌ Setup failed:", error);
  process.exitCode = 1;
});
