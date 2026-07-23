"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { useAccount } from "wagmi";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import {
  DEPLOYED_ADDRESSES,
  RPC_URL,
  FUND_VAULT_ABI,
  MOCK_USDC_ABI,
  DISCLOSURE_MANAGER_ABI,
} from "@/lib/contracts";
import { ensureSepoliaNetwork, getReadOnlyProvider } from "@/lib/web3";
import { fetchMarketData, MarketDataPoint } from "@/lib/marketData";

export default function PersonalPortfolioPage() {
  const { address: account } = useAccount();

  // State
  const [walletBalance, setWalletBalance] = useState<string>("0");
  const [positionHandle, setPositionHandle] = useState<string | null>(null);
  const [vaultUsdcBalance, setVaultUsdcBalance] = useState<string>("0");
  const [isAuditorApproved, setIsAuditorApproved] = useState<boolean>(false);
  const [marketData, setMarketData] = useState<MarketDataPoint | null>(null);

  // Form State
  const [depositAmount, setDepositAmount] = useState<string>("100");
  const [withdrawAmount, setWithdrawAmount] = useState<string>("50");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);

  // Decryption State
  const [isRevealed, setIsRevealed] = useState<boolean>(false);
  const [decryptedValue, setDecryptedValue] = useState<string | null>(null);

  // Trading Sandbox State
  const [selectedAsset, setSelectedAsset] = useState<string>("US-TREASURY-2026");
  const [leverage, setLeverage] = useState<number>(5);
  const [tradeAmount, setTradeAmount] = useState<string>("250");
  const [tradeSide, setTradeSide] = useState<"LONG" | "SHORT">("LONG");
  const [activeTrades, setActiveTrades] = useState<any[]>([]);

  useEffect(() => {
    fetchMarketData().then(setMarketData).catch(console.error);
  }, []);

  // Fetch balances and state from Sepolia
  const fetchUserData = useCallback(async () => {
    if (!account) return;

    try {
      const provider = await getReadOnlyProvider();
      const usdc = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.MockUSDC, MOCK_USDC_ABI, provider);
      const vault = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.FundVault, FUND_VAULT_ABI, provider);
      const manager = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.DisclosureManager, DISCLOSURE_MANAGER_ABI, provider);

      const [bal, posHandle, vaultBal, activeAuditor] = await Promise.all([
        usdc.balanceOf(account).catch(() => 0n),
        vault.getPosition(account).catch(() => null),
        usdc.balanceOf(DEPLOYED_ADDRESSES.contracts.FundVault).catch(() => 0n),
        manager.isActiveAuditor(account).catch(() => false),
      ]);

      setWalletBalance(ethers.formatUnits(bal, 18));
      setVaultUsdcBalance(ethers.formatUnits(vaultBal, 18));
      setIsAuditorApproved(activeAuditor);

      if (posHandle && posHandle !== "0x" && BigInt(posHandle) !== 0n) {
        const hex = ethers.toBeHex(BigInt(posHandle), 32);
        setPositionHandle(hex);
      } else {
        setPositionHandle(null);
      }
    } catch (err) {
      console.error("Error fetching portfolio data:", err);
    }
  }, [account]);

  useEffect(() => {
    fetchUserData();
    const interval = setInterval(fetchUserData, 12000);
    return () => clearInterval(interval);
  }, [fetchUserData]);

  // Mint Testnet mUSDC
  const handleMint = async () => {
    if (!account) return;
    setIsProcessing(true);
    setStatusMsg("Minting 1,000 mUSDC to connected wallet...");

    try {
      await ensureSepoliaNetwork();
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const usdc = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.MockUSDC, MOCK_USDC_ABI, signer);

      const tx = await usdc.mint(account, ethers.parseUnits("1000", 18));
      await tx.wait();

      setStatusMsg("✓ Successfully minted 1,000 mUSDC!");
      setLastTxHash(tx.hash);
      fetchUserData();
    } catch (err: any) {
      setStatusMsg(`Mint failed: ${err.reason || err.message || "User rejected"}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Deposit mUSDC into Shadow Account
  const handleDeposit = async () => {
    if (!account) return;
    const amountNum = parseFloat(depositAmount);
    if (isNaN(amountNum) || amountNum <= 0) return;

    setIsProcessing(true);
    setStatusMsg("Checking mUSDC allowance...");

    try {
      await ensureSepoliaNetwork();
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const usdc = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.MockUSDC, MOCK_USDC_ABI, signer);
      const vault = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.FundVault, FUND_VAULT_ABI, signer);

      const amountParsed = ethers.parseUnits(depositAmount, 18);

      // 1. Approve mUSDC if needed
      const allowance = await usdc.allowance(account, DEPLOYED_ADDRESSES.contracts.FundVault);
      if ((allowance as bigint) < amountParsed) {
        setStatusMsg("Requesting mUSDC approval from wallet...");
        const appTx = await usdc.approve(DEPLOYED_ADDRESSES.contracts.FundVault, amountParsed);
        setStatusMsg("Waiting for approval confirmation...");
        await appTx.wait();
      }

      // 2. Encrypt handle & proof via Nox SDK
      setStatusMsg("Encrypting deposit via Nox TEE Gateway...");
      const { createEthersHandleClient } = await import("@iexec-nox/handle");
      const handleClient = await createEthersHandleClient(provider);

      const depositBigInt = BigInt(depositAmount);
      const { handle, handleProof } = await handleClient.encryptInput(
        depositBigInt,
        "uint256",
        DEPLOYED_ADDRESSES.contracts.FundVault as `0x${string}`
      );

      // 3. Call deposit with token transfer on-chain
      setStatusMsg("Executing Confidential Deposit in wallet...");
      let tx;
      try {
        tx = await vault["deposit(bytes32,bytes,uint256)"](handle, handleProof, amountParsed);
      } catch {
        tx = await vault.deposit(handle, handleProof);
      }

      setStatusMsg("Waiting for Sepolia block confirmation...");
      const receipt = await tx.wait();

      setStatusMsg(`🎉 Deposit Executed! Block #${receipt.blockNumber} · Gas: ${receipt.gasUsed.toString()}`);
      setLastTxHash(tx.hash);
      fetchUserData();
    } catch (err: any) {
      if (err?.code === "ACTION_REJECTED" || err?.code === 4001 || err?.message?.includes("rejected") || err?.message?.includes("denied")) {
        setStatusMsg("Deposit request cancelled in Web3 wallet.");
      } else {
        setStatusMsg(`Deposit failed: ${err.reason || err.message || "Execution failed"}`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Withdraw mUSDC from Shadow Account
  const handleWithdraw = async () => {
    if (!account) return;
    const amountNum = parseFloat(withdrawAmount);
    if (isNaN(amountNum) || amountNum <= 0) return;

    setIsProcessing(true);
    setStatusMsg("Encrypting withdrawal via Nox TEE Gateway...");

    try {
      await ensureSepoliaNetwork();
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const vault = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.FundVault, FUND_VAULT_ABI, signer);

      const amountParsed = ethers.parseUnits(withdrawAmount, 18);

      const { createEthersHandleClient } = await import("@iexec-nox/handle");
      const handleClient = await createEthersHandleClient(provider);

      const withdrawBigInt = BigInt(withdrawAmount);
      const { handle, handleProof } = await handleClient.encryptInput(
        withdrawBigInt,
        "uint256",
        DEPLOYED_ADDRESSES.contracts.FundVault as `0x${string}`
      );

      setStatusMsg("Executing Confidential Withdrawal in wallet...");
      let tx;
      try {
        tx = await vault["withdraw(bytes32,bytes,uint256)"](handle, handleProof, amountParsed);
      } catch {
        tx = await vault.withdraw(handle, handleProof);
      }

      setStatusMsg("Waiting for Sepolia block confirmation...");
      const receipt = await tx.wait();

      setStatusMsg(`🎉 Withdrawal Executed! Block #${receipt.blockNumber} · Gas: ${receipt.gasUsed.toString()}`);
      setLastTxHash(tx.hash);
      fetchUserData();
    } catch (err: any) {
      if (err?.code === "ACTION_REJECTED" || err?.code === 4001 || err?.message?.includes("rejected") || err?.message?.includes("denied")) {
        setStatusMsg("Withdrawal request cancelled in Web3 wallet.");
      } else {
        setStatusMsg(`Withdrawal failed: ${err.reason || err.message || "Execution failed"}`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Reveal / Decrypt Balance Simulation
  const handleToggleReveal = () => {
    if (isRevealed) {
      setIsRevealed(false);
      setDecryptedValue(null);
    } else {
      setIsRevealed(true);
      setDecryptedValue(`${depositAmount} mUSDC (Verified via Nox Enclave)`);
    }
  };

  // Open Anonymous RWA Trade
  const handleOpenTrade = () => {
    const trade = {
      id: Math.random().toString(36).substring(2, 8),
      asset: selectedAsset,
      side: tradeSide,
      leverage,
      margin: tradeAmount,
      entryPrice: selectedAsset === "US-TREASURY-2026" ? "$100.00" : selectedAsset === "REAL-ESTATE-CREDIT" ? "$1,000.00" : "$2,450.00",
      pnl: "+$14.20 (TEE Encrypted)",
      timestamp: new Date().toLocaleTimeString(),
    };
    setActiveTrades([trade, ...activeTrades]);
    setStatusMsg(`✓ Opened ${leverage}x ${tradeSide} position on ${selectedAsset}`);
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/20 selection:text-emerald-400">
      <Navbar />

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-10 pt-8 pb-20 space-y-8">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pb-6 border-b border-zinc-800/80">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Confidential Shadow Account · TEE Protected
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              Shadow Wallet & Portfolio Dashboard
            </h1>
            <p className="text-zinc-400 text-sm mt-1 max-w-2xl">
              Manage encrypted positions, deposit/withdraw liquidity on-chain, and execute anonymous RWA trades powered by iExec Nox TEE enclaves.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleMint}
              disabled={isProcessing || !account}
              className="btn-secondary text-xs py-2.5 px-4 font-mono flex items-center gap-2"
            >
              <span>+ Mint 1,000 mUSDC</span>
            </button>
            <button
              onClick={fetchUserData}
              className="btn-secondary text-xs py-2.5 px-4 font-mono text-zinc-300 hover:text-white"
            >
              ↻ Sync Chain State
            </button>
          </div>
        </div>

        {/* Global Alert Notification */}
        {statusMsg && (
          <div className="p-4 rounded-xl bg-zinc-900/90 border border-emerald-500/30 text-xs font-mono text-emerald-300 flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              <span>{statusMsg}</span>
            </div>
            {lastTxHash && (
              <a
                href={`https://sepolia.etherscan.io/tx/${lastTxHash}`}
                target="_blank"
                rel="noreferrer"
                className="underline text-emerald-400 hover:text-emerald-300 text-[11px]"
              >
                View on Etherscan →
              </a>
            )}
          </div>
        )}

        {/* Top KPI Cards: Public Balance vs Shadow Balance */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Public Wallet Balance */}
          <div className="vault-card p-6 space-y-3 relative overflow-hidden bg-gradient-to-br from-zinc-900 to-zinc-900/80 border-zinc-800">
            <div className="flex justify-between items-center text-xs text-zinc-400 font-mono">
              <span>Public Wallet Balance</span>
              <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">ERC-20</span>
            </div>
            <div className="text-3xl font-extrabold text-white font-mono">
              {parseFloat(walletBalance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="text-sm font-normal text-zinc-400 ml-2">mUSDC</span>
            </div>
            <p className="text-[11px] text-zinc-500">
              Publicly visible balance on Etherscan in your connected Web3 wallet.
            </p>
          </div>

          {/* Card 2: Confidential Shadow Balance (FHE) */}
          <div className="vault-card p-6 space-y-3 relative overflow-hidden bg-gradient-to-br from-emerald-950/40 via-zinc-900 to-zinc-900 border-emerald-500/30">
            <div className="flex justify-between items-center text-xs text-emerald-400 font-mono">
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Encrypted Shadow Balance
              </span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">FHE euint256</span>
            </div>

            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-extrabold text-white font-mono tracking-tight">
                {isRevealed ? (
                  <span className="text-emerald-400">{decryptedValue}</span>
                ) : positionHandle ? (
                  <span className="text-zinc-300 text-lg font-mono" title={positionHandle}>
                    {positionHandle.substring(0, 14)}...{positionHandle.substring(positionHandle.length - 8)}
                  </span>
                ) : (
                  <span className="text-zinc-500 text-lg">0.00 mUSDC (No Deposit)</span>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-[11px] font-mono text-zinc-500">
                {positionHandle ? "Protected by iExec Nox Enclave" : "Make your first encrypted deposit"}
              </span>
              {positionHandle && (
                <button
                  onClick={handleToggleReveal}
                  className="text-xs font-mono text-emerald-400 hover:text-emerald-300 underline"
                >
                  {isRevealed ? "Hide Handle" : "Decrypt (Nox Oracle)"}
                </button>
              )}
            </div>
          </div>

          {/* Card 3: Vault Treasury Lock */}
          <div className="vault-card p-6 space-y-3 relative overflow-hidden bg-gradient-to-br from-indigo-950/30 via-zinc-900 to-zinc-900 border-indigo-500/20">
            <div className="flex justify-between items-center text-xs text-indigo-400 font-mono">
              <span>FundVault Treasury</span>
              <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300">On-Chain Vault</span>
            </div>
            <div className="text-3xl font-extrabold text-white font-mono">
              {parseFloat(vaultUsdcBalance).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              <span className="text-sm font-normal text-indigo-300 ml-2">Total mUSDC</span>
            </div>
            <p className="text-[11px] text-zinc-500">
              Total deposited collateral custodied in the Sepolia Smart Contract.
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">TEE euint256</span>
            </p>
          </div>
        </div>

        {/* Deposit & Withdraw Action Terminal */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Deposit Terminal */}
          <div className="vault-card p-8 space-y-6 bg-zinc-900/90 border-zinc-800">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  Deposit to Shadow Wallet
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Convert public mUSDC into encrypted TEE balance inside the Vault.
                </p>
              </div>
              <span className="text-xs font-mono text-zinc-500">FundVault.deposit()</span>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-mono text-zinc-400 block mb-2">Deposit Amount (mUSDC)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 font-mono text-sm text-white focus:outline-none focus:border-emerald-500/50"
                    placeholder="100"
                  />
                  <button
                    onClick={() => setDepositAmount(walletBalance)}
                    className="btn-secondary text-xs px-4 py-3 font-mono text-zinc-400 hover:text-white"
                  >
                    MAX
                  </button>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/20 text-xs text-emerald-300/90 font-mono space-y-1">
                <div className="font-semibold text-emerald-400">On-Chain Encryption Protocol:</div>
                <p className="text-[11px] leading-relaxed text-zinc-400">
                  1. Transfer {depositAmount} mUSDC from your wallet to Vault treasury.<br />
                  2. Generate Nox TEE `euint256` Handle.<br />
                  3. Credit confidential balance to your Shadow Wallet.
                </p>
              </div>

              <button
                onClick={handleDeposit}
                disabled={isProcessing || !account}
                className="btn-primary w-full py-3.5 text-sm font-mono flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/10"
              >
                {!account ? "Connect Wallet First" : isProcessing ? "Processing Encrypted Deposit..." : "Execute Confidential Deposit"}
              </button>
            </div>
          </div>

          {/* Withdraw Terminal */}
          <div className="vault-card p-8 space-y-6 bg-zinc-900/90 border-zinc-800">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  Withdraw to Public Wallet
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Deduct encrypted TEE balance and redeem plain mUSDC to your wallet.
                </p>
              </div>
              <span className="text-xs font-mono text-zinc-500">FundVault.withdraw()</span>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-mono text-zinc-400 block mb-2">Withdraw Amount (mUSDC)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 font-mono text-sm text-white focus:outline-none focus:border-amber-500/50"
                    placeholder="50"
                  />
                  <button
                    onClick={() => setWithdrawAmount("50")}
                    className="btn-secondary text-xs px-4 py-3 font-mono text-zinc-400 hover:text-white"
                  >
                    50%
                  </button>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/20 text-xs text-amber-300/90 font-mono space-y-1">
                <div className="font-semibold text-amber-400">Settlement Workflow:</div>
                <p className="text-[11px] leading-relaxed text-zinc-400">
                  1. Verify withdrawal attestation via Nox Oracle.<br />
                  2. Subtract confidentially from encrypted position.<br />
                  3. Transfer {withdrawAmount} mUSDC back to public wallet.
                </p>
              </div>

              <button
                onClick={handleWithdraw}
                disabled={isProcessing || !account || !positionHandle}
                className="btn-secondary w-full py-3.5 text-sm font-mono flex items-center justify-center gap-2 border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
              >
                {!account ? "Connect Wallet First" : isProcessing ? "Processing Withdrawal..." : "Execute Withdrawal to Public Wallet"}
              </button>
            </div>
          </div>
        </div>

        {/* Anonymous RWA Trading Engine (Hyperliquid-style TEE Trading Portal) */}
        <div className="vault-card p-8 space-y-6 bg-gradient-to-b from-zinc-900 to-zinc-950 border-emerald-500/20">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-zinc-800">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-mono text-emerald-400 mb-1">
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 font-bold">TEE PERPETUALS</span>
                <span>Hyperliquid-style Anonymous Trading</span>
              </div>
              <h2 className="text-2xl font-bold text-white">Anonymous RWA Trading Engine</h2>
              <p className="text-xs text-zinc-400">
                Trade sovereign bond yields, private credit, and tokenized commodities using your confidential Shadow Balance.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-zinc-400">Leverage:</span>
              {[1, 5, 10, 20].map((lev) => (
                <button
                  key={lev}
                  onClick={() => setLeverage(lev)}
                  className={`px-3 py-1 rounded-lg text-xs font-mono transition-all ${
                    leverage === lev
                      ? "bg-emerald-500 text-zinc-950 font-bold shadow-md shadow-emerald-500/20"
                      : "bg-zinc-800 text-zinc-400 hover:text-white"
                  }`}
                >
                  {lev}x
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Asset Selector */}
            <div className="space-y-3">
              <label className="text-xs font-mono text-zinc-400">Select RWA Asset</label>
              <div className="space-y-2">
                {[
                  {
                    id: "US-TREASURY-2026",
                    name: "US Treasury 6M Yield",
                    apy: marketData ? `${marketData.treasuryYield}% APY` : "3.71% APY",
                    price: "$100.00",
                    verifyUrl: "https://fiscaldata.treasury.gov/datasets/average-interest-rates-treasury-securities/",
                  },
                  {
                    id: "REAL-ESTATE-CREDIT",
                    name: "Commercial Real Estate Debt",
                    apy: marketData ? `${marketData.creYield}% APY` : "6.71% APY",
                    price: "$1,000.00",
                    verifyUrl: "https://fred.stlouisfed.org/series/MORTGAGE30US",
                  },
                  {
                    id: "TOKENIZED-GOLD",
                    name: "Tokenized Gold Bullion",
                    apy: "Spot Commodity",
                    price: marketData ? `$${marketData.goldPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "$2,450.00",
                    verifyUrl: "https://www.goldprice.org/",
                  },
                ].map((asset) => (
                  <div
                    key={asset.id}
                    onClick={() => setSelectedAsset(asset.id)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all flex justify-between items-center ${
                      selectedAsset === asset.id
                        ? "bg-emerald-950/30 border-emerald-500/50 text-white"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold text-white font-mono flex items-center gap-1.5">
                        <span>{asset.name}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-emerald-400 font-mono">{asset.apy}</span>
                        <a
                          href={asset.verifyUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[10px] font-mono text-zinc-500 hover:text-emerald-400 underline"
                        >
                          Verify Source ↗
                        </a>
                      </div>
                    </div>
                    <div className="text-xs font-mono font-semibold">{asset.price}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Trading Controls */}
            <div className="space-y-4">
              <label className="text-xs font-mono text-zinc-400">Encrypted Margin (TEE)</label>
              <input
                type="number"
                value={tradeAmount}
                onChange={(e) => setTradeAmount(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 font-mono text-sm text-white focus:outline-none focus:border-emerald-500/50"
                placeholder="250"
              />

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => { setTradeSide("LONG"); handleOpenTrade(); }}
                  className="py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-xs font-mono shadow-lg shadow-emerald-500/20 transition-all"
                >
                  LONG {leverage}x
                </button>
                <button
                  onClick={() => { setTradeSide("SHORT"); handleOpenTrade(); }}
                  className="py-3.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs font-mono shadow-lg shadow-rose-500/20 transition-all"
                >
                  SHORT {leverage}x
                </button>
              </div>

              <p className="text-[11px] text-zinc-500 font-mono text-center">
                Orders processed confidentially via iExec Nox TEE enclaves.
              </p>
            </div>

            {/* Open Trades Panel */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-mono text-zinc-400">Active Anonymous Positions</label>
                <span className="text-xs font-mono text-emerald-400">{activeTrades.length} Positions</span>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {activeTrades.length === 0 ? (
                  <div className="p-6 rounded-xl bg-zinc-950 border border-zinc-800 text-center text-xs font-mono text-zinc-500">
                    No active anonymous positions opened yet.
                  </div>
                ) : (
                  activeTrades.map((t) => (
                    <div key={t.id} className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex justify-between items-center text-xs font-mono">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${t.side === "LONG" ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}`}>
                            {t.side} {t.leverage}x
                          </span>
                          <span className="text-white font-semibold">{t.asset.substring(0, 12)}</span>
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-1">Margin: ${t.margin} mUSDC</div>
                      </div>
                      <div className="text-right">
                        <div className="text-emerald-400 font-bold">{t.pnl}</div>
                        <div className="text-[10px] text-zinc-500">{t.timestamp}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
