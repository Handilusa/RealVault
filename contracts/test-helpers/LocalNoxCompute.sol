// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @dev Hardhat-only test helper that implements the INoxCompute interface
 * methods used by RealVault contracts. Lives under contracts/test-helpers/
 * (NOT a mock — it's a local compute stub for offline Hardhat tests on chain 31337).
 *
 * Implements exact function selectors from INoxCompute so Nox.sol library calls
 * resolve correctly when deployed bytecode is injected at 0x75C6...685.
 */
contract LocalNoxCompute {
    // TEEType enum index: Uint256 = 35 (matches @iexec-nox TypeUtils.sol)

    /// @dev wrapAsPublicHandle(bytes32 value, TEEType teeType) -> bytes32
    /// TEEType is an enum, ABI-encoded as uint8
    function wrapAsPublicHandle(bytes32 value, uint8 /* teeType */) external pure returns (bytes32) {
        if (value == bytes32(0)) return bytes32(0);
        return value;
    }

    /// @dev allow(bytes32 handle, address account) — ACL grant (no-op in local tests)
    function allow(bytes32 handle, address /* account */) external pure returns (bytes32) {
        return handle;
    }

    /// @dev allowTransient(bytes32 handle, address account) — transient ACL (no-op)
    function allowTransient(bytes32 /* handle */, address /* account */) external pure {}

    /// @dev isAllowed(bytes32 handle, address account) — always true locally
    function isAllowed(bytes32 /* handle */, address /* account */) external pure returns (bool) {
        return true;
    }

    /// @dev validateInputProof(bytes32, address, bytes, uint8) — no-op for local tests
    function validateInputProof(bytes32 /* handle */, address /* owner */, bytes calldata /* proof */, uint8 /* teeType */) external pure {}

    /// @dev add(bytes32 a, bytes32 b) -> bytes32
    function add(bytes32 a, bytes32 b) external pure returns (bytes32) {
        return bytes32(uint256(a) + uint256(b));
    }

    /// @dev safeAdd(bytes32 a, bytes32 b) -> (bytes32 success, bytes32 result)
    function safeAdd(bytes32 a, bytes32 b) external pure returns (bytes32, bytes32) {
        uint256 valA = uint256(a);
        uint256 valB = uint256(b);
        unchecked {
            uint256 res = valA + valB;
            if (res < valA) {
                return (bytes32(0), bytes32(0));
            }
            return (bytes32(uint256(1)), bytes32(res));
        }
    }

    /// @dev sub(bytes32 a, bytes32 b) -> bytes32
    function sub(bytes32 a, bytes32 b) external pure returns (bytes32) {
        uint256 valA = uint256(a);
        uint256 valB = uint256(b);
        if (valB >= valA) return bytes32(0);
        return bytes32(valA - valB);
    }

    /// @dev safeSub(bytes32 a, bytes32 b) -> (bytes32 success, bytes32 result)
    function safeSub(bytes32 a, bytes32 b) external pure returns (bytes32, bytes32) {
        uint256 valA = uint256(a);
        uint256 valB = uint256(b);
        if (valB > valA) {
            return (bytes32(0), bytes32(0));
        }
        return (bytes32(uint256(1)), bytes32(valA - valB));
    }

    /// @dev mul(bytes32 a, bytes32 b) -> bytes32
    function mul(bytes32 a, bytes32 b) external pure returns (bytes32) {
        return bytes32(uint256(a) * uint256(b));
    }

    /// @dev select(bytes32 condition, bytes32 ifTrue, bytes32 ifFalse) -> bytes32
    function select(bytes32 condition, bytes32 ifTrue, bytes32 ifFalse) external pure returns (bytes32) {
        return uint256(condition) != 0 ? ifTrue : ifFalse;
    }

    /// @dev gt(bytes32 a, bytes32 b) -> bytes32 condition
    function gt(bytes32 a, bytes32 b) external pure returns (bytes32) {
        return bytes32(uint256(uint256(a) > uint256(b) ? 1 : 0));
    }

    /// @dev ge(bytes32 a, bytes32 b) -> bytes32 condition
    function ge(bytes32 a, bytes32 b) external pure returns (bytes32) {
        return bytes32(uint256(uint256(a) >= uint256(b) ? 1 : 0));
    }

    /// @dev lt(bytes32 a, bytes32 b) -> bytes32 condition
    function lt(bytes32 a, bytes32 b) external pure returns (bytes32) {
        return bytes32(uint256(uint256(a) < uint256(b) ? 1 : 0));
    }

    /// @dev le(bytes32 a, bytes32 b) -> bytes32 condition
    function le(bytes32 a, bytes32 b) external pure returns (bytes32) {
        return bytes32(uint256(uint256(a) <= uint256(b) ? 1 : 0));
    }
}
