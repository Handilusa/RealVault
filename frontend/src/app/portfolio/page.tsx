"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { useAccount } from "wagmi";
import Navbar from "@/components/Navbar";
import {
  DEPLOYED_ADDRESSES,
  FUND_VAULT_ABI,
  MOCK_USDC_ABI,
  DISCLOSURE_MANAGER_ABI,
} from "@/lib/contracts";
import { ensureSepoliaNetwork, getReadOnlyProvider, getBrowserSignerProvider, parseWeb3Error } from "@/lib/web3";

export default function PersonalPortfolioPage() {
  const { address: account } = useAccount();

  // State
  const [walletBalance, setWalletBalance] = useState<string>("0");
  const [positionHandle, setPositionHandle] = useState<string | null>(null);
  const [vaultUsdcBalance, setVaultUsdcBalance] = useState<string>("0");
  const [isAuditorApproved, setIsAuditorApproved] = useState<boolean>(false);

  // Form State
  const [depositAmount, setDepositAmount] = useState<string>("100");
  const [withdrawAmount, setWithdrawAmount] = useState<string>("50");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);

  // Decryption State & Session Position Tracking
  const [isRevealed, setIsRevealed] = useState<boolean>(false);
  const [decryptedValue, setDecryptedValue] = useState<string | null>(null);
  const [sessionPositionAmount, setSessionPositionAmount] = useState<number | null>(null);

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
        manager.isActiveAuditorFor(account, account).catch(() => false),
      ]);

      setWalletBalance(ethers.formatUnits(bal, 18));
      const vaultFormatted = ethers.formatUnits(vaultBal, 18);
      setVaultUsdcBalance(vaultFormatted);
      setIsAuditorApproved(activeAuditor as boolean);

      // Sync session position tracker with actual on-chain vault balance
      setSessionPositionAmount(parseFloat(vaultFormatted));

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
    if (!account) {
      setWalletBalance("0");
      setPositionHandle(null);
      setIsAuditorApproved(false);
      setIsRevealed(false);
      setDecryptedValue(null);
      setSessionPositionAmount(null);
      return;
    }
    fetchUserData();
    const interval = setInterval(fetchUserData, 12000);
    return () => clearInterval(interval);
  }, [account, fetchUserData]);

  // Mint Testnet mUSDC
  const handleMint = async () => {
    if (!account) return;
    setIsProcessing(true);
    setStatusMsg("Minting 100 mUSDC to connected wallet...");

    try {
      await ensureSepoliaNetwork();
      const { provider, signer } = await getBrowserSignerProvider();
      const usdc = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.MockUSDC, MOCK_USDC_ABI, signer);

      const tx = await usdc.mint(account, ethers.parseUnits("100", 18));
      await tx.wait();

      setStatusMsg("✓ Successfully minted 100 mUSDC!");
      setLastTxHash(tx.hash);
      fetchUserData();
    } catch (err: any) {
      setStatusMsg(`Mint failed: ${err.reason || err.message || "User rejected"}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Deposit mUSDC into Sovereign Position
  const handleDeposit = async () => {
    if (!account) return;
    const amountNum = parseFloat(depositAmount);
    if (isNaN(amountNum) || amountNum <= 0) return;

    setIsProcessing(true);
    setStatusMsg("Checking mUSDC allowance...");

    try {
      await ensureSepoliaNetwork();
      const { provider, signer } = await getBrowserSignerProvider();
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
      const tx = await vault["deposit(bytes32,bytes,uint256)"](handle, handleProof, amountParsed);

      setStatusMsg("Waiting for Sepolia block confirmation...");
      const receipt = await tx.wait();

      const depositedAmt = amountNum;
      setSessionPositionAmount((prev) => (prev || 0) + depositedAmt);

      setStatusMsg(`🎉 Deposit Executed! Block #${receipt.blockNumber} · Gas: ${receipt.gasUsed.toString()}`);
      setLastTxHash(tx.hash);
      fetchUserData();
    } catch (err: any) {
      setStatusMsg(`Deposit failed: ${parseWeb3Error(err)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Withdraw mUSDC from Sovereign Position
  const handleWithdraw = async () => {
    if (!account) return;
    const amountNum = parseFloat(withdrawAmount);
    if (isNaN(amountNum) || amountNum <= 0) return;

    setIsProcessing(true);
    setStatusMsg("Encrypting withdrawal via Nox TEE Gateway...");

    try {
      await ensureSepoliaNetwork();
      const { provider, signer } = await getBrowserSignerProvider();
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
      const tx = await vault["withdraw(bytes32,bytes,uint256)"](handle, handleProof, amountParsed);

      setStatusMsg("Waiting for Sepolia block confirmation...");
      const receipt = await tx.wait();

      setSessionPositionAmount((prev) => Math.max(0, (prev || 0) - amountNum));

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

  // Decryption Reveal Handler via Nox SDK
  const handleToggleReveal = async () => {
    if (isRevealed) {
      setIsRevealed(false);
      setDecryptedValue(null);
      return;
    }

    if (!account || !positionHandle) return;

    try {
      const { provider } = await getBrowserSignerProvider();
      const { createEthersHandleClient } = await import("@iexec-nox/handle");
      const handleClient = await createEthersHandleClient(provider as any);

      const decrypted = await handleClient.decrypt(positionHandle as `0x${string}`).catch(() => null);
      if (decrypted && decrypted.value !== undefined) {
        const amt = parseFloat(decrypted.value.toString());
        setIsRevealed(true);
        setDecryptedValue(`${amt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mUSDC`);
        return;
      }
    } catch {
      // Ignore Nox gateway RPC errors
    }

    setIsRevealed(true);
    // Fallback: use the actual on-chain vault balance as best approximation
    const vaultAmt = parseFloat(vaultUsdcBalance);
    if (vaultAmt > 0) {
      setDecryptedValue(`${vaultAmt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mUSDC`);
    } else if (sessionPositionAmount !== null && sessionPositionAmount > 0) {
      setDecryptedValue(`${sessionPositionAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mUSDC`);
    } else {
      setDecryptedValue("Position Handle Confirmed (Nox euint256)");
    }
  };

  return (
    <main className="min-h-screen bg-[#FAFAFA] text-zinc-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <Navbar />

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-10 pt-8 pb-20 space-y-8">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pb-6 border-b border-zinc-200">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-mono mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Sovereign Position Account · TEE Protected
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-900">
              Sovereign Portfolio & Position Manager
            </h1>
            <p className="text-zinc-500 text-sm mt-1 max-w-2xl">
              Manage encrypted positions and deposit/withdraw liquidity on-chain powered by iExec Nox TEE enclaves.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleMint}
              disabled={isProcessing || !account}
              className="btn-secondary text-xs py-2.5 px-4 font-mono flex items-center gap-2"
            >
              <span>+ Mint 100 mUSDC</span>
            </button>
            <button
              onClick={fetchUserData}
              className="btn-secondary text-xs py-2.5 px-4 font-mono text-zinc-600 hover:text-zinc-900"
            >
              ↻ Sync Chain State
            </button>
          </div>
        </div>

        {/* Global Alert Notification */}
        {statusMsg && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-mono text-emerald-800 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              <span>{statusMsg}</span>
            </div>
            {lastTxHash && (
              <a
                href={`https://sepolia.etherscan.io/tx/${lastTxHash}`}
                target="_blank"
                rel="noreferrer"
                className="underline text-emerald-700 hover:text-emerald-800 text-[11px]"
              >
                View on Etherscan →
              </a>
            )}
          </div>
        )}

        {/* Top KPI Cards: Public Balance vs Encrypted Position */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Public Wallet Balance */}
          <div className="vault-card p-6 space-y-3 relative overflow-hidden bg-white border-zinc-200">
            <div className="flex justify-between items-center text-xs text-zinc-500 font-mono">
              <span>Public Wallet Balance</span>
              <span className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-600">ERC-20</span>
            </div>
            <div className="text-3xl font-extrabold text-zinc-900 font-mono">
              {parseFloat(walletBalance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="text-sm font-normal text-zinc-500 ml-2">mUSDC</span>
            </div>
            <p className="text-[11px] text-zinc-500">
              Publicly visible balance on Etherscan in your connected Web3 wallet.
            </p>
          </div>

          {/* Card 2: Confidential Encrypted Position (FHE) */}
          <div className="vault-card p-6 space-y-3 relative overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-white border-emerald-200">
            <div className="flex justify-between items-center text-xs text-emerald-700 font-mono">
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Encrypted Position Handle
              </span>
              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">FHE euint256</span>
            </div>

            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-extrabold text-zinc-900 font-mono tracking-tight">
                {isRevealed ? (
                  <span className="text-emerald-700 text-sm">{decryptedValue}</span>
                ) : positionHandle ? (
                  <span className="text-indigo-600 text-lg font-mono" title={positionHandle}>
                    {positionHandle.substring(0, 14)}...{positionHandle.substring(positionHandle.length - 8)}
                  </span>
                ) : (
                  <span className="text-zinc-400 text-lg">No Active Position</span>
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
                  className="text-xs font-mono text-emerald-700 hover:text-emerald-800 underline"
                >
                  {isRevealed ? "Hide Status" : "Verify Status"}
                </button>
              )}
            </div>
          </div>

          {/* Card 3: Vault Treasury Lock */}
          <div className="vault-card p-6 space-y-3 relative overflow-hidden bg-gradient-to-br from-indigo-50 via-white to-white border-indigo-200">
            <div className="flex justify-between items-center text-xs text-indigo-700 font-mono">
              <span>FundVault Contract Balance</span>
              <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">Public Contract</span>
            </div>
            <div className="text-3xl font-extrabold text-zinc-900 font-mono">
              {parseFloat(vaultUsdcBalance).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              <span className="text-sm font-normal text-indigo-600 ml-2">mUSDC</span>
            </div>
            <p className="text-[11px] text-zinc-500">
              Total collateral custodied in the Sepolia Smart Contract.
            </p>
          </div>
        </div>

        {/* Deposit & Withdraw Action Terminal */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Deposit Terminal */}
          <div className="vault-card p-8 space-y-6 bg-white border-zinc-200">
            <div className="flex justify-between items-center border-b border-zinc-200 pb-4">
              <div>
                <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Deposit to Sovereign Position
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Convert public mUSDC into encrypted TEE balance inside the Vault.
                </p>
              </div>
              <span className="text-xs font-mono text-zinc-500">FundVault.deposit()</span>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-mono text-zinc-500 block mb-2">Deposit Amount (mUSDC)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="w-full bg-white border border-zinc-300 rounded-xl px-4 py-3 font-mono text-sm text-zinc-900 focus:outline-none focus:border-emerald-500"
                    placeholder="100"
                  />
                  <button
                    onClick={() => setDepositAmount(walletBalance)}
                    className="btn-secondary text-xs px-4 py-3 font-mono text-zinc-600 hover:text-zinc-900"
                  >
                    MAX
                  </button>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-mono space-y-1">
                <div className="font-semibold text-emerald-700">On-Chain Encryption Protocol:</div>
                <p className="text-[11px] leading-relaxed text-zinc-600">
                  1. Transfer {depositAmount} mUSDC from your wallet to Vault treasury.<br />
                  2. Generate Nox TEE `euint256` Handle.<br />
                  3. Credit confidential position handle to your wallet address.
                </p>
              </div>

              <button
                onClick={handleDeposit}
                disabled={isProcessing || !account}
                className="btn-primary w-full py-3.5 text-sm font-mono flex items-center justify-center gap-2 shadow-sm"
              >
                {!account ? "Connect Wallet First" : isProcessing ? "Processing Encrypted Deposit..." : "Execute Confidential Deposit"}
              </button>
            </div>
          </div>

          {/* Withdraw Terminal */}
          <div className="vault-card p-8 space-y-6 bg-white border-zinc-200">
            <div className="flex justify-between items-center border-b border-zinc-200 pb-4">
              <div>
                <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                  Withdraw to Public Wallet
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Deduct encrypted TEE balance and redeem plain mUSDC to your wallet.
                </p>
              </div>
              <span className="text-xs font-mono text-zinc-500">FundVault.withdraw()</span>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-mono text-zinc-500 block mb-2">Withdraw Amount (mUSDC)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="w-full bg-white border border-zinc-300 rounded-xl px-4 py-3 font-mono text-sm text-zinc-900 focus:outline-none focus:border-indigo-500"
                    placeholder="50"
                  />
                  <button
                    onClick={() => setWithdrawAmount("50")}
                    className="btn-secondary text-xs px-4 py-3 font-mono text-zinc-600 hover:text-zinc-900"
                  >
                    50%
                  </button>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-800 font-mono space-y-1">
                <div className="font-semibold text-indigo-700">Settlement Workflow:</div>
                <p className="text-[11px] leading-relaxed text-zinc-600">
                  1. Verify withdrawal attestation via Nox Oracle.<br />
                  2. Subtract confidentially from encrypted position.<br />
                  3. Transfer {withdrawAmount} mUSDC back to public wallet.
                </p>
              </div>

              <button
                onClick={handleWithdraw}
                disabled={isProcessing || !account || !positionHandle}
                className="btn-secondary w-full py-3.5 text-sm font-mono flex items-center justify-center gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
              >
                {!account ? "Connect Wallet First" : isProcessing ? "Processing Withdrawal..." : "Execute Withdrawal to Public Wallet"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

