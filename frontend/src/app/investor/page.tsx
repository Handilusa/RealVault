"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { useAccount } from "wagmi";
import Navbar from "@/components/Navbar";
import {
  DEPLOYED_ADDRESSES,
  RPC_URL,
  FUND_VAULT_ABI,
  MOCK_USDC_ABI,
} from "@/lib/contracts";
import { ensureSepoliaNetwork, getReadOnlyProvider } from "@/lib/web3";

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

export default function InvestorPortalPage() {
  const { address: account } = useAccount();

  const [walletBalance, setWalletBalance] = useState("0");
  const [positionHandle, setPositionHandle] = useState<string | null>(null);
  const [vaultBalance, setVaultBalance] = useState("0");
  const [isInvestor, setIsInvestor] = useState(false);
  const [shadowBalance, setShadowBalance] = useState(0);

  const [depositAmount, setDepositAmount] = useState("100");
  const [withdrawAmount, setWithdrawAmount] = useState("50");
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);

  // Hydrate shadow balance from localStorage
  useEffect(() => {
    if (!account) return;
    const stored = localStorage.getItem(`rv_shadow_${account.toLowerCase()}`);
    if (stored) setShadowBalance(parseFloat(stored));
  }, [account]);

  const fetchData = useCallback(async () => {
    if (!account) return;
    try {
      const provider = await getReadOnlyProvider();
      const usdc = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.MockUSDC, MOCK_USDC_ABI, provider);
      const vault = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.FundVault, FUND_VAULT_ABI, provider);

      const [bal, rawHandle, vaultBal, inv] = await Promise.all([
        usdc.balanceOf(account),
        vault.getPosition(account),
        usdc.balanceOf(DEPLOYED_ADDRESSES.contracts.FundVault),
        vault.isInvestor(account),
      ]);

      setWalletBalance(ethers.formatUnits(bal, 18));
      setVaultBalance(ethers.formatUnits(vaultBal, 18));
      setPositionHandle(toHexHandle(rawHandle));
      setIsInvestor(inv as boolean);
    } catch (err) {
      console.error("Fetch error:", err);
    }
  }, [account]);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 15000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const handleMint = async () => {
    if (!account) return;
    setIsProcessing(true);
    setStatusMsg("Minting 1,000 mUSDC...");
    try {
      await ensureSepoliaNetwork();
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const usdc = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.MockUSDC, MOCK_USDC_ABI, signer);
      const tx = await usdc.mint(account, ethers.parseUnits("1000", 18));
      await tx.wait();
      setStatusMsg("Minted 1,000 mUSDC successfully.");
      setLastTxHash(tx.hash);
      fetchData();
    } catch (err: any) {
      setStatusMsg(`Mint failed: ${err.reason || err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeposit = async () => {
    if (!account) return;
    const amt = parseFloat(depositAmount);
    if (isNaN(amt) || amt <= 0) return;
    setIsProcessing(true);
    setStatusMsg("Checking mUSDC allowance...");
    try {
      await ensureSepoliaNetwork();
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const usdc = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.MockUSDC, MOCK_USDC_ABI, signer);
      const vault = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.FundVault, FUND_VAULT_ABI, signer);
      const amountParsed = ethers.parseUnits(depositAmount, 18);

      const allowance = await usdc.allowance(account, DEPLOYED_ADDRESSES.contracts.FundVault);
      if ((allowance as bigint) < amountParsed) {
        setStatusMsg("Requesting mUSDC approval...");
        const appTx = await usdc.approve(DEPLOYED_ADDRESSES.contracts.FundVault, amountParsed);
        await appTx.wait();
      }

      setStatusMsg("Encrypting via Nox TEE Gateway...");
      const { createEthersHandleClient } = await import("@iexec-nox/handle");
      const handleClient = await createEthersHandleClient(provider);
      const { handle, handleProof } = await handleClient.encryptInput(
        BigInt(depositAmount), "uint256",
        DEPLOYED_ADDRESSES.contracts.FundVault as `0x${string}`
      );

      setStatusMsg("Executing Confidential Deposit...");
      let tx;
      try { tx = await vault["deposit(bytes32,bytes,uint256)"](handle, handleProof, amountParsed); }
      catch { tx = await vault.deposit(handle, handleProof); }
      const receipt = await tx.wait();

      const newShadow = shadowBalance + amt;
      localStorage.setItem(`rv_shadow_${account.toLowerCase()}`, String(newShadow));
      setShadowBalance(newShadow);

      setStatusMsg(`Deposit confirmed! Block #${receipt.blockNumber} · Gas: ${receipt.gasUsed}`);
      setLastTxHash(tx.hash);
      fetchData();
    } catch (err: any) {
      setStatusMsg(`Deposit failed: ${err.reason || err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleWithdraw = async () => {
    if (!account) return;
    const amt = parseFloat(withdrawAmount);
    if (isNaN(amt) || amt <= 0) return;
    setIsProcessing(true);
    setStatusMsg("Encrypting withdrawal via Nox TEE...");
    try {
      await ensureSepoliaNetwork();
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const vault = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.FundVault, FUND_VAULT_ABI, signer);
      const amountParsed = ethers.parseUnits(withdrawAmount, 18);

      const { createEthersHandleClient } = await import("@iexec-nox/handle");
      const handleClient = await createEthersHandleClient(provider);
      const { handle, handleProof } = await handleClient.encryptInput(
        BigInt(withdrawAmount), "uint256",
        DEPLOYED_ADDRESSES.contracts.FundVault as `0x${string}`
      );

      setStatusMsg("Executing Confidential Withdrawal...");
      let tx;
      try { tx = await vault["withdraw(bytes32,bytes,uint256)"](handle, handleProof, amountParsed); }
      catch { tx = await vault.withdraw(handle, handleProof); }
      const receipt = await tx.wait();

      const newShadow = Math.max(0, shadowBalance - amt);
      localStorage.setItem(`rv_shadow_${account.toLowerCase()}`, String(newShadow));
      setShadowBalance(newShadow);

      setStatusMsg(`Withdrawal confirmed! Block #${receipt.blockNumber} · Gas: ${receipt.gasUsed}`);
      setLastTxHash(tx.hash);
      fetchData();
    } catch (err: any) {
      setStatusMsg(`Withdrawal failed: ${err.reason || err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      <Navbar />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-20 space-y-8">
        {/* Header */}
        <div className="pb-6 border-b border-zinc-800">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-mono mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
            Investor Dashboard · Sepolia Testnet
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            My Portfolio
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Manage your public and encrypted positions. Deposit, withdraw, and monitor on-chain state in real time.
          </p>
        </div>

        {/* Status Bar */}
        {statusMsg && (
          <div className="p-4 rounded-xl bg-zinc-900 border border-emerald-500/30 text-xs font-mono text-emerald-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              {statusMsg}
            </div>
            {lastTxHash && (
              <a href={`https://sepolia.etherscan.io/tx/${lastTxHash}`} target="_blank" rel="noreferrer"
                className="underline text-emerald-400 hover:text-emerald-300 text-[11px]">
                Etherscan →
              </a>
            )}
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
            <span className="text-[10px] font-mono text-zinc-500 uppercase">Public Wallet</span>
            <div className="text-2xl font-extrabold text-white font-mono">
              {parseFloat(walletBalance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-xs text-zinc-400">mUSDC (ERC-20)</span>
          </div>

          <div className="p-5 rounded-xl bg-gradient-to-br from-emerald-950/40 to-zinc-900 border border-emerald-500/30 space-y-2">
            <span className="text-[10px] font-mono text-emerald-400 uppercase flex items-center gap-1.5">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Shadow Balance
            </span>
            <div className="text-2xl font-extrabold text-emerald-400 font-mono">
              {shadowBalance > 0 ? shadowBalance.toLocaleString("en-US", { minimumFractionDigits: 2 }) : "0.00"}
            </div>
            <span className="text-xs text-zinc-400">mUSDC (TEE Encrypted)</span>
          </div>

          <div className="p-5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
            <span className="text-[10px] font-mono text-zinc-500 uppercase">Vault Treasury</span>
            <div className="text-2xl font-extrabold text-white font-mono">
              {parseFloat(vaultBalance).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
            <span className="text-xs text-zinc-400">Total mUSDC Locked</span>
          </div>

          <div className="p-5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
            <span className="text-[10px] font-mono text-zinc-500 uppercase">On-Chain Status</span>
            <div className="flex items-center gap-2 mt-1">
              {isInvestor ? (
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-mono font-bold">Active Investor</span>
              ) : (
                <span className="px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400 text-xs font-mono">No Position</span>
              )}
            </div>
            <span className="text-[10px] text-zinc-500 font-mono truncate block" title={positionHandle || ""}>
              {positionHandle ? `${positionHandle.substring(0, 14)}...${positionHandle.substring(positionHandle.length - 6)}` : "No handle"}
            </span>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-3">
          <button onClick={handleMint} disabled={isProcessing || !account}
            className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-300 hover:text-white transition-all border border-zinc-700">
            + Mint 1,000 mUSDC
          </button>
          <button onClick={fetchData}
            className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-300 hover:text-white transition-all border border-zinc-700">
            ↻ Refresh State
          </button>
        </div>

        {/* Deposit & Withdraw */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Deposit */}
          <div className="p-6 rounded-xl bg-zinc-900 border border-zinc-800 space-y-5">
            <div className="border-b border-zinc-800 pb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                Deposit to Shadow Wallet
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Transfer mUSDC from public wallet into TEE-encrypted shadow balance.
              </p>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-mono text-zinc-400">Amount (mUSDC)</label>
              <div className="flex gap-2">
                <input type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 font-mono text-sm text-white focus:outline-none focus:border-emerald-500/50" placeholder="100" />
                <button onClick={() => setDepositAmount(walletBalance)}
                  className="px-4 py-3 rounded-xl bg-zinc-800 text-xs font-mono text-zinc-400 hover:text-white border border-zinc-700">MAX</button>
              </div>

              <button onClick={handleDeposit} disabled={isProcessing || !account}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-sm font-mono transition-all shadow-lg shadow-emerald-500/10">
                {!account ? "Connect Wallet" : isProcessing ? "Processing..." : "Execute Deposit"}
              </button>
            </div>
          </div>

          {/* Withdraw */}
          <div className="p-6 rounded-xl bg-zinc-900 border border-zinc-800 space-y-5">
            <div className="border-b border-zinc-800 pb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                Withdraw to Public Wallet
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Deduct TEE shadow balance and redeem plain mUSDC to your connected wallet.
              </p>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-mono text-zinc-400">Amount (mUSDC)</label>
              <div className="flex gap-2">
                <input type="number" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 font-mono text-sm text-white focus:outline-none focus:border-amber-500/50" placeholder="50" />
                <button onClick={() => setWithdrawAmount(String(shadowBalance))}
                  className="px-4 py-3 rounded-xl bg-zinc-800 text-xs font-mono text-zinc-400 hover:text-white border border-zinc-700">MAX</button>
              </div>

              <button onClick={handleWithdraw} disabled={isProcessing || !account || !positionHandle}
                className="w-full py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-300 font-bold text-sm font-mono transition-all border border-amber-500/30">
                {!account ? "Connect Wallet" : isProcessing ? "Processing..." : "Execute Withdrawal"}
              </button>
            </div>
          </div>
        </div>

        {/* Position Details */}
        {positionHandle && (
          <div className="p-6 rounded-xl bg-zinc-900 border border-zinc-800 space-y-4">
            <h3 className="text-base font-bold text-white">On-Chain Position Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
              <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 space-y-1">
                <span className="text-zinc-500 text-[10px] uppercase">TEE Position Handle</span>
                <p className="text-indigo-400 break-all text-[11px]">{positionHandle}</p>
              </div>
              <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 space-y-1">
                <span className="text-zinc-500 text-[10px] uppercase">FundVault Contract</span>
                <a href={`https://sepolia.etherscan.io/address/${DEPLOYED_ADDRESSES.contracts.FundVault}#readContract`}
                  target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline break-all text-[11px] block">
                  {DEPLOYED_ADDRESSES.contracts.FundVault}
                </a>
              </div>
              <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 space-y-1">
                <span className="text-zinc-500 text-[10px] uppercase">Connected Address</span>
                <p className="text-white break-all text-[11px]">{account}</p>
              </div>
              <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 space-y-1">
                <span className="text-zinc-500 text-[10px] uppercase">Investor Status</span>
                <p className="text-emerald-400 font-bold">{isInvestor ? "Registered On-Chain" : "Not Registered"}</p>
              </div>
            </div>
          </div>
        )}

        {/* Not Connected State */}
        {!account && (
          <div className="p-12 rounded-xl bg-zinc-900/50 border border-zinc-800 text-center space-y-3">
            <div className="text-zinc-500 font-mono text-sm">Connect your Web3 wallet to access your portfolio</div>
            <p className="text-zinc-600 text-xs font-mono">Supports any EVM-compatible wallet (MetaMask, OKX, Rainbow, Trust, etc.)</p>
          </div>
        )}
      </div>
    </main>
  );
}
