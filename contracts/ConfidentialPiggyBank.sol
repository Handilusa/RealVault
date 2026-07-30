// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {Nox, euint256, externalEuint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

/// @title ConfidentialPiggyBank — Multi-User Sovereign Encrypted Piggy Bank
/// @notice Simple encrypted savings contract allowing any wallet to maintain their own private balance.
contract ConfidentialPiggyBank {
    mapping(address => euint256) private balances;
    mapping(address => bool) public isInitialized;

    event Deposited(address indexed account);
    event Withdrawn(address indexed account);

    constructor() {}

    function deposit(externalEuint256 inputHandle, bytes calldata inputProof) external {
        euint256 amount = Nox.fromExternal(inputHandle, inputProof);
        if (!isInitialized[msg.sender]) {
            balances[msg.sender] = Nox.toEuint256(0);
            isInitialized[msg.sender] = true;
        }

        balances[msg.sender] = Nox.add(balances[msg.sender], amount);
        Nox.allowThis(balances[msg.sender]);
        Nox.allow(balances[msg.sender], msg.sender);
        emit Deposited(msg.sender);
    }

    function withdraw(externalEuint256 inputHandle, bytes calldata inputProof) external {
        require(isInitialized[msg.sender], "No active piggy bank balance");
        euint256 amount = Nox.fromExternal(inputHandle, inputProof);
        balances[msg.sender] = Nox.sub(balances[msg.sender], amount);
        Nox.allowThis(balances[msg.sender]);
        Nox.allow(balances[msg.sender], msg.sender);
        emit Withdrawn(msg.sender);
    }

    function getBalance(address account) external view returns (euint256) {
        return balances[account];
    }
}

