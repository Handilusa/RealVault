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
    MockUSDC: safeAddress("0x57A97B71aF262d60AA0B1408264f69698f287D70"),
    WrappedUSDC: safeAddress("0xd0F2E33A7f66852FacDD4400D28D1D14Ec38729e"),
    FundVault: safeAddress("0xC37da66F128feFE3c91744E8b4aD9208c2083784"),
    NAVAggregator: safeAddress("0x931a690B7e0BFD0f2D2c2173291987fCB819d20a"),
    DisclosureManager: safeAddress("0x4F7eAafEF7680Ef59B120f62c27882dbB068fd6d"),
    RebalancerAgent: safeAddress("0x9f5975d9461Ce41f2c21DDfAB8426DBE00903285"),
    RwaPerpEngine: safeAddress("0x9a42F328EbE36e11Abb92444e9EF4e257Ad33902"),
    ChainlinkOracle: safeAddress("0x5e515fF92C77B9A06DfE09818930e8aFDaFa432E"),
    SignedNavOracle: safeAddress("0xb8725f00342cC7AcBfdc38E16F45CCF7741D8F26"),
    SafeMultisig: safeAddress("0xEB964eD961f6d901ffC36Bf3244430efa4418f9D"),
  },
  noxCompute: safeAddress("0x24Ef36Ec5b626D7DCD09a98F3083c2758F0F77bF"),
  deploymentBlock: 11328000,
};

export const SEPOLIA_RPC_FALLBACKS = [
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://rpc.ankr.com/eth_sepolia",
  "https://1rpc.io/sepolia",
  "https://sepolia.gateway.tenderly.co",
  "https://ethereum-sepolia.blockpi.network/v1/rpc/public",
  "https://rpc.sepolia.org",
];

export const RPC_URL = SEPOLIA_RPC_FALLBACKS[0];

// Cached working RPC index — avoids retrying known-dead endpoints on repeat calls
let _cachedRpcIndex = 0;

/**
 * Creates a JsonRpcProvider, trying each fallback RPC in order until one responds.
 * Uses a 3.5s timeout per RPC attempt so slow/dead nodes don't hang the dApp.
 */
export async function createFallbackProvider(testLogs = false): Promise<ethers.JsonRpcProvider> {
  const withTimeout = <T>(promise: Promise<T>, ms = 3500): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error("RPC Timeout")), ms)),
    ]);
  };

  for (let attempt = 0; attempt < SEPOLIA_RPC_FALLBACKS.length; attempt++) {
    const idx = (_cachedRpcIndex + attempt) % SEPOLIA_RPC_FALLBACKS.length;
    const url = SEPOLIA_RPC_FALLBACKS[idx];
    const provider = new ethers.JsonRpcProvider(url, 11155111, { staticNetwork: true });
    try {
      const block = await withTimeout(provider.getBlockNumber(), 3500);
      if (testLogs) {
        await withTimeout(
          provider.getLogs({
            address: DEPLOYED_ADDRESSES.contracts.FundVault,
            fromBlock: Math.max(0, block - 100),
            toBlock: block,
          }),
          4000
        );
      }
      _cachedRpcIndex = idx; // cache working index
      return provider;
    } catch {
      console.warn(`RPC endpoint failed or timed out: ${url}`);
      continue;
    }
  }
  // All failed — return first one as last resort
  return new ethers.JsonRpcProvider(SEPOLIA_RPC_FALLBACKS[0], 11155111, { staticNetwork: true });
}

/** Synchronous provider factory (no health check). Use createFallbackProvider() when possible. */
export function createJsonRpcProvider(url = RPC_URL) {
  return new ethers.JsonRpcProvider(url, 11155111, { staticNetwork: true });
}

// ─── Real World Asset Portfolio Allocation Definitions (On-Chain Policy) ──────
export const RWA_PORTFOLIO_ASSETS = [
  {
    id: "ust-bill",
    name: "Short-Duration U.S. Treasury Bills",
    ticker: "UST-BILL",
    category: "Sovereign Debt Allocation",
    contract: "WrappedUSDC (ERC-7984)",
    description: "Short-duration sovereign debt sleeve used as the fund's defensive allocation model.",
  },
  {
    id: "cre-debt",
    name: "Prime Commercial Real Estate Debt",
    ticker: "CRE-DEBT",
    category: "Commercial Real Estate Allocation",
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
  "function rotateUserHandle(address investor) external",
  "function disclosureManager() external view returns (address)",
  "function navAggregator() external view returns (address)",
  "event Deposited(address indexed investor)",
  "event Withdrawn(address indexed investor)",
  "event UserHandleRotated(address indexed investor)",
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
  "function vault() external view returns (address)",
  "event NavAggregated(uint256 totalInvestors, uint256 blockNumber)",
];

export const DISCLOSURE_MANAGER_ABI = [
  "function grantAuditorAccess(address auditor) external",
  "function revokeAuditorAccess(address auditor) external",
  "function isActiveAuditorFor(address investor, address auditor) external view returns (bool)",
  "function auditorGrantedAtForInvestor(address investor, address auditor) external view returns (uint256)",
  "function getInvestorAuditorHistory(address investor) external view returns (address[])",
  "function vault() external view returns (address)",
  "event AuditorAccessGranted(address indexed investor, address indexed auditor, uint256 timestamp)",
  "event AuditorAccessRevoked(address indexed investor, address indexed auditor, uint256 timestamp)",
];

export const REBALANCER_ABI = [
  "function setTargetAllocation(uint256 allocA, uint256 allocB) external",
  "function rebalance(bytes32 amountHandle, bytes calldata amountProof, bool fromAtoB) external",
  "function batchRebalance(bytes32[] calldata amounts, bytes[] calldata proofs, bool[] calldata directions) external",
  "function userTargetAllocA(address user) external view returns (uint256)",
  "function userTargetAllocB(address user) external view returns (uint256)",
  "function userRebalanceCount(address user) external view returns (uint256)",
  "function userLastRebalanceBlock(address user) external view returns (uint256)",
  "function isInitialized(address user) external view returns (bool)",
  "event TargetAllocationUpdated(address indexed user, uint256 targetA, uint256 targetB)",
  "event RebalanceExecuted(address indexed user, uint256 indexed rebalanceId, uint256 blockNumber)",
];

export const MOCK_USDC_ABI = [
  "function mint(address to, uint256 amount) external",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
];

export const RWA_PERP_ENGINE_ABI = [
  "function openPosition(bytes32 assetId, bytes32 marginHandle, bytes calldata marginProof, uint8 leverage, bool isLong) external",
  "function closePosition(uint256 positionIndex) external",
  "function getPositions(address user) external view returns (tuple(bytes32 assetId, bytes32 marginHandle, uint128 entryPriceE8, uint80 entryRoundOrNonce, bytes32 entrySourceId, uint8 leverage, uint64 openedAt, bool isLong, bool isOpen)[])",
  "function maxPositionsPerWallet() external view returns (uint256)",
  "function maxMarginPerPositionE6() external view returns (uint256)",
  "function tradingPaused() external view returns (bool)",
  "function assetConfigs(bytes32) external view returns (tuple(bytes32 assetId, string symbol, address oracleAdapter, uint256 maxStaleness, string valuationMethod, string description))",
  "event PositionOpened(address indexed user, uint256 indexed positionIndex, bytes32 assetId, bool isLong, uint8 leverage, uint128 entryPriceE8, uint80 entryRound, bytes32 sourceId, uint64 openedAt)",
  "event PositionClosed(address indexed user, uint256 indexed positionIndex, bytes32 assetId, uint128 exitPriceE8, bytes32 exitSourceId, int256 pnlScalar, uint64 closedAt)",
];

export const ORACLE_ADAPTER_ABI = [
  "function latestPrice(bytes32 assetId) external view returns (uint256 priceE8, uint256 updatedAt, bytes32 sourceId, uint256 confidence, bool settlementEnabled)",
];

// Helper to compute ethers.keccak256(toUtf8Bytes(str))
export const ASSET_IDS = {
  rGOLD: ethers.id("rGOLD"),
  rUSTB: ethers.id("rUSTB"),
  rCRE: ethers.id("rCRE"),
};

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
