// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {Nox, euint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

interface IFundVaultACL {
    function getPosition(address investor) external view returns (euint256);
    function rotateUserHandle(address investor) external;
}

/// @title DisclosureManager — Sovereign Per-Investor Access Control List (ACL) Manager
/// @notice Allows each investor to grant or revoke time-bound viewing access to auditors/regulators
///         over their OWN encrypted vault position exclusively. Revocation is enforced cryptographically
///         via single-user Handle Rotation.
contract DisclosureManager {
    IFundVaultACL public vault;

    // investor => auditor => isActive
    mapping(address => mapping(address => bool)) public isAuditorForInvestor;
    // investor => auditor => grantedAt timestamp
    mapping(address => mapping(address => uint256)) public auditorGrantedAtForInvestor;
    // investor => list of auditors
    mapping(address => address[]) private investorAuditorHistory;

    event AuditorAccessGranted(address indexed investor, address indexed auditor, uint256 timestamp);
    event AuditorAccessRevoked(address indexed investor, address indexed auditor, uint256 timestamp);

    constructor(address _vault) {
        require(_vault != address(0), "Invalid vault address");
        vault = IFundVaultACL(_vault);
    }

    /// @notice Grant viewing permission to an auditor over msg.sender's encrypted position
    function grantAuditorAccess(address auditor) external {
        require(auditor != address(0), "Invalid auditor address");
        require(auditor != msg.sender, "Cannot grant audit access to self");
        require(!isAuditorForInvestor[msg.sender][auditor], "Auditor already active for investor");

        euint256 pos = vault.getPosition(msg.sender);
        Nox.allow(pos, auditor); // Grant ACL key for msg.sender's encrypted position handle

        isAuditorForInvestor[msg.sender][auditor] = true;
        auditorGrantedAtForInvestor[msg.sender][auditor] = block.timestamp;
        investorAuditorHistory[msg.sender].push(auditor);

        emit AuditorAccessGranted(msg.sender, auditor, block.timestamp);
    }

    /// @notice Revoke auditor viewing access over msg.sender's position via single-user Handle Rotation
    function revokeAuditorAccess(address auditor) external {
        require(isAuditorForInvestor[msg.sender][auditor], "Auditor is not active for investor");

        // Rotate only msg.sender's position handle in FundVault
        vault.rotateUserHandle(msg.sender);

        isAuditorForInvestor[msg.sender][auditor] = false;

        emit AuditorAccessRevoked(msg.sender, auditor, block.timestamp);
    }

    /// @notice Check if auditor is active for a given investor
    function isActiveAuditorFor(address investor, address auditor) external view returns (bool) {
        return isAuditorForInvestor[investor][auditor];
    }

    /// @notice Get auditor history for a specific investor
    function getInvestorAuditorHistory(address investor) external view returns (address[] memory) {
        return investorAuditorHistory[investor];
    }
}

