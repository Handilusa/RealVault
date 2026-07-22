const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RealVault Core Contracts Architecture Test", function () {
  let mockUSDC, wrappedUSDC, fundVault, navAggregator, disclosureManager, rebalancerAgent;
  let owner, investor1, investor2, auditor;

  beforeEach(async function () {
    [owner, investor1, investor2, auditor] = await ethers.getSigners();

    // 1. Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDC.deploy();
    await mockUSDC.waitForDeployment();

    // 2. Deploy WrappedUSDC
    const WrappedUSDC = await ethers.getContractFactory("WrappedUSDC");
    wrappedUSDC = await WrappedUSDC.deploy(await mockUSDC.getAddress());
    await wrappedUSDC.waitForDeployment();

    // 3. Deploy FundVault
    const FundVault = await ethers.getContractFactory("FundVault");
    fundVault = await FundVault.deploy(await mockUSDC.getAddress(), await wrappedUSDC.getAddress());
    await fundVault.waitForDeployment();

    // 4. Deploy NAVAggregator
    const NAVAggregator = await ethers.getContractFactory("NAVAggregator");
    navAggregator = await NAVAggregator.deploy(await fundVault.getAddress());
    await navAggregator.waitForDeployment();

    // 5. Deploy DisclosureManager
    const DisclosureManager = await ethers.getContractFactory("DisclosureManager");
    disclosureManager = await DisclosureManager.deploy(await fundVault.getAddress());
    await disclosureManager.waitForDeployment();

    // Link DisclosureManager
    await fundVault.setDisclosureManager(await disclosureManager.getAddress());

    // 6. Deploy RebalancerAgent
    const RebalancerAgent = await ethers.getContractFactory("RebalancerAgent");
    rebalancerAgent = await RebalancerAgent.deploy(6000, 4000);
    await rebalancerAgent.waitForDeployment();
  });

  describe("Deployment & Configuration", function () {
    it("Should correctly initialize MockUSDC with 1,000,000 mUSDC", async function () {
      const balance = await mockUSDC.balanceOf(owner.address);
      expect(balance).to.equal(ethers.parseUnits("1000000", 18));
    });

    it("Should set correct deposit and wrapped token addresses in FundVault", async function () {
      expect(await fundVault.depositToken()).to.equal(await mockUSDC.getAddress());
      expect(await fundVault.wrappedToken()).to.equal(await wrappedUSDC.getAddress());
    });

    it("Should configure DisclosureManager address in FundVault", async function () {
      expect(await fundVault.disclosureManager()).to.equal(await disclosureManager.getAddress());
    });

    it("Should initialize RebalancerAgent with 60/40 allocation targets", async function () {
      expect(await rebalancerAgent.targetAllocationA()).to.equal(6000);
      expect(await rebalancerAgent.targetAllocationB()).to.equal(4000);
    });

    it("Should start with 0 investors in FundVault", async function () {
      expect(await fundVault.investorCount()).to.equal(0);
      const investors = await fundVault.getInvestors();
      expect(investors.length).to.equal(0);
    });
  });

  describe("DisclosureManager Roles", function () {
    it("Should prevent non-admin from changing target allocation in RebalancerAgent", async function () {
      await expect(
        rebalancerAgent.connect(investor1).setTargetAllocation(5000, 5000)
      ).to.be.revertedWith("RebalancerAgent: caller is not admin");
    });

    it("Should allow admin to update target allocation", async function () {
      await rebalancerAgent.setTargetAllocation(5000, 5000);
      expect(await rebalancerAgent.targetAllocationA()).to.equal(5000);
      expect(await rebalancerAgent.targetAllocationB()).to.equal(5000);
    });
  });
});
