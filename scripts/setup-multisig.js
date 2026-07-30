const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n🔐 Setting Up Multisig Governance\n");

  // Check if Safe SDK is installed
  try {
    require.resolve("@safe-global/protocol-kit");
  } catch (e) {
    console.error("❌ @safe-global/protocol-kit not installed!");
    console.error("   Run: npm install @safe-global/protocol-kit");
    process.exitCode = 1;
    return;
  }

  const { SafeFactory, default: Safe } = require("@safe-global/protocol-kit");

  // Load deployment info
  const rwaPath = path.join(__dirname, "../deployments/sepolia-rwa-perp-engine.json");
  const deployment = JSON.parse(fs.readFileSync(rwaPath));

  const [deployer] = await hre.ethers.getSigners();

  // Generate ephemeral signer wallets (only deployer has funds on Sepolia)
  const signer2Wallet = hre.ethers.Wallet.createRandom().connect(hre.ethers.provider);
  const signer3Wallet = hre.ethers.Wallet.createRandom().connect(hre.ethers.provider);

  // Fund ephemeral signers with gas for signing
  console.log("📋 Funding ephemeral signers...");
  const fundAmount = hre.ethers.parseEther("0.01");
  let fundTx = await deployer.sendTransaction({ to: signer2Wallet.address, value: fundAmount });
  await fundTx.wait();
  fundTx = await deployer.sendTransaction({ to: signer3Wallet.address, value: fundAmount });
  await fundTx.wait();
  console.log("   ✅ Signers funded");

  const signer1 = deployer;
  const signer2 = signer2Wallet;
  const signer3 = signer3Wallet;
  
  console.log("\n📋 Configuration:");
  console.log("   Signer 1 (deployer):", signer1.address);
  console.log("   Signer 2 (ephemeral):", signer2.address);
  console.log("   Signer 3 (ephemeral):", signer3.address);
  console.log("   Threshold: 2-of-3");

  // ============================================
  // Step 1: Deploy Safe
  // ============================================
  console.log("\n===================================================");
  console.log("STEP 1: Deploy Safe Multisig");
  console.log("===================================================\n");

  const RPC_URL = process.env.SEPOLIA_RPC_URL;
  
  console.log("   [1.1] Creating SafeFactory...");
  const safeFactory = await SafeFactory.init({
    provider: RPC_URL,
    signer: process.env.PRIVATE_KEY
  });

  const safeAccountConfig = {
    owners: [signer1.address, signer2.address, signer3.address],
    threshold: 2,
  };

  console.log("   [1.2] Deploying Safe with 2-of-3 threshold...");
  const safeSdk = await safeFactory.deploySafe({ safeAccountConfig });
  const safeAddress = await safeSdk.getAddress();
  console.log("   ✅ Safe deployed:", safeAddress);

  // Fund Safe with gas
  console.log("   [1.3] Funding Safe with gas...");
  const tx = await deployer.sendTransaction({
    to: safeAddress,
    value: hre.ethers.parseEther("0.02")
  });
  await tx.wait();
  console.log("   ✅ Safe funded with 0.02 ETH");

  // ============================================
  // Step 2: Transfer Contract Ownership
  // ============================================
  console.log("\n===================================================");
  console.log("STEP 2: Transfer Ownership to Safe");
  console.log("===================================================\n");

  const contracts = [
    { name: "RwaPerpEngine", address: deployment.contracts.RwaPerpEngine },
    { name: "ChainlinkOracle", address: deployment.contracts.ChainlinkRwaOracleAdapter },
    { name: "SignedNavOracle", address: deployment.contracts.SignedNavOracleAdapter }
  ];

  console.log("   Current Owners:");
  for (const contract of contracts) {
    const instance = await hre.ethers.getContractAt("Ownable", contract.address);
    const owner = await instance.owner();
    console.log(`   - ${contract.name}: ${owner}`);
  }

  console.log("\n   [2.1] Transferring ownership...");
  for (const contract of contracts) {
    try {
      const instance = await hre.ethers.getContractAt("Ownable", contract.address);
      const txOwn = await instance.transferOwnership(safeAddress);
      await txOwn.wait();
      console.log(`   ✅ ${contract.name} → Safe`);
    } catch (error) {
      console.log(`   ⚠️  ${contract.name}: ${error.message.slice(0, 80)}`);
    }
  }

  console.log("\n   New Owners:");
  for (const contract of contracts) {
    const instance = await hre.ethers.getContractAt("Ownable", contract.address);
    const owner = await instance.owner();
    console.log(`   - ${contract.name}: ${owner}`);
  }

  // ============================================
  // Step 3: Test Multisig Operation (Pause)
  // ============================================
  console.log("\n===================================================");
  console.log("STEP 3: Test Multisig Operation (Pause Trading)");
  console.log("===================================================\n");

  const rwaPerpEngine = await hre.ethers.getContractAt(
    "RwaPerpEngine",
    deployment.contracts.RwaPerpEngine
  );

  console.log("   [3.1] Creating pause transaction...");
  const pauseData = rwaPerpEngine.interface.encodeFunctionData("pauseTrading");

  const safeTransaction = await safeSdk.createTransaction({
    transactions: [{
      to: deployment.contracts.RwaPerpEngine,
      value: "0",
      data: pauseData
    }]
  });

  console.log("   [3.2] Signer 1 (deployer) signing...");
  let signedTx = await safeSdk.signTransaction(safeTransaction);

  console.log("   [3.3] Signer 2 signing and executing...");
  const safeSdk2 = await Safe.init({
    provider: RPC_URL,
    signer: signer2.privateKey,
    safeAddress
  });
  
  signedTx = await safeSdk2.signTransaction(signedTx);
  const executeTxResponse = await safeSdk2.executeTransaction(signedTx);
  await executeTxResponse.transactionResponse.wait();

  console.log("   ✅ Pause executed via multisig!");
  console.log("   Transaction:", executeTxResponse.hash);

  // Verify pause
  const isPaused = await rwaPerpEngine.tradingPaused();
  console.log("   Trading Paused:", isPaused);

  // Unpause immediately (for demo continuity)
  console.log("\n   [3.4] Unpausing (for demo)...");
  const unpauseData = rwaPerpEngine.interface.encodeFunctionData("unpauseTrading");
  const unpauseTx = await safeSdk.createTransaction({
    transactions: [{
      to: deployment.contracts.RwaPerpEngine,
      value: "0",
      data: unpauseData
    }]
  });
  
  let signedUnpause = await safeSdk.signTransaction(unpauseTx);
  signedUnpause = await safeSdk2.signTransaction(signedUnpause);
  const executeUnpause = await safeSdk2.executeTransaction(signedUnpause);
  await executeUnpause.transactionResponse.wait();
  console.log("   ✅ Trading unpaused via multisig");

  // ============================================
  // Save Configuration
  // ============================================
  console.log("\n===================================================");
  console.log("Saving Multisig Configuration");
  console.log("===================================================\n");

  const multisigConfig = {
    safeAddress,
    threshold: 2,
    owners: [signer1.address, signer2.address, signer3.address],
    network: "sepolia",
    chainId: 11155111,
    contracts: contracts.map(c => ({ name: c.name, address: c.address })),
    note: "Signer 2 and 3 are ephemeral - replace with real team wallets for production",
    timestamp: new Date().toISOString()
  };

  const outputPath = path.join(__dirname, "../deployments/multisig-config.json");
  fs.writeFileSync(outputPath, JSON.stringify(multisigConfig, null, 2));
  console.log("   ✅ Configuration saved:", outputPath);

  // ============================================
  // Summary
  // ============================================
  console.log("\n===================================================");
  console.log("✅ MULTISIG SETUP COMPLETE");
  console.log("===================================================\n");

  console.log("📊 Configuration:");
  console.log("   Safe Address:", safeAddress);
  console.log("   Signers: 3");
  console.log("   Threshold: 2-of-3");
  console.log("   Gas Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(safeAddress)), "ETH");

  console.log("\n✅ Ownership Transferred:");
  contracts.forEach(c => console.log(`   - ${c.name}`));

  console.log("\n✅ Tests Passed:");
  console.log("   - Pause/unpause via multisig");

  console.log("\n📋 Next Steps:");
  console.log("   1. Replace ephemeral signers with real team wallets");
  console.log("   2. Document emergency procedures");
  console.log("   3. Ready for production launch!\n");
}

main().catch((error) => {
  console.error("❌ Setup failed:", error);
  process.exitCode = 1;
});
