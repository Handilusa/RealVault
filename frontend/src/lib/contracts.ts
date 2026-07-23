import { ethers } from "ethers";

// Helper to guarantee valid EIP-55 checksums for Ethers v6
const safeAddress = (addr: string) => {
  try {
    return ethers.getAddress(addr.toLowerCase());
  } catch {
    return addr;
  }
};

// Deployed Contract Addresses on Ethereum Sepolia (Chain ID: 11155111)
export const DEPLOYED_ADDRESSES = {
  network: "sepolia",
  chainId: 11155111,
  contracts: {
    MockUSDC: safeAddress("0xD1f773cB1e56623c6D538002e400c65f46d332F4"),
    WrappedUSDC: safeAddress("0x26251371d262c785ba53553Bd7CF092b42a19d70"),
    FundVault: safeAddress("0xE97e5d50634A3CAb3361fD91858E89B0b716Afd0"),
    NAVAggregator: safeAddress("0x04F2Ae698A5971E6bF653121097b2F2Ab732B370"),
    DisclosureManager: safeAddress("0x518E274002E4a6654C18CD6a59A40107b78e4122"),
    RebalancerAgent: safeAddress("0x279A6dc11abBF4eCBAD89D1f2F60927b692d2482"),
  },
  deployer: safeAddress("0x1420cF8Bb9D92C3fDb674ECc5A57295c59078fDA"),
  noxCompute: safeAddress("0x24Ef36Ec5b626D7DCD09a98F3083c2758F0F77bF"),
  deploymentBlock: 11328000,
};

export const SEPOLIA_RPC_FALLBACKS = [
  "https://sepolia.gateway.tenderly.co",
  "https://rpc.ankr.com/eth_sepolia",
  "https://ethereum-sepolia.blockpi.network/v1/rpc/public",
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://1rpc.io/sepolia",
  "https://rpc2.sepolia.org",
];

export const RPC_URL = SEPOLIA_RPC_FALLBACKS[0];

// Cached working RPC index — avoids retrying known-dead endpoints on repeat calls
let _cachedRpcIndex = 0;

/**
 * Creates a JsonRpcProvider, trying each fallback RPC in order until one responds.
 * Caches the working endpoint index so subsequent calls skip known-dead RPCs.
 */
export async function createFallbackProvider(testLogs = false): Promise<ethers.JsonRpcProvider> {
  // Start from the last known working index
  for (let attempt = 0; attempt < SEPOLIA_RPC_FALLBACKS.length; attempt++) {
    const idx = (_cachedRpcIndex + attempt) % SEPOLIA_RPC_FALLBACKS.length;
    const url = SEPOLIA_RPC_FALLBACKS[idx];
    const provider = new ethers.JsonRpcProvider(url, 11155111, { staticNetwork: true });
    try {
      // Quick health check
      const block = await provider.getBlockNumber();
      if (testLogs) {
        // Test getLogs capacity to prevent 403 Archive errors
        await provider.getLogs({
          address: DEPLOYED_ADDRESSES.contracts.FundVault,
          fromBlock: Math.max(0, block - 100),
          toBlock: block,
        });
      }
      _cachedRpcIndex = idx; // cache working index
      return provider;
    } catch {
      console.warn(`RPC fallback failed (testLogs=${testLogs}): ${url}`);
      continue;
    }
  }
  // All failed — return first one as fallback
  console.error("All Sepolia RPC endpoints failed");
  return new ethers.JsonRpcProvider(SEPOLIA_RPC_FALLBACKS[0], 11155111, { staticNetwork: true });
}

/** Synchronous provider factory (no health check). Use createFallbackProvider() when possible. */
export function createJsonRpcProvider(url = RPC_URL) {
  return new ethers.JsonRpcProvider(url, 11155111, { staticNetwork: true });
}

// ─── Real World Asset Portfolio Allocation Definitions (On-Chain Policy) ──────
// NOTE: Target percentages come from RebalancerAgent.sol (targetAllocationA/B).
// No USD values are hardcoded — they must be derived from on-chain NAV data.
export const RWA_PORTFOLIO_ASSETS = [
  {
    id: "ust-bill",
    name: "Short-Duration U.S. Treasury Bills",
    ticker: "UST-BILL",
    category: "Sovereign Debt Allocation",
    targetAllocationPct: 60,
    allocationBps: 6000,
    contract: "WrappedUSDC (ERC-7984)",
    description: "Short-duration sovereign debt sleeve used as the fund's defensive allocation model.",
  },
  {
    id: "cre-debt",
    name: "Prime Commercial Real Estate Debt",
    ticker: "CRE-DEBT",
    category: "Commercial Real Estate Allocation",
    targetAllocationPct: 40,
    allocationBps: 4000,
    contract: "WrappedUSDC (ERC-7984)",
    description: "Senior secured first-lien commercial real estate debt backed by prime urban institutional properties.",
  },
];

// ─── ABIs — Synced with actual deployed Solidity contracts ───────────────────

export const FUND_VAULT_ABI = [
  "function deposit(bytes32 inputHandle, bytes calldata inputProof, uint256 plainAmount) external",
  "function deposit(bytes32 inputHandle, bytes calldata inputProof) external",
  "function withdraw(bytes32 inputHandle, bytes calldata inputProof, uint256 plainAmount) external",
  "function withdraw(bytes32 inputHandle, bytes calldata inputProof) external",
  "function isInvestor(address user) external view returns (bool)",
  "function getPosition(address user) external view returns (uint256)",
  "function getInvestors() external view returns (address[])",
  "function investorCount() external view returns (uint256)",
  "function admin() external view returns (address)",
  "function disclosureManager() external view returns (address)",
  "function navAggregator() external view returns (address)",
  "event Deposited(address indexed investor)",
  "event Withdrawn(address indexed investor)",
  "event HandlesRotated(uint256 count)",
];

export const NAV_AGGREGATOR_ABI = [
  "function aggregateAll() external",
  "function startBatch() external",
  "function processBatch(uint256 batchSize) external",
  "function aggregatedNav() external view returns (uint256)",
  "function lastUpdateBlock() external view returns (uint256)",
  "function lastInvestorCount() external view returns (uint256)",
  "function batchInProgress() external view returns (bool)",
  "function batchCursor() external view returns (uint256)",
  "function admin() external view returns (address)",
  "function vault() external view returns (address)",
  "event NavAggregated(uint256 totalInvestors, uint256 blockNumber)",
];

export const DISCLOSURE_MANAGER_ABI = [
  "function grantAuditorAccess(address auditor) external",
  "function revokeAuditorAccess(address auditor) external",
  "function isActiveAuditor(address auditor) external view returns (bool)",
  "function auditorGrantedAt(address auditor) external view returns (uint256)",
  "function getAuditorHistory() external view returns (address[])",
  "function admin() external view returns (address)",
  "function vault() external view returns (address)",
  "event AuditorAccessGranted(address indexed auditor, uint256 timestamp)",
  "event AuditorAccessRevoked(address indexed auditor, uint256 timestamp)",
];

export const REBALANCER_ABI = [
  "function setTargetAllocation(uint256 allocA, uint256 allocB) external",
  "function rebalance(bytes32 amountHandle, bytes calldata amountProof, bool fromAtoB) external",
  "function batchRebalance(bytes32[] calldata amounts, bytes[] calldata proofs, bool[] calldata directions) external",
  "function targetAllocationA() external view returns (uint256)",
  "function targetAllocationB() external view returns (uint256)",
  "function rebalanceCount() external view returns (uint256)",
  "function lastRebalanceBlock() external view returns (uint256)",
  "function admin() external view returns (address)",
  "event TargetAllocationUpdated(uint256 targetA, uint256 targetB)",
  "event RebalanceExecuted(uint256 indexed rebalanceId, uint256 blockNumber)",
];

export const MOCK_USDC_ABI = [
  "function mint(address to, uint256 amount) external",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
];

// ─── Gas Benchmark Data — Loaded dynamically from benchmark results ──────────
export interface GasBenchmarkEntry {
  investors: number;
  gas: number;
}

export interface GasBenchmarkData {
  grant: GasBenchmarkEntry[];
  revoke: GasBenchmarkEntry[];
  aggregate: GasBenchmarkEntry[];
}

export async function loadGasBenchmarks(): Promise<GasBenchmarkData | null> {
  try {
    const res = await fetch("/benchmarks/gas-scaling-sepolia.json");
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.gasData?.grant && data?.gasData?.revoke && data?.gasData?.aggregate) {
      return data.gasData as GasBenchmarkData;
    }
    return null;
  } catch {
    return null;
  }
}
