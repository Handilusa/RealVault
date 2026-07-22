// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {Nox, euint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

interface IFundVaultACL {
    function getInvestors() external view returns (address[] memory);
    function getPosition(address investor) external view returns (euint256);
    function rotateHandles(address[] calldata targetInvestors) external;
}

/// @title DisclosureManager — Gestor de Control de Acceso (ACL) de 3 Niveles
/// @notice Administra el acceso de inversores, auditores temporales y mercado público.
///         Utiliza el patrón de Handle Rotation para revocar permisos de auditor de forma irrefutable.
contract DisclosureManager {
    address public admin;
    IFundVaultACL public vault;

    mapping(address => bool) public isActiveAuditor;
    mapping(address => uint256) public auditorGrantedAt;
    address[] public auditorHistory;

    event AuditorAccessGranted(address indexed auditor, uint256 timestamp);
    event AuditorAccessRevoked(address indexed auditor, uint256 timestamp);

    modifier onlyAdmin() {
        require(msg.sender == admin, "DisclosureManager: caller is not admin");
        _;
    }

    constructor(address _vault) {
        admin = msg.sender;
        vault = IFundVaultACL(_vault);
    }

    /// @notice Otorga acceso de lectura (viewer) a un auditor sobre todas las posiciones actuales
    function grantAuditorAccess(address auditor) external onlyAdmin {
        require(auditor != address(0), "Invalid auditor address");
        require(!isActiveAuditor[auditor], "Auditor already active");

        address[] memory investorList = vault.getInvestors();
        for (uint256 i = 0; i < investorList.length; i++) {
            euint256 pos = vault.getPosition(investorList[i]);
            Nox.allow(pos, auditor); // Permite al auditor descifrar off-chain esta posición
        }

        isActiveAuditor[auditor] = true;
        auditorGrantedAt[auditor] = block.timestamp;
        auditorHistory.push(auditor);

        emit AuditorAccessGranted(auditor, block.timestamp);
    }

    /// @notice Revoca acceso de un auditor mediante Handle Rotation en el FundVault
    /// @dev Al rotar los handles, se crea un nuevo handle con un ACL limpio y se otorga permiso
    ///      únicamente al inversor correspondiente. El auditor queda excluido del nuevo handle.
    function revokeAuditorAccess(address auditor) external onlyAdmin {
        require(isActiveAuditor[auditor], "Auditor is not active");

        address[] memory investorList = vault.getInvestors();
        
        // Invocar la rotación de handles en el FundVault
        vault.rotateHandles(investorList);

        isActiveAuditor[auditor] = false;

        emit AuditorAccessRevoked(auditor, block.timestamp);
    }

    /// @notice Devuelve el historial de auditores que han recibido acceso
    function getAuditorHistory() external view returns (address[] memory) {
        return auditorHistory;
    }
}
