// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {Nox, euint256, externalEuint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

/// @title RebalancerAgent — Agente de Rebalanceo Confidencial
/// @notice Ejecuta rebalanceos de portafolio entre 2 activos cifrados sin exponer los montos individuales al mercado.
///         Soporta reglas programables de asignación y rebalanceo por lotes (batching/layering).
contract RebalancerAgent {
    address public admin;

    // Balances cifrados de dos activos del fondo (ej: mUSDC cifrado y mETH cifrado)
    euint256 public assetA;
    euint256 public assetB;

    // Regla de asignación objetivo en puntos básicos (10000 = 100%)
    uint256 public targetAllocationA;  // ej: 6000 = 60%
    uint256 public targetAllocationB;  // ej: 4000 = 40%

    uint256 public rebalanceCount;
    uint256 public lastRebalanceBlock;

    event RebalanceExecuted(uint256 indexed rebalanceId, uint256 blockNumber);
    event TargetAllocationUpdated(uint256 targetA, uint256 targetB);

    modifier onlyAdmin() {
        require(msg.sender == admin, "RebalancerAgent: caller is not admin");
        _;
    }

    constructor(uint256 _targetA, uint256 _targetB) {
        require(_targetA + _targetB == 10000, "Allocation must sum to 100%");
        admin = msg.sender;
        targetAllocationA = _targetA;
        targetAllocationB = _targetB;

        assetA = Nox.toEuint256(0);
        Nox.allowThis(assetA);
        assetB = Nox.toEuint256(0);
        Nox.allowThis(assetB);
    }

    /// @notice Actualiza la regla de asignación objetivo
    function setTargetAllocation(uint256 _targetA, uint256 _targetB) external onlyAdmin {
        require(_targetA + _targetB == 10000, "Allocation must sum to 100%");
        targetAllocationA = _targetA;
        targetAllocationB = _targetB;
        emit TargetAllocationUpdated(_targetA, _targetB);
    }

    /// @notice Ejecuta un rebalanceo individual transfiriendo `amount` cifrado entre A y B
    function rebalance(
        externalEuint256 amountHandle,
        bytes calldata amountProof,
        bool fromAtoB
    ) external onlyAdmin {
        euint256 amount = Nox.fromExternal(amountHandle, amountProof);

        if (fromAtoB) {
            assetA = Nox.sub(assetA, amount);
            assetB = Nox.add(assetB, amount);
        } else {
            assetB = Nox.sub(assetB, amount);
            assetA = Nox.add(assetA, amount);
        }

        Nox.allowThis(assetA);
        Nox.allowThis(assetB);
        Nox.allow(assetA, admin);
        Nox.allow(assetB, admin);

        rebalanceCount++;
        lastRebalanceBlock = block.number;

        emit RebalanceExecuted(rebalanceCount, block.number);
    }

    /// @notice Ejecuta un lote de operaciones de rebalanceo parciales (batching/layering)
    function batchRebalance(
        externalEuint256[] calldata amounts,
        bytes[] calldata proofs,
        bool[] calldata directions  // true: A->B, false: B->A
    ) external onlyAdmin {
        require(amounts.length == proofs.length && amounts.length == directions.length, "Array length mismatch");

        for (uint256 i = 0; i < amounts.length; i++) {
            euint256 amount = Nox.fromExternal(amounts[i], proofs[i]);

            if (directions[i]) {
                assetA = Nox.sub(assetA, amount);
                assetB = Nox.add(assetB, amount);
            } else {
                assetB = Nox.sub(assetB, amount);
                assetA = Nox.add(assetA, amount);
            }

            Nox.allowThis(assetA);
            Nox.allowThis(assetB);
        }

        Nox.allow(assetA, admin);
        Nox.allow(assetB, admin);

        rebalanceCount++;
        lastRebalanceBlock = block.number;

        emit RebalanceExecuted(rebalanceCount, block.number);
    }
}
