"use client";

import { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import {
  DEPLOYED_ADDRESSES,
  createFallbackProvider,
  FUND_VAULT_ABI,
  NAV_AGGREGATOR_ABI,
  DISCLOSURE_MANAGER_ABI,
  REBALANCER_ABI,
} from "@/lib/contracts";

export interface OnChainEvent {
  id: string;
  contractName: string;
  eventName: string;
  blockNumber: number;
  txHash: string;
  summary: string;
  type: "deposit" | "nav" | "acl" | "rebalance" | "withdraw" | "policy";
}

/**
 * Fetch logs for all contracts simultaneously using provider.getLogs().
 * Reduces RPC request count from ~200 calls to ~5 calls, preventing 429 rate limits.
 */
async function fetchAllContractLogs(
  provider: ethers.JsonRpcProvider,
  addresses: string[],
  fromBlock: number,
  toBlock: number,
  chunkSize = 2500
): Promise<ethers.Log[]> {
  const allLogs: ethers.Log[] = [];
  let start = fromBlock;

  while (start <= toBlock) {
    const end = Math.min(start + chunkSize - 1, toBlock);
    try {
      const logs = await provider.getLogs({
        address: addresses,
        fromBlock: start,
        toBlock: end,
      });
      allLogs.push(...logs);
    } catch (err: any) {
      if (chunkSize > 500) {
        const half = Math.floor(chunkSize / 2);
        const log1 = await fetchAllContractLogs(provider, addresses, start, Math.min(start + half - 1, end), half);
        const log2 = await fetchAllContractLogs(provider, addresses, Math.min(start + half, end + 1), end, half);
        allLogs.push(...log1, ...log2);
      } else {
        console.warn(`getLogs chunk [${start}-${end}] failed:`, err?.message?.slice(0, 100));
      }
    }
    start = end + 1;
  }

  return allLogs;
}

export default function OnChainEventFeed() {
  const [events, setEvents] = useState<OnChainEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastSyncBlock, setLastSyncBlock] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [blocksScanned, setBlocksScanned] = useState<number>(0);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = await createFallbackProvider(true);
      const currentBlock = await provider.getBlockNumber();
      setLastSyncBlock(currentBlock);

      // Scan last 15,000 blocks bounded by deployment block floor
      const SCAN_RANGE = 15000;
      const deployFloor = DEPLOYED_ADDRESSES.deploymentBlock || 11328000;
      const fromBlock = Math.max(deployFloor, currentBlock - SCAN_RANGE);
      setBlocksScanned(currentBlock - fromBlock);

      const targetContracts: Record<string, { name: string; iface: ethers.Interface }> = {
        [DEPLOYED_ADDRESSES.contracts.FundVault.toLowerCase()]: {
          name: "FundVault.sol",
          iface: new ethers.Interface(FUND_VAULT_ABI),
        },
        [DEPLOYED_ADDRESSES.contracts.NAVAggregator.toLowerCase()]: {
          name: "NAVAggregator.sol",
          iface: new ethers.Interface(NAV_AGGREGATOR_ABI),
        },
        [DEPLOYED_ADDRESSES.contracts.DisclosureManager.toLowerCase()]: {
          name: "DisclosureManager.sol",
          iface: new ethers.Interface(DISCLOSURE_MANAGER_ABI),
        },
        [DEPLOYED_ADDRESSES.contracts.RebalancerAgent.toLowerCase()]: {
          name: "RebalancerAgent.sol",
          iface: new ethers.Interface(REBALANCER_ABI),
        },
      };

      const addresses = Object.keys(targetContracts);
      let rawLogs: ethers.Log[] = [];
      try {
        rawLogs = await fetchAllContractLogs(provider, addresses, fromBlock, currentBlock);
      } catch (logErr) {
        console.warn("Primary provider log fetch failed, retrying with fallback provider...", logErr);
        const retryProvider = await createFallbackProvider(true);
        rawLogs = await fetchAllContractLogs(retryProvider, addresses, fromBlock, currentBlock);
      }

      const parsedEvents: OnChainEvent[] = [];

      for (const log of rawLogs) {
        const contractInfo = targetContracts[log.address.toLowerCase()];
        if (!contractInfo) continue;

        try {
          const parsed = contractInfo.iface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          if (!parsed) continue;

          let type: OnChainEvent["type"] = "deposit";
          let summary = `${parsed.name} event on ${contractInfo.name}`;

          if (parsed.name === "Deposited") {
            type = "deposit";
            summary = `Confidential deposit registered for ${String(parsed.args[0]).slice(0, 8)}...`;
          } else if (parsed.name === "Withdrawn") {
            type = "withdraw";
            summary = `Confidential withdrawal executed for ${String(parsed.args[0]).slice(0, 8)}...`;
          } else if (parsed.name === "HandlesRotated") {
            type = "acl";
            const lpCount = Number(parsed.args[0]);
            summary = `Re-encrypted position handles for ${lpCount} ${lpCount === 1 ? "LP" : "LPs"} via Nox.add()`;
          } else if (parsed.name === "NavAggregated") {
            type = "nav";
            const invCount = Number(parsed.args[0]);
            summary = `TEE enclave sum computed across ${invCount} investor ${invCount === 1 ? "handle" : "handles"}`;
          } else if (parsed.name === "AuditorAccessGranted") {
            type = "acl";
            summary = `Auditor viewing permission granted to ${String(parsed.args[0]).slice(0, 10)}...`;
          } else if (parsed.name === "AuditorAccessRevoked") {
            type = "acl";
            summary = `Auditor access revoked + handle rotation for ${String(parsed.args[0]).slice(0, 10)}...`;
          } else if (parsed.name === "RebalanceExecuted") {
            type = "rebalance";
            summary = `Rebalance execution #${parsed.args[0]} finalized on-chain`;
          } else if (parsed.name === "TargetAllocationUpdated") {
            type = "policy";
            summary = `Policy allocation updated to ${Number(parsed.args[0]) / 100}% / ${Number(parsed.args[1]) / 100}%`;
          }

          parsedEvents.push({
            id: `${log.transactionHash}-${log.index}`,
            contractName: contractInfo.name,
            eventName: parsed.name,
            blockNumber: log.blockNumber,
            txHash: log.transactionHash,
            summary,
            type,
          });
        } catch {
          // Log topic didn't match contract interface, ignore safely
        }
      }

      // Sort descending by block number and cap at top 20 most recent
      parsedEvents.sort((a, b) => b.blockNumber - a.blockNumber);
      setEvents(parsedEvents.slice(0, 20));

      if (parsedEvents.length === 0) {
        setError(`Scanned ${(currentBlock - fromBlock).toLocaleString()} blocks — no contract events found in this range.`);
      }
    } catch (err: any) {
      console.error("Failed to query on-chain events:", err);
      setError(`RPC query failed: ${err?.message?.slice(0, 80) || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const getBadgeStyle = (type: OnChainEvent["type"]) => {
    switch (type) {
      case "deposit":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "withdraw":
        return "bg-orange-50 text-orange-700 border-orange-200";
      case "nav":
        return "bg-indigo-50 text-indigo-700 border-indigo-200";
      case "acl":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "rebalance":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "policy":
        return "bg-blue-50 text-blue-700 border-blue-200";
      default:
        return "bg-zinc-100 text-zinc-700 border-zinc-200";
    }
  };

  return (
    <div className="vault-card p-6 sm:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-zinc-200">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-zinc-900">
              Live On-Chain Event Monitor
            </h3>
            <span className="badge-testnet text-[10px]">Sepolia RPC</span>
          </div>
          <p className="text-sm text-zinc-500 mt-1">
            Real-time contract log stream queried directly from Ethereum Sepolia smart contracts
          </p>
        </div>

        <div className="flex items-center gap-3">
          {lastSyncBlock > 0 && (
            <div className="text-right">
              <span className="font-mono text-xs text-zinc-400 block">
                Block <strong className="text-zinc-700">#{lastSyncBlock.toLocaleString()}</strong>
              </span>
              {blocksScanned > 0 && (
                <span className="font-mono text-[10px] text-zinc-400">
                  {blocksScanned.toLocaleString()} blocks scanned
                </span>
              )}
            </div>
          )}
          <button
            onClick={fetchEvents}
            disabled={loading}
            className="btn-secondary text-xs py-2 px-3.5 font-mono flex items-center gap-1.5"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>Scanning Logs...</span>
              </>
            ) : "Refresh Event Log"}
          </button>
        </div>
      </div>

      {loading && events.length === 0 ? (
        <div className="p-8 text-center font-mono text-xs text-zinc-400 bg-zinc-50 rounded-lg border border-zinc-200 space-y-2">
          <svg className="animate-spin h-5 w-5 text-indigo-600 mx-auto" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <div>Scanning {blocksScanned > 0 ? `${blocksScanned.toLocaleString()} blocks` : "Sepolia blockchain"} for contract events...</div>
          <div className="text-[10px] text-zinc-400">Querying FundVault, NAVAggregator, DisclosureManager, RebalancerAgent</div>
        </div>
      ) : events.length === 0 ? (
        <div className="p-6 text-center font-mono text-xs bg-zinc-50 rounded-lg border border-zinc-200 space-y-2">
          <div className="font-bold text-zinc-600">No Events Found In Recent Blocks</div>
          {error && <p className="text-zinc-500">{error}</p>}
          <p className="text-zinc-400">Run transactions (deposit, grant auditor, update policy) to populate the live log feed.</p>
          <div className="flex items-center justify-center gap-4 pt-2 text-[10px]">
            <a
              href={`https://sepolia.etherscan.io/address/${DEPLOYED_ADDRESSES.contracts.FundVault}#events`}
              target="_blank"
              rel="noreferrer"
              className="text-indigo-600 hover:text-indigo-800 underline"
            >
              FundVault Events ↗
            </a>
            <a
              href={`https://sepolia.etherscan.io/address/${DEPLOYED_ADDRESSES.contracts.DisclosureManager}#events`}
              target="_blank"
              rel="noreferrer"
              className="text-indigo-600 hover:text-indigo-800 underline"
            >
              DisclosureManager Events ↗
            </a>
            <a
              href={`https://sepolia.etherscan.io/address/${DEPLOYED_ADDRESSES.contracts.RebalancerAgent}#events`}
              target="_blank"
              rel="noreferrer"
              className="text-indigo-600 hover:text-indigo-800 underline"
            >
              RebalancerAgent Events ↗
            </a>
          </div>
        </div>
      ) : (
        <>
          <div className="text-xs font-mono text-zinc-500 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Showing latest {events.length} events across {blocksScanned.toLocaleString()} blocks scanned</span>
          </div>

          <div className="overflow-hidden rounded-lg border border-zinc-200">
            <div className="overflow-x-auto">
              <table className="w-full font-mono text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="text-left px-4 py-3">Block</th>
                    <th className="text-left px-4 py-3">Contract</th>
                    <th className="text-left px-4 py-3">Event Name</th>
                    <th className="text-left px-4 py-3">On-Chain Summary</th>
                    <th className="text-right px-4 py-3">Transaction</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {events.map((evt) => (
                    <tr key={evt.id} className="hover:bg-zinc-50/60 transition-colors">
                      <td className="px-4 py-3 font-bold text-zinc-900">
                        #{evt.blockNumber.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 font-semibold">
                        {evt.contractName}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-bold ${getBadgeStyle(evt.type)}`}>
                          {evt.eventName}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-700 font-sans text-xs">
                        {evt.summary}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <a
                          href={`https://sepolia.etherscan.io/tx/${evt.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-indigo-600 hover:underline inline-flex items-center gap-1 font-semibold"
                        >
                          <span>{evt.txHash.slice(0, 8)}...</span>
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
        </>
      )}
    </div>
  );
}
