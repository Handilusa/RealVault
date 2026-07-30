const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("ChainlinkRwaOracleAdapter", function () {
  let adapter;
  let mockFeed;
  let owner;
  let nonOwner;
  
  const ASSET_ID_RGOLD = ethers.keccak256(ethers.toUtf8Bytes("rGOLD"));
  const HEARTBEAT_1_HOUR = 3600;
  const GOLD_PRICE_E8 = 185050000000n; // $1,850.50 in 8 decimals

  beforeEach(async function () {
    [owner, nonOwner] = await ethers.getSigners();

    // Deploy mock Chainlink aggregator
    const MockChainlinkAggregator = await ethers.getContractFactory("MockChainlinkAggregator");
    mockFeed = await MockChainlinkAggregator.deploy(8, "XAU / USD");
    await mockFeed.waitForDeployment();

    // Deploy ChainlinkRwaOracleAdapter
    const ChainlinkRwaOracleAdapter = await ethers.getContractFactory("ChainlinkRwaOracleAdapter");
    adapter = await ChainlinkRwaOracleAdapter.deploy(owner.address);
    await adapter.waitForDeployment();
  });

  describe("Deployment", function () {
    it("should set the correct owner", async function () {
      expect(await adapter.owner()).to.equal(owner.address);
    });
  });

  describe("configureFeed (Task 3.1 - Requirements 4.1, 4.2)", function () {
    it("should allow owner to configure a feed", async function () {
      await expect(
        adapter.configureFeed(ASSET_ID_RGOLD, await mockFeed.getAddress(), HEARTBEAT_1_HOUR)
      )
        .to.emit(adapter, "FeedConfigured")
        .withArgs(ASSET_ID_RGOLD, await mockFeed.getAddress(), HEARTBEAT_1_HOUR);

      expect(await adapter.getFeedAddress(ASSET_ID_RGOLD)).to.equal(await mockFeed.getAddress());
      expect(await adapter.getHeartbeat(ASSET_ID_RGOLD)).to.equal(HEARTBEAT_1_HOUR);
    });

    it("should revert when non-owner tries to configure feed", async function () {
      await expect(
        adapter.connect(nonOwner).configureFeed(ASSET_ID_RGOLD, await mockFeed.getAddress(), HEARTBEAT_1_HOUR)
      ).to.be.revertedWithCustomError(adapter, "OwnableUnauthorizedAccount");
    });

    it("should revert when feed address is zero", async function () {
      await expect(
        adapter.configureFeed(ASSET_ID_RGOLD, ethers.ZeroAddress, HEARTBEAT_1_HOUR)
      ).to.be.revertedWithCustomError(adapter, "InvalidFeedAddress");
    });

    it("should revert when heartbeat is zero", async function () {
      await expect(
        adapter.configureFeed(ASSET_ID_RGOLD, await mockFeed.getAddress(), 0)
      ).to.be.revertedWithCustomError(adapter, "InvalidHeartbeat");
    });

    it("should allow updating existing feed configuration", async function () {
      // Configure initial feed
      await adapter.configureFeed(ASSET_ID_RGOLD, await mockFeed.getAddress(), HEARTBEAT_1_HOUR);

      // Update with new heartbeat
      const newHeartbeat = 7200; // 2 hours
      await expect(
        adapter.configureFeed(ASSET_ID_RGOLD, await mockFeed.getAddress(), newHeartbeat)
      )
        .to.emit(adapter, "FeedConfigured")
        .withArgs(ASSET_ID_RGOLD, await mockFeed.getAddress(), newHeartbeat);

      expect(await adapter.getHeartbeat(ASSET_ID_RGOLD)).to.equal(newHeartbeat);
    });
  });

  describe("latestPrice - Valid Price Data (Task 3.2)", function () {
    beforeEach(async function () {
      // Configure feed
      await adapter.configureFeed(ASSET_ID_RGOLD, await mockFeed.getAddress(), HEARTBEAT_1_HOUR);
    });

    it("should return valid price when all checks pass (Requirements 4.3-4.9)", async function () {
      const currentTime = await time.latest();
      const roundId = 100n;
      const answeredInRound = 100n;

      // Set valid round data
      await mockFeed.updateRoundData(
        roundId,
        GOLD_PRICE_E8,
        currentTime,
        answeredInRound
      );

      const result = await adapter.latestPrice(ASSET_ID_RGOLD);
      
      // Verify return values
      expect(result.priceE8).to.equal(GOLD_PRICE_E8);
      expect(result.updatedAt).to.equal(currentTime);
      
      // Verify sourceId is feed address encoded as bytes32
      const expectedSourceId = ethers.zeroPadValue(
        ethers.toBeHex(await mockFeed.getAddress()),
        32
      );
      expect(result.sourceId).to.equal(expectedSourceId);
      
      expect(result.confidence).to.equal(95);
      expect(result.settlementEnabled).to.be.true;
    });

    it("should handle feed with 18 decimals and convert to 8 decimals", async function () {
      // Deploy feed with 18 decimals
      const MockChainlinkAggregator = await ethers.getContractFactory("MockChainlinkAggregator");
      const feed18Decimals = await MockChainlinkAggregator.deploy(18, "TEST / USD");
      await feed18Decimals.waitForDeployment();

      // Configure adapter with 18-decimal feed
      const assetIdTest = ethers.keccak256(ethers.toUtf8Bytes("rTEST"));
      await adapter.configureFeed(assetIdTest, await feed18Decimals.getAddress(), HEARTBEAT_1_HOUR);

      const currentTime = await time.latest();
      const priceE18 = ethers.parseEther("1850.50"); // 18 decimals
      
      await feed18Decimals.updateRoundData(100n, priceE18, currentTime, 100n);

      const result = await adapter.latestPrice(assetIdTest);
      
      // Should convert 18 decimals to 8 decimals
      const expectedPriceE8 = 185050000000n; // $1,850.50 in 8 decimals
      expect(result.priceE8).to.equal(expectedPriceE8);
      expect(result.settlementEnabled).to.be.true;
    });

    it("should handle feed with 6 decimals and convert to 8 decimals", async function () {
      // Deploy feed with 6 decimals (like USDC price feeds)
      const MockChainlinkAggregator = await ethers.getContractFactory("MockChainlinkAggregator");
      const feed6Decimals = await MockChainlinkAggregator.deploy(6, "USDC / USD");
      await feed6Decimals.waitForDeployment();

      // Configure adapter with 6-decimal feed
      const assetIdUsdc = ethers.keccak256(ethers.toUtf8Bytes("rUSDC"));
      await adapter.configureFeed(assetIdUsdc, await feed6Decimals.getAddress(), HEARTBEAT_1_HOUR);

      const currentTime = await time.latest();
      const priceE6 = 1000000n; // $1.00 in 6 decimals
      
      await feed6Decimals.updateRoundData(100n, priceE6, currentTime, 100n);

      const result = await adapter.latestPrice(assetIdUsdc);
      
      // Should convert 6 decimals to 8 decimals
      const expectedPriceE8 = 100000000n; // $1.00 in 8 decimals
      expect(result.priceE8).to.equal(expectedPriceE8);
      expect(result.settlementEnabled).to.be.true;
    });
  });

  describe("latestPrice - Validation Failures (Task 3.2)", function () {
    beforeEach(async function () {
      await adapter.configureFeed(ASSET_ID_RGOLD, await mockFeed.getAddress(), HEARTBEAT_1_HOUR);
    });

    it("should return settlementEnabled=false when feed not configured", async function () {
      const unconfiguredAsset = ethers.keccak256(ethers.toUtf8Bytes("UNCONFIGURED"));
      
      const result = await adapter.latestPrice(unconfiguredAsset);
      
      expect(result.priceE8).to.equal(0);
      expect(result.updatedAt).to.equal(0);
      expect(result.sourceId).to.equal(ethers.ZeroHash);
      expect(result.confidence).to.equal(0);
      expect(result.settlementEnabled).to.be.false;
    });

    it("should reject zero price (Requirement 4.4)", async function () {
      const currentTime = await time.latest();
      
      // Set price to 0
      await mockFeed.updateRoundData(100n, 0n, currentTime, 100n);

      const result = await adapter.latestPrice(ASSET_ID_RGOLD);
      
      expect(result.priceE8).to.equal(0);
      expect(result.settlementEnabled).to.be.false;
    });

    it("should reject negative price (Requirement 4.4)", async function () {
      const currentTime = await time.latest();
      
      // Set negative price
      await mockFeed.updateRoundData(100n, -100000000n, currentTime, 100n);

      const result = await adapter.latestPrice(ASSET_ID_RGOLD);
      
      expect(result.priceE8).to.equal(0);
      expect(result.settlementEnabled).to.be.false;
    });

    it("should reject stale round data - answeredInRound < roundId (Requirement 4.5)", async function () {
      const currentTime = await time.latest();
      const roundId = 100n;
      const answeredInRound = 99n; // Stale: answered in earlier round
      
      await mockFeed.updateRoundData(
        roundId,
        GOLD_PRICE_E8,
        currentTime,
        answeredInRound
      );

      const result = await adapter.latestPrice(ASSET_ID_RGOLD);
      
      expect(result.priceE8).to.equal(0);
      expect(result.settlementEnabled).to.be.false;
    });

    it("should reject invalid round - answeredInRound = 0 (Requirement 4.6)", async function () {
      const currentTime = await time.latest();
      const roundId = 100n;
      const answeredInRound = 0n; // Invalid round
      
      await mockFeed.updateRoundData(
        roundId,
        GOLD_PRICE_E8,
        currentTime,
        answeredInRound
      );

      const result = await adapter.latestPrice(ASSET_ID_RGOLD);
      
      expect(result.priceE8).to.equal(0);
      expect(result.settlementEnabled).to.be.false;
    });

    it("should reject stale price exceeding heartbeat (Requirement 4.7)", async function () {
      const currentTime = await time.latest();
      const staleTime = currentTime - HEARTBEAT_1_HOUR - 1; // 1 second beyond heartbeat
      
      await mockFeed.updateRoundData(100n, GOLD_PRICE_E8, staleTime, 100n);

      const result = await adapter.latestPrice(ASSET_ID_RGOLD);
      
      expect(result.priceE8).to.equal(GOLD_PRICE_E8);
      expect(result.updatedAt).to.equal(staleTime);
      expect(result.settlementEnabled).to.be.false; // Stale data
    });

    it("should accept price exactly at heartbeat boundary (Requirement 4.7)", async function () {
      // Set up the round data first
      const setupTime = await time.latest();
      await mockFeed.updateRoundData(100n, GOLD_PRICE_E8, setupTime, 100n);
      
      // Advance time by exactly the heartbeat duration minus 1 (to account for block mining)
      await time.increase(HEARTBEAT_1_HOUR - 1);
      
      // Now check - the price should be exactly at the boundary (block.timestamp - updatedAt == heartbeat)
      const result = await adapter.latestPrice(ASSET_ID_RGOLD);
      
      expect(result.priceE8).to.equal(GOLD_PRICE_E8);
      expect(result.updatedAt).to.equal(setupTime);
      expect(result.settlementEnabled).to.be.true; // Still fresh at boundary (<=)
    });

    it("should handle latestRoundData() revert gracefully", async function () {
      // Make the mock revert
      await mockFeed.setShouldRevert(true);

      const result = await adapter.latestPrice(ASSET_ID_RGOLD);
      
      // Should return default values without reverting
      expect(result.priceE8).to.equal(0);
      expect(result.updatedAt).to.equal(0);
      expect(result.sourceId).to.equal(ethers.ZeroHash);
      expect(result.confidence).to.equal(0);
      expect(result.settlementEnabled).to.be.false;
    });
  });

  describe("Edge Cases", function () {
    beforeEach(async function () {
      await adapter.configureFeed(ASSET_ID_RGOLD, await mockFeed.getAddress(), HEARTBEAT_1_HOUR);
    });

    it("should handle very large price values", async function () {
      const currentTime = await time.latest();
      const largePriceE8 = ethers.MaxUint256 / 2n; // Very large but valid
      
      await mockFeed.updateRoundData(100n, largePriceE8, currentTime, 100n);

      const result = await adapter.latestPrice(ASSET_ID_RGOLD);
      
      expect(result.priceE8).to.equal(largePriceE8);
      expect(result.settlementEnabled).to.be.true;
    });

    it("should handle very large round IDs", async function () {
      const currentTime = await time.latest();
      const largeRoundId = (2n ** 80n) - 1n; // Max uint80
      
      await mockFeed.updateRoundData(
        largeRoundId,
        GOLD_PRICE_E8,
        currentTime,
        largeRoundId
      );

      const result = await adapter.latestPrice(ASSET_ID_RGOLD);
      
      expect(result.priceE8).to.equal(GOLD_PRICE_E8);
      expect(result.settlementEnabled).to.be.true;
    });

    it("should handle multiple assets with different feeds", async function () {
      // Deploy second mock feed for silver
      const MockChainlinkAggregator = await ethers.getContractFactory("MockChainlinkAggregator");
      const silverFeed = await MockChainlinkAggregator.deploy(8, "XAG / USD");
      await silverFeed.waitForDeployment();

      const ASSET_ID_RSILVER = ethers.keccak256(ethers.toUtf8Bytes("rSILVER"));
      const SILVER_PRICE_E8 = 2350000000n; // $23.50

      // Configure both feeds
      await adapter.configureFeed(ASSET_ID_RSILVER, await silverFeed.getAddress(), HEARTBEAT_1_HOUR);

      const currentTime = await time.latest();
      
      // Update both feeds
      await mockFeed.updateRoundData(100n, GOLD_PRICE_E8, currentTime, 100n);
      await silverFeed.updateRoundData(200n, SILVER_PRICE_E8, currentTime, 200n);

      // Query both assets
      const goldResult = await adapter.latestPrice(ASSET_ID_RGOLD);
      const silverResult = await adapter.latestPrice(ASSET_ID_RSILVER);

      expect(goldResult.priceE8).to.equal(GOLD_PRICE_E8);
      expect(goldResult.settlementEnabled).to.be.true;
      
      expect(silverResult.priceE8).to.equal(SILVER_PRICE_E8);
      expect(silverResult.settlementEnabled).to.be.true;

      // Verify different sourceIds
      expect(goldResult.sourceId).to.not.equal(silverResult.sourceId);
    });
  });

  describe("Integration Scenarios", function () {
    it("should simulate realistic rGOLD price update flow", async function () {
      // Configure rGOLD feed
      await adapter.configureFeed(ASSET_ID_RGOLD, await mockFeed.getAddress(), HEARTBEAT_1_HOUR);

      // Simulate price update at T=0
      const t0 = await time.latest();
      await mockFeed.updateRoundData(100n, GOLD_PRICE_E8, t0, 100n);

      let result = await adapter.latestPrice(ASSET_ID_RGOLD);
      expect(result.priceE8).to.equal(GOLD_PRICE_E8);
      expect(result.settlementEnabled).to.be.true;

      // Advance time by 30 minutes - still fresh
      await time.increase(1800);
      result = await adapter.latestPrice(ASSET_ID_RGOLD);
      expect(result.settlementEnabled).to.be.true;

      // Advance time by another 31 minutes - now stale (total 61 minutes)
      await time.increase(1860);
      result = await adapter.latestPrice(ASSET_ID_RGOLD);
      expect(result.settlementEnabled).to.be.false; // Stale

      // New price update
      const t1 = await time.latest();
      const newPriceE8 = 186000000000n; // $1,860.00
      await mockFeed.updateRoundData(101n, newPriceE8, t1, 101n);

      result = await adapter.latestPrice(ASSET_ID_RGOLD);
      expect(result.priceE8).to.equal(newPriceE8);
      expect(result.settlementEnabled).to.be.true; // Fresh again
    });

    it("should properly gate settlement during Chainlink outage", async function () {
      await adapter.configureFeed(ASSET_ID_RGOLD, await mockFeed.getAddress(), HEARTBEAT_1_HOUR);

      // Initial valid state
      const currentTime = await time.latest();
      await mockFeed.updateRoundData(100n, GOLD_PRICE_E8, currentTime, 100n);

      let result = await adapter.latestPrice(ASSET_ID_RGOLD);
      expect(result.settlementEnabled).to.be.true;

      // Simulate Chainlink outage (feed starts reverting)
      await mockFeed.setShouldRevert(true);

      result = await adapter.latestPrice(ASSET_ID_RGOLD);
      expect(result.settlementEnabled).to.be.false; // Cannot settle during outage

      // Outage resolved
      await mockFeed.setShouldRevert(false);
      const recoveryTime = await time.latest();
      await mockFeed.updateRoundData(101n, GOLD_PRICE_E8, recoveryTime, 101n);

      result = await adapter.latestPrice(ASSET_ID_RGOLD);
      expect(result.settlementEnabled).to.be.true; // Settlement restored
    });
  });
});
