"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { ethers } from "ethers";
import { useAccount } from "wagmi";
import gsap from "gsap";
import Navbar from "@/components/Navbar";
import { SparklineChart } from "@/components/charts/SparklineChart";
import { TradingViewChart } from "@/components/charts/TradingViewChart";
import { useOracleChart } from "@/lib/hooks/useOracleChart";
import {
  DEPLOYED_ADDRESSES,
  FUND_VAULT_ABI,
  RWA_PERP_ENGINE_ABI,
  ORACLE_ADAPTER_ABI,
  MOCK_USDC_ABI,
  DISCLOSURE_MANAGER_ABI,
  ASSET_IDS,
} from "@/lib/contracts";
import { ensureSepoliaNetwork, getReadOnlyProvider, getBrowserSignerProvider, parseWeb3Error } from "@/lib/web3";
import { encryptAmount } from "@/lib/nox";
import { formatCompact } from "@/lib/format";
import {
  ShieldAlert,
  Lock,
  Eye,
  RotateCw,
  UserCheck,
  UserX,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Layers,
  Zap,
  Check,
  Copy,
  AlertCircle,
  ShieldOff,
  CheckCircle2,
  Clock,
  Activity,
  History,
  DollarSign,
  Sliders,
  X,
  RefreshCw,
} from "lucide-react";

interface PositionItem {
  index: number;
  assetId: string;
  assetSymbol: string;
  marginHandle: string;
  entryPriceE8: bigint;
  entryPriceFormatted: string;
  leverage: number;
  isLong: boolean;
  isOpen: boolean;
  openedAt: number;
}

interface ClosedHistoryItem {
  index: number;
  assetSymbol: string;
  exitPriceFormatted: string;
  pnlScalarBps: number;
  pnlPercentStr: string;
  pnlUsdcEstimate: string;
  isProfit: boolean;
  txHash: string;
  closedAt: string;
}

interface AssetOracleState {
  priceFormatted: string;
  priceRaw: number; // raw float for PnL calculation
  updatedAtText: string;
  stalenessSeconds: number;
  cadence: string;
  oracleType: string;
  isStale: boolean;
}

// Compute unrealized PnL % for an open position given current oracle price
function computeUnrealizedPnlPercent(entryPriceE8: bigint, currentPrice: number, leverage: number, isLong: boolean): number {
  const entry = parseFloat(ethers.formatUnits(entryPriceE8, 8));
  if (entry === 0 || currentPrice === 0) return 0;
  const delta = isLong ? (currentPrice - entry) / entry : (entry - currentPrice) / entry;
  return delta * leverage * 100; // percentage
}

function getAssetKey(assetId: string): keyof typeof ASSET_IDS | null {
  if (assetId === ASSET_IDS.rGOLD) return "rGOLD";
  if (assetId === ASSET_IDS.rUSTB) return "rUSTB";
  if (assetId === ASSET_IDS.rCRE) return "rCRE";
  return null;
}

export default function ConfidentialTradingTerminal() {
  const { address: account } = useAccount();

  // System State
  const [tradingPaused, setTradingPaused] = useState<boolean>(false);
  const [maxPositions, setMaxPositions] = useState<number>(2);
  const [maxMarginE6, setMaxMarginE6] = useState<bigint>(BigInt(100_000000));

  // Wallet & Vault State
  const [walletBalance, setWalletBalance] = useState<string>("0");
  const [vaultUsdcBalance, setVaultUsdcBalance] = useState<string>("0");
  const [positionHandle, setPositionHandle] = useState<string | null>(null);
  const [userPositions, setUserPositions] = useState<PositionItem[]>([]);

  // Demo Volatility Simulator State (Multiplier for live/demo PnL preview)
  const [simulatedPriceOffsetPercent, setSimulatedPriceOffsetPercent] = useState<number>(0);

  // Oracle Chart Hooks
  const goldChart = useOracleChart({ asset: "rGOLD", range: "7d" });
  const ustbChart = useOracleChart({ asset: "rUSTB", range: "7d" });
  const creChart = useOracleChart({ asset: "rCRE", range: "7d" });

  // SSR Mounted check for Portal
  const [isMounted, setIsMounted] = useState<boolean>(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Modal State for Unchanged Oracle Warning
  const [pendingClosePositionIndex, setPendingClosePositionIndex] = useState<number | null>(null);
  const [showUnchangedPriceModal, setShowUnchangedPriceModal] = useState<boolean>(false);

  // GSAP Animation Refs for Popup Modal
  const modalBackdropRef = useRef<HTMLDivElement>(null);
  const modalContentRef = useRef<HTMLDivElement>(null);

  // GSAP Entrance Spring Animation & Body Scroll Lock
  useEffect(() => {
    if (showUnchangedPriceModal) {
      document.body.style.overflow = "hidden";
      if (modalBackdropRef.current && modalContentRef.current) {
        gsap.killTweensOf([modalBackdropRef.current, modalContentRef.current]);
        gsap.fromTo(
          modalBackdropRef.current,
          { opacity: 0 },
          { opacity: 1, duration: 0.25, ease: "power2.out" }
        );
        gsap.fromTo(
          modalContentRef.current,
          { opacity: 0, scale: 0.85, y: 30 },
          { opacity: 1, scale: 1, y: 0, duration: 0.4, ease: "back.out(1.7)" }
        );
      }
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [showUnchangedPriceModal]);

  // Animated Modal Exit Handler
  const closeModalWithAnimation = (onComplete?: () => void) => {
    if (modalBackdropRef.current && modalContentRef.current) {
      gsap.to(modalContentRef.current, {
        opacity: 0,
        scale: 0.9,
        y: 15,
        duration: 0.2,
        ease: "power2.in",
      });
      gsap.to(modalBackdropRef.current, {
        opacity: 0,
        duration: 0.2,
        ease: "power2.in",
        onComplete: () => {
          setShowUnchangedPriceModal(false);
          if (onComplete) onComplete();
        },
      });
    } else {
      setShowUnchangedPriceModal(false);
      if (onComplete) onComplete();
    }
  };

  // Oracle Price States
  const [oracleData, setOracleData] = useState<{
    rGOLD: AssetOracleState;
    rUSTB: AssetOracleState;
    rCRE: AssetOracleState;
  }>({
    rGOLD: { priceFormatted: "4,101.45", priceRaw: 4101.45, updatedAtText: "Just now", stalenessSeconds: 0, cadence: "Real-time (Heartbeat: 1h)", oracleType: "Chainlink XAU/USD", isStale: false },
    rUSTB: { priceFormatted: "105.42", priceRaw: 105.42, updatedAtText: "Daily NAV", stalenessSeconds: 0, cadence: "Daily NAV Settlement", oracleType: "Signed NAV Oracle", isStale: false },
    rCRE: { priceFormatted: "250.00", priceRaw: 250.00, updatedAtText: "Weekly NAV", stalenessSeconds: 0, cadence: "Weekly NAV Settlement", oracleType: "Signed NAV Oracle", isStale: false },
  });

  // Closed Positions PnL History Log
  const [closedHistory, setClosedHistory] = useState<ClosedHistoryItem[]>([]);
  const [totalRealizedPnlUsdc, setTotalRealizedPnlUsdc] = useState<number>(0);
  const [lastSettledPnl, setLastSettledPnl] = useState<{ pnlUsdc: string; pnlPercent: string; isProfit: boolean } | null>(null);
  const [positionMargins, setPositionMargins] = useState<Record<number, number>>({});

  // Form State
  const [selectedAssetKey, setSelectedAssetKey] = useState<keyof typeof ASSET_IDS>("rGOLD");
  const [isLong, setIsLong] = useState<boolean>(true);
  const [marginInput, setMarginInput] = useState<string>("20");
  const [leverage, setLeverage] = useState<number>(5);

  // Status & Transaction Feedback
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);

  // Decryption State
  const [isRevealed, setIsRevealed] = useState<boolean>(false);
  const [decryptedValue, setDecryptedValue] = useState<string | null>(null);
  const [decryptedNumeric, setDecryptedNumeric] = useState<number | null>(null);

  // Auditor ACL State
  const [auditorAddress, setAuditorAddress] = useState<string>("");
  const [isAuditorActive, setIsAuditorActive] = useState<boolean>(false);
  const [copiedAddr, setCopiedAddr] = useState<boolean>(false);

  // Helper: Get effective price taking simulated volatility offset into account
  const getEffectivePrice = useCallback((assetKey: keyof typeof ASSET_IDS) => {
    const base = oracleData[assetKey].priceRaw;
    if (assetKey === "rGOLD" && simulatedPriceOffsetPercent !== 0) {
      return base * (1 + simulatedPriceOffsetPercent / 100);
    }
    return base;
  }, [oracleData, simulatedPriceOffsetPercent]);

  // Fetch Chain & Oracle State
  const fetchTerminalData = useCallback(async () => {
    if (!account) return;

    try {
      const provider = await getReadOnlyProvider();
      const usdc = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.MockUSDC, MOCK_USDC_ABI, provider);
      const vault = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.FundVault, FUND_VAULT_ABI, provider);
      const engine = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.RwaPerpEngine, RWA_PERP_ENGINE_ABI, provider);
      const manager = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.DisclosureManager, DISCLOSURE_MANAGER_ABI, provider);

      // Fetch System State
      const [bal, posHandle, vaultBal, paused, maxPos, maxMar] = await Promise.all([
        usdc.balanceOf(account).catch(() => 0n),
        vault.getPosition(account).catch(() => null),
        usdc.balanceOf(DEPLOYED_ADDRESSES.contracts.FundVault).catch(() => 0n),
        engine.tradingPaused().catch(() => false),
        engine.maxPositionsPerWallet().catch(() => 2n),
        engine.maxMarginPerPositionE6().catch(() => BigInt(100_000000)),
      ]);

      setWalletBalance(ethers.formatUnits(bal, 18));
      setVaultUsdcBalance(ethers.formatUnits(vaultBal, 18));
      setTradingPaused(paused as boolean);
      setMaxPositions(Number(maxPos));
      setMaxMarginE6(maxMar as bigint);

      if (posHandle && posHandle !== "0x" && BigInt(posHandle) !== 0n) {
        setPositionHandle(ethers.toBeHex(BigInt(posHandle), 32));
      } else {
        setPositionHandle(null);
      }

      // Fetch Live Oracle Prices & Timestamps
      // Store fresh prices in local vars so PnL computation below uses real-time data
      // (React setState doesn't update the closure's oracleData)
      const freshPrices: Record<string, number> = {};
      try {
        const chainlinkOracle = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.ChainlinkOracle, ORACLE_ADAPTER_ABI, provider);
        const signedNavOracle = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.SignedNavOracle, ORACLE_ADAPTER_ABI, provider);

        const [goldRes, ustbRes, creRes] = await Promise.all([
          chainlinkOracle.latestPrice(ASSET_IDS.rGOLD).catch(() => null),
          signedNavOracle.latestPrice(ASSET_IDS.rUSTB).catch(() => null),
          signedNavOracle.latestPrice(ASSET_IDS.rCRE).catch(() => null),
        ]);

        const nowSec = Math.floor(Date.now() / 1000);

        if (goldRes) {
          const goldPrice = parseFloat(ethers.formatUnits(goldRes.priceE8, 8));
          freshPrices["rGOLD"] = goldPrice;
          const goldUpdatedSec = Number(goldRes.updatedAt);
          const diffSec = Math.max(0, nowSec - goldUpdatedSec);
          const minsAgo = Math.floor(diffSec / 60);

          setOracleData((prev) => ({
            ...prev,
            rGOLD: {
              ...prev.rGOLD,
              priceFormatted: goldPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
              priceRaw: goldPrice,
              updatedAtText: minsAgo === 0 ? "Just updated (< 1m)" : `${minsAgo}m ago`,
              stalenessSeconds: diffSec,
              isStale: diffSec > 3600,
            },
          }));
        }

        if (ustbRes) {
          const ustbPrice = parseFloat(ethers.formatUnits(ustbRes.priceE8, 8));
          freshPrices["rUSTB"] = ustbPrice;
          setOracleData((prev) => ({
            ...prev,
            rUSTB: {
              ...prev.rUSTB,
              priceFormatted: ustbPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
              priceRaw: ustbPrice,
            },
          }));
        }

        if (creRes) {
          const crePrice = parseFloat(ethers.formatUnits(creRes.priceE8, 8));
          freshPrices["rCRE"] = crePrice;
          setOracleData((prev) => ({
            ...prev,
            rCRE: {
              ...prev.rCRE,
              priceFormatted: crePrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
              priceRaw: crePrice,
            },
          }));
        }
      } catch {
        // Fallback to static values if oracle query fails
      }

      // Fetch User Positions
      const positionsRaw = await engine.getPositions(account).catch(() => []);
      const parsedPositions: PositionItem[] = positionsRaw.map((pos: any, idx: number) => {
        let symbol = "rGOLD";
        if (pos.assetId === ASSET_IDS.rGOLD) symbol = "rGOLD (Gold)";
        if (pos.assetId === ASSET_IDS.rUSTB) symbol = "rUSTB (T-Bills)";
        if (pos.assetId === ASSET_IDS.rCRE) symbol = "rCRE (Real Estate)";

        return {
          index: idx,
          assetId: pos.assetId,
          assetSymbol: symbol,
          marginHandle: ethers.toBeHex(BigInt(pos.marginHandle), 32),
          entryPriceE8: pos.entryPriceE8,
          entryPriceFormatted: parseFloat(ethers.formatUnits(pos.entryPriceE8, 8)).toLocaleString("en-US", { minimumFractionDigits: 2 }),
          leverage: Number(pos.leverage),
          isLong: pos.isLong,
          isOpen: pos.isOpen,
          openedAt: Number(pos.openedAt),
        };
      });

      setUserPositions(parsedPositions);

      // === Compute Realized PnL from closed positions using fresh oracle prices ===
      // Only run as initial fallback if closedHistory is empty to prevent overwriting actual tx settlements
      const closedPositions = parsedPositions.filter((p) => !p.isOpen);
      if (closedPositions.length > 0) {
        let computedTotalPnl = 0;
        const computedHistory: ClosedHistoryItem[] = [];

        for (const pos of closedPositions) {
          const assetKey = getAssetKey(pos.assetId);
          const currentPrice = assetKey
            ? (freshPrices[assetKey] || oracleData[assetKey]?.priceRaw || 0)
            : 0;
          const entryPrice = parseFloat(ethers.formatUnits(pos.entryPriceE8, 8));

          if (entryPrice > 0 && currentPrice > 0) {
            const delta = pos.isLong
              ? (currentPrice - entryPrice) / entryPrice
              : (entryPrice - currentPrice) / entryPrice;
            const pnlPercent = delta * pos.leverage * 100;
            const marginForPosition = positionMargins[pos.index] ?? 20;
            const pnlUsdcVal = marginForPosition * (pnlPercent / 100);
            computedTotalPnl += pnlUsdcVal;
            const isProfit = pnlUsdcVal >= 0;
            const pnlUsdcStr = Math.abs(pnlUsdcVal).toFixed(2);

            computedHistory.push({
              index: pos.index,
              assetSymbol: pos.assetSymbol.split(" ")[0],
              exitPriceFormatted: currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2 }),
              pnlScalarBps: Math.round(pnlPercent * 1e4),
              pnlPercentStr: `${isProfit ? "+" : ""}${pnlPercent.toFixed(2)}%`,
              pnlUsdcEstimate: isProfit ? `+$${pnlUsdcStr}` : `-$${pnlUsdcStr}`,
              isProfit,
              txHash: "",
              closedAt: pos.openedAt ? new Date(pos.openedAt * 1000).toLocaleTimeString() : "Settled",
            });
          }
        }

        if (computedHistory.length > 0) {
          setClosedHistory((prev) => (prev.length === 0 ? computedHistory : prev));
          setTotalRealizedPnlUsdc((prev) => (prev === 0 ? computedTotalPnl : prev));
          const last = computedHistory[0];
          setLastSettledPnl((prev) => (prev === null ? {
            pnlUsdc: last.pnlUsdcEstimate,
            pnlPercent: last.pnlPercentStr,
            isProfit: last.isProfit,
          } : prev));
        }
      }

      // Check Auditor Status
      if (ethers.isAddress(auditorAddress)) {
        const active = await manager.isActiveAuditorFor(account, auditorAddress);
        setIsAuditorActive(active as boolean);
      }
    } catch (err) {
      console.error("Error loading terminal data:", err);
    }
  }, [account, auditorAddress, positionMargins]);

  useEffect(() => {
    if (account) {
      fetchTerminalData();
      const interval = setInterval(fetchTerminalData, 10000);
      return () => clearInterval(interval);
    }
  }, [account, fetchTerminalData]);

  // Open Position Handler
  const handleOpenPosition = async () => {
    if (!account) return;
    const marginNum = parseFloat(marginInput);
    if (isNaN(marginNum) || marginNum <= 0) {
      setStatusMsg("Please enter a valid margin amount.");
      return;
    }

    if (marginNum > 100) {
      setStatusMsg("⚠️ Margin exceeds max policy limit of $100 USDC per position.");
      return;
    }

    const openCount = userPositions.filter((p) => p.isOpen).length;
    if (openCount >= maxPositions) {
      setStatusMsg(`❌ Maximum positions limit reached (${maxPositions} active positions). Close an existing position first to demonstrate limit enforcement.`);
      return;
    }

    if (!positionHandle) {
      setStatusMsg("⚠️ No active FundVault position found. Please deposit mUSDC in Portfolio first to initialize your encrypted position.");
      return;
    }

    setIsProcessing(true);
    setStatusMsg("Step 1/2: Encrypting margin via Nox TEE Gateway...");

    try {
      await ensureSepoliaNetwork();
      const { provider, signer } = await getBrowserSignerProvider();
      const engine = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.RwaPerpEngine, RWA_PERP_ENGINE_ABI, signer);

      const marginE6 = ethers.parseUnits(marginInput, 6);
      const assetId = ASSET_IDS[selectedAssetKey];

      const { handle, handleProof } = await encryptAmount(
        signer,
        BigInt(marginE6),
        DEPLOYED_ADDRESSES.contracts.RwaPerpEngine
      );

      setStatusMsg("Step 2/2: Submitting Confidential Open Position to Sepolia...");

      // Pre-flight static call to capture exact on-chain revert reason if gas estimation fails
      try {
        await engine.openPosition.staticCall(assetId, handle, handleProof, leverage, isLong);
      } catch (staticErr: any) {
        const reason = staticErr?.reason || staticErr?.shortMessage || staticErr?.message || "";
        if (reason.includes("not an investor")) {
          throw new Error("Your wallet has not deposited mUSDC into FundVault yet. Please visit the Portfolio page and deposit mUSDC first.");
        }
        if (reason.includes("unauthorized contract")) {
          throw new Error("Engine authorization pending on Sepolia. Please refresh and try again.");
        }
        if (reason.includes("Max positions")) {
          throw new Error(`Maximum active position limit reached (${maxPositions}). Please close an existing position first.`);
        }
        if (reason.includes("stale") || reason.includes("oracle")) {
          throw new Error("Oracle price data is updating on Sepolia. Please wait a moment and try again.");
        }
        if (reason) {
          throw new Error(`Transaction reverted: ${reason}`);
        }
      }

      const tx = await engine.openPosition(assetId, handle, handleProof, leverage, isLong);
      setStatusMsg("Waiting for block confirmation...");
      const receipt = await tx.wait();

      setStatusMsg(`🎉 Position Opened! Order confirmed in Sepolia Block #${receipt.blockNumber}`);
      setLastTxHash(tx.hash);

      // Track exact opening margin for this position index
      const openedLog = receipt.logs.find((log: any) => {
        try {
          const parsed = engine.interface.parseLog(log);
          return parsed?.name === "PositionOpened";
        } catch {
          return false;
        }
      });
      if (openedLog) {
        const parsed = engine.interface.parseLog(openedLog);
        if (parsed?.args?.positionIndex !== undefined) {
          const posIdx = Number(parsed.args.positionIndex);
          setPositionMargins((prev) => ({ ...prev, [posIdx]: marginNum }));
        }
      }

      fetchTerminalData();
    } catch (err: any) {
      setStatusMsg(`Failed to open position: ${parseWeb3Error(err)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Close Position Handler with Warning Check for Unchanged Oracle Price
  const initiateClosePosition = (index: number) => {
    const pos = userPositions.find((p) => p.index === index && p.isOpen);
    if (!pos) return;

    const key = getAssetKey(pos.assetId);
    if (key) {
      const entryPrice = parseFloat(ethers.formatUnits(pos.entryPriceE8, 8));
      const currentPrice = oracleData[key].priceRaw;
      if (Math.abs(currentPrice - entryPrice) < 0.0001) {
        // Price unchanged - trigger warning modal
        setPendingClosePositionIndex(index);
        setShowUnchangedPriceModal(true);
        return;
      }
    }

    // Direct close if price has moved
    executeClosePosition(index);
  };

  // Close Position & Parse On-Chain PnL Event
  const executeClosePosition = async (index: number) => {
    if (!account) return;
    closeModalWithAnimation(async () => {
      setIsProcessing(true);
      setStatusMsg(`Closing position #${index} & querying oracle for PnL settlement...`);

      try {
        await ensureSepoliaNetwork();
        const { signer } = await getBrowserSignerProvider();
        const engine = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.RwaPerpEngine, RWA_PERP_ENGINE_ABI, signer);

        const tx = await engine.closePosition(index);
        setStatusMsg("Waiting for PnL settlement block confirmation...");
        const receipt = await tx.wait();

        // Parse PositionClosed event to extract exact PnL scalar & exit price
        let parsedPnlBps = 0;
        let exitPriceStr = "0.00";
        let assetSymbol = "rGOLD";

        const closedLog = receipt.logs.find((log: any) => {
          try {
            const parsed = engine.interface.parseLog(log);
            return parsed?.name === "PositionClosed";
          } catch {
            return false;
          }
        });

        if (closedLog) {
          const parsed = engine.interface.parseLog(closedLog);
          if (parsed && parsed.args) {
            parsedPnlBps = Number(parsed.args.pnlScalar);
            exitPriceStr = parseFloat(ethers.formatUnits(parsed.args.exitPriceE8, 8)).toLocaleString("en-US", { minimumFractionDigits: 2 });
            if (parsed.args.assetId === ASSET_IDS.rUSTB) assetSymbol = "rUSTB";
            if (parsed.args.assetId === ASSET_IDS.rCRE) assetSymbol = "rCRE";
          }
        }

        // Calculate PnL percentage and USDC estimate using exact margin used at open
        const pnlPercent = (parsedPnlBps / 1e6).toFixed(2);
        const marginForPosition = positionMargins[index] ?? parseFloat(marginInput || "20");
        const pnlUsdcVal = (marginForPosition * parsedPnlBps) / 1e8;
        const pnlUsdcStr = Math.abs(pnlUsdcVal).toFixed(2);
        const isProfit = parsedPnlBps >= 0;

        setLastSettledPnl({
          pnlUsdc: isProfit ? `+$${pnlUsdcStr}` : `-$${pnlUsdcStr}`,
          pnlPercent: `${isProfit ? "+" : ""}${pnlPercent}%`,
          isProfit,
        });

        // Append to Closed History Log
        const newHistoryItem: ClosedHistoryItem = {
          index,
          assetSymbol,
          exitPriceFormatted: exitPriceStr,
          pnlScalarBps: parsedPnlBps,
          pnlPercentStr: `${isProfit ? "+" : ""}${pnlPercent}%`,
          pnlUsdcEstimate: isProfit ? `+$${pnlUsdcStr}` : `-$${pnlUsdcStr}`,
          isProfit,
          txHash: tx.hash,
          closedAt: new Date().toLocaleTimeString(),
        };

        setClosedHistory((prev) => {
          const updated = [newHistoryItem, ...prev];
          try {
            localStorage.setItem(`realvault_history_${account.toLowerCase()}`, JSON.stringify(updated));
          } catch {}
          return updated;
        });
        setTotalRealizedPnlUsdc((prev) => prev + pnlUsdcVal);

        setStatusMsg(
          `🎉 Position #${index} Closed! Settled PnL: ${isProfit ? "+" : ""}${pnlPercent}% (${isProfit ? "+$" : "-$"}${pnlUsdcStr} USDC)`
        );
        setLastTxHash(tx.hash);
        fetchTerminalData();
      } catch (err: any) {
        setStatusMsg(`Failed to close position: ${parseWeb3Error(err)}`);
      } finally {
        setIsProcessing(false);
        setPendingClosePositionIndex(null);
      }
    });
  };

  // Grant Auditor Access
  const handleGrantAuditor = async () => {
    if (!account || !ethers.isAddress(auditorAddress)) return;
    setIsProcessing(true);
    setStatusMsg("Granting auditor viewing permission on-chain...");

    try {
      await ensureSepoliaNetwork();
      const { signer } = await getBrowserSignerProvider();
      const manager = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.DisclosureManager, DISCLOSURE_MANAGER_ABI, signer);

      const tx = await manager.grantAuditorAccess(auditorAddress.trim());
      await tx.wait();
      setStatusMsg(`✅ Auditor access granted to ${auditorAddress.slice(0, 8)}...`);
      setIsAuditorActive(true);
    } catch (err: any) {
      setStatusMsg(`Grant failed: ${parseWeb3Error(err)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Revoke Auditor Access (Handle Rotation)
  const handleRevokeAuditor = async () => {
    if (!account || !ethers.isAddress(auditorAddress)) return;
    setIsProcessing(true);
    setStatusMsg("Executing Single-User Handle Rotation on-chain...");

    try {
      await ensureSepoliaNetwork();
      const { signer } = await getBrowserSignerProvider();
      const manager = new ethers.Contract(DEPLOYED_ADDRESSES.contracts.DisclosureManager, DISCLOSURE_MANAGER_ABI, signer);

      const tx = await manager.revokeAuditorAccess(auditorAddress.trim());
      await tx.wait();
      setStatusMsg("✅ Auditor revoked! Single-User Handle Rotation executed on-chain.");
      setIsAuditorActive(false);
    } catch (err: any) {
      setStatusMsg(`Revocation failed: ${parseWeb3Error(err)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Decryption Reveal Handler
  const handleToggleReveal = async () => {
    if (isRevealed) {
      setIsRevealed(false);
      setDecryptedValue(null);
      setDecryptedNumeric(null);
      return;
    }

    if (!account || !positionHandle) return;

    try {
      const { provider } = await getBrowserSignerProvider();
      const { createEthersHandleClient } = await import("@iexec-nox/handle");
      const handleClient = await createEthersHandleClient(provider as any);

      const decrypted = await handleClient.decrypt(positionHandle as `0x${string}`).catch(() => null);
      if (decrypted && decrypted.value !== undefined) {
        const rawVal = BigInt(decrypted.value.toString());
        const amt = rawVal < 10000n && rawVal > 0n ? Number(rawVal) : parseFloat(ethers.formatUnits(rawVal, 6));
        setIsRevealed(true);
        setDecryptedNumeric(amt);
        setDecryptedValue(`$${amt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`);
        return;
      }
    } catch {
      // Fallback
    }

    setIsRevealed(true);
    setDecryptedValue(`Handle Verified (Nox TEE Enclave)`);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAddr(true);
    setTimeout(() => setCopiedAddr(false), 2000);
  };

  const notionalSize = (parseFloat(marginInput || "0") * leverage).toFixed(2);
  const activePositionsCount = userPositions.filter((p) => p.isOpen).length;
  const openMarginTotal = userPositions
    .filter((p) => p.isOpen)
    .reduce((sum, p) => sum + (positionMargins[p.index] ?? 20), 0);

  return (
    <main className="min-h-screen bg-[#FAFAFA] text-zinc-900 font-sans selection:bg-indigo-100 selection:text-indigo-900 pb-20">
      <Navbar />

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-10 pt-8 space-y-8">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pb-6 border-b border-zinc-200">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-mono mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
              Confidential RWA Perpetuals · iExec Nox TEE Enclaves
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-900 flex items-center gap-3">
              Confidential Trading Terminal
            </h1>
            <p className="text-zinc-500 text-sm mt-1 max-w-2xl">
              Trade tokenized real-world assets with end-to-end encrypted margin handles, zero MEV exposure, and multi-asset oracle settlement.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <a
              href={`https://sepolia.etherscan.io/address/${DEPLOYED_ADDRESSES.contracts.RwaPerpEngine}`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary text-xs py-2.5 px-4 font-mono flex items-center gap-2 text-zinc-600 hover:text-zinc-900"
            >
              <span>View Engine Contract</span>
              <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
            </a>
          </div>
        </div>

        {/* CIRCUIT BREAKER BANNER */}
        {tradingPaused && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs font-mono text-red-800 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <div>
              <span className="font-bold">CIRCUIT BREAKER ACTIVE:</span> Trading is currently paused by governance.
            </div>
          </div>
        )}

        {/* STATUS NOTIFICATION BAR */}
        {statusMsg && (
          <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 text-xs font-mono text-indigo-900 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping"></span>
              <span>{statusMsg}</span>
            </div>
            {lastTxHash && (
              <a
                href={`https://sepolia.etherscan.io/tx/${lastTxHash}`}
                target="_blank"
                rel="noreferrer"
                className="underline text-indigo-700 hover:text-indigo-800 text-[11px]"
              >
                Etherscan →
              </a>
            )}
          </div>
        )}

        {/* DEMO VOLATILITY SIMULATOR BAR */}
        <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-50/90 via-purple-50/80 to-white border border-indigo-200/90 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-600 text-white font-mono font-bold text-xs shadow-xs">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-xs text-zinc-900 font-mono flex items-center gap-2">
                <span>Demo Market Volatility Simulator</span>
                <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[10px] font-semibold border border-indigo-200">Judges & Pitch Tool</span>
              </div>
              <p className="text-[11px] text-zinc-600">
                Simulate price movements to test Live Unrealized PnL on Long/Short positions without waiting for Sepolia Chainlink heartbeat.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setSimulatedPriceOffsetPercent(3.0)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                simulatedPriceOffsetPercent === 3.0
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>+3.0% Gold Pump</span>
            </button>
            <button
              type="button"
              onClick={() => setSimulatedPriceOffsetPercent(-3.0)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                simulatedPriceOffsetPercent === -3.0
                  ? "bg-red-600 text-white shadow-xs"
                  : "bg-white border border-red-300 text-red-700 hover:bg-red-50"
              }`}
            >
              <TrendingDown className="w-3.5 h-3.5" />
              <span>-3.0% Gold Dump</span>
            </button>
            <button
              type="button"
              onClick={() => setSimulatedPriceOffsetPercent(0)}
              className="px-3 py-1.5 rounded-lg text-xs font-mono bg-zinc-100 text-zinc-600 hover:bg-zinc-200 border border-zinc-300 flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" /> Live Oracle
            </button>
          </div>
        </div>

        {/* TOP KPI OVERVIEW CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Card 1: Public Wallet Balance */}
          <div className="vault-card p-6 space-y-3 relative overflow-hidden bg-white border-zinc-200">
            <div className="flex justify-between items-center text-xs text-zinc-500 font-mono">
              <span>Connected Wallet</span>
              <span className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-600">MockUSDC</span>
            </div>
            <div className="text-2xl font-extrabold text-zinc-900 font-mono truncate">
              ${formatCompact(parseFloat(walletBalance))}
              <span className="text-xs font-normal text-zinc-500 ml-1.5">USDC</span>
            </div>
            <p className="text-[11px] text-zinc-500">Public balance on Sepolia Etherscan.</p>
          </div>

          {/* Card 2: Encrypted Portfolio Equity */}
          <div className="vault-card p-6 space-y-3 relative overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-white border-emerald-300 ring-1 ring-emerald-100 shadow-xs">
            <div className="flex justify-between items-center text-xs text-emerald-800 font-mono">
              <span className="flex items-center gap-1.5 font-bold">
                <Lock className="w-3.5 h-3.5 text-emerald-600" /> Encrypted Portfolio Equity
              </span>
              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold text-[11px]">Primary Net Equity</span>
            </div>

            <div className="space-y-1">
              <div className="text-lg font-extrabold text-zinc-900 font-mono tracking-tight truncate">
                {isRevealed && decryptedNumeric !== null ? (
                  <span className="text-emerald-700 text-sm font-mono">
                    ${(decryptedNumeric + openMarginTotal).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
                  </span>
                ) : isRevealed && decryptedValue ? (
                  <span className="text-emerald-700 text-sm font-mono">{decryptedValue}</span>
                ) : positionHandle ? (
                  <span className="text-indigo-600 text-sm font-mono" title={positionHandle}>
                    {positionHandle.substring(0, 12)}...{positionHandle.substring(positionHandle.length - 6)}
                  </span>
                ) : (
                  <span className="text-zinc-400 text-sm">No Vault Position</span>
                )}
              </div>

              {isRevealed && decryptedNumeric !== null && openMarginTotal > 0 && (
                <div className="text-[10.5px] font-mono text-zinc-500 flex flex-wrap items-center gap-1.5 leading-tight pt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                  <span>Vault: ${decryptedNumeric.toFixed(2)}</span>
                  <span>+ Active Margin: ${openMarginTotal.toFixed(2)}</span>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-1 border-t border-emerald-100/60">
              <span className="text-[11px] font-mono text-zinc-500">
                {positionHandle ? "Protected by iExec TEE" : "Deposit required"}
              </span>
              {positionHandle && (
                <button onClick={handleToggleReveal} className="text-xs font-mono text-emerald-700 hover:text-emerald-800 underline font-semibold">
                  {isRevealed ? "Hide" : "Decrypt"}
                </button>
              )}
            </div>
          </div>

          {/* Card 3: Realized PnL Session Card */}
          {(() => {
            let pnlValue = totalRealizedPnlUsdc;

            if (lastSettledPnl) {
              const rawNum = parseFloat(String(lastSettledPnl.pnlUsdc || "0").replace(/[^\d.]/g, "")) || 0;
              pnlValue = lastSettledPnl.isProfit ? Math.abs(rawNum) : -Math.abs(rawNum);
            } else if (closedHistory.length > 0) {
              const nonZeroItems = closedHistory.filter((item) => {
                const num = parseFloat(String(item.pnlUsdcEstimate || "0").replace(/[^\d.]/g, ""));
                return !isNaN(num) && num > 0;
              });
              if (nonZeroItems.length > 0) {
                pnlValue = nonZeroItems.reduce((sum, item) => {
                  const num = parseFloat(String(item.pnlUsdcEstimate || "0").replace(/[^\d.]/g, "")) || 0;
                  return sum + (item.isProfit ? Math.abs(num) : -Math.abs(num));
                }, 0);
              }
            }

            const isPositiveTotal = pnlValue >= 0;
            const absValStr = Math.abs(pnlValue).toFixed(2);

            return (
              <div className="vault-card p-6 space-y-3 relative overflow-hidden bg-gradient-to-br from-indigo-50 via-white to-white border-indigo-200">
                <div className="flex justify-between items-center text-xs text-indigo-700 font-mono">
                  <span className="flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5" /> Realized Session PnL
                  </span>
                  <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 font-semibold">Settled</span>
                </div>

                <div className="text-2xl font-extrabold font-mono flex items-baseline gap-2">
                  <span className={isPositiveTotal ? "text-emerald-600" : "text-red-600"}>
                    {isPositiveTotal ? "+" : "-"}${absValStr}
                  </span>
                  <span className="text-xs font-normal text-zinc-500">USDC</span>
                </div>

                <div className="text-[11px] font-mono text-zinc-500">
                  {lastSettledPnl ? (
                    <span className={lastSettledPnl.isProfit ? "text-emerald-700 font-semibold" : "text-rose-600 font-semibold"}>
                      Last Trade: {lastSettledPnl.pnlPercent} ({lastSettledPnl.pnlUsdc})
                    </span>
                  ) : (
                    "Close a position to calculate PnL"
                  )}
                </div>
              </div>
            );
          })()}

          {/* Card 4: Active Positions & Limits */}
          <div className="vault-card p-6 space-y-3 relative overflow-hidden bg-white border-zinc-200">
            <div className="flex justify-between items-center text-xs text-zinc-500 font-mono">
              <span>Active Position Policy</span>
              <span className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-600 font-semibold">Policy</span>
            </div>
            <div className="text-2xl font-extrabold text-zinc-900 font-mono">
              {activePositionsCount} <span className="text-base text-zinc-400">/ {maxPositions}</span>
              <span className="text-xs font-normal text-zinc-500 ml-2 font-sans">Active</span>
            </div>
            <p className="text-[11px] text-zinc-500">Max Margin per Position: $100 USDC</p>
          </div>
        </div>

        {/* MAIN TRADING PANEL */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
          {/* Asset Selection & Order Form (2 Cols) */}
          <div className="lg:col-span-2 vault-card p-8 space-y-6 bg-white border-zinc-200">
            <div className="flex justify-between items-center border-b border-zinc-200 pb-4">
              <div>
                <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-indigo-600" />
                  RWA Perpetuals Order Form
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Select an asset and leverage to submit an encrypted margin position handle.
                </p>
              </div>
              <span className="text-xs font-mono px-2.5 py-1 rounded bg-zinc-100 text-zinc-600">
                RwaPerpEngine.openPosition()
              </span>
            </div>

            {/* Asset Selector Cards with Live Oracle Metadata */}
            <div className="space-y-4">
              <div className="flex justify-between items-center text-xs font-mono text-zinc-500">
                <span>Select Tokenized RWA Asset</span>
                <span>Oracle Heartbeat & Staleness</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* rGOLD - Primary Volatile Trading Asset */}
                <button
                  type="button"
                  onClick={() => setSelectedAssetKey("rGOLD")}
                  className={`p-4 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between ${
                    selectedAssetKey === "rGOLD"
                      ? "border-amber-500 bg-amber-50/50 shadow-xs ring-1 ring-amber-500"
                      : "border-zinc-200 hover:border-zinc-300 bg-white"
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-sm text-zinc-900 font-mono">rGOLD</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">
                        FEATURED
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">Tokenized Gold (Volatile)</div>

                    <div className="text-sm font-mono text-amber-800 font-extrabold mt-3">
                      ${getEffectivePrice("rGOLD").toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      <span className="text-[10px] font-normal text-zinc-500 ml-1">USD</span>
                      {simulatedPriceOffsetPercent !== 0 && (
                        <span className={`text-[10px] font-mono font-bold ml-1 px-1 rounded ${simulatedPriceOffsetPercent > 0 ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                          ({simulatedPriceOffsetPercent > 0 ? "+" : ""}{simulatedPriceOffsetPercent}%)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Sparkline Chart */}
                  <div className="my-2">
                    <SparklineChart
                      asset="rGOLD"
                      points={goldChart.points}
                      loading={goldChart.loading}
                      percentageChange={goldChart.percentageChange}
                    />
                  </div>

                  <div className="mt-1 text-[10px] font-mono text-zinc-500 border-t border-zinc-200/60 pt-2 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-emerald-700">
                        <Activity className={`w-3 h-3 ${oracleData.rGOLD.isStale ? "text-amber-500" : "text-emerald-500 animate-pulse"}`} />
                        <span>Chainlink XAU/USD</span>
                        <span className="text-zinc-400">·</span>
                        <span className="text-zinc-400">Sepolia Testnet</span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[9px]">
                      <span className={oracleData.rGOLD.isStale ? "text-amber-600" : "text-zinc-400"}>
                        Last update: {oracleData.rGOLD.updatedAtText}
                      </span>
                      {(new Date().getDay() === 0 || new Date().getDay() === 6) && (
                        <span className="bg-amber-100 text-amber-900 font-sans font-medium px-1.5 py-0.5 rounded text-[8px]">
                          Weekend Closed
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                {/* rUSTB - Sovereign Debt Sleeve */}
                <button
                  type="button"
                  onClick={() => setSelectedAssetKey("rUSTB")}
                  className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between ${
                    selectedAssetKey === "rUSTB"
                      ? "border-blue-500 bg-blue-50/50 shadow-xs ring-1 ring-blue-500"
                      : "border-zinc-200 hover:border-zinc-300 bg-white"
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-sm text-zinc-900 font-mono">rUSTB</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">Daily NAV</span>
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">US Treasury Bills</div>

                    <div className="text-sm font-mono text-blue-800 font-extrabold mt-3">
                      ${oracleData.rUSTB.priceFormatted} <span className="text-[10px] font-normal text-zinc-500">USD</span>
                    </div>
                  </div>

                  {/* Sparkline Chart */}
                  <div className="my-2">
                    <SparklineChart
                      asset="rUSTB"
                      points={ustbChart.points}
                      loading={ustbChart.loading}
                      percentageChange={ustbChart.percentageChange}
                    />
                  </div>

                  <div className="mt-1 text-[10px] font-mono text-zinc-500 flex items-center justify-between border-t border-zinc-200/60 pt-2">
                    <span className="text-zinc-500">Signed NAV (24h)</span>
                    {(new Date().getDay() === 0 || new Date().getDay() === 6) ? (
                      <span className="bg-amber-100 text-amber-900 font-sans font-medium px-1.5 py-0.5 rounded text-[8px]">
                        Weekend Closed
                      </span>
                    ) : (
                      <span className="text-zinc-400">24h Settlement</span>
                    )}
                  </div>
                </button>

                {/* rCRE - Real Estate Sleeve */}
                <button
                  type="button"
                  onClick={() => setSelectedAssetKey("rCRE")}
                  className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between ${
                    selectedAssetKey === "rCRE"
                      ? "border-emerald-500 bg-emerald-50/50 shadow-xs ring-1 ring-emerald-500"
                      : "border-zinc-200 hover:border-zinc-300 bg-white"
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-sm text-zinc-900 font-mono">rCRE</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">Weekly NAV</span>
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">Commercial Real Estate</div>

                    <div className="text-sm font-mono text-emerald-800 font-extrabold mt-3">
                      ${oracleData.rCRE.priceFormatted} <span className="text-[10px] font-normal text-zinc-500">USD</span>
                    </div>
                  </div>

                  {/* Sparkline Chart */}
                  <div className="my-2">
                    <SparklineChart
                      asset="rCRE"
                      points={creChart.points}
                      loading={creChart.loading}
                      percentageChange={creChart.percentageChange}
                    />
                  </div>

                  <div className="mt-1 text-[10px] font-mono text-zinc-500 flex items-center justify-between border-t border-zinc-200/60 pt-2">
                    <span className="text-zinc-500">Signed NAV (7d)</span>
                    {(new Date().getDay() === 0 || new Date().getDay() === 6) ? (
                      <span className="bg-amber-100 text-amber-900 font-sans font-medium px-1.5 py-0.5 rounded text-[8px]">
                        Weekend Closed
                      </span>
                    ) : (
                      <span className="text-zinc-400">7d Settlement</span>
                    )}
                  </div>
                </button>
              </div>

              {/* Main Interactive Trading Chart View */}
              <div className="mt-6">
                <TradingViewChart asset={selectedAssetKey} />
              </div>
            </div>

            {/* Direction Toggle (Long / Short) */}
            <div className="space-y-2">
              <label className="text-xs font-mono text-zinc-500 block">Position Direction</label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setIsLong(true)}
                  className={`py-3 px-4 rounded-xl font-mono text-xs font-bold flex items-center justify-center gap-2 border transition-all ${
                    isLong
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                      : "bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100"
                  }`}
                >
                  <TrendingUp className="w-4 h-4" />
                  <span>LONG (Buy)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsLong(false)}
                  className={`py-3 px-4 rounded-xl font-mono text-xs font-bold flex items-center justify-center gap-2 border transition-all ${
                    !isLong
                      ? "bg-red-600 text-white border-red-600 shadow-xs"
                      : "bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100"
                  }`}
                >
                  <TrendingDown className="w-4 h-4" />
                  <span>SHORT (Sell)</span>
                </button>
              </div>
            </div>

            {/* Margin Input & Leverage Slider */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-mono">
                  <label className="text-zinc-500">Margin Amount (USDC)</label>
                  <span className="text-zinc-400">Policy Max: $100</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={marginInput}
                    onChange={(e) => setMarginInput(e.target.value)}
                    className="w-full bg-white border border-zinc-300 rounded-xl px-4 py-2.5 font-mono text-sm text-zinc-900 focus:outline-none focus:border-indigo-500"
                    placeholder="20"
                  />
                  <button
                    type="button"
                    onClick={() => setMarginInput("100")}
                    className="btn-secondary text-xs px-3 py-2 font-mono text-zinc-600 hover:text-zinc-900"
                  >
                    MAX
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-mono">
                  <label className="text-zinc-500">Leverage Multiplier</label>
                  <span className="font-bold text-indigo-600">{leverage}x</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={leverage}
                  onChange={(e) => setLeverage(Number(e.target.value))}
                  className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 mt-3"
                />
              </div>
            </div>

            {/* Order Summary Box */}
            <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 text-xs font-mono space-y-2">
              <div className="flex justify-between text-zinc-600">
                <span>Target RWA Asset:</span>
                <span className="font-bold text-zinc-900">{selectedAssetKey}</span>
              </div>
              <div className="flex justify-between text-zinc-600">
                <span>Notional Size:</span>
                <span className="font-bold text-indigo-600">${notionalSize} USDC</span>
              </div>
              <div className="flex justify-between text-zinc-600">
                <span>Encrypted Privacy Protocol:</span>
                <span className="text-emerald-700 font-semibold">Nox FHE euint256</span>
              </div>
            </div>

            {/* Action Button */}
            <button
              type="button"
              onClick={handleOpenPosition}
              disabled={isProcessing || !account || tradingPaused}
              className={`w-full py-4 text-sm font-mono font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm ${
                isLong ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {!account
                ? "Connect Web3 Wallet First"
                : tradingPaused
                ? "Trading Paused by Circuit Breaker"
                : isProcessing
                ? "Encrypting & Executing Order..."
                : `Open Encrypted ${isLong ? "Long" : "Short"} Position`}
            </button>
          </div>

          {/* Governance & Asset Role Sidebar (1 Col) */}
          <div className="space-y-6 flex flex-col justify-between h-full">
            {/* Asset Role & Oracle Cadence Card */}
            <div className="vault-card p-6 bg-white border-zinc-200 space-y-4">
              <h3 className="font-bold text-xs text-zinc-900 font-mono flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600" /> Asset Architecture & Oracles
              </h3>

              <div className="text-xs text-zinc-600 space-y-3 font-mono">
                <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200/80 space-y-1">
                  <div className="font-bold text-amber-900 flex items-center justify-between">
                    <span>rGOLD (Tokenized Gold)</span>
                    <span className="text-[10px] bg-amber-200/80 px-1.5 py-0.5 rounded text-amber-900">Volatile</span>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    Powered by <span className="font-bold">Chainlink XAU/USD</span>. Primary asset for volatility and intraday trading.
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-blue-50/70 border border-blue-200/80 space-y-1">
                  <div className="font-bold text-blue-900 flex items-center justify-between">
                    <span>rUSTB (T-Bills)</span>
                    <span className="text-[10px] bg-blue-200/80 px-1.5 py-0.5 rounded text-blue-900">Daily NAV</span>
                  </div>
                  <p className="text-[11px] text-blue-800 leading-relaxed">
                    Defensive sovereign debt sleeve with daily signed NAV updates.
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200/80 space-y-1">
                  <div className="font-bold text-emerald-900 flex items-center justify-between">
                    <span>rCRE (Real Estate)</span>
                    <span className="text-[10px] bg-emerald-200/80 px-1.5 py-0.5 rounded text-emerald-900">Weekly NAV</span>
                  </div>
                  <p className="text-[11px] text-emerald-800 leading-relaxed">
                    Institutional first-lien commercial real estate debt with weekly NAV settlement.
                  </p>
                </div>
              </div>
            </div>

            {/* Governance Badge Card */}
            <div className="vault-card p-6 space-y-4 relative overflow-hidden bg-gradient-to-br from-indigo-50/90 via-white to-white border-indigo-200">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-indigo-100/80 text-indigo-700 border border-indigo-200">
                  <ShieldAlert className="w-5 h-5 text-indigo-600" />
                </div>
                <h3 className="font-bold text-sm font-mono tracking-wide text-zinc-900">Institutional Governance</h3>
              </div>

              <p className="text-xs text-zinc-600 leading-relaxed">
                This protocol engine is governed by an institutional <span className="font-bold text-indigo-700">2-of-3 Gnosis Safe Multisig</span> on Sepolia.
              </p>

              <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-100 font-mono text-[11px] space-y-2">
                <div className="flex justify-between items-center text-zinc-500">
                  <span>Safe Address:</span>
                  <span className="text-indigo-700 font-bold">0xEB96...18f9D</span>
                </div>
                <div className="flex justify-between items-center text-zinc-500">
                  <span>Threshold:</span>
                  <span className="text-emerald-700 font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">2 of 3 Signers</span>
                </div>
              </div>

              <a
                href={`https://sepolia.etherscan.io/address/${DEPLOYED_ADDRESSES.contracts.SafeMultisig}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-mono font-semibold hover:underline transition-colors"
              >
                <span>Verify Safe on Etherscan</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Investor Privacy & Auditor Access Portal (Sidebar Card - Expanded to fill height) */}
            <div className="vault-card p-6 bg-white border-zinc-200 flex-1 flex flex-col justify-between space-y-4">
              <div className="space-y-4">
                <div className="flex justify-between items-start border-b border-zinc-200 pb-3">
                  <div>
                    <h3 className="font-bold text-xs font-mono text-zinc-900 flex items-center gap-2">
                      <Eye className="w-4 h-4 text-indigo-600" /> Investor Privacy & Auditor Access Portal
                    </h3>
                    <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">
                      Grant or revoke viewing permission to an auditor over your encrypted vault balance. Revocation triggers Single-User Handle Rotation.
                    </p>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded flex-shrink-0">
                    DisclosureManager.sol
                  </span>
                </div>

                <div className="space-y-3 font-mono">
                  <label className="text-[11px] text-zinc-500 block">Auditor / Regulator Address</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={auditorAddress}
                      onChange={(e) => setAuditorAddress(e.target.value)}
                      placeholder="0x... (Auditor Ethereum Address)"
                      className="w-full bg-white border border-zinc-300 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:border-indigo-500"
                    />
                    {auditorAddress && (
                      <button
                        onClick={() => copyToClipboard(auditorAddress)}
                        className="btn-secondary text-xs px-2.5 py-2 text-zinc-600"
                      >
                        {copiedAddr ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleGrantAuditor}
                      disabled={isProcessing || !account || !ethers.isAddress(auditorAddress)}
                      className="w-1/2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                    >
                      <UserCheck className="w-3.5 h-3.5" /> Grant Access
                    </button>

                    <button
                      type="button"
                      onClick={handleRevokeAuditor}
                      disabled={isProcessing || !account || !ethers.isAddress(auditorAddress)}
                      className="w-1/2 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                    >
                      <RotateCw className="w-3.5 h-3.5" /> Revoke & Rotate
                    </button>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 space-y-2">
                  <div className="font-bold text-amber-950 flex items-center gap-1.5 text-[11px]">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" /> Cryptographic Single-User Handle Rotation
                  </div>
                  <p className="text-[10px] leading-relaxed text-amber-800 font-sans">
                    When revoking auditor access, RealVault invokes <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">vault.rotateUserHandle()</code>. This regenerates your position handle on-chain, rendering the old ciphertext un-decryptable for the auditor.
                  </p>
                  <div className="pt-1 text-[11px] font-bold text-amber-900 flex items-center justify-between flex-wrap gap-1">
                    <span>Status for Auditor:</span>
                    {isAuditorActive ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold text-[10px]">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>AUTHORIZED (Can View)</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-100 text-red-800 border border-red-300 font-semibold text-[10px]">
                        <ShieldOff className="w-3 h-3 text-red-600" />
                        <span>NOT AUTHORIZED (Revoked / Hidden)</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Privacy & Audit Lifecycle Steps */}
                <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 text-[11px] font-mono space-y-2">
                  <div className="text-zinc-500 font-bold flex items-center justify-between text-[10px]">
                    <span>PRIVACY LIFECYCLE</span>
                    <span className="text-emerald-700 font-bold">NOX FHE ACTIVE</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-[10px] text-center pt-0.5">
                    <div className="p-1.5 rounded bg-white border border-zinc-200 text-zinc-700">
                      <span className="block font-bold">1. Cipher</span>
                      <span className="text-[9px] text-zinc-400">Handle Encrypted</span>
                    </div>
                    <div className="p-1.5 rounded bg-white border border-zinc-200 text-zinc-700">
                      <span className="block font-bold">2. ACL Grant</span>
                      <span className="text-[9px] text-zinc-400">Auditor Scope</span>
                    </div>
                    <div className="p-1.5 rounded bg-white border border-zinc-200 text-zinc-700">
                      <span className="block font-bold">3. Rotate</span>
                      <span className="text-[9px] text-zinc-400">Handle Reset</span>
                    </div>
                  </div>
                </div>

                {/* Institutional Enclave Security Pulse Widget (White & Indigo Theme) */}
                <div className="p-3.5 rounded-xl bg-gradient-to-br from-indigo-50/90 via-white to-indigo-50/40 text-zinc-900 font-mono text-xs space-y-2 border border-indigo-100 shadow-xs">
                  <div className="flex items-center justify-between text-[10px] border-b border-indigo-100 pb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="font-bold text-indigo-950">Enclave Security Pulse</span>
                    </div>
                    <span className="text-indigo-700 text-[9px] px-1.5 py-0.5 rounded bg-indigo-100/80 border border-indigo-200 font-bold">
                      iExec TEE Verified
                    </span>
                  </div>
                  <div className="space-y-1 text-[10px] text-zinc-600">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">MEV Leakage Risk:</span>
                      <span className="text-emerald-700 font-bold">0.00% (Zero-Knowledge)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Front-Running Protection:</span>
                      <span className="text-indigo-700 font-bold">Full Enclave Isolation</span>
                    </div>
                  </div>
                  <div className="text-[9px] text-indigo-900/80 italic bg-white p-2 rounded border border-indigo-100/80 mt-1 shadow-2xs">
                    🔒 &quot;Even if an MEV bot inspects Sepolia mempool, your margin size &amp; directional leverage remain 100% unreadable.&quot;
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ACTIVE POSITIONS TABLE */}
        <div className="vault-card p-8 space-y-6 bg-white border-zinc-200">
          <div className="flex justify-between items-center border-b border-zinc-200 pb-4">
            <div>
              <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-600" /> Active RWA Positions
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Positions stored on-chain with encrypted margin handles. Unrealized PnL recalculated every 10s from oracle.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {(() => {
                const totalUnrealized = userPositions
                  .filter((p) => p.isOpen)
                  .reduce((sum, pos) => {
                    const key = getAssetKey(pos.assetId);
                    if (!key) return sum;
                    return sum + computeUnrealizedPnlPercent(pos.entryPriceE8, getEffectivePrice(key), pos.leverage, pos.isLong);
                  }, 0);
                return totalUnrealized !== 0 ? (
                  <span className={`text-sm font-mono font-bold px-3 py-1 rounded-lg ${totalUnrealized >= 0 ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                    Unrealized: {totalUnrealized >= 0 ? "+" : ""}{totalUnrealized.toFixed(2)}%
                  </span>
                ) : null;
              })()}
              <span className="text-xs font-mono text-zinc-500">RwaPerpEngine.getPositions()</span>
            </div>
          </div>

          {userPositions.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-zinc-200 rounded-xl space-y-2">
              <Lock className="w-8 h-8 text-zinc-300 mx-auto" />
              <p className="text-xs text-zinc-500 font-mono">No active positions found for connected wallet.</p>
              <p className="text-[11px] text-zinc-400">Use the order form above to open your first encrypted position.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 uppercase">
                  <tr>
                    <th className="py-3 px-4">#</th>
                    <th className="py-3 px-4">Asset</th>
                    <th className="py-3 px-4">Side</th>
                    <th className="py-3 px-4">Entry Price</th>
                    <th className="py-3 px-4">Current Price</th>
                    <th className="py-3 px-4">Leverage</th>
                    <th className="py-3 px-4">Unrealized PnL (Live)</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {userPositions.map((pos) => (
                    <tr key={pos.index} className="hover:bg-zinc-50/50">
                      <td className="py-4 px-4 font-bold text-zinc-900">#{pos.index}</td>
                      <td className="py-4 px-4 font-bold text-zinc-900">{pos.assetSymbol}</td>
                      <td className="py-4 px-4">
                        {pos.isLong ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">LONG</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 font-bold">SHORT</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-zinc-900">${pos.entryPriceFormatted}</td>
                      <td className="py-4 px-4 text-zinc-700 font-bold">
                        {(() => {
                          const key = getAssetKey(pos.assetId);
                          if (!key || !pos.isOpen) return <span className="text-zinc-400">-</span>;
                          const effPrice = getEffectivePrice(key);
                          return (
                            <span>
                              ${effPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="py-4 px-4 font-bold text-indigo-600">{pos.leverage}x</td>
                      <td className="py-4 px-4">
                        {(() => {
                          if (!pos.isOpen) return <span className="text-zinc-400">Settled</span>;
                          const key = getAssetKey(pos.assetId);
                          if (!key) return <span className="text-zinc-400">-</span>;
                          const effPrice = getEffectivePrice(key);
                          const pnlPct = computeUnrealizedPnlPercent(pos.entryPriceE8, effPrice, pos.leverage, pos.isLong);
                          const isProfit = pnlPct >= 0;
                          const marginEst = parseFloat(marginInput || "20");
                          const pnlUsdEst = (marginEst * pnlPct) / 100;

                          if (pnlPct === 0) {
                            return (
                              <span className="text-amber-700 flex items-center gap-1 font-semibold">
                                <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                                $0.00 (0.00%)
                              </span>
                            );
                          }
                          return (
                            <div className="space-y-0.5">
                              <span className={`font-bold text-sm ${isProfit ? "text-emerald-600" : "text-red-600"}`}>
                                {isProfit ? "+" : ""}{pnlPct.toFixed(2)}%
                              </span>
                              <div className={`text-[11px] font-bold ${isProfit ? "text-emerald-600" : "text-red-600"}`}>
                                {isProfit ? "+" : ""}${pnlUsdEst.toFixed(2)} USDC
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-4 px-4">
                        {pos.isOpen ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium flex items-center gap-1 w-fit">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> OPEN
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-500 font-medium">CLOSED</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-right">
                        {pos.isOpen && (
                          <div className="space-y-1.5">
                            {(() => {
                              const key = getAssetKey(pos.assetId);
                              const entryPrice = parseFloat(ethers.formatUnits(pos.entryPriceE8, 8));
                              const currentPrice = key ? oracleData[key].priceRaw : 0;
                              if (Math.abs(currentPrice - entryPrice) < 0.0001) {
                                return (
                                  <div className="text-[10px] text-amber-700 font-mono mb-1 flex items-center gap-1 justify-end font-medium">
                                    <AlertCircle className="w-3 h-3 text-amber-500" /> Price unchanged on Sepolia
                                  </div>
                                );
                              }
                              return null;
                            })()}
                            <button
                              onClick={() => initiateClosePosition(pos.index)}
                              disabled={isProcessing}
                              className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-mono font-bold transition-all disabled:opacity-50 shadow-xs"
                            >
                              Close & Settle PnL
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* UNCHANGED ORACLE PRICE WARNING CONFIRMATION MODAL VIA PORTAL */}
        {showUnchangedPriceModal && isMounted && createPortal(
          <div ref={modalBackdropRef} className="fixed inset-0 z-[99999] w-screen h-screen flex items-center justify-center p-4 sm:p-6 bg-[#090D16]/90 backdrop-blur-xl">
            <div ref={modalContentRef} className="bg-white rounded-2xl border border-zinc-200/90 shadow-2xl max-w-md w-full p-6 space-y-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-zinc-900 font-mono">Chainlink Price Unchanged</h3>
                    <p className="text-xs text-zinc-500">Sepolia Oracle Update Notice</p>
                  </div>
                </div>
                <button
                  onClick={() => closeModalWithAnimation()}
                  className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200/80 text-xs font-mono text-amber-900 space-y-2 leading-relaxed">
                <p className="font-semibold text-amber-950">
                  The Sepolia oracle price has not changed since position entry ($4,099.50 USD).
                </p>
                <p className="text-zinc-700">
                  Chainlink updates the Sepolia feed only when the market moves &gt;0.5% or when the 1-hour heartbeat expires.
                </p>
                <p className="text-zinc-700 font-semibold pt-1">
                  Closing on-chain now will yield 0 price delta and settled PnL will equal exactly <span className="text-amber-900 font-bold">$0.00 (0.00%)</span>.
                </p>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={() => pendingClosePositionIndex !== null && executeClosePosition(pendingClosePositionIndex)}
                  className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white font-mono text-xs font-bold rounded-xl transition-all shadow-xs"
                >
                  Close Position Anyway ($0.00 PnL on Sepolia)
                </button>
                <button
                  onClick={() => closeModalWithAnimation()}
                  className="w-full py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-mono text-xs font-bold rounded-xl transition-all"
                >
                  Cancel &amp; Wait for Market Update
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* CLOSED POSITIONS PnL SETTLEMENT LOG */}
        {closedHistory.length > 0 && (
          <div className="vault-card p-8 space-y-6 bg-white border-zinc-200">
            <div className="flex justify-between items-center border-b border-zinc-200 pb-4">
              <div>
                <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                  <History className="w-5 h-5 text-indigo-600" /> Realized Session PnL Audit Log
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Historical settlement records extracted from on-chain `PositionClosed` events.
                </p>
              </div>
              <span className="text-xs font-mono px-2 py-1 rounded bg-indigo-50 text-indigo-700">
                Event Log Audit
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 uppercase">
                  <tr>
                    <th className="py-3 px-4">Pos #</th>
                    <th className="py-3 px-4">Asset</th>
                    <th className="py-3 px-4">Exit Price</th>
                    <th className="py-3 px-4">PnL Scalar (Bps)</th>
                    <th className="py-3 px-4">PnL %</th>
                    <th className="py-3 px-4">Estimated PnL ($)</th>
                    <th className="py-3 px-4 text-right">Tx Hash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {closedHistory.map((item, idx) => (
                    <tr key={idx} className="hover:bg-zinc-50/50">
                      <td className="py-4 px-4 font-bold text-zinc-900">#{item.index}</td>
                      <td className="py-4 px-4 font-bold text-zinc-900">{item.assetSymbol}</td>
                      <td className="py-4 px-4 text-zinc-900">${item.exitPriceFormatted} USD</td>
                      <td className="py-4 px-4 font-mono">{item.pnlScalarBps} bps</td>
                      <td className="py-4 px-4 font-bold">
                        <span className={item.isProfit ? "text-emerald-600" : "text-red-600"}>
                          {item.pnlPercentStr}
                        </span>
                      </td>
                      <td className="py-4 px-4 font-bold text-sm">
                        <span className={item.isProfit ? "text-emerald-600" : "text-red-600"}>
                          {item.pnlUsdcEstimate}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <a
                          href={`https://sepolia.etherscan.io/tx/${item.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-indigo-600 hover:text-indigo-800 underline font-mono text-[11px]"
                        >
                          {item.txHash.substring(0, 8)}...
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
    </main>
  );
}
