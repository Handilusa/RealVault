// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {Nox, euint256, externalEuint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title FundVault — Fondo RWA Confidencial
/// @notice Administra depositos confidenciales, posiciones individuales cifradas, NAV total cifrado
///         y expone la interfaz rotateHandles() para la rotacion de ACL del DisclosureManager.
///         Otorga permisos ACL a DisclosureManager y NAVAggregator sobre cada handle de posicion.
contract FundVault {
    address public admin;
    address public disclosureManager;
    address public navAggregator;
    IERC20 public depositToken;          // MockUSDC
    address public wrappedToken;         // WrappedUSDC (ERC-7984)

    mapping(address => euint256) private positions;  // balance cifrado por inversor
    address[] public investors;                       // lista publica de inversores
    mapping(address => bool) public isInvestor;

    euint256 public totalNav;            // NAV agregado cifrado
    uint256 public investorCount;

    event Deposited(address indexed investor);
    event Withdrawn(address indexed investor);
    event NavUpdated();
    event DisclosureManagerUpdated(address indexed newManager);
    event NavAggregatorUpdated(address indexed newAggregator);
    event HandlesRotated(uint256 count);

    modifier onlyAdmin() {
        require(msg.sender == admin, "FundVault: caller is not admin");
        _;
    }

    modifier onlyDisclosureManager() {
        require(msg.sender == disclosureManager, "FundVault: caller is not DisclosureManager");
        _;
    }

    constructor(address _depositToken, address _wrappedToken) {
        admin = msg.sender;
        depositToken = IERC20(_depositToken);
        wrappedToken = _wrappedToken;
        totalNav = Nox.toEuint256(0);
        Nox.allowThis(totalNav);
    }

    /// @notice Setea la direccion del DisclosureManager autorizado
    function setDisclosureManager(address _disclosureManager) external onlyAdmin {
        require(_disclosureManager != address(0), "Invalid address");
        disclosureManager = _disclosureManager;
        emit DisclosureManagerUpdated(_disclosureManager);
    }

    /// @notice Setea la direccion del NAVAggregator autorizado
    function setNavAggregator(address _navAggregator) external onlyAdmin {
        require(_navAggregator != address(0), "Invalid address");
        navAggregator = _navAggregator;
        // Allow NAVAggregator to read totalNav handle for TEE enclave aggregation
        Nox.allow(totalNav, _navAggregator);
        emit NavAggregatorUpdated(_navAggregator);
    }

    /// @notice Inversor deposita un monto cifrado y transfiere mUSDC publico a la tesoreria de FundVault
    function deposit(externalEuint256 inputHandle, bytes calldata inputProof, uint256 plainAmount) external {
        if (address(depositToken) != address(0) && plainAmount > 0) {
            require(depositToken.transferFrom(msg.sender, address(this), plainAmount), "FundVault: mUSDC transfer failed");
        }
        _internalDeposit(inputHandle, inputProof);
    }

    /// @notice Sobrecarga para mantener compatibilidad Nox TEE directa
    function deposit(externalEuint256 inputHandle, bytes calldata inputProof) external {
        _internalDeposit(inputHandle, inputProof);
    }

    function _internalDeposit(externalEuint256 inputHandle, bytes calldata inputProof) internal {
        euint256 amount = Nox.fromExternal(inputHandle, inputProof);

        if (!isInvestor[msg.sender]) {
            isInvestor[msg.sender] = true;
            investors.push(msg.sender);
            positions[msg.sender] = Nox.toEuint256(0);
            Nox.allowThis(positions[msg.sender]);
            investorCount++;
        }

        // Sumar al balance confidencial del inversor
        positions[msg.sender] = Nox.add(positions[msg.sender], amount);
        Nox.allowThis(positions[msg.sender]);
        Nox.allow(positions[msg.sender], msg.sender); // Inversor descifra su propia posicion

        // Grant ACL to satellite contracts so they can operate on the handle
        if (disclosureManager != address(0)) {
            Nox.allow(positions[msg.sender], disclosureManager);
        }
        if (navAggregator != address(0)) {
            Nox.allow(positions[msg.sender], navAggregator);
        }

        // Actualizar NAV acumulado cifrado
        totalNav = Nox.add(totalNav, amount);
        Nox.allowThis(totalNav);
        // Re-grant ACL to NAVAggregator after totalNav handle changes
        if (navAggregator != address(0)) {
            Nox.allow(totalNav, navAggregator);
        }

        emit Deposited(msg.sender);
        emit NavUpdated();
    }

    /// @notice Inversor retira un monto cifrado y recibe mUSDC de regreso en su wallet
    function withdraw(externalEuint256 inputHandle, bytes calldata inputProof, uint256 plainAmount) external {
        _internalWithdraw(inputHandle, inputProof);
        if (address(depositToken) != address(0) && plainAmount > 0) {
            require(depositToken.transfer(msg.sender, plainAmount), "FundVault: mUSDC transfer back failed");
        }
    }

    /// @notice Sobrecarga para mantener compatibilidad Nox TEE directa
    function withdraw(externalEuint256 inputHandle, bytes calldata inputProof) external {
        _internalWithdraw(inputHandle, inputProof);
    }

    function _internalWithdraw(externalEuint256 inputHandle, bytes calldata inputProof) internal {
        require(isInvestor[msg.sender], "FundVault: not an investor");

        euint256 amount = Nox.fromExternal(inputHandle, inputProof);

        positions[msg.sender] = Nox.sub(positions[msg.sender], amount);
        Nox.allowThis(positions[msg.sender]);
        Nox.allow(positions[msg.sender], msg.sender);

        // Re-grant ACL to satellite contracts after handle change
        if (disclosureManager != address(0)) {
            Nox.allow(positions[msg.sender], disclosureManager);
        }
        if (navAggregator != address(0)) {
            Nox.allow(positions[msg.sender], navAggregator);
        }

        totalNav = Nox.sub(totalNav, amount);
        Nox.allowThis(totalNav);
        if (navAggregator != address(0)) {
            Nox.allow(totalNav, navAggregator);
        }

        emit Withdrawn(msg.sender);
        emit NavUpdated();
    }

    /// @notice Devuelve la lista completa de inversores para el NAVAggregator y DisclosureManager
    function getInvestors() external view returns (address[] memory) {
        return investors;
    }

    /// @notice Devuelve el handle cifrado de la posicion de un inversor
    function getPosition(address investor) external view returns (euint256) {
        return positions[investor];
    }

    /// @notice Rota los handles de posiciones cifradas para aislar permisos (Revocacion O(n))
    /// @dev Callable SOLO por el DisclosureManager durante auditorias o revocaciones
    function rotateHandles(address[] calldata targetInvestors) external onlyDisclosureManager {
        for (uint256 i = 0; i < targetInvestors.length; i++) {
            address inv = targetInvestors[i];
            if (isInvestor[inv]) {
                // Crear un nuevo handle con el mismo valor (Nox.add con 0) -> ACL limpio
                euint256 oldHandle = positions[inv];
                euint256 newHandle = Nox.add(oldHandle, Nox.toEuint256(0));
                
                Nox.allowThis(newHandle);
                Nox.allow(newHandle, inv); // Re-grant de acceso al inversor unicamente

                // Re-grant ACL to satellite contracts on the new (rotated) handle
                if (disclosureManager != address(0)) {
                    Nox.allow(newHandle, disclosureManager);
                }
                if (navAggregator != address(0)) {
                    Nox.allow(newHandle, navAggregator);
                }

                positions[inv] = newHandle;
            }
        }
        emit HandlesRotated(targetInvestors.length);
    }
}
