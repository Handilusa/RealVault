const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const amountStr = process.env.AMOUNT || "100";
  const amountBig = BigInt(amountStr);

  console.log(`\n====================================================`);
  console.log(`🔒 RealVault — Executing Encrypted Deposit on Sepolia`);
  console.log(`   Amount: ${amountStr} mUSDC`);
  console.log(`====================================================\n`);

  const manifestPath = path.join(__dirname, `../deployments/sepolia.json`);
  if (!fs.existsSync(manifestPath)) {
    console.error(`❌ Manifest not found at ${manifestPath}`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  const [signer] = await hre.ethers.getSigners();
  console.log("👤 Investor Signer:", signer.address);

  const mockUSDC = await hre.ethers.getContractAt("MockUSDC", manifest.contracts.MockUSDC);
  const fundVault = await hre.ethers.getContractAt("FundVault", manifest.contracts.FundVault);

  const parsedAmount = hre.ethers.parseUnits(amountStr, 18);

  // 1. Approve mUSDC if needed
  const currentAllowance = await mockUSDC.allowance(signer.address, manifest.contracts.FundVault);
  if (currentAllowance < parsedAmount) {
    console.log("1️⃣ Approving mUSDC transfer...");
    const txApp = await mockUSDC.approve(manifest.contracts.FundVault, parsedAmount);
    await txApp.wait();
    console.log("   ✅ Approved on-chain!");
  } else {
    console.log("1️⃣ mUSDC already approved on-chain.");
  }

  // 2. Encrypt deposit amount using Nox Handle SDK
  console.log("\n2️⃣ Encrypting deposit amount via @iexec-nox/handle SDK...");
  const { createEthersHandleClient } = await import("@iexec-nox/handle");
  const handleClient = await createEthersHandleClient(signer);

  const { handle, handleProof } = await handleClient.encryptInput(
    amountBig,
    "uint256",
    manifest.contracts.FundVault
  );

  console.log("   Encrypted Handle (bytes32):", handle);
  console.log("   Handle Proof:", handleProof);

  // 3. Call deposit on FundVault.sol
  console.log("\n3️⃣ Sending encrypted deposit to FundVault.sol...");
  const tx = await fundVault.deposit(handle, handleProof);
  console.log("   ⏳ Waiting for Sepolia block confirmation...");
  const receipt = await tx.wait();

  console.log(`\n====================================================`);
  console.log(`🎉 Deposit Successful on Sepolia!`);
  console.log(`   Tx Hash: ${tx.hash}`);
  console.log(`   Block: #${receipt.blockNumber}`);
  console.log(`   Gas Used: ${receipt.gasUsed.toString()}`);
  console.log(`====================================================\n`);
  console.log(`👉 Refresh or click "Sync Chain State" on the dashboard to view your new LP position.\n`);
}

main().catch((err) => {
  console.error("❌ Deposit failed:", err);
  process.exit(1);
});
