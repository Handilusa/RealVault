"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { useAccount } from "wagmi";
import {
  DEPLOYED_ADDRESSES,
  REBALANCER_ABI,
  ASSET_IDS,
} from "@/lib/contracts";
import { ensureSepoliaNetwork, getReadOnlyProvider, getBrowserSignerProvider, parseWeb3Error } from "@/lib/web3";
import {
  Sliders,
  TrendingUp,
  Info,
  RefreshCw,
  ChevronDown,
  ShieldCheck,
  Zap,
  CheckCircle2,
  Database,
  Calendar,
  Layers,
  AlertCircle,
} from "lucide-react";

// Asset Class Market Benchmarks (Fallback when historical on-chain span < 1.0 day)
const DEFAULT_USTB_APY = 5.20; // US Sovereign Treasuries T-Bill Benchmark
const DEFAULT_CRE_APY = 7.80;  // Commercial Real Estate Funds Benchmark

interface AssetApyData {
  apy: number;
  isRealOnChain: boolean;
  sampleCount: number;
  timeSpanDays: number;
  note?: string;
}

// Calculate annualized APY strictly using on-chain publishedAt timestamps: (NAV_t2 / NAV_t1)^(365 / days) - 1
function calculateAnnualizedApy(nav1: number, nav2: number, timestamp1Sec: number, timestamp2Sec: number): { apy: number; days: number } | null {
  if (nav1 <= 0 || nav2 <= 0 || timestamp2Sec <= timestamp1Sec) return null;
  const timeSpanDays = (timestamp2Sec - timestamp1Sec) / (3600 * 24);
  // Requirement: Must have at least 1.0 full day (24 hours) of historical span to avoid aggressive extrapolation
  if (timeSpanDays < 1.0) return null;

  const growth = nav2 / nav1;
  const annualized = Math.pow(growth, 365 / timeSpanDays) - 1;
  // Clamp between -50% and +200% for economic sanity
  const clamped = Math.min(Math.max(annualized * 100, -50), 200);
  return { apy: clamped, days: timeSpanDays };
}

export default function AutomatedYieldStrategyWidget() {
  const { address: account } = useAccount();

  // Allocation State
  const [targetRatioA, setTargetRatioA] = useState<number>(60);
  const [isProcessingRule, setIsProcessingRule] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  // Dynamic On-Chain APY State
  const [ustbApyData, setUstbApyData] = useState<AssetApyData>({
    apy: DEFAULT_USTB_APY,
    isRealOnChain: false,
    sampleCount: 0,
    timeSpanDays: 0,
  });
  const [creApyData, setCreApyData] = useState<AssetApyData>({
    apy: DEFAULT_CRE_APY,
    isRealOnChain: false,
    sampleCount: 0,
    timeSpanDays: 0,
  });
  const [isQueryingLogs, setIsQueryingLogs] = useState<boolean>(false);

  // Calculate Weighted APY based on live derived asset rates
  const weightedYield = ((targetRatioA * ustbApyData.apy) + ((100 - targetRatioA) * creApyData.apy)) / 100;
  const hasRealOnChainLogs = ustbApyData.isRealOnChain || creApyData.isRealOnChain;
  const totalSampleLogs = ustbApyData.sampleCount + creApyData.sampleCount;
  const maxTimeSpanDays = Math.max(ustbApyData.timeSpanDays, creApyData.timeSpanDays);

  // Confidence Tiering Logic
  // Tier 1: High Confidence (span >= 7.0d and logs >= 5)
  // Tier 2: Limited History (span >= 1.0d)
  // Tier 3: Benchmark Fallback (span < 1.0d)
  const isHighConfidence = hasRealOnChainLogs && maxTimeSpanDays >= 7.0 && totalSampleLogs >= 5;
  const isLimitedHistory = hasRealOnChainLogs && !isHighConfidence;

  // Fetch On-Chain NavSubmitted Logs for rUSTB & rCRE strictly using publishedAt timestamps
  const fetchNavLogsAndCalculateApy = useCallback(async () => {
    setIsQueryingLogs(true);
    try {
      const provider = await getReadOnlyProvider();
      const navOracleAddr = DEPLOYED_ADDRESSES.contracts.SignedNavOracle;
      if (!navOracleAddr) return;

      const navAbi = [
        "event NavSubmitted(bytes32 indexed assetId, uint256 navE8, uint256 publishedAt, uint256 validUntil, uint256 nonce, address indexed publisher)"
      ];
      const contract = new ethers.Contract(navOracleAddr, navAbi, provider);

      // 1. Fetch rUSTB NavSubmitted events
      const filterUSTB = contract.filters.NavSubmitted(ASSET_IDS.rUSTB);
      const logsUSTB = await contract.queryFilter(filterUSTB, DEPLOYED_ADDRESSES.deploymentBlock || 0).catch(() => []);

      if (logsUSTB.length >= 2) {
        const first = logsUSTB[0] as ethers.EventLog;
        const last = logsUSTB[logsUSTB.length - 1] as ethers.EventLog;
        const nav1 = parseFloat(ethers.formatUnits(first.args[1], 8));
        const t1 = Number(first.args[2]); // strictly on-chain publishedAt
        const nav2 = parseFloat(ethers.formatUnits(last.args[1], 8));
        const t2 = Number(last.args[2]); // strictly on-chain publishedAt

        const result = calculateAnnualizedApy(nav1, nav2, t1, t2);
        if (result) {
          setUstbApyData({
            apy: Number(result.apy.toFixed(2)),
            isRealOnChain: true,
            sampleCount: logsUSTB.length,
            timeSpanDays: Number(result.days.toFixed(1)),
          });
        } else {
          setUstbApyData({
            apy: DEFAULT_USTB_APY,
            isRealOnChain: false,
            sampleCount: logsUSTB.length,
            timeSpanDays: Number(((t2 - t1) / 86400).toFixed(1)),
            note: "Limited On-Chain History (< 24h span)",
          });
        }
      }

      // 2. Fetch rCRE NavSubmitted events
      const filterCRE = contract.filters.NavSubmitted(ASSET_IDS.rCRE);
      const logsCRE = await contract.queryFilter(filterCRE, DEPLOYED_ADDRESSES.deploymentBlock || 0).catch(() => []);

      if (logsCRE.length >= 2) {
        const first = logsCRE[0] as ethers.EventLog;
        const last = logsCRE[logsCRE.length - 1] as ethers.EventLog;
        const nav1 = parseFloat(ethers.formatUnits(first.args[1], 8));
        const t1 = Number(first.args[2]); // strictly on-chain publishedAt
        const nav2 = parseFloat(ethers.formatUnits(last.args[1], 8));
        const t2 = Number(last.args[2]); // strictly on-chain publishedAt

        const result = calculateAnnualizedApy(nav1, nav2, t1, t2);
        if (result) {
          setCreApyData({
            apy: Number(result.apy.toFixed(2)),
            isRealOnChain: true,
            sampleCount: logsCRE.length,
            timeSpanDays: Number(result.days.toFixed(1)),
          });
        } else {
          setCreApyData({
            apy: DEFAULT_CRE_APY,
            isRealOnChain: false,
            sampleCount: logsCRE.length,
            timeSpanDays: Number(((t2 - t1) / 86400).toFixed(1)),
            note: "Limited On-Chain History (< 24h span)",
          });
        }
      }
    } catch (err) {
      console.warn("Could not query NavSubmitted logs for APY calculation:", err);
    } finally {
      setIsQueryingLogs(false);
    }
  }, []);

  // Fetch saved user allocation from RebalancerAgent.sol
  const fetchUserAllocation = useCallback(async () => {
    if (!account) return;

    try {
      const provider = await getReadOnlyProvider();
      const agent = new ethers.Contract(
        DEPLOYED_ADDRESSES.contracts.RebalancerAgent,
        REBALANCER_ABI,
        provider
      );

      const [isInit, targetA] = await Promise.all([
        agent.isInitialized(account).catch(() => false),
        agent.userTargetAllocA(account).catch(() => null),
      ]);

      if (isInit && targetA !== null) {
        const pctA = Math.round(Number(targetA) / 100);
        setTargetRatioA(pctA);
      } else if (typeof window !== "undefined") {
        try {
          const saved = localStorage.getItem(`realvault_target_alloc_${account.toLowerCase()}`);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (typeof parsed.a === "number") {
              setTargetRatioA(Math.round(parsed.a / 100));
            }
          }
        } catch {}
      }
    } catch (err) {
      console.error("Failed to fetch rebalancer policy:", err);
    }
  }, [account]);

  useEffect(() => {
    fetchUserAllocation();
    fetchNavLogsAndCalculateApy();
  }, [fetchUserAllocation, fetchNavLogsAndCalculateApy]);

  // Handle Save Allocation Policy on-chain
  const handleUpdateAllocation = async () => {
    if (!account) {
      setStatusMsg("Please connect your Web3 wallet first.");
      return;
    }

    setIsProcessingRule(true);
    setStatusMsg("Submitting setTargetAllocation transaction to Sepolia...");
    setTxHash(null);

    try {
      await ensureSepoliaNetwork();
      const { signer } = await getBrowserSignerProvider();
      const agent = new ethers.Contract(
        DEPLOYED_ADDRESSES.contracts.RebalancerAgent,
        REBALANCER_ABI,
        signer
      );

      const bpsA = BigInt(targetRatioA * 100);
      const bpsB = BigInt((100 - targetRatioA) * 100);

      const tx = await agent.setTargetAllocation(bpsA, bpsB);
      const receipt = await tx.wait();

      setTxHash(tx.hash);
      setStatusMsg(`✅ Sovereign Target Allocation updated on-chain! Gas used: ${receipt.gasUsed.toString()}`);

      if (typeof window !== "undefined") {
        localStorage.setItem(
          `realvault_target_alloc_${account.toLowerCase()}`,
          JSON.stringify({ a: Number(bpsA), b: Number(bpsB) })
        );
      }
    } catch (err: any) {
      setStatusMsg(`Policy update failed: ${parseWeb3Error(err)}`);
    } finally {
      setIsProcessingRule(false);
    }
  };

  return (
    <section id="yield-strategy" className="scroll-mt-20">
      {/* Collapsible Header Card */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full vault-card p-5 flex items-center justify-between gap-4 cursor-pointer hover:border-indigo-200 transition-all duration-200 group"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
            <TrendingUp className="w-4.5 h-4.5 text-emerald-600" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-zinc-900">
                Automated Yield Strategy &amp; Target Allocation
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-100 border border-zinc-200 text-zinc-500 font-medium">
                RebalancerAgent.sol
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Simulate weighted benchmark yields and set your sovereign allocation policy on-chain
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right font-mono">
            <div className="flex items-center gap-1 justify-end">
              {isHighConfidence ? (
                <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded flex items-center gap-1">
                  <Database className="w-3.5 h-3.5 text-emerald-600" />
                  HIGH CONFIDENCE ON-CHAIN NAV
                </span>
              ) : isLimitedHistory ? (
                <span className="text-[10px] font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                  LIMITED TESTNET HISTORY (ELIGIBLE FOR ANNUALIZATION)
                </span>
              ) : (
                <span className="text-[10px] font-mono text-zinc-500 uppercase bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded">
                  INDICATIVE MARKET BENCHMARK
                </span>
              )}
            </div>
            <span className="text-sm font-extrabold text-emerald-600 block mt-1">
              ~{weightedYield.toFixed(2)}% APY
            </span>
          </div>

          <ChevronDown
            className={`w-4 h-4 text-zinc-400 group-hover:text-zinc-600 transition-transform duration-300 ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {/* Expandable Content */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isExpanded ? "max-h-[1400px] opacity-100 mt-4" : "max-h-0 opacity-0"
        }`}
      >
        <div className="vault-card p-6 sm:p-8 space-y-6 bg-white">
          {/* Information & Auditability Disclaimer Banner */}
          <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-200 text-xs font-mono text-indigo-900 flex items-start gap-3">
            <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold flex items-center gap-2">
                <span>Market Benchmark Simulation &amp; On-Chain Verification</span>
                {hasRealOnChainLogs && (
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Verified On-Chain Logs
                  </span>
                )}
              </span>
              <p className="text-[11.5px] font-sans text-indigo-800/90 leading-relaxed">
                Yield projections are computed from {hasRealOnChainLogs ? "verified on-chain SignedNavOracle logs" : "documented market asset benchmarks (rUSTB ~5.20% T-Bills / rCRE ~7.80% Real Estate)"}.
                Saving your policy registers your sovereign preference in <code className="px-1 py-0.5 rounded bg-indigo-100 text-indigo-950 font-mono text-[11px]">RebalancerAgent.sol</code>.
              </p>
            </div>
          </div>

          {/* Preset Buttons */}
          <div className="space-y-2">
            <span className="text-xs font-mono uppercase text-zinc-400 block">
              Policy Allocation Presets:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
              <button
                onClick={() => setTargetRatioA(80)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  targetRatioA === 80
                    ? "bg-indigo-50/80 border-indigo-300 ring-1 ring-indigo-200"
                    : "bg-zinc-50 border-zinc-200 hover:bg-zinc-100"
                }`}
              >
                <div className="font-bold text-zinc-900">Conservative T-Bills (80/20)</div>
                <div className="text-[11px] text-zinc-500 mt-1">
                  ~{((80 * ustbApyData.apy + 20 * creApyData.apy) / 100).toFixed(2)}% APY Target
                </div>
              </button>

              <button
                onClick={() => setTargetRatioA(50)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  targetRatioA === 50
                    ? "bg-indigo-50/80 border-indigo-300 ring-1 ring-indigo-200"
                    : "bg-zinc-50 border-zinc-200 hover:bg-zinc-100"
                }`}
              >
                <div className="font-bold text-zinc-900">Balanced Strategy (50/50)</div>
                <div className="text-[11px] text-zinc-500 mt-1">
                  ~{((50 * ustbApyData.apy + 50 * creApyData.apy) / 100).toFixed(2)}% APY Target
                </div>
              </button>

              <button
                onClick={() => setTargetRatioA(30)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  targetRatioA === 30
                    ? "bg-indigo-50/80 border-indigo-300 ring-1 ring-indigo-200"
                    : "bg-zinc-50 border-zinc-200 hover:bg-zinc-100"
                }`}
              >
                <div className="font-bold text-zinc-900">High-Yield CRE (30/70)</div>
                <div className="text-[11px] text-zinc-500 mt-1">
                  ~{((30 * ustbApyData.apy + 70 * creApyData.apy) / 100).toFixed(2)}% APY Target
                </div>
              </button>
            </div>
          </div>

          {/* Interactive Dual Bar Range Slider */}
          <div className="space-y-4 pt-2 border-t border-zinc-200">
            <div className="flex justify-between items-center text-xs font-mono">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block" />
                <span className="text-zinc-900 font-semibold">
                  Sovereign Debt (rUSTB): {targetRatioA}%
                </span>
                <span className="text-zinc-400 text-[11px]">
                  ({ustbApyData.apy}% {ustbApyData.isRealOnChain ? "Verified NAV" : "Benchmark"})
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-400 text-[11px]">
                  ({creApyData.apy}% {creApyData.isRealOnChain ? "Verified NAV" : "Benchmark"})
                </span>
                <span className="text-zinc-700 font-semibold">
                  Real Estate (rCRE): {100 - targetRatioA}%
                </span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
              </div>
            </div>

            <div className="relative w-full h-8 flex items-center select-none group my-1">
              <div className="w-full h-6 rounded-lg overflow-hidden flex border border-zinc-200 shadow-inner relative bg-zinc-100">
                <div
                  className="bg-indigo-600 h-full transition-all duration-75 flex items-center justify-start pl-3 text-[10px] font-mono text-white font-bold whitespace-nowrap overflow-hidden"
                  style={{ width: `${targetRatioA}%` }}
                >
                  {targetRatioA >= 25 && `${targetRatioA}% rUSTB`}
                </div>
                <div
                  className="bg-emerald-500 h-full transition-all duration-75 flex items-center justify-end pr-3 text-[10px] font-mono text-white font-bold whitespace-nowrap overflow-hidden"
                  style={{ width: `${100 - targetRatioA}%` }}
                >
                  {100 - targetRatioA >= 25 && `${100 - targetRatioA}% rCRE`}
                </div>
              </div>

              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={targetRatioA}
                onChange={(e) => setTargetRatioA(Number(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
              />

              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-white border-2 border-indigo-600 shadow-md pointer-events-none z-10 flex items-center justify-center transition-all group-hover:scale-110 group-active:scale-95"
                style={{ left: `${targetRatioA}%` }}
              >
                <div className="w-2 h-2 rounded-full bg-indigo-600" />
              </div>
            </div>

            {/* Calculated Yield Summary Box */}
            <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 font-mono text-xs">
              <div className="space-y-1">
                <span className="text-zinc-400 text-[10px] uppercase block">
                  Weighted Target APY {hasRealOnChainLogs ? "(Deriving from On-Chain NavSubmitted Logs)" : "(Market Benchmark Derived)"}
                </span>
                <span className="text-base font-extrabold text-emerald-600 block">
                  ~{weightedYield.toFixed(2)}% Annualized APY
                </span>

                {/* Auditability Line */}
                <div className="text-[10.5px] text-zinc-500 flex flex-wrap items-center gap-2 pt-0.5">
                  <span>Source: <code className="px-1 py-0.2 bg-zinc-200 text-zinc-800 rounded font-mono">SignedNavOracleAdapter.sol</code></span>
                  <span>·</span>
                  <span>Window: {maxTimeSpanDays > 0 ? `${maxTimeSpanDays}d` : "Fallback Benchmark"}</span>
                  <span>·</span>
                  <span>Logs: {totalSampleLogs} events</span>
                  {isLimitedHistory && (
                    <>
                      <span>·</span>
                      <span className="italic text-amber-700">Annualized from limited testnet history</span>
                    </>
                  )}
                </div>
              </div>

              <button
                onClick={handleUpdateAllocation}
                disabled={isProcessingRule || !account}
                className="btn-primary py-2.5 px-5 text-xs font-mono flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:cursor-not-allowed shrink-0"
              >
                {isProcessingRule ? (
                  <>
                    <RefreshCw className="animate-spin h-3.5 w-3.5 text-white" />
                    <span>Saving On-Chain...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Save Sovereign Policy On-Chain</span>
                  </>
                )}
              </button>
            </div>

            {statusMsg && (
              <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200 text-xs font-mono text-indigo-900 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold">Transaction Status:</span>
                  {txHash && (
                    <a
                      href={`https://sepolia.etherscan.io/tx/${txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-600 hover:text-indigo-800 underline font-bold"
                    >
                      View on Etherscan ↗
                    </a>
                  )}
                </div>
                <p className="leading-relaxed">{statusMsg}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
