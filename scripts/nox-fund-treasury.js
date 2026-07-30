const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { createViemHandleClient } = require("@iexec-nox/handle");
const { createWalletClient, http } = require("viem");
const { sepolia } = require("viem/chains");
const { privateKeyToAccount } = require("viem/accounts");

async function main() {
  console.log("\n🏦 Funding RwaPerpEngine Treasury with Nox FHE\n");

  // Load deployment info
  const deployment = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../deployments/sepolia-rwa-perp-engine.json"))
  );

  const engineAddress = deployment.contracts.RwaPerpEngine;
  console.log("📦 RwaPerpEngine:", engineAddress);

  // Get deployer signer
  const [deployer] = await hre.ethers.getSigners();
  console.log("   Deployer:", deployer.address);

  // Initialize treasury amount: $100,000 USDC (6 decimals)
  const treasuryAmount = 100_000_000000n; // 100,000 USDC
  console.log("   Target Amount: $100,000 USDC");

  // Step 1: Create Nox handle client
  console.log("\n[1/4] Creating Nox handle client...");
  
  const account = privateKeyToAccount(process.env.PRIVATE_KEY);
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL)
  });

  const handleClient = await createViemHandleClient(walletClient);
  console.log("   ✅ Handle client created");

  // Step 2: Encrypt treasury amount
  console.log("\n[2/4] Encrypting treasury amount with FHE...");
  
  const { handle, handleProof } = await handleClient.encryptInput(
    treasuryAmount,
    "uint256",
    engineAddress
  );
  
  console.log("   ✅ Encrypted handle:", handle);
  console.log("   ✅ Proof generated");

  // Step 3: Fund treasury via contract
  console.log("\n[3/4] Funding treasury...");
  
  const rwaPerpEngine = await hre.ethers.getContractAt("RwaPerpEngine", engineAddress);
  
  const tx = await rwaPerpEngine.fundTreasury(handle, handleProof);
  await tx.wait();
  
  console.log("   ✅ Treasury funded!");
  console.log("   Transaction:", tx.hash);

  // Step 4: Verify (attempt to read treasury balance handle)
  console.log("\n[4/4] Verifying treasury...");
  
  const treasuryHandle = await rwaPerpEngine.getTreasuryBalance();
  console.log("   Treasury Balance Handle:", treasuryHandle);
  console.log("   ⚠️  Decryption requires disclosure manager ACL");

  console.log("\n✅ Treasury funding complete!");
  console.log("\n📋 Next Steps:");
  console.log("   1. Test opening position with user wallet");
  console.log("   2. Close position to verify treasury can pay profits");
  console.log("   3. Run nox-test-flow.js for full validation\n");
}

main().catch((error) => {
  console.error("❌ Failed:", error);
  process.exitCode = 1;
});
