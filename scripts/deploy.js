const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n====================================================");
  console.log("🚀 RealVault — Deployment Script");
  console.log("   Network:", hre.network.name);
  console.log("====================================================\n");

  const [deployer] = await hre.ethers.getSigners();
  if (deployer) {
    const balance = await hre.ethers.provider.getBalance(deployer.address);
    console.log("   Deployer Address:", deployer.address);
    console.log("   Deployer Balance:", hre.ethers.formatEther(balance), "ETH");
  } else {
    console.log("⚠️ No deployer signer found. Please check PRIVATE_KEY in .env");
  }

  // 1. Deploy MockUSDC
  console.log("\n[1/5] Deploying MockUSDC...");
  const MockUSDC = await hre.ethers.getContractFactory("MockUSDC");
  const mockUSDC = await MockUSDC.deploy();
  await mockUSDC.waitForDeployment();
  const mockUSDCAddress = await mockUSDC.getAddress();
  console.log("   ✅ MockUSDC deployed at:", mockUSDCAddress);

  // 2. Deploy WrappedUSDC (ERC20ToERC7984Wrapper)
  console.log("\n[2/5] Deploying WrappedUSDC (wcUSDC ERC-7984)...");
  const WrappedUSDC = await hre.ethers.getContractFactory("WrappedUSDC");
  const wrappedUSDC = await WrappedUSDC.deploy(mockUSDCAddress);
  await wrappedUSDC.waitForDeployment();
  const wrappedUSDCAddress = await wrappedUSDC.getAddress();
  console.log("   ✅ WrappedUSDC deployed at:", wrappedUSDCAddress);

  // 3. Deploy FundVault
  console.log("\n[3/5] Deploying FundVault...");
  const FundVault = await hre.ethers.getContractFactory("FundVault");
  const fundVault = await FundVault.deploy(mockUSDCAddress, wrappedUSDCAddress);
  await fundVault.waitForDeployment();
  const fundVaultAddress = await fundVault.getAddress();
  console.log("   ✅ FundVault deployed at:", fundVaultAddress);

  // 4. Deploy NAVAggregator
  console.log("\n[4/5] Deploying NAVAggregator...");
  const NAVAggregator = await hre.ethers.getContractFactory("NAVAggregator");
  const navAggregator = await NAVAggregator.deploy(fundVaultAddress);
  await navAggregator.waitForDeployment();
  const navAggregatorAddress = await navAggregator.getAddress();
  console.log("   ✅ NAVAggregator deployed at:", navAggregatorAddress);

  // 5. Deploy DisclosureManager
  console.log("\n[5/5] Deploying DisclosureManager...");
  const DisclosureManager = await hre.ethers.getContractFactory("DisclosureManager");
  const disclosureManager = await DisclosureManager.deploy(fundVaultAddress);
  await disclosureManager.waitForDeployment();
  const disclosureManagerAddress = await disclosureManager.getAddress();
  console.log("   ✅ DisclosureManager deployed at:", disclosureManagerAddress);

  // Link DisclosureManager to FundVault
  console.log("\n🔗 Setting DisclosureManager in FundVault...");
  const txLink = await fundVault.setDisclosureManager(disclosureManagerAddress);
  await txLink.wait();
  console.log("   ✅ FundVault.setDisclosureManager completed!");

  // Link NAVAggregator to FundVault
  console.log("\n🔗 Setting NAVAggregator in FundVault...");
  const txNav = await fundVault.setNavAggregator(navAggregatorAddress);
  await txNav.wait();
  console.log("   ✅ FundVault.setNavAggregator completed!");

  // 6. Deploy RebalancerAgent
  console.log("\n[Bonus] Deploying RebalancerAgent (60/40 target)...");
  const RebalancerAgent = await hre.ethers.getContractFactory("RebalancerAgent");
  const rebalancerAgent = await RebalancerAgent.deploy(6000, 4000);
  await rebalancerAgent.waitForDeployment();
  const rebalancerAgentAddress = await rebalancerAgent.getAddress();
  console.log("   ✅ RebalancerAgent deployed at:", rebalancerAgentAddress);

  // Save deployed addresses JSON artifact
  const deploymentInfo = {
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    deployer: deployer ? deployer.address : null,
    timestamp: new Date().toISOString(),
    contracts: {
      MockUSDC: mockUSDCAddress,
      WrappedUSDC: wrappedUSDCAddress,
      FundVault: fundVaultAddress,
      NAVAggregator: navAggregatorAddress,
      DisclosureManager: disclosureManagerAddress,
      RebalancerAgent: rebalancerAgentAddress,
    },
  };

  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const outputPath = path.join(deploymentsDir, `${hre.network.name}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));
  console.log("\n📄 Deployment manifest saved to:", outputPath);

  console.log("\n====================================================");
  console.log("🎉 RealVault Core Contracts Deployment Complete!");
  console.log("====================================================\n");
}

main().catch((error) => {
  console.error("❌ Deployment failed:", error);
  process.exitCode = 1;
});
