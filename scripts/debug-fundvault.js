const hre = require("hardhat");

async function main() {
  console.log("\n====================================================");
  console.log("🔍 Debugging FundVault Authorization");
  console.log("====================================================\n");

  const fundVaultAddress = "0xE97e5d50634A3CAb3361fD91858E89B0b716Afd0";
  const rwaPerpEngineAddress = "0x0C1FADE8e9F997bda451b11Fa3852836233Fcc1C";

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Get FundVault instance
  const fundVault = await hre.ethers.getContractAt("FundVault", fundVaultAddress);

  // Try to read initialDeployer (as public state variable)
  try {
    const initialDeployer = await fundVault.initialDeployer();
    console.log("FundVault initialDeployer:", initialDeployer);
  } catch (error) {
    console.log("❌ Cannot read initialDeployer:", error.message);
  }

  // Try to check if already authorized
  try {
    const isAuthorized = await fundVault.authorizedContracts(rwaPerpEngineAddress);
    console.log("RwaPerpEngine already authorized:", isAuthorized);
  } catch (error) {
    console.log("❌ Cannot read authorizedContracts:", error.message);
  }

  // Try to call setAuthorizedContract with gas estimation
  try {
    console.log("\nEstimating gas for setAuthorizedContract...");
    const gasEstimate = await fundVault.setAuthorizedContract.estimateGas(rwaPerpEngineAddress, true);
    console.log("Gas estimate:", gasEstimate.toString());
  } catch (error) {
    console.log("❌ Gas estimation failed:", error.message);
    
    // Try to get the revert reason
    try {
      await fundVault.setAuthorizedContract.staticCall(rwaPerpEngineAddress, true);
    } catch (staticError) {
      console.log("❌ Static call error:", staticError);
    }
  }

  console.log("\n====================================================\n");
}

main().catch((error) => {
  console.error("❌ Debug failed:", error);
  process.exitCode = 1;
});
