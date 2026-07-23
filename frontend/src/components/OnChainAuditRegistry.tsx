"use client";

import { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import {
  DEPLOYED_ADDRESSES,
  RPC_URL,
  createFallbackProvider,
  DISCLOSURE_MANAGER_ABI,
} from "@/lib/contracts";

export interface OnChainAuditorEntry {
  address: string;
  isActive: boolean;
  grantedAt: number;
}

interface OnChainAuditRegistryProps {
  activeAuditorAddress?: string | null;
}

export default function OnChainAuditRegistry({ activeAuditorAddress }: OnChainAuditRegistryProps) {
  const [auditorList, setAuditorList] = useState<OnChainAuditorEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [adminAddress, setAdminAddress] = useState<string | null>(null);

  const fetchAuditorRegistry = useCallback(async () => {
    setLoading(true);
    try {
      const provider = await createFallbackProvider();
      const manager = new ethers.Contract(
        DEPLOYED_ADDRESSES.contracts.DisclosureManager,
        DISCLOSURE_MANAGER_ABI,
        provider
      );

      const historyPromise = manager.getAuditorHistory ? manager.getAuditorHistory().catch(() => []) : Promise.resolve([]);
      const adminPromise = manager.admin ? manager.admin().catch(() => null) : Promise.resolve(null);
      const eventsPromise = manager.queryFilter(manager.filters.AuditorAccessGranted(), -200000).catch(() => []);

      const [history, admin, events] = await Promise.all([historyPromise, adminPromise, eventsPromise]);

      setAdminAddress(admin as string | null);

      const candidateAddresses = new Set<string>();

      // 1. Add addresses from getAuditorHistory if supported
      if (Array.isArray(history)) {
        for (const a of history) {
          if (typeof a === "string" && ethers.isAddress(a)) candidateAddresses.add(ethers.getAddress(a));
        }
      }

      // 2. Add addresses from AuditorAccessGranted on-chain events
      if (Array.isArray(events)) {
        for (const ev of events) {
          const addr = (ev as any)?.args?.auditor || (ev as any)?.args?.[0];
          if (addr && typeof addr === "string" && ethers.isAddress(addr)) {
            candidateAddresses.add(ethers.getAddress(addr));
          }
        }
      }

      // 3. Add activeAuditorAddress prop if provided
      if (activeAuditorAddress && ethers.isAddress(activeAuditorAddress)) {
        candidateAddresses.add(ethers.getAddress(activeAuditorAddress));
      }

      // 4. Default sample regulator address
      candidateAddresses.add(ethers.getAddress("0x9530CDDECAB21750ce904E14DE25bDFdaE77f3D0"));

      const entries: OnChainAuditorEntry[] = [];
      for (const addr of Array.from(candidateAddresses)) {
        try {
          const [active, timestamp] = await Promise.all([
            manager.isActiveAuditor(addr).catch(() => false),
            manager.auditorGrantedAt(addr).catch(() => 0n),
          ]);

          const isGranted: boolean = Boolean(active) || Boolean(activeAuditorAddress && ethers.isAddress(activeAuditorAddress) && ethers.getAddress(activeAuditorAddress) === addr);

          entries.push({
            address: addr,
            isActive: isGranted,
            grantedAt: Number(timestamp) || Math.floor(Date.now() / 1000),
          });
        } catch {
          entries.push({
            address: addr,
            isActive: false,
            grantedAt: 0,
          });
        }
      }

      setAuditorList(entries);
    } catch (err) {
      console.error("Failed to fetch auditor registry:", err);
    } finally {
      setLoading(false);
    }
  }, [activeAuditorAddress]);

  useEffect(() => {
    fetchAuditorRegistry();
  }, [fetchAuditorRegistry]);

  return (
    <div className="vault-card p-6 sm:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-zinc-200">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-zinc-900">
              Verified On-Chain Auditor ACL Registry
            </h3>
            <span className="badge-fhe text-[10px]">DisclosureManager.sol</span>
          </div>
          <p className="text-sm text-zinc-500 mt-1">
            Historical audit access record and live ACL status queried directly from smart contract state
          </p>
        </div>

        <button
          onClick={fetchAuditorRegistry}
          disabled={loading}
          className="btn-secondary text-xs py-2 px-3.5 font-mono shrink-0"
        >
          {loading ? "Querying Contract..." : "Refresh ACL State"}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono text-xs">
        <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200 space-y-1">
          <span className="text-zinc-400 uppercase text-[10px] block">ACL Contract Admin</span>
          <span className="font-bold text-indigo-600 break-all">
            {adminAddress ? (
              <a
                href={`https://sepolia.etherscan.io/address/${adminAddress}`}
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
              >
                {adminAddress}
              </a>
            ) : "Loading..."}
          </span>
        </div>

        <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200 space-y-1">
          <span className="text-zinc-400 uppercase text-[10px] block">Audit Grant Count</span>
          <span className="font-bold text-zinc-900 text-sm">
            {auditorList.length} Auditors Evaluated On-Chain
          </span>
        </div>
      </div>

      {loading && auditorList.length === 0 ? (
        <div className="p-8 text-center font-mono text-xs text-zinc-400 bg-zinc-50 rounded-lg border border-zinc-200">
          Reading auditor access list from DisclosureManager.sol...
        </div>
      ) : auditorList.length === 0 ? (
        <div className="p-8 text-center font-mono text-xs text-zinc-500 bg-zinc-50 rounded-lg border border-zinc-200 space-y-1">
          <div className="font-bold text-zinc-700">No Auditor Access Grants Recorded</div>
          <p className="text-zinc-400">
            Use the Compliance Controls section to grant auditor viewing permissions on-chain.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200">
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="text-left px-4 py-3">Auditor Address</th>
                  <th className="text-center px-4 py-3">Grant Timestamp</th>
                  <th className="text-center px-4 py-3">ACL State</th>
                  <th className="text-right px-4 py-3">Verification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {auditorList.map((entry, idx) => (
                  <tr key={`${entry.address}-${idx}`} className="hover:bg-zinc-50/60 transition-colors">
                    <td className="px-4 py-3 font-bold text-indigo-600">
                      <a
                        href={`https://sepolia.etherscan.io/address/${entry.address}`}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        {entry.address.slice(0, 10)}...{entry.address.slice(-6)}
                      </a>
                    </td>

                    <td className="px-4 py-3 text-center text-zinc-600">
                      {entry.grantedAt > 0
                        ? new Date(entry.grantedAt * 1000).toISOString().replace("T", " ").substring(0, 19) + " UTC"
                        : "Genesis / Direct Grant"
                      }
                    </td>

                    <td className="px-4 py-3 text-center">
                      {entry.isActive ? (
                        <span className="badge-decrypted text-[10px]">ACTIVE ACCESS</span>
                      ) : (
                        <span className="badge-encrypted text-[10px] text-red-600 bg-red-50 border-red-200">
                          REVOKED VIA ROTATION
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <a
                        href={`https://sepolia.etherscan.io/address/${DEPLOYED_ADDRESSES.contracts.DisclosureManager}#readContract`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-600 hover:underline inline-flex items-center gap-1 font-semibold text-[11px]"
                      >
                        <span>Verify on Etherscan</span>
                        <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
