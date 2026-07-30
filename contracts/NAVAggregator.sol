// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {Nox, euint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

interface IFundVault {
    function getInvestors() external view returns (address[] memory);
    function getPosition(address investor) external view returns (euint256);
    function investorCount() external view returns (uint256);
}

/// @title NAVAggregator — Public Read-Only Aggregate NAV Calculator via Nox TEE
/// @notice Computes public aggregate fund NAV on-chain using homomorphic addition (`Nox.add`)
///         across encrypted handles without revealing individual position amounts.
contract NAVAggregator {
    IFundVault public vault;

    euint256 public aggregatedNav;       // Encrypted aggregate NAV handle
    uint256 public lastUpdateBlock;
    uint256 public lastInvestorCount;

    // Incremental batching state
    uint256 public batchCursor;          // Index of last processed investor
    euint256 public batchAccumulator;    // Partial accumulator
    bool public batchInProgress;

    event NavAggregated(uint256 totalInvestors, uint256 blockNumber);
    event BatchStarted(uint256 totalInvestors);
    event BatchProgress(uint256 processedCount, uint256 totalInvestors);

    constructor(address _vault) {
        require(_vault != address(0), "Invalid vault address");
        vault = IFundVault(_vault);
        aggregatedNav = Nox.toEuint256(0);
        Nox.allowThis(aggregatedNav);
        batchAccumulator = Nox.toEuint256(0);
        Nox.allowThis(batchAccumulator);
    }

    /// @notice Compute aggregate NAV in 1 block for public fund statistics
    function aggregateAll() external {
        require(!batchInProgress, "Batch in progress, use processBatch()");

        address[] memory investorList = vault.getInvestors();
        euint256 sum = Nox.toEuint256(0);
        Nox.allowThis(sum);

        for (uint256 i = 0; i < investorList.length; i++) {
            euint256 pos = vault.getPosition(investorList[i]);
            sum = Nox.add(sum, pos);
            Nox.allowThis(sum);
        }

        aggregatedNav = sum;
        Nox.allowThis(aggregatedNav);

        lastUpdateBlock = block.number;
        lastInvestorCount = investorList.length;

        emit NavAggregated(investorList.length, block.number);
    }

    /// @notice Start incremental batching
    function startBatch() external {
        require(!batchInProgress, "Batch already in progress");
        batchInProgress = true;
        batchCursor = 0;
        batchAccumulator = Nox.toEuint256(0);
        Nox.allowThis(batchAccumulator);

        emit BatchStarted(vault.investorCount());
    }

    /// @notice Process partial batch of investors
    function processBatch(uint256 batchSize) external {
        require(batchInProgress, "No batch in progress");

        address[] memory investorList = vault.getInvestors();
        uint256 end = batchCursor + batchSize;
        if (end > investorList.length) {
            end = investorList.length;
        }

        for (uint256 i = batchCursor; i < end; i++) {
            euint256 pos = vault.getPosition(investorList[i]);
            batchAccumulator = Nox.add(batchAccumulator, pos);
            Nox.allowThis(batchAccumulator);
        }

        batchCursor = end;
        emit BatchProgress(batchCursor, investorList.length);

        if (batchCursor >= investorList.length) {
            aggregatedNav = batchAccumulator;
            Nox.allowThis(aggregatedNav);

            lastUpdateBlock = block.number;
            lastInvestorCount = investorList.length;
            batchInProgress = false;

            emit NavAggregated(investorList.length, block.number);
        }
    }
}

