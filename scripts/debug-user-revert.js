const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { createViemHandleClient } = require("@iexec-nox/handle");
const { createWalletClient, http } = require("viem");
const { sepolia } = require("viem/chains");
const { privateKeyToAccount } = require("viem/accounts");

async function main() {
  console.log("\n====================================================");
  console.log("🐛 Debugging openPosition Revert Data");
  console.log("   Network:", hre.network.name);
  console.log("====================================================\n");

  const rwaDeployments = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../deployments/sepolia-rwa-perp-engine.json"))
  );
  const engineAddress = rwaDeployments.contracts.RwaPerpEngine;
  const fundVaultAddress = rwaDeployments.contracts.FundVault;

  const testUserPrivateKey = process.env.TEST_USER_PRIVATE_KEY || process.env.PRIVATE_KEY;
  const testUserAccount = privateKeyToAccount(testUserPrivateKey);
  const [deployer] = await hre.ethers.getSigners();

  console.log("   Engine Address:", engineAddress);
  console.log("   User Address:", deployer.address);

  // Check if deployer has deposited in FundVault
  const fundVault = await hre.ethers.getContractAt("FundVault", fundVaultAddress);
  const isInvestor = await fundVault.isInvestor(deployer.address);
  console.log("   User isInvestor in FundVault:", isInvestor);

  const posHandle = await fundVault.getPosition(deployer.address);
  console.log("   User FundVault handle:", posHandle.toString());

  const engine = await hre.ethers.getContractAt("RwaPerpEngine", engineAddress);
  const ASSET_ID_RGOLD = hre.ethers.id("rGOLD");

  // Generate proof
  const testUserWalletClient = createWalletClient({
    account: testUserAccount,
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL)
  });
  const handleClient = await createViemHandleClient(testUserWalletClient);

  const margin = hre.ethers.parseUnits("20", 6);
  const { handle: marginHandle, handleProof: marginProof } = await handleClient.encryptInput(
    margin,
    "uint256",
    engineAddress
  );

  console.log("\nSimulating openPosition for deployer...");
  try {
    const tx = await engine.openPosition.populateTransaction(
      ASSET_ID_RGOLD,
      marginHandle,
      marginProof,
      5, // 5x
      true // Long
    );

    const rawResult = await hre.ethers.provider.call({
      from: deployer.address,
      to: engineAddress,
      data: tx.data
    });
    console.log("✅ Call succeeded! Return data:", rawResult);
  } catch (err) {
    console.log("\n❌ Call reverted!");
    console.log("   Error message:", err.message);
    console.log("   Error code:", err.code);
    console.log("   Error data:", err.data);
    
    if (err.data) {
      const errorHex = err.data;
      console.log("   Error selector (4 bytes):", errorHex.slice(0, 10));

      // Try parsing with engine interface
      try {
        const parsed = engine.interface.parseError(errorHex);
        console.log("   Parsed Error:", parsed.name, parsed.args);
      } catch (e) {
        console.log("   Could not parse with RwaPerpEngine interface");
      }

      // Try parsing with FundVault interface
      try {
        const parsedVault = fundVault.interface.parseError(errorHex);
        console.log("   Parsed FundVault Error:", parsedVault.name, parsedVault.args);
      } catch (e) {
        console.log("   Could not parse with FundVault interface");
      }
    }
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exitCode = 1;
});
