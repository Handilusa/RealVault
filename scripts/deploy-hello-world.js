const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying ConfidentialPiggyBank (Hello World) to network:", hre.network.name);

  const [deployer] = await hre.ethers.getSigners();
  if (deployer) {
    console.log("   Deployer account:", deployer.address);
    console.log("   Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());
  } else {
    console.log("   ⚠️ No deployer account found (check PRIVATE_KEY in .env if deploying to Sepolia)");
  }

  const Factory = await hre.ethers.getContractFactory("ConfidentialPiggyBank");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("✅ ConfidentialPiggyBank deployed at:", address);
  console.log("   Verify on Explorer: https://sepolia.etherscan.io/address/" + address);
}

main().catch((error) => {
  console.error("❌ Deployment failed:", error);
  process.exitCode = 1;
});
