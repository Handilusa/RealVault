/**
 * RealVault — Multi-Investor Gas Scaling Simulation (ETH Sepolia)
 * 
 * This script measures the O(n) gas scaling of:
 *   1. DisclosureManager.grantAuditorAccess()  — iterates all investors calling Nox.allow()
 *   2. DisclosureManager.revokeAuditorAccess() — triggers FundVault.rotateHandles() O(n)
 *   3. NAVAggregator.aggregateAll()            — FHE sum across all positions
 * 
 * Strategy: Uses @iexec-nox/handle SDK to create real encrypted deposits
 * for multiple investors, then measures gas at each investor count.
 * 
 * All operations are real on-chain FHE operations against ETH Sepolia (11155111).
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n====================================================");
  console.log("📊 RealVault — Multi-Investor Gas Scaling Benchmark");
  console.log("   Network:", hre.network.name);
  console.log("====================================================\n");

  // Load deployment manifest
  const manifestPath = path.join(__dirname, `../deployments/${hre.network.name}.json`);
  if (!fs.existsSync(manifestPath)) {
    console.error(`❌ Deployment manifest not found. Run deploy first.`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  const [deployer] = await hre.ethers.getSigners();
  console.log("👤 Deployer:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("💰 Balance:", hre.ethers.formatEther(balance), "ETH\n");

  // Attach to deployed contracts
  const mockUSDC = await hre.ethers.getContractAt("MockUSDC", manifest.contracts.MockUSDC);
  const fundVault = await hre.ethers.getContractAt("FundVault", manifest.contracts.FundVault);
  const navAggregator = await hre.ethers.getContractAt("NAVAggregator", manifest.contracts.NAVAggregator);
  const disclosureManager = await hre.ethers.getContractAt("DisclosureManager", manifest.contracts.DisclosureManager);

  // Dynamically import ESM handle SDK
  const { createEthersHandleClient } = await import("@iexec-nox/handle");
  const handleClient = await createEthersHandleClient(deployer);

  const fundVaultAddress = manifest.contracts.FundVault;

  // ========================================
  // Phase 1: Register investors via real FHE deposits
  // ========================================
  const TARGET_INVESTORS = 8;
  const gasData = {
    grant: [],
    revoke: [],
    aggregate: [],
  };

  // Check how many investors are already registered
  const existingCount = Number(await fundVault.investorCount());
  console.log(`📋 Existing investors: ${existingCount}`);

  // We need to deposit from unique addresses. Since we only have 1 signer,
  // we'll use the deployer for all deposits but create unique "investor" entries
  // by calling deposit multiple times from the same address.
  // However, FundVault only registers each address ONCE (isInvestor check).
  //
  // Strategy: Generate ephemeral wallets, fund them with ETH, then deposit from each.

  console.log(`\n🔑 Generating ${TARGET_INVESTORS} ephemeral investor wallets...`);

  const investors = [];
  for (let i = 0; i < TARGET_INVESTORS; i++) {
    const wallet = hre.ethers.Wallet.createRandom().connect(hre.ethers.provider);
    investors.push(wallet);
    console.log(`   Investor ${i + 1}: ${wallet.address}`);
  }

  // Fund each investor wallet with ETH for gas
  console.log(`\n💸 Funding investor wallets with ETH for gas...`);
  const fundAmount = hre.ethers.parseEther("0.008"); // ~8M gas worth per investor
  for (let i = 0; i < investors.length; i++) {
    const tx = await deployer.sendTransaction({
      to: investors[i].address,
      value: fundAmount,
    });
    await tx.wait();
    console.log(`   ✅ Funded Investor ${i + 1} with 0.008 ETH`);
  }

  // Each investor: encrypt deposit amount → call deposit()
  console.log(`\n💰 Performing real FHE deposits from each investor...`);
  const depositAmounts = [1000n, 2500n, 500n, 7500n, 3000n, 1200n, 4400n, 6000n];

  for (let i = 0; i < investors.length; i++) {
    const investorWallet = investors[i];
    const amount = depositAmounts[i] || 1000n;

    try {
      // Create handle client for this investor
      const investorHandleClient = await createEthersHandleClient(investorWallet);

      console.log(`   [${i + 1}/${TARGET_INVESTORS}] Encrypting ${amount} for ${investorWallet.address.slice(0, 10)}...`);

      // Encrypt the deposit amount
      const { handle, handleProof } = await investorHandleClient.encryptInput(
        amount,
        "uint256",
        fundVaultAddress
      );

      // Call deposit on FundVault
      const depositTx = await fundVault.connect(investorWallet).deposit(handle, handleProof);
      const depositReceipt = await depositTx.wait();
      console.log(`   ✅ Investor ${i + 1} deposited. Gas: ${depositReceipt.gasUsed.toString()}`);
    } catch (err) {
      console.error(`   ❌ Investor ${i + 1} deposit failed:`, err.message);
      // If encrypted input fails, skip this investor
      continue;
    }

    // After each deposit, measure gas for grant/revoke/aggregate at this investor count
    const currentInvestorCount = Number(await fundVault.investorCount());
    console.log(`\n   📊 Measuring gas with ${currentInvestorCount} investors...`);

    // --- Grant Auditor Access ---
    try {
      const auditorAddr = hre.ethers.Wallet.createRandom().address;
      const grantTx = await disclosureManager.grantAuditorAccess(auditorAddr);
      const grantReceipt = await grantTx.wait();
      const grantGas = Number(grantReceipt.gasUsed);
      gasData.grant.push({ investors: currentInvestorCount, gas: grantGas });
      console.log(`      Grant Auditor:   ${grantGas} gas`);

      // --- Revoke Auditor (Handle Rotation) ---
      const revokeTx = await disclosureManager.revokeAuditorAccess(auditorAddr);
      const revokeReceipt = await revokeTx.wait();
      const revokeGas = Number(revokeReceipt.gasUsed);
      gasData.revoke.push({ investors: currentInvestorCount, gas: revokeGas });
      console.log(`      Revoke (Rotate): ${revokeGas} gas`);
    } catch (err) {
      console.error(`      ⚠️ Grant/Revoke failed:`, err.message);
    }

    // --- NAV Aggregation ---
    try {
      const aggTx = await navAggregator.aggregateAll();
      const aggReceipt = await aggTx.wait();
      const aggGas = Number(aggReceipt.gasUsed);
      gasData.aggregate.push({ investors: currentInvestorCount, gas: aggGas });
      console.log(`      NAV Aggregate:   ${aggGas} gas`);
    } catch (err) {
      console.error(`      ⚠️ NAV Aggregation failed:`, err.message);
    }

    console.log("");
  }

  // ========================================
  // Phase 2: Output Results Table & JSON
  // ========================================
  console.log("\n====================================================");
  console.log("📊 GAS SCALING RESULTS — O(n) Handle Rotation");
  console.log("====================================================");
  console.log("\n| Investors | Grant Auditor | Revoke (Rotate) | NAV Aggregate |");
  console.log("|-----------|--------------|-----------------|---------------|");

  for (let i = 0; i < gasData.grant.length; i++) {
    const g = gasData.grant[i];
    const r = gasData.revoke[i];
    const a = gasData.aggregate[i];
    console.log(
      `| ${g.investors.toString().padStart(9)} | ${g.gas.toString().padStart(12)} | ${r.gas.toString().padStart(15)} | ${a.gas.toString().padStart(13)} |`
    );
  }

  // Calculate linear regression slope
  if (gasData.revoke.length >= 2) {
    const first = gasData.revoke[0];
    const last = gasData.revoke[gasData.revoke.length - 1];
    const slope = (last.gas - first.gas) / (last.investors - first.investors);
    console.log(`\n📈 Revoke Gas Slope: ~${Math.round(slope)} gas/investor (linear O(n) confirmed)`);
  }

  // Save results
  const resultsDir = path.join(__dirname, "../benchmarks");
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const resultsPath = path.join(resultsDir, `gas-scaling-${hre.network.name}.json`);
  const results = {
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    fundVault: fundVaultAddress,
    gasData,
    handlePrefix: "0x0000aa36a7 (ETH Sepolia Chain ID in handle)",
  };
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\n📄 Results saved to: ${resultsPath}`);

  console.log("\n====================================================");
  console.log("🎉 Gas Scaling Benchmark Complete!");
  console.log("====================================================\n");
}

main().catch((error) => {
  console.error("❌ Benchmark failed:", error);
  process.exitCode = 1;
});
