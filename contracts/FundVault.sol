// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {Nox, euint256, externalEuint256, ebool} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title FundVault - Sovereign Confidential RWA Vault
/// @notice Manages confidential deposits, encrypted investor positions, and aggregate NAV handles.
///         Enforces per-user handle rotation to revoke audit access cryptographically.
contract FundVault {
    address public initialDeployer;
    address public disclosureManager;
    address public navAggregator;
    IERC20 public depositToken;          // MockUSDC
    address public wrappedToken;         // WrappedUSDC (ERC-7984)

    mapping(address => euint256) private positions;  // encrypted balance per investor
    address[] public investors;                       // investor address registry
    mapping(address => bool) public isInvestor;

    euint256 public totalNav;            // encrypted aggregate NAV handle
    uint256 public investorCount;

    // Whitelist of contracts authorized to call debitFrom/creditTo
    mapping(address => bool) public authorizedContracts;
    address[] public authorizedContractList;  // Iterable list for ACL grants

    event Deposited(address indexed investor);
    event AuthorizedContractSet(address indexed contractAddress, bool authorized);
    event BalanceDebited(address indexed investor, address indexed authorizedContract);
    event BalanceCredited(address indexed investor, address indexed authorizedContract);
    event Withdrawn(address indexed investor);
    event NavUpdated();
    event DisclosureManagerUpdated(address indexed newManager);
    event NavAggregatorUpdated(address indexed newAggregator);
    event UserHandleRotated(address indexed investor);

    modifier onlyDisclosureManagerOrUser(address investor) {
        require(
            msg.sender == disclosureManager || msg.sender == investor,
            "FundVault: unauthorized rotation caller"
        );
        _;
    }

    constructor(address _depositToken, address _wrappedToken) {
        initialDeployer = msg.sender;
        depositToken = IERC20(_depositToken);
        wrappedToken = _wrappedToken;
        totalNav = Nox.toEuint256(0);
        Nox.allowThis(totalNav);
    }

    /// @notice One-time linkage for DisclosureManager
    function setDisclosureManager(address _disclosureManager) external {
        require(disclosureManager == address(0) || msg.sender == initialDeployer, "DisclosureManager already set");
        require(_disclosureManager != address(0), "Invalid address");
        disclosureManager = _disclosureManager;
        emit DisclosureManagerUpdated(_disclosureManager);
    }

    /// @notice One-time linkage for NAVAggregator
    function setNavAggregator(address _navAggregator) external {
        require(navAggregator == address(0) || msg.sender == initialDeployer, "NavAggregator already set");
        require(_navAggregator != address(0), "Invalid address");
        navAggregator = _navAggregator;
        Nox.allow(totalNav, _navAggregator);
        emit NavAggregatorUpdated(_navAggregator);
    }

    /// @notice Investor deposits encrypted amount and transfers plain mUSDC to vault
    function deposit(externalEuint256 inputHandle, bytes calldata inputProof, uint256 plainAmount) external {
        if (address(depositToken) != address(0) && plainAmount > 0) {
            require(depositToken.transferFrom(msg.sender, address(this), plainAmount), "FundVault: mUSDC transfer failed");
        }
        _internalDeposit(inputHandle, inputProof);
    }

    /// @notice Direct Nox TEE overload
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

        // Add to confidential balance with safe arithmetic
        (ebool addOk, euint256 newPos) = Nox.safeAdd(positions[msg.sender], amount);
        positions[msg.sender] = Nox.select(addOk, newPos, positions[msg.sender]);
        
        // Grant ACL permissions using centralized helper
        _grantPositionAcl(msg.sender, positions[msg.sender]);

        // Update aggregate NAV with safe arithmetic
        (ebool navAddOk, euint256 newNav) = Nox.safeAdd(totalNav, amount);
        totalNav = Nox.select(navAddOk, newNav, totalNav);
        Nox.allowThis(totalNav);
        if (navAggregator != address(0)) {
            Nox.allow(totalNav, navAggregator);
        }

        emit Deposited(msg.sender);
        emit NavUpdated();
    }

    /// @notice Investor withdraws encrypted amount and receives plain mUSDC back
    function withdraw(externalEuint256 inputHandle, bytes calldata inputProof, uint256 plainAmount) external {
        _internalWithdraw(inputHandle, inputProof);
        if (address(depositToken) != address(0) && plainAmount > 0) {
            require(depositToken.transfer(msg.sender, plainAmount), "FundVault: mUSDC transfer back failed");
        }
    }

    /// @notice Direct Nox TEE overload
    function withdraw(externalEuint256 inputHandle, bytes calldata inputProof) external {
        _internalWithdraw(inputHandle, inputProof);
    }

    function _internalWithdraw(externalEuint256 inputHandle, bytes calldata inputProof) internal {
        require(isInvestor[msg.sender], "FundVault: not an investor");

        euint256 amount = Nox.fromExternal(inputHandle, inputProof);

        // Subtract from confidential balance with safe arithmetic (prevents underflow)
        (ebool subOk, euint256 newPos) = Nox.safeSub(positions[msg.sender], amount);
        positions[msg.sender] = Nox.select(subOk, newPos, positions[msg.sender]);
        
        // Grant ACL permissions using centralized helper
        _grantPositionAcl(msg.sender, positions[msg.sender]);

        // Update aggregate NAV with safe arithmetic
        (ebool navSubOk, euint256 newNav) = Nox.safeSub(totalNav, amount);
        totalNav = Nox.select(navSubOk, newNav, totalNav);
        Nox.allowThis(totalNav);
        if (navAggregator != address(0)) {
            Nox.allow(totalNav, navAggregator);
        }

        emit Withdrawn(msg.sender);
        emit NavUpdated();
    }

    /// @notice Get investor address list (for satellite contracts and UI verification)
    function getInvestors() external view returns (address[] memory) {
        return investors;
    }

    /// @notice Get encrypted position handle for an investor
    function getPosition(address investor) external view returns (euint256) {
        return positions[investor];
    }

    /// @notice Rotates single investor position handle to purge auditor ACL viewing access
    function rotateUserHandle(address investor) external onlyDisclosureManagerOrUser(investor) {
        if (isInvestor[investor]) {
            euint256 oldHandle = positions[investor];
            euint256 newHandle = Nox.add(oldHandle, Nox.toEuint256(0));
            
            Nox.allowThis(newHandle);
            Nox.allow(newHandle, investor); // Re-grant access to investor ONLY

            if (disclosureManager != address(0)) {
                Nox.allow(newHandle, disclosureManager);
            }
            if (navAggregator != address(0)) {
                Nox.allow(newHandle, navAggregator);
            }

            positions[investor] = newHandle;
            emit UserHandleRotated(investor);
        }
    }

    /// @notice Set authorization status for external contracts (e.g., RwaPerpEngine)
    /// @dev Only initialDeployer can authorize contracts
    /// @param contractAddress Address of the contract to authorize/deauthorize
    /// @param authorized True to authorize, false to remove authorization
    function setAuthorizedContract(address contractAddress, bool authorized) external {
        require(msg.sender == initialDeployer, "FundVault: only deployer");
        require(contractAddress != address(0), "FundVault: invalid address");
        
        if (authorized && !authorizedContracts[contractAddress]) {
            // Add to iterable list
            authorizedContractList.push(contractAddress);
        } else if (!authorized && authorizedContracts[contractAddress]) {
            // Remove from iterable list (swap-and-pop)
            for (uint256 i = 0; i < authorizedContractList.length; i++) {
                if (authorizedContractList[i] == contractAddress) {
                    authorizedContractList[i] = authorizedContractList[authorizedContractList.length - 1];
                    authorizedContractList.pop();
                    break;
                }
            }
        }
        
        authorizedContracts[contractAddress] = authorized;
        emit AuthorizedContractSet(contractAddress, authorized);
    }

    /// @notice Debits encrypted amount from investor balance (authorized contracts only)
    /// @dev CRITICAL: FundVault executes safeSub internally with validation
    /// @dev Following ERC-7984 pattern: arithmetic stays in vault, not caller
    /// @param investor Address of the investor
    /// @param amount Encrypted amount to debit (euint256 handle)
    /// @return newBalance New encrypted balance after debit
    function debitFrom(address investor, euint256 amount) external returns (euint256 newBalance) {
        require(authorizedContracts[msg.sender], "FundVault: unauthorized contract");
        require(isInvestor[investor], "FundVault: not an investor");
        
        // Execute safe subtraction (FundVault controls arithmetic)
        // CRITICAL: Use ebool to detect underflow and fallback to unchanged balance
        (ebool subOk, euint256 result) = Nox.safeSub(positions[investor], amount);
        positions[investor] = Nox.select(subOk, result, positions[investor]);  // Fallback: no changes if underflow
        
        // Grant ACL permissions using centralized helper
        _grantPositionAcl(investor, positions[investor]);
        
        emit BalanceDebited(investor, msg.sender);
        return positions[investor];
    }

    /// @notice Credits encrypted amount to investor balance (authorized contracts only)
    /// @dev CRITICAL: FundVault executes safeAdd internally
    /// @dev Following ERC-7984 pattern: arithmetic stays in vault, not caller
    /// @param investor Address of the investor
    /// @param amount Encrypted amount to credit (euint256 handle)
    /// @return newBalance New encrypted balance after credit
    function creditTo(address investor, euint256 amount) external returns (euint256 newBalance) {
        require(authorizedContracts[msg.sender], "FundVault: unauthorized contract");
        require(isInvestor[investor], "FundVault: not an investor");
        
        // Execute safe addition (FundVault controls arithmetic)
        // CRITICAL: Use ebool to detect overflow and fallback to unchanged balance
        (ebool addOk, euint256 result) = Nox.safeAdd(positions[investor], amount);
        positions[investor] = Nox.select(addOk, result, positions[investor]);  // Fallback: no changes if overflow
        
        // Grant ACL permissions using centralized helper
        _grantPositionAcl(investor, positions[investor]);
        
        emit BalanceCredited(investor, msg.sender);
        return positions[investor];
    }

    // ============================================
    // INTERNAL HELPERS
    // ============================================

    /// @notice Centralized ACL management for position handles
    /// @dev CRITICAL: All balance mutations MUST call this helper to ensure consistent ACL grants
    /// @dev This prevents ACL desynchronization bugs across deposit/withdraw/debit/credit operations
    /// @param investor The investor whose position handle needs ACL grants
    /// @param handle The encrypted balance handle to grant permissions on
    function _grantPositionAcl(address investor, euint256 handle) internal {
        // Core permissions
        Nox.allowThis(handle);                      // FundVault can operate
        Nox.allow(handle, investor);                // Investor can decrypt
        
        // CRITICAL: Grant ACL to ALL authorized contracts (e.g., RwaPerpEngine, liquidation engine)
        // This is necessary because during user-initiated deposits, msg.sender is the user,
        // so authorized contracts would never get ACL if we only granted to msg.sender.
        // Without this, RwaPerpEngine.openPosition() reverts with ACL error (0xb87a12a9)
        // when calling _debitMargin -> FundVault.getPosition() -> Nox operations on the handle.
        for (uint256 i = 0; i < authorizedContractList.length; i++) {
            Nox.allow(handle, authorizedContractList[i]);
        }
        
        // Optional satellite contracts
        if (disclosureManager != address(0)) {
            Nox.allow(handle, disclosureManager);   // Auditor can view
        }
        if (navAggregator != address(0)) {
            Nox.allow(handle, navAggregator);       // NavAggregator can read
        }
    }
}

