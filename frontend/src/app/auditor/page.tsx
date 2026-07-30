"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { useAccount } from "wagmi";
import Navbar from "@/components/Navbar";
import { DEPLOYED_ADDRESSES, createFallbackProvider, DISCLOSURE_MANAGER_ABI } from "@/lib/contracts";
import { ensureSepoliaNetwork, getBrowserSignerProvider } from "@/lib/web3";
import {
  Eye,
  ShieldAlert,
  RotateCw,
  UserCheck,
  UserX,
  Zap,
  Copy,
  Check,
  Wallet,
} from "lucide-react";

export default function AuditorPage() {
  const { address: connectedAccount } = useAccount();
  const [auditorAddress, setAuditorAddress] = useState<string>("");
  const [isActive, setIsActive] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [lastGasUsed, setLastGasUsed] = useState<number | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [copiedAddr, setCopiedAddr] = useState<boolean>(false);

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
      setStatusMsg(`✅ Auditor access granted on Sepolia! Gas used: ${receipt.gasUsed.toString()}`);
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
      setStatusMsg(`✅ Auditor revoked & position handle rotated on Sepolia! Gas used: ${receipt.gasUsed.toString()}`);
    } catch (err: any) {
      setStatusMsg(`Revocation failed: ${err?.reason || err?.message || "Transaction rejected"}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#FAFAFA] text-zinc-900 font-sans selection:bg-indigo-100 selection:text-indigo-900 pb-16">
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        {/* HEADER */}
        <section className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-mono mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
              Auditor Access Control · iExec Nox Protocol
            </div>
            <h1 className="text-2xl font-extrabold text-zinc-900 tracking-tight flex items-center gap-2">
              <Eye className="w-6 h-6 text-indigo-600" />
              Sovereign Auditor ACL Portal
            </h1>
            <p className="text-xs text-zinc-500">
              Grant or revoke temporary viewing permissions for an auditor over YOUR encrypted position. Revocation executes on-chain Single-User Handle Rotation.
            </p>
          </div>

          <div className="flex items-center space-x-2 bg-zinc-50 px-3 py-2 rounded-lg border border-zinc-200 text-xs shrink-0">
            <span className="text-zinc-500 font-medium">Auditor Status:</span>
            {isActive ? (
              <span className="text-emerald-700 font-bold font-mono flex items-center gap-1.5 bg-emerald-100/80 px-2.5 py-0.5 rounded-full">
                <UserCheck className="w-3.5 h-3.5" /> AUTHORIZED
              </span>
            ) : (
              <span className="text-zinc-500 font-bold font-mono flex items-center gap-1.5 bg-zinc-200/60 px-2.5 py-0.5 rounded-full">
                <UserX className="w-3.5 h-3.5 text-zinc-400" /> NOT AUTHORIZED
              </span>
            )}
          </div>
        </section>

        {/* AUDITOR ACTIONS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Grant Card */}
          <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm space-y-4">
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
                      onClick={() => copyToClipboard(auditorAddress)}
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
          <div className="bg-white border border-amber-200 rounded-xl p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-center text-xs font-mono text-amber-700 uppercase tracking-wide">
              <span>Revoke Rights (Handle Rotation)</span>
              <RotateCw className="w-4 h-4 text-amber-600" />
            </div>

            <div className="space-y-3.5">
              <p className="text-xs text-zinc-600 leading-relaxed">
                Invokes <code className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-mono text-[11px]">DisclosureManager.revokeAuditorAccess()</code>.
                Regenerates a clean handle for your position, cryptographically excluding the auditor.
              </p>

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

        {/* GAS MEASUREMENT RESULTS */}
        {lastGasUsed && (
          <div className="p-5 rounded-xl bg-white border border-zinc-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-900 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                Last Transaction Gas ({lastAction})
              </span>
              <span className="font-mono text-sm font-bold text-indigo-600">
                {lastGasUsed.toLocaleString("en-US")} gas
              </span>
            </div>
          </div>
        )}

        {/* STATUS MSG */}
        {statusMsg && (
          <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 text-xs font-mono text-indigo-900">
            {statusMsg}
          </div>
        )}

        {/* HANDLE ROTATION ARCHITECTURE INSIGHT */}
        <section className="p-6 rounded-xl bg-amber-50/60 border border-amber-200/80 space-y-4">
          <div className="flex items-start space-x-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-amber-900">
                Sovereign Single-User Handle Rotation
              </h3>
              <p className="text-xs text-amber-800/90 leading-relaxed">
                By creating a new handle (<code className="px-1.5 py-0.5 rounded bg-amber-100/80 text-amber-900 font-mono text-[11px]">Nox.add(oldHandle, 0)</code>) specifically for your position, RealVault invalidates the ciphertext pointer previously accessible to the auditor without affecting any other investor on-chain.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

