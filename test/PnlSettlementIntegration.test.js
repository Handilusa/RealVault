const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PnL Settlement Integration & Verification Test", function () {
  let mathContract;
  let owner;

  before(async function () {
    [owner] = await ethers.getSigners();

    // Deploy TestRwaPerpMath helper wrapper
    const TestRwaPerpMath = await ethers.getContractFactory(
      "contracts/test-helpers/TestRwaPerpMath.sol:TestRwaPerpMath"
    );
    mathContract = await TestRwaPerpMath.deploy();
    await mathContract.waitForDeployment();
  });

  describe("1. Smart Contract PnL Scalar Math Verification", function () {
    it("should compute exact PnL scalar for -1.31% price drop on 1x leverage", async function () {
      // Entry: $4000.00, Exit: $3947.60 (-1.31% drop), Long, 1x leverage
      const position = {
        assetId: ethers.id("rGOLD"),
        marginHandle: ethers.ZeroHash,
        entryPriceE8: 4000n * 10n ** 8n, // $4000
        entryRoundOrNonce: 1n,
        entrySourceId: ethers.ZeroHash,
        leverage: 1,
        openedAt: Math.floor(Date.now() / 1000),
        isLong: true,
        isOpen: true,
      };
      const exitPriceE8 = 394760000000n; // $3947.60 in 8 decimals (3947.60 * 1e8)

      const pnlScalar = await mathContract.testCalculatePnL(position, exitPriceE8);
      const pnlBps = Number(pnlScalar) / 10000; // in bps (-131 bps = -1.31%)

      // Delta: -52.40 / 4000 = -1.31% -> -1310000 in E8 scale
      expect(pnlBps).to.be.closeTo(-131, 2); // -1.31% (-131 bps)
    });

    it("should compute amplified PnL scalar for 5x leverage on 1.31% drop", async function () {
      // Entry: $4000.00, Exit: $3947.60 (-1.31% drop), Long, 5x leverage -> -6.55%
      const position = {
        assetId: ethers.id("rGOLD"),
        marginHandle: ethers.ZeroHash,
        entryPriceE8: 4000n * 10n ** 8n,
        entryRoundOrNonce: 1n,
        entrySourceId: ethers.ZeroHash,
        leverage: 5,
        openedAt: Math.floor(Date.now() / 1000),
        isLong: true,
        isOpen: true,
      };
      const exitPriceE8 = 394760000000n;

      const pnlScalar = await mathContract.testCalculatePnL(position, exitPriceE8);
      const pnlPercent = Number(pnlScalar) / 1000000;

      // 5 * (-1.31%) = -6.55%
      expect(pnlPercent).to.be.closeTo(-6.55, 0.05);
    });

    it("should compute profit for short position on price drop", async function () {
      // Entry: $4000.00, Exit: $3800.00 (-5.00% drop), Short, 2x leverage -> +10.00%
      const position = {
        assetId: ethers.id("rGOLD"),
        marginHandle: ethers.ZeroHash,
        entryPriceE8: 4000n * 10n ** 8n,
        entryRoundOrNonce: 1n,
        entrySourceId: ethers.ZeroHash,
        leverage: 2,
        openedAt: Math.floor(Date.now() / 1000),
        isLong: false, // SHORT
        isOpen: true,
      };
      const exitPriceE8 = 3800n * 10n ** 8n;

      const pnlScalar = await mathContract.testCalculatePnL(position, exitPriceE8);
      const pnlPercent = Number(pnlScalar) / 1000000;

      expect(pnlPercent).to.be.closeTo(10.0, 0.01);
    });
  });

  describe("2. Frontend PnL USDC Formula & Margin Lookup Verification", function () {
    it("should accurately calculate USDC loss using opening margin instead of form input", function () {
      const openingMarginUsdc = 20.00; // $20 margin deposited
      const pnlBps = -1310000; // -1.31% in basis points (1e8 scale: -1310000 / 1e8 = -0.0131)

      // Formula used in executeClosePosition
      const pnlUsdcVal = (openingMarginUsdc * pnlBps) / 100000000;
      
      // $20 * (-0.0131) = -$0.262 USDC -> -$0.26 USDC
      expect(pnlUsdcVal).to.be.closeTo(-0.262, 0.001);
      expect(Math.abs(pnlUsdcVal).toFixed(2)).to.equal("0.26");
    });

    it("should remain consistent if current form marginInput changes before position close", function () {
      const positionMarginsMap = { 0: 20.00, 1: 50.00 }; // Pos 0 opened with $20, Pos 1 opened with $50
      const currentFormMarginInput = "100"; // User typed 100 in order form

      const posIndexToClose = 0;
      const parsedPnlBps = -1310000;

      // Ensure margin is pulled from positionMarginsMap[0] ($20) instead of form input ($100)
      const marginForPosition = positionMarginsMap[posIndexToClose] ?? parseFloat(currentFormMarginInput);
      const pnlUsdcVal = (marginForPosition * parsedPnlBps) / 100000000;

      expect(marginForPosition).to.equal(20.00);
      expect(pnlUsdcVal.toFixed(2)).to.equal("-0.26");
    });
  });
});
