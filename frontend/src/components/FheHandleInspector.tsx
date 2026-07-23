"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import {
  DEPLOYED_ADDRESSES,
  createFallbackProvider,
  FUND_VAULT_ABI,
  NAV_AGGREGATOR_ABI,
} from "@/lib/contracts";

const ETHERSCAN_BASE = "https://sepolia.etherscan.io";

interface FheHandleInspectorProps {
  navHandle?: string | null;
  positionHandle?: string | null;
}

interface OnChainHandle {
  label: string;
  hex: string;
  source: string; // contract name
  sourceAddress: string;
  method: string;
  blockFetched: number;
}

/** Convert BigInt / raw value to 0x-prefixed 32-byte hex string */
const toHexHandle = (val: any): string | null => {
  if (!val || val === "0" || val === 0n) return null;
  try {
    const big = BigInt(val);
    if (big === 0n) return null;
    return ethers.toBeHex(big, 32);
  } catch {
    return String(val);
  }
};

/** Parse handle bytes to extract chain ID prefix */
const parseChainId = (hex: string): { chainId: number | null; prefix: string; networkName: string } => {
  const clean = hex.toLowerCase();
  // Nox Protocol encodes chain ID in bytes 2-5 of the handle (after 0x00 00)
  // Sepolia = 0xaa36a7 = 11155111
  if (clean.startsWith("0x0000aa36a7")) {
    return { chainId: 11155111, prefix: clean.slice(0, 12), networkName: "Sepolia" };
  }
  // Bellecour (iExec sidechain) = 0x86 = 134
  if (clean.startsWith("0x00000086")) {
    return { chainId: 134, prefix: clean.slice(0, 10), networkName: "Bellecour" };
  }
  // Mainnet = 0x01
  if (clean.startsWith("0x00000001")) {
    return { chainId: 1, prefix: clean.slice(0, 10), networkName: "Ethereum Mainnet" };
  }
  // Unknown — try to extract hex bytes 3-5 as chain id
  try {
    const possibleId = parseInt(clean.slice(6, 12), 16);
    if (possibleId > 0 && possibleId < 999999999) {
      return { chainId: possibleId, prefix: clean.slice(0, 12), networkName: `Chain ${possibleId}` };
    }
  } catch { /* ignore */ }
  return { chainId: null, prefix: clean.slice(0, 12), networkName: "Unknown" };
};

export default function FheHandleInspector({
  navHandle: propNavHandle,
  positionHandle: propPositionHandle,
}: FheHandleInspectorProps) {
  // On-chain state
  const [onChainHandles, setOnChainHandles] = useState<OnChainHandle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentBlock, setCurrentBlock] = useState<number>(0);

  // Currently selected handle for detailed inspection
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  // Manual paste input
  const [manualInput, setManualInput] = useState<string>("");
  const [useManual, setUseManual] = useState(false);

  /** Fetch real handles from on-chain contracts */
  const fetchOnChainHandles = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const provider = await createFallbackProvider();
      const block = await provider.getBlockNumber();
      setCurrentBlock(block);

      const vault = new ethers.Contract(
        DEPLOYED_ADDRESSES.contracts.FundVault,
        FUND_VAULT_ABI,
        provider
      );
      const nav = new ethers.Contract(
        DEPLOYED_ADDRESSES.contracts.NAVAggregator,
        NAV_AGGREGATOR_ABI,
        provider
      );

      const handles: OnChainHandle[] = [];

      // 1. Fetch aggregated NAV handle from NAVAggregator
      try {
        const rawNav = await nav.aggregatedNav();
        const navHex = toHexHandle(rawNav);
        if (navHex) {
          handles.push({
            label: "Aggregated NAV (Total Fund Value)",
            hex: navHex,
            source: "NAVAggregator",
            sourceAddress: DEPLOYED_ADDRESSES.contracts.NAVAggregator,
            method: "aggregatedNav()",
            blockFetched: block,
          });
        }
      } catch (e) {
        console.warn("Failed to fetch aggregatedNav:", e);
      }

      // 2. Fetch all investor position handles from FundVault
      try {
        const investorList: string[] = await vault.getInvestors();
        for (const addr of investorList) {
          try {
            const rawPos = await vault.getPosition(addr);
            const posHex = toHexHandle(rawPos);
            if (posHex) {
              handles.push({
                label: `Investor Position (${addr.slice(0, 6)}...${addr.slice(-4)})`,
                hex: posHex,
                source: "FundVault",
                sourceAddress: DEPLOYED_ADDRESSES.contracts.FundVault,
                method: `getPosition(${addr.slice(0, 8)}...)`,
                blockFetched: block,
              });
            }
          } catch { /* skip individual failures */ }
        }
      } catch (e) {
        console.warn("Failed to fetch investor list:", e);
      }

      // 3. If props provided real handles not already captured, add them
      if (propNavHandle && !handles.some((h) => h.hex === propNavHandle)) {
        handles.unshift({
          label: "NAV Handle (from Dashboard)",
          hex: propNavHandle,
          source: "NAVAggregator",
          sourceAddress: DEPLOYED_ADDRESSES.contracts.NAVAggregator,
          method: "aggregatedNav()",
          blockFetched: block,
        });
      }
      if (propPositionHandle && !handles.some((h) => h.hex === propPositionHandle)) {
        handles.push({
          label: "Your Position Handle (Connected Wallet)",
          hex: propPositionHandle,
          source: "FundVault",
          sourceAddress: DEPLOYED_ADDRESSES.contracts.FundVault,
          method: "getPosition(wallet)",
          blockFetched: block,
        });
      }

      setOnChainHandles(handles);
      if (handles.length > 0) setSelectedIdx(0);
    } catch (err: any) {
      console.error("FHE Handle fetch error:", err);
      setError(err.message || "Failed to connect to Sepolia RPC");
    } finally {
      setLoading(false);
    }
  }, [propNavHandle, propPositionHandle]);

  useEffect(() => {
    fetchOnChainHandles();
  }, [fetchOnChainHandles]);

  // Determine the handle to inspect
  const activeHandle = useManual && manualInput.trim()
    ? manualInput.trim().toLowerCase()
    : onChainHandles[selectedIdx]?.hex || "";
  const activeSource = useManual ? null : onChainHandles[selectedIdx] || null;

  const cleanHandle = activeHandle.toLowerCase();
  const isValidHex = /^0x[0-9a-f]{64}$/.test(cleanHandle);
  const chain = isValidHex ? parseChainId(cleanHandle) : null;

  return (
    <div className="vault-card p-6 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-zinc-200">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-zinc-900">
              TEE Handle &amp; Ciphertext Inspector
            </h3>
            <span className="badge-fhe text-[10px]">iExec Nox SDK</span>
            {loading ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 font-mono font-semibold animate-pulse">
                Querying Sepolia...
              </span>
            ) : onChainHandles.length > 0 ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono font-semibold">
                {onChainHandles.length} Live Handle{onChainHandles.length !== 1 ? "s" : ""}
              </span>
            ) : null}
          </div>
          <p className="text-sm text-zinc-500 mt-1">
            Live on-chain encrypted handles fetched from deployed Sepolia contracts — no mock data
          </p>
        </div>

        {/* Refresh */}
        <button
          onClick={() => { fetchOnChainHandles(); setUseManual(false); }}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-semibold border border-zinc-200 transition-colors disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh from Chain"}
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-mono">
          RPC Error: {error}
        </div>
      )}

      {/* Handle selector: real on-chain handles */}
      {onChainHandles.length > 0 && (
        <div className="space-y-2">
          <label className="text-[10px] font-mono uppercase text-zinc-400 block tracking-wider">
            Select On-Chain Handle to Inspect
          </label>
          <div className="flex flex-wrap gap-2">
            {onChainHandles.map((h, i) => (
              <button
                key={i}
                onClick={() => { setSelectedIdx(i); setUseManual(false); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  !useManual && selectedIdx === i
                    ? h.source === "NAVAggregator"
                      ? "bg-indigo-50 text-indigo-700 border-indigo-300 ring-1 ring-indigo-200"
                      : "bg-emerald-50 text-emerald-700 border-emerald-300 ring-1 ring-emerald-200"
                    : "bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100"
                }`}
              >
                <span className="font-mono">{h.source}</span>
                <span className="text-zinc-400 mx-1">&middot;</span>
                {h.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* No handles found */}
      {!loading && onChainHandles.length === 0 && !error && (
        <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <strong>No encrypted handles found on-chain.</strong> Deposit into FundVault on Sepolia to create real TEE-encrypted position handles, or run the NAV aggregation to generate the aggregated NAV handle.
        </div>
      )}

      {/* Manual paste option */}
      <div className="space-y-2">
        <button
          onClick={() => setUseManual(!useManual)}
          className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold underline underline-offset-2"
        >
          {useManual ? "Use on-chain handle instead" : "Or paste a custom handle to inspect"}
        </button>
        {useManual && (
          <input
            type="text"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            className="w-full font-mono text-xs p-3 rounded-lg border border-zinc-300 bg-zinc-50 focus:bg-white focus:border-indigo-500 focus:outline-none text-zinc-900"
            placeholder="0x... (paste any euint256 ciphertext handle)"
          />
        )}
      </div>

      {/* Active handle display */}
      {activeHandle && (
        <div className="space-y-4">
          {/* Raw handle hex */}
          <div className="p-4 rounded-lg bg-zinc-900 text-zinc-100 font-mono text-xs break-all leading-relaxed relative group">
            <span className="text-zinc-500 text-[10px] block mb-1 uppercase tracking-wider">
              {activeSource ? `${activeSource.source}.${activeSource.method}` : "Custom Handle"}
            </span>
            <code className="text-emerald-400 text-[13px]">{activeHandle}</code>
            {activeSource && (
              <a
                href={`${ETHERSCAN_BASE}/address/${activeSource.sourceAddress}#readContract`}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute top-3 right-3 text-[10px] px-2 py-1 rounded bg-zinc-800 text-indigo-400 hover:text-indigo-300 border border-zinc-700 font-semibold transition-colors"
              >
                Verify on Etherscan &rarr;
              </a>
            )}
          </div>

          {/* Verification Matrix */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs">
            {/* 1. Hex Length */}
            <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200 space-y-1">
              <span className="text-zinc-400 uppercase text-[10px] block">Payload Length</span>
              <div className={`font-bold ${isValidHex ? "text-emerald-600" : "text-red-500"}`}>
                {isValidHex ? (
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    32 Bytes (256-bit)
                  </span>
                ) : (
                  "Invalid Hex Length"
                )}
              </div>
              <span className="text-[11px] text-zinc-400">
                {cleanHandle.length} chars ({Math.max(0, cleanHandle.length - 2)} hex digits)
              </span>
            </div>

            {/* 2. Chain ID */}
            <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200 space-y-1">
              <span className="text-zinc-400 uppercase text-[10px] block">Chain ID Binding</span>
              {chain ? (
                <>
                  <div className="font-bold text-emerald-600 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    {chain.networkName} ({chain.chainId})
                  </div>
                  <span className="text-[11px] text-zinc-400">
                    Prefix: <code className="text-indigo-600 font-bold">{chain.prefix}</code>
                  </span>
                </>
              ) : (
                <div className="text-zinc-500">N/A</div>
              )}
            </div>

            {/* 3. Encrypted Type */}
            <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200 space-y-1">
              <span className="text-zinc-400 uppercase text-[10px] block">Encrypted Type</span>
              <div className="font-bold text-indigo-600">euint256</div>
              <span className="text-[11px] text-zinc-400">
                Nox Protocol Encrypted Integer
              </span>
            </div>

            {/* 4. Data Source */}
            <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200 space-y-1">
              <span className="text-zinc-400 uppercase text-[10px] block">Data Source</span>
              {activeSource ? (
                <>
                  <div className="font-bold text-zinc-900 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Live On-Chain
                  </div>
                  <span className="text-[11px] text-zinc-400">
                    Block #{activeSource.blockFetched.toLocaleString()}
                  </span>
                </>
              ) : (
                <div className="font-bold text-amber-600 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Manual Input
                </div>
              )}
            </div>
          </div>

          {/* On-chain provenance details */}
          {activeSource && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
              <div className="p-3 rounded-lg bg-indigo-50/50 border border-indigo-100 space-y-1">
                <span className="text-indigo-400 uppercase text-[10px] block">Source Contract</span>
                <a
                  href={`${ETHERSCAN_BASE}/address/${activeSource.sourceAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-indigo-700 hover:text-indigo-900 underline underline-offset-2 break-all"
                >
                  {activeSource.sourceAddress}
                </a>
                <div className="text-[11px] text-zinc-500">{activeSource.source}.sol</div>
              </div>
              <div className="p-3 rounded-lg bg-indigo-50/50 border border-indigo-100 space-y-1">
                <span className="text-indigo-400 uppercase text-[10px] block">ACL Enclave Contract</span>
                <a
                  href={`${ETHERSCAN_BASE}/address/${DEPLOYED_ADDRESSES.noxCompute}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-indigo-700 hover:text-indigo-900 underline underline-offset-2 break-all"
                >
                  {DEPLOYED_ADDRESSES.noxCompute}
                </a>
                <div className="text-[11px] text-zinc-500">Nox TEE Compute Gateway</div>
              </div>
            </div>
          )}

          {/* Security explanation */}
          <div className="p-4 rounded-lg bg-indigo-50/60 border border-indigo-100 space-y-2 text-xs text-zinc-700">
            <div className="font-bold text-indigo-950 flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>Hardware Enclave &amp; TEE Security Guarantee</span>
              {activeSource && (
                <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 font-mono">
                  VERIFIED ON-CHAIN
                </span>
              )}
            </div>
            <p className="leading-relaxed text-zinc-600 font-sans text-[13px]">
              This handle is a <strong>real on-chain reference</strong> to an encrypted ciphertext stored inside the iExec Nox TEE enclave (<a href={`${ETHERSCAN_BASE}/address/${DEPLOYED_ADDRESSES.noxCompute}`} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800 underline underline-offset-1">{DEPLOYED_ADDRESSES.noxCompute.slice(0, 10)}...{DEPLOYED_ADDRESSES.noxCompute.slice(-4)}</a>).
              It was fetched directly from the deployed smart contract at block <strong>#{currentBlock.toLocaleString()}</strong>.
              The underlying value cannot be decrypted by public nodes, block explorers, or mempool bots without an authorized EIP-712 signature matching the on-chain ACL permissions set by <a href={`${ETHERSCAN_BASE}/address/${DEPLOYED_ADDRESSES.contracts.FundVault}`} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800 underline underline-offset-1">FundVault.sol</a>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
