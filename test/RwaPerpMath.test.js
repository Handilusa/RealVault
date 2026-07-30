const { expect } = require("chai");
const { ethers } = require("hardhat");

// Feature: confidential-rwa-perp-engine
// Phase 2: Position Math Tests
// Tests for RwaPerpMath library functions (_scaledAmount and _calculatePnL)

describe("RwaPerpMath — Position Math Library", function () {
    let mathContract;
    let owner;

    // Deploy a test contract that exposes RwaPerpMath internal functions
    before(async function () {
        [owner] = await ethers.getSigners();

        // Create a test contract wrapper to expose internal library functions
        const TestRwaPerpMath = await ethers.getContractFactory("contracts/test-helpers/TestRwaPerpMath.sol:TestRwaPerpMath");
        mathContract = await TestRwaPerpMath.deploy();
        await mathContract.waitForDeployment();
    });

    describe("_calculatePnL — Unit Tests", function () {
        it("should calculate correct PnL for profitable long position", async function () {
            // Long position: entry $1000, exit $1100, 5x leverage
            // Expected PnL: ((1100 - 1000) / 1000) * 5 * 100% = 50%
            const position = {
                assetId: ethers.id("rGOLD"),
                marginHandle: ethers.ZeroHash, // Encrypted handle (not used in pure math)
                entryPriceE8: 1000n * 10n**8n, // $1000.00
                entryRoundOrNonce: 1n,
                entrySourceId: ethers.ZeroHash,
                leverage: 5,
                openedAt: Math.floor(Date.now() / 1000),
                isLong: true,
                isOpen: true
            };
            const exitPriceE8 = 1100n * 10n**8n; // $1100.00

            const pnlScalar = await mathContract.testCalculatePnL(position, exitPriceE8);

            // Expected: (100 * 5 * 1e8) / 1000 = 50000000 (50%)
            const expectedPnL = (100n * 5n * 10n**8n) / 1000n;
            expect(pnlScalar).to.equal(expectedPnL);
        });

        it("should calculate correct PnL for losing long position", async function () {
            // Long position: entry $1000, exit $900, 5x leverage
            // Expected PnL: ((900 - 1000) / 1000) * 5 * 100% = -50%
            const position = {
                assetId: ethers.id("rGOLD"),
                marginHandle: ethers.ZeroHash,
                entryPriceE8: 1000n * 10n**8n, // $1000.00
                entryRoundOrNonce: 1n,
                entrySourceId: ethers.ZeroHash,
                leverage: 5,
                openedAt: Math.floor(Date.now() / 1000),
                isLong: true,
                isOpen: true
            };
            const exitPriceE8 = 900n * 10n**8n; // $900.00

            const pnlScalar = await mathContract.testCalculatePnL(position, exitPriceE8);

            // Expected: (-100 * 5 * 1e8) / 1000 = -50000000 (-50%)
            const expectedPnL = (-100n * 5n * 10n**8n) / 1000n;
            expect(pnlScalar).to.equal(expectedPnL);
        });

        it("should calculate correct PnL for profitable short position", async function () {
            // Short position: entry $1000, exit $900, 5x leverage
            // Expected PnL: ((1000 - 900) / 1000) * 5 * 100% = 50%
            const position = {
                assetId: ethers.id("rGOLD"),
                marginHandle: ethers.ZeroHash,
                entryPriceE8: 1000n * 10n**8n, // $1000.00
                entryRoundOrNonce: 1n,
                entrySourceId: ethers.ZeroHash,
                leverage: 5,
                openedAt: Math.floor(Date.now() / 1000),
                isLong: false, // SHORT
                isOpen: true
            };
            const exitPriceE8 = 900n * 10n**8n; // $900.00

            const pnlScalar = await mathContract.testCalculatePnL(position, exitPriceE8);

            // Expected: (100 * 5 * 1e8) / 1000 = 50000000 (50%)
            const expectedPnL = (100n * 5n * 10n**8n) / 1000n;
            expect(pnlScalar).to.equal(expectedPnL);
        });

        it("should calculate correct PnL for losing short position", async function () {
            // Short position: entry $1000, exit $1100, 5x leverage
            // Expected PnL: ((1000 - 1100) / 1000) * 5 * 100% = -50%
            const position = {
                assetId: ethers.id("rGOLD"),
                marginHandle: ethers.ZeroHash,
                entryPriceE8: 1000n * 10n**8n, // $1000.00
                entryRoundOrNonce: 1n,
                entrySourceId: ethers.ZeroHash,
                leverage: 5,
                openedAt: Math.floor(Date.now() / 1000),
                isLong: false, // SHORT
                isOpen: true
            };
            const exitPriceE8 = 1100n * 10n**8n; // $1100.00

            const pnlScalar = await mathContract.testCalculatePnL(position, exitPriceE8);

            // Expected: (-100 * 5 * 1e8) / 1000 = -50000000 (-50%)
            const expectedPnL = (-100n * 5n * 10n**8n) / 1000n;
            expect(pnlScalar).to.equal(expectedPnL);
        });

        it("should return zero PnL when entry and exit prices are equal", async function () {
            // Position: entry $1000, exit $1000, any leverage
            const position = {
                assetId: ethers.id("rGOLD"),
                marginHandle: ethers.ZeroHash,
                entryPriceE8: 1000n * 10n**8n, // $1000.00
                entryRoundOrNonce: 1n,
                entrySourceId: ethers.ZeroHash,
                leverage: 5,
                openedAt: Math.floor(Date.now() / 1000),
                isLong: true,
                isOpen: true
            };
            const exitPriceE8 = 1000n * 10n**8n; // $1000.00 (same as entry)

            const pnlScalar = await mathContract.testCalculatePnL(position, exitPriceE8);

            expect(pnlScalar).to.equal(0n);
        });

        it("should handle 1x leverage correctly (no amplification)", async function () {
            // Long position: entry $1000, exit $1100, 1x leverage
            // Expected PnL: ((1100 - 1000) / 1000) * 1 * 100% = 10%
            const position = {
                assetId: ethers.id("rGOLD"),
                marginHandle: ethers.ZeroHash,
                entryPriceE8: 1000n * 10n**8n, // $1000.00
                entryRoundOrNonce: 1n,
                entrySourceId: ethers.ZeroHash,
                leverage: 1, // 1x leverage
                openedAt: Math.floor(Date.now() / 1000),
                isLong: true,
                isOpen: true
            };
            const exitPriceE8 = 1100n * 10n**8n; // $1100.00

            const pnlScalar = await mathContract.testCalculatePnL(position, exitPriceE8);

            // Expected: (100 * 1 * 1e8) / 1000 = 10000000 (10%)
            const expectedPnL = (100n * 1n * 10n**8n) / 1000n;
            expect(pnlScalar).to.equal(expectedPnL);
        });

        it("should handle 10x leverage correctly (maximum amplification)", async function () {
            // Long position: entry $1000, exit $1050, 10x leverage
            // Expected PnL: ((1050 - 1000) / 1000) * 10 * 100% = 50%
            const position = {
                assetId: ethers.id("rGOLD"),
                marginHandle: ethers.ZeroHash,
                entryPriceE8: 1000n * 10n**8n, // $1000.00
                entryRoundOrNonce: 1n,
                entrySourceId: ethers.ZeroHash,
                leverage: 10, // 10x leverage (MAX_LEVERAGE)
                openedAt: Math.floor(Date.now() / 1000),
                isLong: true,
                isOpen: true
            };
            const exitPriceE8 = 1050n * 10n**8n; // $1050.00

            const pnlScalar = await mathContract.testCalculatePnL(position, exitPriceE8);

            // Expected: (50 * 10 * 1e8) / 1000 = 50000000 (50%)
            const expectedPnL = (50n * 10n * 10n**8n) / 1000n;
            expect(pnlScalar).to.equal(expectedPnL);
        });

        it("should handle small price movements correctly", async function () {
            // Long position: entry $1850.25, exit $1850.75, 5x leverage
            // Expected PnL: ((1850.75 - 1850.25) / 1850.25) * 5 * 100% ≈ 0.135%
            const position = {
                assetId: ethers.id("rGOLD"),
                marginHandle: ethers.ZeroHash,
                entryPriceE8: 185025000000n, // $1850.25
                entryRoundOrNonce: 1n,
                entrySourceId: ethers.ZeroHash,
                leverage: 5,
                openedAt: Math.floor(Date.now() / 1000),
                isLong: true,
                isOpen: true
            };
            const exitPriceE8 = 185075000000n; // $1850.75

            const pnlScalar = await mathContract.testCalculatePnL(position, exitPriceE8);

            // Expected: (50000000 * 5 * 1e8) / 185025000000 ≈ 135135 (0.135%)
            const priceDelta = 50000000n; // $0.50 in 8 decimals
            const expectedPnL = (priceDelta * 5n * 10n**8n) / 185025000000n;
            expect(pnlScalar).to.equal(expectedPnL);
        });

        it("should verify leverage is multiplied exactly once (no double multiplication)", async function () {
            // This test verifies Requirement 24.3: No leverage double-multiplication
            // Long position: entry $1000, exit $1100, 3x leverage
            const position = {
                assetId: ethers.id("rGOLD"),
                marginHandle: ethers.ZeroHash,
                entryPriceE8: 1000n * 10n**8n,
                entryRoundOrNonce: 1n,
                entrySourceId: ethers.ZeroHash,
                leverage: 3,
                openedAt: Math.floor(Date.now() / 1000),
                isLong: true,
                isOpen: true
            };
            const exitPriceE8 = 1100n * 10n**8n;

            const pnlScalar = await mathContract.testCalculatePnL(position, exitPriceE8);

            // If leverage were multiplied twice, result would be 90% instead of 30%
            const correctPnL = (100n * 3n * 10n**8n) / 1000n; // 30%
            const incorrectDoubleLeveragePnL = (100n * 3n * 3n * 10n**8n) / 1000n; // 90% (WRONG)

            expect(pnlScalar).to.equal(correctPnL);
            expect(pnlScalar).to.not.equal(incorrectDoubleLeveragePnL);
        });
    });

    describe("_calculatePnL — Property-Based Tests (Property 13 & 14)", function () {
        // Property 13: Long Position PnL Calculation
        // Validates: Requirements 8.4
        // **Validates Requirements 8.4**
        it("Property 13: Long Position PnL = ((exitPrice - entryPrice) × margin × leverage) / entryPrice", async function () {
            const iterations = 100; // Minimum 100 iterations per spec

            for (let i = 0; i < iterations; i++) {
                // Generate random parameters
                const entryPrice = BigInt(Math.floor(Math.random() * 2900 + 100)); // $100 - $3000
                const exitPrice = BigInt(Math.floor(Math.random() * 2900 + 100)); // $100 - $3000
                const leverage = Math.floor(Math.random() * 10) + 1; // 1-10

                const position = {
                    assetId: ethers.id("rGOLD"),
                    marginHandle: ethers.ZeroHash,
                    entryPriceE8: entryPrice * 10n**8n,
                    entryRoundOrNonce: 1n,
                    entrySourceId: ethers.ZeroHash,
                    leverage: leverage,
                    openedAt: Math.floor(Date.now() / 1000),
                    isLong: true,
                    isOpen: true
                };

                const pnlScalar = await mathContract.testCalculatePnL(position, exitPrice * 10n**8n);

                // Calculate expected PnL using the formula
                const priceDelta = Number(exitPrice - entryPrice);
                const expectedPnL = (priceDelta * leverage * 1e8) / Number(entryPrice);
                const expectedPnLBigInt = BigInt(Math.floor(expectedPnL));

                // Allow small rounding differences due to integer division
                const tolerance = 1n;
                const diff = pnlScalar > expectedPnLBigInt ? 
                    pnlScalar - expectedPnLBigInt : 
                    expectedPnLBigInt - pnlScalar;
                
                expect(diff).to.be.lte(tolerance, 
                    `Iteration ${i}: entryPrice=${entryPrice}, exitPrice=${exitPrice}, leverage=${leverage}`);
            }
        });

        // Property 14: Short Position PnL Calculation
        // Validates: Requirements 8.5
        // **Validates Requirements 8.5**
        it("Property 14: Short Position PnL = ((entryPrice - exitPrice) × margin × leverage) / entryPrice", async function () {
            const iterations = 100; // Minimum 100 iterations per spec

            for (let i = 0; i < iterations; i++) {
                // Generate random parameters
                const entryPrice = BigInt(Math.floor(Math.random() * 2900 + 100)); // $100 - $3000
                const exitPrice = BigInt(Math.floor(Math.random() * 2900 + 100)); // $100 - $3000
                const leverage = Math.floor(Math.random() * 10) + 1; // 1-10

                const position = {
                    assetId: ethers.id("rGOLD"),
                    marginHandle: ethers.ZeroHash,
                    entryPriceE8: entryPrice * 10n**8n,
                    entryRoundOrNonce: 1n,
                    entrySourceId: ethers.ZeroHash,
                    leverage: leverage,
                    openedAt: Math.floor(Date.now() / 1000),
                    isLong: false, // SHORT
                    isOpen: true
                };

                const pnlScalar = await mathContract.testCalculatePnL(position, exitPrice * 10n**8n);

                // Calculate expected PnL using the formula (reversed for short)
                const priceDelta = Number(entryPrice - exitPrice);
                const expectedPnL = (priceDelta * leverage * 1e8) / Number(entryPrice);
                const expectedPnLBigInt = BigInt(Math.floor(expectedPnL));

                // Allow small rounding differences due to integer division
                const tolerance = 1n;
                const diff = pnlScalar > expectedPnLBigInt ? 
                    pnlScalar - expectedPnLBigInt : 
                    expectedPnLBigInt - pnlScalar;
                
                expect(diff).to.be.lte(tolerance, 
                    `Iteration ${i}: entryPrice=${entryPrice}, exitPrice=${exitPrice}, leverage=${leverage}`);
            }
        });

        it("Property: PnL sign is correct for all price movements and directions", async function () {
            const iterations = 100;

            for (let i = 0; i < iterations; i++) {
                const entryPrice = BigInt(Math.floor(Math.random() * 2900 + 100));
                const exitPrice = BigInt(Math.floor(Math.random() * 2900 + 100));
                const leverage = Math.floor(Math.random() * 10) + 1;
                const isLong = Math.random() < 0.5;

                const position = {
                    assetId: ethers.id("rGOLD"),
                    marginHandle: ethers.ZeroHash,
                    entryPriceE8: entryPrice * 10n**8n,
                    entryRoundOrNonce: 1n,
                    entrySourceId: ethers.ZeroHash,
                    leverage: leverage,
                    openedAt: Math.floor(Date.now() / 1000),
                    isLong: isLong,
                    isOpen: true
                };

                const pnlScalar = await mathContract.testCalculatePnL(position, exitPrice * 10n**8n);

                // Verify sign correctness
                if (isLong) {
                    // Long: profit when exitPrice > entryPrice
                    if (exitPrice > entryPrice) {
                        expect(pnlScalar).to.be.gt(0n, `Long position should profit when price increases (iter ${i})`);
                    } else if (exitPrice < entryPrice) {
                        expect(pnlScalar).to.be.lt(0n, `Long position should lose when price decreases (iter ${i})`);
                    } else {
                        expect(pnlScalar).to.equal(0n, `No price change should result in zero PnL (iter ${i})`);
                    }
                } else {
                    // Short: profit when exitPrice < entryPrice
                    if (exitPrice < entryPrice) {
                        expect(pnlScalar).to.be.gt(0n, `Short position should profit when price decreases (iter ${i})`);
                    } else if (exitPrice > entryPrice) {
                        expect(pnlScalar).to.be.lt(0n, `Short position should lose when price increases (iter ${i})`);
                    } else {
                        expect(pnlScalar).to.equal(0n, `No price change should result in zero PnL (iter ${i})`);
                    }
                }
            }
        });
    });

    describe("Edge Cases and Boundary Conditions", function () {
        it("should handle very large price increases without overflow", async function () {
            // Entry $100, exit $3000, 10x leverage
            const position = {
                assetId: ethers.id("rGOLD"),
                marginHandle: ethers.ZeroHash,
                entryPriceE8: 100n * 10n**8n,
                entryRoundOrNonce: 1n,
                entrySourceId: ethers.ZeroHash,
                leverage: 10,
                openedAt: Math.floor(Date.now() / 1000),
                isLong: true,
                isOpen: true
            };
            const exitPriceE8 = 3000n * 10n**8n;

            const pnlScalar = await mathContract.testCalculatePnL(position, exitPriceE8);

            // Expected: (2900 * 10 * 1e8) / 100 = 29000000000 (29000%)
            const expectedPnL = (2900n * 10n * 10n**8n) / 100n;
            expect(pnlScalar).to.equal(expectedPnL);
        });

        it("should handle very large price decreases without underflow", async function () {
            // Entry $3000, exit $100, 10x leverage (short)
            const position = {
                assetId: ethers.id("rGOLD"),
                marginHandle: ethers.ZeroHash,
                entryPriceE8: 3000n * 10n**8n,
                entryRoundOrNonce: 1n,
                entrySourceId: ethers.ZeroHash,
                leverage: 10,
                openedAt: Math.floor(Date.now() / 1000),
                isLong: false, // SHORT
                isOpen: true
            };
            const exitPriceE8 = 100n * 10n**8n;

            const pnlScalar = await mathContract.testCalculatePnL(position, exitPriceE8);

            // Expected: (2900 * 10 * 1e8) / 3000 ≈ 966666667 (966.67%)
            const expectedPnL = (2900n * 10n * 10n**8n) / 3000n;
            expect(pnlScalar).to.equal(expectedPnL);
        });

        it("should handle fractional percentage results correctly", async function () {
            // Entry $1850.25, exit $1850.26, 5x leverage
            const position = {
                assetId: ethers.id("rGOLD"),
                marginHandle: ethers.ZeroHash,
                entryPriceE8: 185025000000n,
                entryRoundOrNonce: 1n,
                entrySourceId: ethers.ZeroHash,
                leverage: 5,
                openedAt: Math.floor(Date.now() / 1000),
                isLong: true,
                isOpen: true
            };
            const exitPriceE8 = 185026000000n;

            const pnlScalar = await mathContract.testCalculatePnL(position, exitPriceE8);

            // Very small profit should still be non-zero
            expect(pnlScalar).to.be.gt(0n);
            expect(pnlScalar).to.be.lt(100000n); // Less than 0.001%
        });
    });
});
