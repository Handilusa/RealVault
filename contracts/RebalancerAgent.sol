// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {Nox, euint256, externalEuint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

/// @title RebalancerAgent — Sovereign Per-User Confidential Rebalancing Agent
/// @notice Executes portfolio rebalancing between 2 encrypted asset sleeves per-user (msg.sender)
///         without exposing individual trade amounts or position sizes.
contract RebalancerAgent {
    // Per-user asset sleeve balances
    mapping(address => euint256) private userAssetA;
    mapping(address => euint256) private userAssetB;
    mapping(address => bool) public isInitialized;

    // Per-user target allocation rules in basis points (10000 = 100%)
    mapping(address => uint256) public userTargetAllocA; // e.g. 6000 = 60%
    mapping(address => uint256) public userTargetAllocB; // e.g. 4000 = 40%

    // Per-user execution stats
    mapping(address => uint256) public userRebalanceCount;
    mapping(address => uint256) public userLastRebalanceBlock;

    event RebalanceExecuted(address indexed user, uint256 indexed rebalanceId, uint256 blockNumber);
    event TargetAllocationUpdated(address indexed user, uint256 targetA, uint256 targetB);

    constructor() {}

    /// @notice Initialize position for msg.sender with default or initial zero balances
    function initializePosition() public {
        if (!isInitialized[msg.sender]) {
            userAssetA[msg.sender] = Nox.toEuint256(0);
            Nox.allowThis(userAssetA[msg.sender]);
            Nox.allow(userAssetA[msg.sender], msg.sender);

            userAssetB[msg.sender] = Nox.toEuint256(0);
            Nox.allowThis(userAssetB[msg.sender]);
            Nox.allow(userAssetB[msg.sender], msg.sender);

            userTargetAllocA[msg.sender] = 5000;
            userTargetAllocB[msg.sender] = 5000;
            isInitialized[msg.sender] = true;
        }
    }

    /// @notice Update allocation policy for caller's sovereign portfolio
    function setTargetAllocation(uint256 _targetA, uint256 _targetB) external {
        require(_targetA + _targetB == 10000, "Allocation must sum to 100%");
        if (!isInitialized[msg.sender]) {
            initializePosition();
        }
        userTargetAllocA[msg.sender] = _targetA;
        userTargetAllocB[msg.sender] = _targetB;
        emit TargetAllocationUpdated(msg.sender, _targetA, _targetB);
    }

    /// @notice Execute confidential rebalance for caller's own position
    function rebalance(
        externalEuint256 amountHandle,
        bytes calldata amountProof,
        bool fromAtoB
    ) external {
        if (!isInitialized[msg.sender]) {
            initializePosition();
        }

        euint256 amount = Nox.fromExternal(amountHandle, amountProof);

        if (fromAtoB) {
            userAssetA[msg.sender] = Nox.sub(userAssetA[msg.sender], amount);
            userAssetB[msg.sender] = Nox.add(userAssetB[msg.sender], amount);
        } else {
            userAssetB[msg.sender] = Nox.sub(userAssetB[msg.sender], amount);
            userAssetA[msg.sender] = Nox.add(userAssetA[msg.sender], amount);
        }

        Nox.allowThis(userAssetA[msg.sender]);
        Nox.allowThis(userAssetB[msg.sender]);
        Nox.allow(userAssetA[msg.sender], msg.sender);
        Nox.allow(userAssetB[msg.sender], msg.sender);

        userRebalanceCount[msg.sender]++;
        userLastRebalanceBlock[msg.sender] = block.number;

        emit RebalanceExecuted(msg.sender, userRebalanceCount[msg.sender], block.number);
    }

    /// @notice Execute batch rebalance for caller's own position
    function batchRebalance(
        externalEuint256[] calldata amounts,
        bytes[] calldata proofs,
        bool[] calldata directions
    ) external {
        require(amounts.length == proofs.length && amounts.length == directions.length, "Array length mismatch");
        if (!isInitialized[msg.sender]) {
            initializePosition();
        }

        for (uint256 i = 0; i < amounts.length; i++) {
            euint256 amount = Nox.fromExternal(amounts[i], proofs[i]);

            if (directions[i]) {
                userAssetA[msg.sender] = Nox.sub(userAssetA[msg.sender], amount);
                userAssetB[msg.sender] = Nox.add(userAssetB[msg.sender], amount);
            } else {
                userAssetB[msg.sender] = Nox.sub(userAssetB[msg.sender], amount);
                userAssetA[msg.sender] = Nox.add(userAssetA[msg.sender], amount);
            }

            Nox.allowThis(userAssetA[msg.sender]);
            Nox.allowThis(userAssetB[msg.sender]);
        }

        Nox.allow(userAssetA[msg.sender], msg.sender);
        Nox.allow(userAssetB[msg.sender], msg.sender);

        userRebalanceCount[msg.sender]++;
        userLastRebalanceBlock[msg.sender] = block.number;

        emit RebalanceExecuted(msg.sender, userRebalanceCount[msg.sender], block.number);
    }

    /// @notice Get caller's asset handles
    function getUserAssetA(address user) external view returns (euint256) {
        return userAssetA[user];
    }

    function getUserAssetB(address user) external view returns (euint256) {
        return userAssetB[user];
    }
}

