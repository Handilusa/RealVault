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
    MockUSDC: safeAddress("0x181680C8F6975Bbd339e4F7eFC9cbFDaf4844817"),
    WrappedUSDC: safeAddress("0x81E99DD3F0F8a2637fD3dc14cedCa58312C06F7A"),
    FundVault: safeAddress("0x6173B5846d882E7a74904EAd017F425C24147F93"),
    NAVAggregator: safeAddress("0x6A40DC170444B7a66a508ce56Fd2cA2C961A5683"),
    DisclosureManager: safeAddress("0x9B1777491F7ab00C9de386D20d450Ff3f587f28a"),
    RebalancerAgent: safeAddress("0x8b0C3D4922Da61f393c3190fE569f52BCE03a6DD"),
  },
  noxCompute: safeAddress("0x24Ef36Ec5b626D7DCD09a98F3083c2758F0F77bF"),
  publicNavHandle: "0x0000aa36a723006d8c4928a02417aca1e1d96b6c5a87d991e04607721059d189",
};

export const RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";

// ─── Real World Asset Portfolio Reserves (Institutional Asset Definitions) ─────
export const RWA_PORTFOLIO_ASSETS = [
  {
    id: "ust-bill",
    name: "Short-Duration U.S. Treasury Bills",
    ticker: "UST-BILL",
    category: "Sovereign Debt Allocation",
    targetAllocationPct: 60,
    allocationBps: 6000,
    valueUsd: 15660,
    contract: "WrappedUSDC (0x81E9...6F7A)",
    description: "High-liquidity short-term sovereign debt offering risk-minimized baseline yields with continuous compounding.",
    accountingNote: "Verified on-chain test environment (Sepolia)",
  },
  {
    id: "cre-debt",
    name: "Prime Commercial Real Estate Debt",
    ticker: "CRE-DEBT",
    category: "Commercial Real Estate Allocation",
    targetAllocationPct: 40,
    allocationBps: 4000,
    valueUsd: 10440,
    contract: "WrappedUSDC (0x81E9...6F7A)",
    description: "Senior secured first-lien commercial real estate debt backed by prime urban institutional properties.",
    accountingNote: "Verified on-chain test environment (Sepolia)",
  },
];

// ─── On-Chain Fund LPs (Real Sepolia Investor Addresses) ─────────────────────
export const SEPOLIA_FUND_LPS = [
  { address: safeAddress("0xBd889b9c8A8dd99B0EBbaaF482f05e0C55361474"), depositUsd: 1000, pct: 3.8 },
  { address: safeAddress("0x9530CDDECAB21750ce904E14DE25bDFdaE77f3D0"), depositUsd: 2500, pct: 9.6 },
  { address: safeAddress("0xCb76b26D48e66845A12fe856CBCFE7811fc3F677"), depositUsd: 500, pct: 1.9 },
  { address: safeAddress("0x1420cF8Bb9D92C3fDb674ECc5A57295c59078fDA"), depositUsd: 5000, pct: 19.2 },
  { address: safeAddress("0x631D1289196b0266A4ebf94A2D46FA0eb38E5A74"), depositUsd: 7500, pct: 28.7 },
  { address: safeAddress("0x8626f69A1675313469401FD0592a18f2f2E5d5C5"), depositUsd: 3100, pct: 11.9 },
  { address: safeAddress("0xB238E8858C252272a24f0c7ED967F5Bff9Eb3e45"), depositUsd: 4000, pct: 15.3 },
  { address: safeAddress("0x5734E2713e2d6b3ED7BAcD4F5c6f37D625695C05"), depositUsd: 2500, pct: 9.6 },
];

export const FUND_VAULT_ABI = [
  "function deposit(bytes32 ciphertextHandle) external returns (bool)",
  "function rotateHandles() external returns (bool)",
  "function isInvestor(address user) external view returns (bool)",
  "function getPosition(address user) external view returns (bytes32)",
  "function investorCount() external view returns (uint256)",
  "event DepositSubmitted(address indexed investor, bytes32 handle)",
  "event HandlesRotated(uint256 timestamp)",
];

export const NAV_AGGREGATOR_ABI = [
  "function updateNav(bytes32 newNavHandle) external",
  "function aggregatedNav() external view returns (bytes32)",
  "function lastUpdateBlock() external view returns (uint256)",
  "event NavUpdated(bytes32 handle, uint256 blockNumber)",
];

export const DISCLOSURE_MANAGER_ABI = [
  "function grantAuditorAccess(address auditor) external",
  "function revokeAuditorAccess(address auditor) external",
  "function isActiveAuditor(address auditor) external view returns (bool)",
  "event AuditorAccessGranted(address indexed auditor)",
  "event AuditorAccessRevoked(address indexed auditor)",
];

export const REBALANCER_ABI = [
  "function setTargetAllocation(uint256 allocA, uint256 allocB) external",
  "function executeRebalance() external returns (bool)",
  "function targetAllocationA() external view returns (uint256)",
  "function targetAllocationB() external view returns (uint256)",
  "function rebalanceCount() external view returns (uint256)",
  "function lastRebalanceBlock() external view returns (uint256)",
  "event AllocationUpdated(uint256 allocA, uint256 allocB)",
  "event RebalanceExecuted(uint256 timestamp, uint256 bpsA, uint256 bpsB)",
];

export const MOCK_USDC_ABI = [
  "function mint(address to, uint256 amount) external",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
];

export const GAS_BENCHMARKS = [
  { n: 1, grant: 251430, revoke: 198420, aggregate: 48210 },
  { n: 5, grant: 251430, revoke: 482190, aggregate: 48210 },
  { n: 10, grant: 251430, revoke: 836900, aggregate: 48210 },
  { n: 20, grant: 251430, revoke: 1546320, aggregate: 48210 },
  { n: 50, grant: 251430, revoke: 3674580, aggregate: 48210 },
  { n: 100, grant: 251430, revoke: 7221680, aggregate: 48210 },
];

