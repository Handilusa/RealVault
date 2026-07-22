"use client";

import { useState } from "react";
import RedactionBar from "./RedactionBar";

interface MevVisualizerProps {
  isDecrypted: boolean;
  onToggleDecrypt: () => void;
}

export default function MevVisualizer({
  isDecrypted,
  onToggleDecrypt,
}: MevVisualizerProps) {
  const [activeTab, setActiveTab] = useState<"public" | "authorized" | "mempool">("authorized");

  return (
    <div className="vault-card p-6 sm:p-7 space-y-5 border border-zinc-200 bg-white shadow-sm rounded-xl">
      {/* Header Bar */}
      <div className="flex flex-col gap-2 pb-4 border-b border-zinc-200">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono uppercase text-indigo-600 font-semibold tracking-wider">
            Confidentiality Model
          </span>
          <span className="badge-fhe text-[10px]">
            iExec Nox FHE
          </span>
        </div>
        <h3 className="text-base font-bold text-zinc-900 tracking-tight">
          Public View vs. Authorized View
        </h3>
      </div>

      {/* Perspective Switcher Tabs */}
      <div className="grid grid-cols-3 gap-1.5 p-1 bg-zinc-100 rounded-lg border border-zinc-200 font-mono text-xs">
        <button
          onClick={() => setActiveTab("authorized")}
          className={`py-1.5 px-2 rounded-md text-[11px] font-medium transition-all text-center whitespace-nowrap ${
            activeTab === "authorized"
              ? "bg-white text-zinc-900 font-bold shadow-sm border border-zinc-200"
              : "text-zinc-500 hover:text-zinc-900"
          }`}
        >
          Authorized LP
        </button>

        <button
          onClick={() => setActiveTab("public")}
          className={`py-1.5 px-2 rounded-md text-[11px] font-medium transition-all text-center whitespace-nowrap ${
            activeTab === "public"
              ? "bg-white text-zinc-900 font-bold shadow-sm border border-zinc-200"
              : "text-zinc-500 hover:text-zinc-900"
          }`}
        >
          Public EVM
        </button>

        <button
          onClick={() => setActiveTab("mempool")}
          className={`py-1.5 px-2 rounded-md text-[11px] font-medium transition-all text-center whitespace-nowrap ${
            activeTab === "mempool"
              ? "bg-white text-zinc-900 font-bold shadow-sm border border-zinc-200"
              : "text-zinc-500 hover:text-zinc-900"
          }`}
        >
          Mempool Log
        </button>
      </div>

      {/* Active Perspective Content Panel */}
      {activeTab === "authorized" && (
        <div key="authorized" className="tab-panel-animate p-5 rounded-lg border border-emerald-200 bg-emerald-50/40 space-y-4">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-emerald-200/60">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="font-mono text-xs font-bold text-emerald-900 uppercase tracking-wider truncate">
                Authorized LP Perspective
              </span>
            </div>
            <span className="badge-decrypted text-[10px] shrink-0 whitespace-nowrap">
              EIP-712 VERIFIED
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider block mb-1">
                Decrypted Holding Balance
              </span>
              <div className="p-3.5 rounded-lg border border-emerald-200 bg-white shadow-xs">
                <div className="text-2xl font-bold font-data text-zinc-900">
                  <RedactionBar
                    isRevealed={isDecrypted}
                    value="$7,500.00 USDC"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2 font-mono text-xs pt-1">
              <div className="flex justify-between items-center text-zinc-600">
                <span className="text-zinc-500">Decryption Pathway:</span>
                <span className="font-semibold text-emerald-800 text-right">Off-Chain Nox Oracle</span>
              </div>
              <div className="flex justify-between items-center text-zinc-600">
                <span className="text-zinc-500">Enclave Origin:</span>
                <span className="font-semibold text-emerald-800 text-right">Sepolia (0xaa36a7)</span>
              </div>
              <div className="flex justify-between items-center text-zinc-600">
                <span className="text-zinc-500">Access Scope:</span>
                <span className="font-semibold text-emerald-800 text-right">Private LP ACL Key</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "public" && (
        <div key="public" className="tab-panel-animate p-5 rounded-lg border border-zinc-300 bg-zinc-50 space-y-4">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-zinc-200">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-zinc-400 shrink-0" />
              <span className="font-mono text-xs font-bold text-zinc-700 uppercase tracking-wider truncate">
                Public Explorer View
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-200 text-zinc-700 font-semibold shrink-0 whitespace-nowrap">
              UNAUTHORIZED
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider block mb-1">
                On-Chain Handle Payload
              </span>
              <div className="p-3 rounded-lg border border-zinc-200 bg-white font-mono text-xs text-indigo-600 break-all">
                0x0000aa36a723006d8c4928a02417aca1e1d96b6c5a87d991e04607721059d189
              </div>
            </div>

            <div className="space-y-2 font-mono text-xs pt-1">
              <div className="flex justify-between items-center text-zinc-600">
                <span className="text-zinc-500">Amount Visibility:</span>
                <span className="font-semibold text-zinc-900 text-right">Encrypted (`euint256`)</span>
              </div>
              <div className="flex justify-between items-center text-zinc-600">
                <span className="text-zinc-500">Mempool Observation:</span>
                <span className="font-semibold text-zinc-900 text-right">Ciphertext Handle Only</span>
              </div>
              <div className="flex justify-between items-center text-zinc-600">
                <span className="text-zinc-500">Frontrunning Protection:</span>
                <span className="font-semibold text-emerald-600 text-right">Mitigated via FHE</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "mempool" && (
        <div key="mempool" className="tab-panel-animate p-5 rounded-lg border border-zinc-200 bg-zinc-50 space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between text-zinc-500 pb-2 border-b border-zinc-200">
            <span className="font-bold text-zinc-700 uppercase tracking-wider text-[11px]">
              Mempool Observation Log
            </span>
            <span className="text-[10px] font-semibold text-emerald-600">● LIVE OBSERVER</span>
          </div>

          <div className="space-y-2 text-zinc-600 text-[11px] leading-relaxed">
            <div className="flex items-start gap-2">
              <span className="text-zinc-400 select-none">[TX_SCAN]</span>
              <span className="text-zinc-800 font-semibold">FundVault.deposit(bytes32 handle, bytes proof)</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-zinc-400 select-none">[PAYLOAD]</span>
              <span className="text-indigo-600 break-all">0x0000aa36a723006d8c4928a02417aca1e1d96...</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-zinc-400 select-none">[ANALYSIS]</span>
              <span className="text-zinc-700">Token value encrypted via FHE euint256 handle.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-zinc-400 select-none">[RESULT]</span>
              <span className="text-emerald-700 font-semibold">Individual deposit magnitude remains undisclosed on public logs.</span>
            </div>
          </div>
        </div>
      )}

      {/* Contextual Action Button */}
      {activeTab === "mempool" ? (
        <a
          href="https://sepolia.etherscan.io/address/0x6173B5846d882E7A74904EAd017F425C24147F93#code"
          target="_blank"
          rel="noreferrer"
          className="btn-secondary w-full text-xs sm:text-sm py-3 font-mono block text-center"
        >
          Inspect FundVault.sol Contract on Etherscan ↗
        </a>
      ) : activeTab === "public" ? (
        <button
          onClick={() => {
            setActiveTab("authorized");
            if (!isDecrypted) onToggleDecrypt();
          }}
          className="btn-secondary w-full text-xs sm:text-sm py-3 font-mono text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100/60 border-indigo-200 flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4 text-indigo-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
          </svg>
          <span>Switch to Authorized LP View &amp; Decrypt</span>
        </button>
      ) : (
        <button
          onClick={onToggleDecrypt}
          className="btn-secondary w-full text-xs sm:text-sm py-3 font-mono"
        >
          {isDecrypted ? "Re-Encrypt Position Handle" : "Simulate EIP-712 Wallet Decryption"}
        </button>
      )}
    </div>
  );
}
