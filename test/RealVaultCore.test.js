const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RealVault Sovereign Per-User Core Architecture Test", function () {
  let mockUSDC, wrappedUSDC, fundVault, navAggregator, disclosureManager, rebalancerAgent;
  let deployer, investor1, investor2, auditor;

  beforeEach(async function () {
    [deployer, investor1, investor2, auditor] = await ethers.getSigners();

    // Deploy LocalNoxCompute test helper for Hardhat local chain 31337
    const LocalNoxCompute = await ethers.getContractFactory("LocalNoxCompute");
    const localNox = await LocalNoxCompute.deploy();
    await localNox.waitForDeployment();
    const localNoxCode = await ethers.provider.getCode(await localNox.getAddress());
    await ethers.provider.send("hardhat_setCode", [
      "0x75C6AF4430cc474b1bb9b8540b7E46D6f8e1C685",
      localNoxCode,
    ]);

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

    // Link DisclosureManager & NAVAggregator
    await fundVault.setDisclosureManager(await disclosureManager.getAddress());
    await fundVault.setNavAggregator(await navAggregator.getAddress());

    // 6. Deploy RebalancerAgent (Sovereign Per-User)
    const RebalancerAgent = await ethers.getContractFactory("RebalancerAgent");
    rebalancerAgent = await RebalancerAgent.deploy();
    await rebalancerAgent.waitForDeployment();
  });

  describe("Deployment & Core Linkages", function () {
    it("Should correctly initialize MockUSDC with 1,000,000 mUSDC for deployer", async function () {
      const balance = await mockUSDC.balanceOf(deployer.address);
      expect(balance).to.equal(ethers.parseUnits("1000000", 18));
    });

    it("Should set correct token references in FundVault", async function () {
      expect(await fundVault.depositToken()).to.equal(await mockUSDC.getAddress());
      expect(await fundVault.wrappedToken()).to.equal(await wrappedUSDC.getAddress());
    });

    it("Should set satellite contract linkages", async function () {
      expect(await fundVault.disclosureManager()).to.equal(await disclosureManager.getAddress());
      expect(await fundVault.navAggregator()).to.equal(await navAggregator.getAddress());
    });

    it("Should start with 0 investors registered in FundVault", async function () {
      expect(await fundVault.investorCount()).to.equal(0);
      const investors = await fundVault.getInvestors();
      expect(investors.length).to.equal(0);
    });
  });

  describe("Sovereign Per-User Allocation & Multi-Wallet Isolation", function () {
    it("Should allow investor1 to set their own allocation independently", async function () {
      await rebalancerAgent.connect(investor1).setTargetAllocation(7000, 3000);
      expect(await rebalancerAgent.userTargetAllocA(investor1.address)).to.equal(7000);
      expect(await rebalancerAgent.userTargetAllocB(investor1.address)).to.equal(3000);
    });

    it("Should isolate allocations between investor1 and investor2", async function () {
      await rebalancerAgent.connect(investor1).setTargetAllocation(8000, 2000);
      await rebalancerAgent.connect(investor2).setTargetAllocation(3000, 7000);

      expect(await rebalancerAgent.userTargetAllocA(investor1.address)).to.equal(8000);
      expect(await rebalancerAgent.userTargetAllocB(investor1.address)).to.equal(2000);

      expect(await rebalancerAgent.userTargetAllocA(investor2.address)).to.equal(3000);
      expect(await rebalancerAgent.userTargetAllocB(investor2.address)).to.equal(7000);
    });
  });

  describe("Sovereign Per-Investor DisclosureManager ACL", function () {
    it("Should allow investor1 to manage their own auditor ACL without admin intervention", async function () {
      expect(await disclosureManager.isActiveAuditorFor(investor1.address, auditor.address)).to.equal(false);
      
      // investor1 grants access to auditor over their own position handle
      await disclosureManager.connect(investor1).grantAuditorAccess(auditor.address);
      expect(await disclosureManager.isActiveAuditorFor(investor1.address, auditor.address)).to.equal(true);

      // investor1's auditor grant does NOT affect investor2
      expect(await disclosureManager.isActiveAuditorFor(investor2.address, auditor.address)).to.equal(false);
    });
  });
});

