// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {Nox, euint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

interface IFundVault {
    function getInvestors() external view returns (address[] memory);
    function getPosition(address investor) external view returns (euint256);
    function investorCount() external view returns (uint256);
}

/// @title NAVAggregator — Calculador de NAV público vía FHE on-chain
/// @notice Ejecuta sumas sobre handles de posiciones cifradas sin descifrar ningún balance individual.
///         Soporta agregación en 1 bloque (aggregateAll) y batching incremental (startBatch/processBatch).
contract NAVAggregator {
    address public admin;
    IFundVault public vault;

    euint256 public aggregatedNav;       // NAV acumulado FHE
    uint256 public lastUpdateBlock;
    uint256 public lastInvestorCount;

    // Estado para batching incremental
    uint256 public batchCursor;          // Índice del último inversor procesado
    euint256 public batchAccumulator;    // Acumulador parcial entre bloques
    bool public batchInProgress;

    event NavAggregated(uint256 totalInvestors, uint256 blockNumber);
    event BatchStarted(uint256 totalInvestors);
    event BatchProgress(uint256 processedCount, uint256 totalInvestors);

    modifier onlyAdmin() {
        require(msg.sender == admin, "NAVAggregator: caller is not admin");
        _;
    }

    constructor(address _vault) {
        admin = msg.sender;
        vault = IFundVault(_vault);
        aggregatedNav = Nox.toEuint256(0);
        Nox.allowThis(aggregatedNav);
        batchAccumulator = Nox.toEuint256(0);
        Nox.allowThis(batchAccumulator);
    }

    /// @notice Calcula el NAV agregado sumando FHE todas las posiciones en 1 bloque
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

    /// @notice Inicia un proceso de agregación incremental por lotes
    function startBatch() external {
        require(!batchInProgress, "Batch already in progress");
        batchInProgress = true;
        batchCursor = 0;
        batchAccumulator = Nox.toEuint256(0);
        Nox.allowThis(batchAccumulator);

        emit BatchStarted(vault.investorCount());
    }

    /// @notice Procesa un lote parcial de inversores (batchSize)
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
