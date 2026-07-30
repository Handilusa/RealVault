const hre = require("hardhat");
require("dotenv").config();

async function main() {
  console.log("\n🔑 Deployer Address Information\n");
  
  const [deployer] = await hre.ethers.getSigners();
  
  if (!deployer) {
    console.log("❌ No deployer wallet found. Check PRIVATE_KEY in .env");
    return;
  }

  console.log("📍 Deployer Address:", deployer.address);
  
  // Check current balance
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  const balanceETH = hre.ethers.formatEther(balance);
  
  console.log("💰 Current Balance:", balanceETH, "ETH");
  
  if (parseFloat(balanceETH) < 0.5) {
    console.log("\n⚠️  Warning: Low balance for deployment");
    console.log("   Recommended: 0.5 ETH for deployment + gas");
    console.log("\n📥 Get Sepolia testnet ETH from faucets:");
    console.log("   • https://sepoliafaucet.com");
    console.log("   • https://www.alchemy.com/faucets/ethereum-sepolia");
    console.log("   • https://sepolia-faucet.pk910.de");
  } else {
    console.log("\n✅ Sufficient balance for deployment");
  }
  
  console.log("\n");
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exitCode = 1;
});
