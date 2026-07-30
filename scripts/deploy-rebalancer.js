const hre = require("hardhat");

async function main() {
  console.log("\n====================================================");
  console.log("🚀 Deploying Updated Sovereign RebalancerAgent to Sepolia");
  console.log("====================================================\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer Address:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer Balance:", hre.ethers.formatEther(balance), "ETH");

  const RebalancerAgent = await hre.ethers.getContractFactory("RebalancerAgent");
  const rebalancer = await RebalancerAgent.deploy();
  await rebalancer.waitForDeployment();
  const address = await rebalancer.getAddress();

  console.log("\n✅ Sovereign RebalancerAgent deployed at:", address);
  console.log("====================================================\n");
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exitCode = 1;
});
