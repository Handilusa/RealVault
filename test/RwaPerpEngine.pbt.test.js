const { expect } = require("chai");
const { ethers } = require("hardhat");
const fc = require("fast-check");

// Feature: confidential-rwa-perp-engine
// Property-Based Testing: Position Lifecycle Accounting Invariants
// Properties 15, 16, and 17 using fast-check framework

describe("RwaPerpEngine - Property-Based Testing (fast-check)", function () {
    let rwaPerpEngine;
    let fundVault;
    let mockUSDC;
    let chainlinkAdapter;
    let mockChainlinkFeed;
    let owner, user1, treasury;

    const ASSET_ID_RGOLD = ethers.id("rGOLD");
    const GOLD_PRICE_E8 = 185000000000n; // $1,850.00
    const HEARTBEAT_1_HOUR = 3600;

    /**
     * Deploy fixture - Sets up clean contract environment for each iteration
     */
    async function deployFixture() {
        [owner, user1, treasury] = await ethers.getSigners();

        // 0. Inject LocalNoxCompute test stub for Hardhat local chain 31337
        const LocalNoxCompute = await ethers.getContractFactory("LocalNoxCompute");
        const localNox = await LocalNoxCompute.deploy();
        await localNox.waitForDeployment();
        const localNoxCode = await ethers.provider.getCode(await localNox.getAddress());
        await ethers.provider.send("hardhat_setCode", [
            "0x75C6AF4430cc474b1bb9b8540b7E46D6f8e1C685",
            localNoxCode,
        ]);

        // 1. MockUSDC
        const MockUSDC = await ethers.getContractFactory("MockUSDC");
        mockUSDC = await MockUSDC.deploy();
        await mockUSDC.waitForDeployment();

        // 2. WrappedUSDC
        const WrappedUSDC = await ethers.getContractFactory("contracts/WrappedUSDC.sol:WrappedUSDC");
        const wrappedUSDC = await WrappedUSDC.deploy(await mockUSDC.getAddress());
        await wrappedUSDC.waitForDeployment();

        // 3. FundVault
        const FundVault = await ethers.getContractFactory("FundVault");
        fundVault = await FundVault.deploy(await mockUSDC.getAddress(), await wrappedUSDC.getAddress());
        await fundVault.waitForDeployment();

        // 4. RwaPerpEngine
        const RwaPerpEngine = await ethers.getContractFactory("RwaPerpEngine");
        rwaPerpEngine = await RwaPerpEngine.deploy(
            await fundVault.getAddress(),
            treasury.address
        );
        await rwaPerpEngine.waitForDeployment();

        // 5. Chainlink Feed & Adapter
        const MockChainlinkAggregator = await ethers.getContractFactory("MockChainlinkAggregator");
        mockChainlinkFeed = await MockChainlinkAggregator.deploy(8, "XAU / USD");
        await mockChainlinkFeed.waitForDeployment();

        const ChainlinkAdapter = await ethers.getContractFactory("ChainlinkRwaOracleAdapter");
        chainlinkAdapter = await ChainlinkAdapter.deploy(owner.address);
        await chainlinkAdapter.waitForDeployment();

        await chainlinkAdapter.configureFeed(
            ASSET_ID_RGOLD,
            await mockChainlinkFeed.getAddress(),
            HEARTBEAT_1_HOUR
        );

        const block = await ethers.provider.getBlock('latest');
        await mockChainlinkFeed.updateRoundData(100n, GOLD_PRICE_E8, block.timestamp, 100n);

        await rwaPerpEngine.registerOracleAdapter(ASSET_ID_RGOLD, await chainlinkAdapter.getAddress());
        await rwaPerpEngine.configureAsset({
            assetId: ASSET_ID_RGOLD,
            symbol: "rGOLD",
            oracleAdapter: await chainlinkAdapter.getAddress(),
            maxStaleness: HEARTBEAT_1_HOUR,
            valuationMethod: "Market",
            description: "Tokenized Gold"
        });

        // 6. Authorize RwaPerpEngine in FundVault
        await fundVault.setAuthorizedContract(await rwaPerpEngine.getAddress(), true);

        // 7. Fund user USDC
        await mockUSDC.transfer(user1.address, ethers.parseUnits("1000000", 18));
        await mockUSDC.connect(user1).approve(await fundVault.getAddress(), ethers.MaxUint256);

        return {
            rwaPerpEngine,
            fundVault,
            mockChainlinkFeed,
            owner,
            user1,
            treasury
        };
    }

    async function setOraclePrice(priceE8) {
        const block = await ethers.provider.getBlock('latest');
        await mockChainlinkFeed.updateRoundData(101n, priceE8, block.timestamp, 101n);
    }

    describe("Property 15: Balance Round-Trip Invariant (User balance conservation)", function () {
        it("should guarantee user balance after position close satisfies B_final >= B_initial - Margin", async function () {
            this.timeout(60000); // 60s timeout for PBT runs

            await fc.assert(
                fc.asyncProperty(
                    fc.integer({ min: 100, max: 5000 }), // Margin in USD
                    fc.integer({ min: 1, max: 10 }),      // Leverage 1x-10x
                    fc.boolean(),                         // isLong (true/false)
                    fc.integer({ min: 1000, max: 3000 }), // Exit price USD
                    async (marginUsd, leverage, isLong, exitPriceUsd) => {
                        const fixture = await deployFixture();
                        const engine = fixture.rwaPerpEngine;
                        const vault = fixture.fundVault;

                        // Setup user balance: deposit $50,000
                        const userDepositAmount = 50000_000000n;
                        const depositHandle = ethers.zeroPadValue(ethers.toBeHex(userDepositAmount), 32);
                        await vault.connect(user1)["deposit(bytes32,bytes,uint256)"](depositHandle, "0x", userDepositAmount);

                        // Setup treasury: deposit $500,000
                        const treasuryAmount = 500000_000000n;
                        const treasuryHandle = ethers.zeroPadValue(ethers.toBeHex(treasuryAmount), 32);
                        await engine.initializeTreasury(treasuryHandle, "0x");

                        const initialUserBal = BigInt(await vault.getPosition(user1.address));

                        // Ensure oracle price is fresh for openPosition
                        const block1 = await ethers.provider.getBlock('latest');
                        await fixture.mockChainlinkFeed.updateRoundData(100n, GOLD_PRICE_E8, block1.timestamp, 100n);

                        // Open position
                        const marginAmount = BigInt(marginUsd) * 1_000000n;
                        const marginHandle = ethers.zeroPadValue(ethers.toBeHex(marginAmount), 32);
                        await engine.connect(user1)["openPosition(bytes32,bytes32,bytes,uint8,bool)"](
                            ASSET_ID_RGOLD,
                            marginHandle,
                            "0x",
                            leverage,
                            isLong
                        );

                        // Update exit price right before closePosition
                        const exitPriceE8 = BigInt(exitPriceUsd) * 100000000n;
                        const block2 = await ethers.provider.getBlock('latest');
                        await fixture.mockChainlinkFeed.updateRoundData(101n, exitPriceE8, block2.timestamp, 101n);

                        // Close position
                        await engine.connect(user1).closePosition(0);

                        const finalUserBal = BigInt(await vault.getPosition(user1.address));

                        // Verify position closed
                        const positions = await engine.getPositions(user1.address);
                        expect(positions[0].isOpen).to.equal(false);

                        // Invariant: User loss is strictly capped at margin deposited (no negative balance, no loss > margin)
                        expect(finalUserBal).to.be.gte(initialUserBal - marginAmount);
                    }
                ),
                { numRuns: 15 }
            );
        });
    });

    describe("Property 16: Treasury Debit on Profit", function () {
        it("should decrease or maintain treasury balance when user closes position in profit", async function () {
            this.timeout(60000);

            await fc.assert(
                fc.asyncProperty(
                    fc.integer({ min: 100, max: 5000 }),
                    fc.integer({ min: 1, max: 10 }),
                    fc.integer({ min: 1900, max: 3000 }), // Price higher than $1,850 -> Long profit
                    async (marginUsd, leverage, exitPriceUsd) => {
                        const fixture = await deployFixture();
                        const engine = fixture.rwaPerpEngine;
                        const vault = fixture.fundVault;

                        const userDepositAmount = 50000_000000n;
                        const depositHandle = ethers.zeroPadValue(ethers.toBeHex(userDepositAmount), 32);
                        await vault.connect(user1)["deposit(bytes32,bytes,uint256)"](depositHandle, "0x", userDepositAmount);

                        const treasuryAmount = 500000_000000n;
                        const treasuryHandle = ethers.zeroPadValue(ethers.toBeHex(treasuryAmount), 32);
                        await engine.initializeTreasury(treasuryHandle, "0x");

                        const treasuryBefore = BigInt(await engine.getTreasuryBalance());

                        const marginAmount = BigInt(marginUsd) * 1_000000n;
                        const marginHandle = ethers.zeroPadValue(ethers.toBeHex(marginAmount), 32);

                        // Ensure oracle price is fresh for openPosition
                        const block1 = await ethers.provider.getBlock('latest');
                        await fixture.mockChainlinkFeed.updateRoundData(100n, GOLD_PRICE_E8, block1.timestamp, 100n);

                        await engine.connect(user1)["openPosition(bytes32,bytes32,bytes,uint8,bool)"](
                            ASSET_ID_RGOLD,
                            marginHandle,
                            "0x",
                            leverage,
                            true // LONG
                        );

                        const exitPriceE8 = BigInt(exitPriceUsd) * 100000000n;
                        const block2 = await ethers.provider.getBlock('latest');
                        await fixture.mockChainlinkFeed.updateRoundData(101n, exitPriceE8, block2.timestamp, 101n);

                        await engine.connect(user1).closePosition(0);

                        const treasuryAfter = BigInt(await engine.getTreasuryBalance());

                        // Invariant: On profit, treasury payout must debit treasury balance
                        expect(treasuryAfter).to.be.lte(treasuryBefore);
                    }
                ),
                { numRuns: 15 }
            );
        });
    });

    describe("Property 17: Treasury Credit on Loss", function () {
        it("should increase or maintain treasury balance when user closes position in loss", async function () {
            this.timeout(60000);

            await fc.assert(
                fc.asyncProperty(
                    fc.integer({ min: 100, max: 5000 }),
                    fc.integer({ min: 1, max: 10 }),
                    fc.integer({ min: 500, max: 1700 }), // Price lower than $1,850 -> Long loss
                    async (marginUsd, leverage, exitPriceUsd) => {
                        const fixture = await deployFixture();
                        const engine = fixture.rwaPerpEngine;
                        const vault = fixture.fundVault;

                        const userDepositAmount = 50000_000000n;
                        const depositHandle = ethers.zeroPadValue(ethers.toBeHex(userDepositAmount), 32);
                        await vault.connect(user1)["deposit(bytes32,bytes,uint256)"](depositHandle, "0x", userDepositAmount);

                        const treasuryAmount = 500000_000000n;
                        const treasuryHandle = ethers.zeroPadValue(ethers.toBeHex(treasuryAmount), 32);
                        await engine.initializeTreasury(treasuryHandle, "0x");

                        const treasuryBefore = BigInt(await engine.getTreasuryBalance());

                        const marginAmount = BigInt(marginUsd) * 1_000000n;
                        const marginHandle = ethers.zeroPadValue(ethers.toBeHex(marginAmount), 32);

                        // Ensure oracle price is fresh for openPosition
                        const block1 = await ethers.provider.getBlock('latest');
                        await fixture.mockChainlinkFeed.updateRoundData(100n, GOLD_PRICE_E8, block1.timestamp, 100n);

                        await engine.connect(user1)["openPosition(bytes32,bytes32,bytes,uint8,bool)"](
                            ASSET_ID_RGOLD,
                            marginHandle,
                            "0x",
                            leverage,
                            true // LONG
                        );

                        const exitPriceE8 = BigInt(exitPriceUsd) * 100000000n;
                        const block2 = await ethers.provider.getBlock('latest');
                        await fixture.mockChainlinkFeed.updateRoundData(101n, exitPriceE8, block2.timestamp, 101n);

                        await engine.connect(user1).closePosition(0);

                        const treasuryAfter = BigInt(await engine.getTreasuryBalance());

                        // Invariant: On loss, loss credited to treasury balance
                        expect(treasuryAfter).to.be.gte(treasuryBefore);
                    }
                ),
                { numRuns: 15 }
            );
        });
    });
});
