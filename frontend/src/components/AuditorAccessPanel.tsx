"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { useAccount } from "wagmi";
import {
  DEPLOYED_ADDRESSES,
  createFallbackProvider,
  DISCLOSURE_MANAGER_ABI,
} from "@/lib/contracts";
import { ensureSepoliaNetwork, getBrowserSignerProvider } from "@/lib/web3";
import OnChainAuditRegistry from "@/components/OnChainAuditRegistry";
import {
  ShieldAlert,
  RotateCw,
  UserCheck,
  UserX,
  Copy,
  Check,
  ChevronDown,
  Shield,
} from "lucide-react";

export default function AuditorAccessPanel() {
  const { address: connectedAccount } = useAccount();
  const [auditorAddress, setAuditorAddress] = useState<string>("");
  const [isActive, setIsActive] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [lastGasUsed, setLastGasUsed] = useState<number | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [copiedAddr, setCopiedAddr] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  // Check active auditor status from Sepolia RPC for connected investor
  const checkAuditorStatus = useCallback(async (addr: string) => {
    try {
      if (!connectedAccount || !ethers.isAddress(addr)) return;
      const provider = await createFallbackProvider();
      const manager = new ethers.Contract(
        DEPLOYED_ADDRESSES.contracts.DisclosureManager,
        DISCLOSURE_MANAGER_ABI,
        provider
      );
      const active = await manager.isActiveAuditorFor(connectedAccount, addr);
      setIsActive(active as boolean);
    } catch {
      // RPC check failed
    }
  }, [connectedAccount]);

  useEffect(() => {
    if (ethers.isAddress(auditorAddress)) {
      checkAuditorStatus(auditorAddress);
    }
  }, [auditorAddress, checkAuditorStatus]);

  const copyToClipboard = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedAddr(true);
    setTimeout(() => setCopiedAddr(false), 2000);
  };

  const handleGrant = async () => {
    if (!connectedAccount) {
      setStatusMsg("Please connect your Web3 wallet first.");
      return;
    }
    if (!ethers.isAddress(auditorAddress)) {
      setStatusMsg("Please enter a valid auditor Ethereum address.");
      return;
    }

    setIsProcessing(true);
    setStatusMsg("Submitting grantAuditorAccess transaction to ETH Sepolia...");
    try {
      await ensureSepoliaNetwork();
      const validAddr = ethers.getAddress(auditorAddress.trim());
      const { provider, signer } = await getBrowserSignerProvider();
      const manager = new ethers.Contract(
        DEPLOYED_ADDRESSES.contracts.DisclosureManager,
        DISCLOSURE_MANAGER_ABI,
        signer
      );
      const tx = await manager.grantAuditorAccess(validAddr);
      const receipt = await tx.wait();
      setLastGasUsed(Number(receipt.gasUsed));
      setIsActive(true);
      setLastAction("Granted Auditor Access");
      setStatusMsg(`Auditor access granted on Sepolia! Gas used: ${receipt.gasUsed.toString()}`);
    } catch (err: any) {
      setStatusMsg(`Grant failed: ${err?.reason || err?.message || "Transaction rejected"}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRevoke = async () => {
    if (!connectedAccount) {
      setStatusMsg("Please connect your Web3 wallet first.");
      return;
    }
    if (!ethers.isAddress(auditorAddress)) {
      setStatusMsg("Please enter a valid auditor Ethereum address.");
      return;
    }

    setIsProcessing(true);
    setStatusMsg("Submitting revokeAuditorAccess transaction (Single-User Handle Rotation) to ETH Sepolia...");
    try {
      await ensureSepoliaNetwork();
      const validAddr = ethers.getAddress(auditorAddress.trim());
      const { provider, signer } = await getBrowserSignerProvider();
      const manager = new ethers.Contract(
        DEPLOYED_ADDRESSES.contracts.DisclosureManager,
        DISCLOSURE_MANAGER_ABI,
        signer
      );
      const tx = await manager.revokeAuditorAccess(validAddr);
      const receipt = await tx.wait();
      setLastGasUsed(Number(receipt.gasUsed));
      setIsActive(false);
      setLastAction("Revoked via Single-User Handle Rotation");
      setStatusMsg(`Auditor revoked & position handle rotated on Sepolia! Gas used: ${receipt.gasUsed.toString()}`);
    } catch (err: any) {
      setStatusMsg(`Revocation failed: ${err?.reason || err?.message || "Transaction rejected"}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <section id="compliance" className="scroll-mt-20">
      {/* Collapsible Header - Always visible with status badge */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full vault-card p-5 flex items-center justify-between gap-4 cursor-pointer hover:border-indigo-200 transition-all duration-200 group"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center shrink-0">
            <Shield className="w-4.5 h-4.5 text-indigo-600" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
              Compliance & Auditor Access
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-100 border border-zinc-200 text-zinc-500 font-medium">
                DisclosureManager.sol
              </span>
            </h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Grant or revoke temporary viewing permissions for auditors over your encrypted position
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Status badge - visible even when collapsed */}
          {isActive ? (
            <span className="text-emerald-700 font-bold font-mono flex items-center gap-1.5 bg-emerald-50 px-2.5 py-1 rounded-full text-[11px] border border-emerald-200">
              <UserCheck className="w-3.5 h-3.5" /> AUTHORIZED
            </span>
          ) : (
            <span className="text-zinc-500 font-bold font-mono flex items-center gap-1.5 bg-zinc-100 px-2.5 py-1 rounded-full text-[11px] border border-zinc-200">
              <UserX className="w-3.5 h-3.5 text-zinc-400" /> NOT AUTHORIZED
            </span>
          )}

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
          isExpanded ? "max-h-[2000px] opacity-100 mt-4" : "max-h-0 opacity-0"
        }`}
      >
        <div className="space-y-6">
          {/* Grant & Revoke Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Grant Card */}
            <div className="vault-card p-6 space-y-4">
              <div className="flex justify-between items-center text-xs font-mono text-zinc-500 uppercase tracking-wide">
                <span>Grant Viewing Rights</span>
                <UserCheck className="w-4 h-4 text-emerald-600" />
              </div>

              <div className="space-y-3.5">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <label className="text-zinc-600 font-medium">Auditor / Regulator Address</label>
                    {auditorAddress && (
                      <button
                        onClick={(e) => { e.stopPropagation(); copyToClipboard(auditorAddress); }}
                        className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 text-[11px] font-medium transition-colors cursor-pointer"
                      >
                        {copiedAddr ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-600">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  <input
                    type="text"
                    value={auditorAddress}
                    onChange={(e) => setAuditorAddress(e.target.value)}
                    placeholder="0x... (Auditor Ethereum Address)"
                    className="w-full bg-white border border-zinc-200 rounded-lg px-3.5 py-2.5 text-xs text-zinc-900 font-mono focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                  />
                </div>

                <button
                  onClick={handleGrant}
                  disabled={isProcessing || !connectedAccount}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-lg text-xs flex items-center justify-center space-x-2 transition-all shadow-sm cursor-pointer disabled:cursor-not-allowed"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Grant Auditor Access</span>
                </button>
              </div>
            </div>

            {/* Revoke Card (Handle Rotation) */}
            <div className="vault-card p-6 space-y-4 border-amber-200">
              <div className="flex justify-between items-center text-xs font-mono text-amber-700 uppercase tracking-wide">
                <span>Revoke Rights (Handle Rotation)</span>
                <RotateCw className="w-4 h-4 text-amber-600" />
              </div>

              <div className="space-y-3.5">
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Invokes <code className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-mono text-[11px]">DisclosureManager.revokeAuditorAccess()</code>.
                  Regenerates a clean handle for your position, cryptographically excluding the auditor.
                </p>

                {/* Clear warning about what revoke does */}
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 leading-relaxed flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Revoking auditor access does not affect your funds</strong> — it only removes their permission to decrypt your balance handle via Single-User Handle Rotation.
                  </span>
                </div>

                <button
                  onClick={handleRevoke}
                  disabled={isProcessing || !connectedAccount}
                  className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold rounded-lg text-xs flex items-center justify-center space-x-2 transition-all shadow-sm cursor-pointer disabled:cursor-not-allowed"
                >
                  <RotateCw className="w-4 h-4" />
                  <span>Revoke via Handle Rotation</span>
                </button>
              </div>
            </div>
          </div>

          {/* Gas Result */}
          {lastGasUsed && (
            <div className="p-4 rounded-xl bg-white border border-zinc-200 shadow-sm flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-900 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Last Transaction Gas ({lastAction})
              </span>
              <span className="font-mono text-sm font-bold text-indigo-600">
                {lastGasUsed.toLocaleString("en-US")} gas
              </span>
            </div>
          )}

          {/* Status Message */}
          {statusMsg && (
            <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 text-xs font-mono text-indigo-900">
              {statusMsg}
            </div>
          )}

          {/* On-Chain Audit Registry Table */}
          <OnChainAuditRegistry activeAuditorAddress={isActive ? auditorAddress : null} />
        </div>
      </div>
    </section>
  );
}
