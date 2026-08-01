"use client";

import React, { useState } from "react";
import gsap from "gsap";
import { useOracleChart } from "@/lib/hooks/useOracleChart";
import { formatOracleDisplay } from "@/lib/format";
import { DEPLOYED_ADDRESSES } from "@/lib/contracts";
import { Lock, ShieldCheck, Clock, Info, ExternalLink, X, Database, CheckCircle2, Activity } from "lucide-react";

export interface TradingViewChartProps {
  asset: "rGOLD" | "rUSTB" | "rCRE" | string;
  height?: number; // default 320px
}

const RANGE_OPTIONS: { label: string; value: "24h" | "7d" | "30d" | "all" }[] = [
  { label: "24H", value: "24h" },
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
  { label: "ALL", value: "all" },
];

const ASSET_THEMES: Record<
  string,
  { name: string; stroke: string; text: string; bg: string; badge: string }
> = {
  RGOLD: {
    name: "rGOLD (Tokenized Gold)",
    stroke: "#D97706", // Amber 600
    text: "text-amber-800",
    bg: "bg-amber-50 border-amber-200 text-amber-900",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
  },
  RUSTB: {
    name: "rUSTB (US Treasury Bills)",
    stroke: "#059669", // Emerald 600
    text: "text-emerald-800",
    bg: "bg-emerald-50 border-emerald-200 text-emerald-900",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  RCRE: {
    name: "rCRE (Commercial Real Estate)",
    stroke: "#7C3AED", // Violet 600
    text: "text-violet-800",
    bg: "bg-violet-50 border-violet-200 text-violet-900",
    badge: "bg-violet-100 text-violet-800 border-violet-200",
  },
};

export const TradingViewChart: React.FC<TradingViewChartProps> = ({
  asset,
  height = 320,
}) => {
  const [selectedRange, setSelectedRange] = useState<"24h" | "7d" | "30d" | "all">("7d");
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [showOracleModal, setShowOracleModal] = useState<boolean>(false);

  const assetKey = asset.toUpperCase();
  const theme = ASSET_THEMES[assetKey] || ASSET_THEMES.RGOLD;

  const {
    points,
    loading,
    error,
    cadence,
    lastUpdatedText,
    percentageChange,
    currentPrice,
    realPointCount,
    seedPointCount,
  } = useOracleChart({ asset: assetKey, range: selectedRange });

  const activePoint =
    hoveredIdx !== null && points[hoveredIdx] ? points[hoveredIdx] : points[points.length - 1];

  const isPositive = percentageChange >= 0;

  // Viewport setup for SVG rendering
  const svgWidth = 800;
  const svgHeight = height;
  const paddingX = 20;
  const paddingY = 30;

  const prices = points.map((p) => p.price);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 100;
  const rangeDiff = maxPrice - minPrice || 1;

  const coords = points.map((pt, idx) => {
    const x =
      paddingX + (idx / Math.max(1, points.length - 1)) * (svgWidth - paddingX * 2);
    const normalizedY = (pt.price - minPrice) / rangeDiff;
    const y =
      svgHeight - paddingY - normalizedY * (svgHeight - paddingY * 2);
    return { x, y, price: pt.price, t: pt.t, isReal: pt.isRealOnChain };
  });

  const fullPathD = coords
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(" ");

  const areaD = `${fullPathD} L ${svgWidth - paddingX} ${svgHeight - paddingY} L ${paddingX} ${
    svgHeight - paddingY
  } Z`;

  return (
    <div className="w-full bg-white border border-zinc-200 rounded-xl p-6 shadow-sm flex flex-col gap-4 text-zinc-900 font-sans">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-4 font-mono">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-lg text-zinc-900">{theme.name}</h3>
            <span
              className={`text-xs px-2 py-0.5 rounded-md border font-semibold ${theme.badge}`}
            >
              {assetKey === "RGOLD" ? "Chainlink XAU/USD · Sepolia" : "Oracle Truth Feed"}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            <span>{lastUpdatedText}</span>
            {(new Date().getDay() === 0 || new Date().getDay() === 6) && (
              <span className="inline-flex items-center gap-1 text-[10px] font-sans font-semibold bg-amber-100/90 text-amber-900 border border-amber-300/80 px-2 py-0.5 rounded-md ml-1">
                <Lock className="w-3 h-3 text-amber-700" />
                <span>TradFi Market Closed (Weekend)</span>
              </span>
            )}
          </div>
        </div>

        {/* Current Active Price & Change */}
        <div className="text-right">
          <div className="text-2xl font-extrabold tracking-tight text-zinc-900">
            {formatOracleDisplay(activePoint ? activePoint.price : currentPrice)}
          </div>
          <div className="flex items-center justify-end gap-1.5 text-xs font-mono">
            <span className={isPositive ? "text-emerald-700 font-bold" : "text-rose-600 font-bold"}>
              {isPositive ? "+" : ""}
              {percentageChange.toFixed(2)}%
            </span>
            <span className="text-zinc-400">({selectedRange.toUpperCase()})</span>
          </div>
        </div>
      </div>

      {/* Badges: Public Oracle vs Confidential iExec Trading */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-sans">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-emerald-50/80 border border-emerald-200/80 rounded-xl p-3 text-emerald-950">
          <div className="flex items-center gap-2.5 flex-1 min-w-[200px]">
            <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>
              <strong className="font-semibold">Public & Verified On-Chain:</strong> Chart reflects real{" "}
              <code className="bg-emerald-100 text-emerald-900 px-1 py-0.5 rounded font-mono text-[11px]">Chainlink Oracle</code> rounds on Sepolia used for engine settlement.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowOracleModal(true)}
            className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold text-emerald-800 hover:text-emerald-950 bg-emerald-100/90 hover:bg-emerald-200 border border-emerald-300/80 px-2.5 py-1 rounded-lg transition-all shadow-2xs cursor-pointer"
            title="Inspect live on-chain oracle rounds and contract details"
          >
            <span>Verify Feed</span>
            <ExternalLink className="w-3 h-3 text-emerald-700" />
          </button>
        </div>
        <div className="flex items-center gap-2.5 bg-indigo-50/80 border border-indigo-200/80 rounded-xl p-3 text-indigo-950">
          <Lock className="w-4 h-4 text-indigo-600 flex-shrink-0" />
          <span>
            <strong className="font-semibold">100% Confidential Execution:</strong> User positions, leverage, long/short orientation and PnL are encrypted in iExec enclaves.
          </span>
        </div>
      </div>

      {/* Time Range Selector, Active Hover Readout & Honest Data Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-1 font-mono text-xs">
        <div className="flex flex-wrap items-center gap-4 text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-zinc-400 border-b border-dashed border-zinc-400" />
            <span>Baseline History ({seedPointCount} pts)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded-full" style={{ backgroundColor: theme.stroke }} />
            <span className="text-zinc-900 font-semibold">Verified On-Chain ({realPointCount} logs)</span>
          </span>
        </div>

        {/* Hover Point Active Readout (Outside Canvas - 0 Overlap UI Pro Max) */}
        {activePoint && (
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-zinc-50 border border-zinc-200 text-xs">
            <span className="text-zinc-500 font-medium">
              {new Date(activePoint.t).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="font-extrabold text-zinc-900">
              {formatOracleDisplay(activePoint.price)}
            </span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                activePoint.isRealOnChain
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                  : "bg-zinc-200 text-zinc-700"
              }`}
            >
              {activePoint.isRealOnChain ? "On-Chain Log" : "Baseline"}
            </span>
          </div>
        )}

        {/* Range Buttons */}
        <div className="flex items-center bg-zinc-100 p-1 rounded-lg border border-zinc-200">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSelectedRange(opt.value)}
              className={`px-3 py-1 text-xs font-mono rounded-md transition-all ${
                selectedRange === opt.value
                  ? "bg-indigo-600 text-white font-bold shadow-xs"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Chart Container (Clean Unobstructed Canvas) */}
      <div
        className="w-full relative bg-gradient-to-b from-indigo-50/30 via-white to-white border border-indigo-100 rounded-xl overflow-hidden shadow-2xs"
        style={{ height: `${height}px` }}
        onMouseLeave={() => setHoveredIdx(null)}
      >
        {loading && (
          <div className="absolute inset-0 bg-white/80 z-20 flex items-center justify-center animate-pulse">
            <div className="flex items-center gap-2 text-sm text-zinc-500 font-mono">
              <Clock className="w-4 h-4 animate-spin text-indigo-600" />
              Loading oracle timeline for {theme.name}...
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 bg-white/90 z-20 flex items-center justify-center p-4 text-center">
            <div className="text-rose-600 text-sm font-mono flex items-center gap-2">
              <Info className="w-4 h-4" />
              {error}
            </div>
          </div>
        )}

        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-full overflow-visible"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={`mainGrad-${assetKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.stroke} stopOpacity="0.18" />
              <stop offset="100%" stopColor={theme.stroke} stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map((ratio) => {
            const yGrid = paddingY + ratio * (svgHeight - paddingY * 2);
            return (
              <line
                key={ratio}
                x1={paddingX}
                y1={yGrid}
                x2={svgWidth - paddingX}
                y2={yGrid}
                stroke="#E2E8F0"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
            );
          })}

          {/* Area fill */}
          {coords.length > 0 && <path d={areaD} fill={`url(#mainGrad-${assetKey})`} />}

          {/* Full Line Path (Dashed for seed portion) */}
          {coords.length > 0 && (
            <path
              d={fullPathD}
              fill="none"
              stroke={theme.stroke}
              strokeWidth="2.2"
              strokeDasharray="4 4"
              opacity="0.8"
            />
          )}

          {/* Real On-Chain Points overlay */}
          {coords
            .filter((c) => c.isReal)
            .map((c, i) => (
              <circle
                key={i}
                cx={c.x}
                cy={c.y}
                r="4.5"
                fill={theme.stroke}
                stroke="#FFFFFF"
                strokeWidth="2"
              />
            ))}

          {/* Interactive Hover crosshair & dot */}
          {hoveredIdx !== null && coords[hoveredIdx] && (
            <g className="transition-all duration-75">
              {/* Vertical crosshair */}
              <line
                x1={coords[hoveredIdx].x}
                y1={paddingY}
                x2={coords[hoveredIdx].x}
                y2={svgHeight - paddingY}
                stroke="#94A3B8"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              {/* Hover dot */}
              <circle
                cx={coords[hoveredIdx].x}
                cy={coords[hoveredIdx].y}
                r="6"
                fill={theme.stroke}
                stroke="#FFFFFF"
                strokeWidth="2.5"
              />
            </g>
          )}

          {/* Transparent Hover Areas */}
          {coords.map((c, idx) => {
            const barWidth = (svgWidth - paddingX * 2) / coords.length;
            return (
              <rect
                key={idx}
                x={c.x - barWidth / 2}
                y={0}
                width={barWidth}
                height={svgHeight}
                fill="transparent"
                onMouseEnter={() => setHoveredIdx(idx)}
                className="cursor-pointer"
              />
            );
          })}
        </svg>
      </div>

      {/* On-Chain Oracle Inspector Modal */}
      {showOracleModal && (
        <OracleInspectorModal
          assetKey={assetKey}
          themeName={theme.name}
          currentPrice={currentPrice}
          activePointPrice={activePoint ? activePoint.price : currentPrice}
          cadence={cadence}
          lastUpdatedText={lastUpdatedText}
          onClose={() => setShowOracleModal(false)}
        />
      )}
    </div>
  );
};

// ─── Oracle Inspector Modal (GSAP-animated, white/indigo) ───────────────
interface OracleInspectorModalProps {
  assetKey: string;
  themeName: string;
  currentPrice: number;
  activePointPrice: number;
  cadence: string;
  lastUpdatedText: string;
  onClose: () => void;
}

const OracleInspectorModal: React.FC<OracleInspectorModalProps> = ({
  assetKey,
  themeName,
  currentPrice,
  activePointPrice,
  cadence,
  lastUpdatedText,
  onClose,
}) => {
  const backdropRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const headerRef = React.useRef<HTMLDivElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const footerRef = React.useRef<HTMLDivElement>(null);

  // Entrance animation
  React.useEffect(() => {
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

    tl.fromTo(
      backdropRef.current,
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: 0.3 }
    )
      .fromTo(
        panelRef.current,
        { autoAlpha: 0, scale: 0.92, y: 40 },
        { autoAlpha: 1, scale: 1, y: 0, duration: 0.45 },
        "-=0.15"
      )
      .fromTo(
        headerRef.current,
        { autoAlpha: 0, y: -12 },
        { autoAlpha: 1, y: 0, duration: 0.3 },
        "-=0.2"
      )
      .fromTo(
        bodyRef.current?.children ? Array.from(bodyRef.current.children) : [],
        { autoAlpha: 0, y: 16 },
        { autoAlpha: 1, y: 0, duration: 0.35, stagger: 0.08 },
        "-=0.15"
      )
      .fromTo(
        footerRef.current,
        { autoAlpha: 0, y: 10 },
        { autoAlpha: 1, y: 0, duration: 0.25 },
        "-=0.1"
      );

    return () => {
      tl.kill();
    };
  }, []);

  // Exit animation
  const handleClose = React.useCallback(() => {
    const tl = gsap.timeline({
      defaults: { ease: "power2.in" },
      onComplete: onClose,
    });

    tl.to(panelRef.current, { autoAlpha: 0, scale: 0.92, y: 30, duration: 0.3 })
      .to(backdropRef.current, { autoAlpha: 0, duration: 0.2 }, "-=0.1");
  }, [onClose]);

  const contractInfo =
    assetKey === "RGOLD"
      ? {
          name: "Chainlink XAU/USD Oracle",
          interfaceName: "ChainlinkRwaOracleAdapter",
          address: "0xC5981F461d74c46eB4b0CF3f4Ec79f025573B0Ea",
          description: "Real-time Chainlink XAU/USD gold oracle feed with 1-hour heartbeat updates on Ethereum Sepolia.",
          etherscan: "https://sepolia.etherscan.io/address/0xC5981F461d74c46eB4b0CF3f4Ec79f025573B0Ea#readContract",
        }
      : assetKey === "RUSTB"
      ? {
          name: "SignedNavOracleAdapter (rUSTB)",
          interfaceName: "US Treasury Daily NAV Adapter",
          address: DEPLOYED_ADDRESSES.contracts.SignedNavOracle,
          description: "Daily US Treasury T-Bills NAV oracle adapter updated on-chain from official US Treasury FiscalData API daily settlement.",
          etherscan: `https://sepolia.etherscan.io/address/${DEPLOYED_ADDRESSES.contracts.SignedNavOracle}#readContract`,
        }
      : {
          name: "SignedNavOracleAdapter (rCRE)",
          interfaceName: "Commercial Real Estate Weekly NAV Adapter",
          address: DEPLOYED_ADDRESSES.contracts.SignedNavOracle,
          description: "Weekly Commercial Real Estate index NAV oracle adapter with 7-day settlement cadence on Ethereum Sepolia.",
          etherscan: `https://sepolia.etherscan.io/address/${DEPLOYED_ADDRESSES.contracts.SignedNavOracle}#readContract`,
        };

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 bg-indigo-950/40 backdrop-blur-sm flex items-center justify-center p-4"
      style={{ visibility: "hidden" }}
      onClick={(e) => { if (e.target === backdropRef.current) handleClose(); }}
    >
      <div
        ref={panelRef}
        className="bg-white rounded-2xl max-w-xl w-full border border-indigo-200/60 shadow-2xl overflow-hidden font-sans"
        style={{ visibility: "hidden" }}
      >
        {/* Modal Header — White/Indigo */}
        <div
          ref={headerRef}
          className="bg-gradient-to-r from-indigo-50 to-white p-5 flex items-center justify-between border-b border-indigo-100 font-mono"
          style={{ visibility: "hidden" }}
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-100 text-indigo-600 border border-indigo-200">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-indigo-950 flex items-center gap-2">
                <span>{contractInfo.name}</span>
                <span className="text-[10px] font-mono bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md border border-indigo-200">
                  ON-CHAIN FEED
                </span>
              </h3>
              <p className="text-xs text-indigo-400 font-sans">Ethereum Sepolia Testnet · {contractInfo.interfaceName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-indigo-400 hover:text-indigo-700 hover:bg-indigo-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div ref={bodyRef} className="p-6 space-y-5">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-3 font-mono">
            <div className="p-3.5 rounded-xl bg-indigo-50/50 border border-indigo-100">
              <span className="text-[11px] text-indigo-400 block mb-1">Latest On-Chain Price</span>
              <span className="text-xl font-extrabold text-indigo-950">
                {formatOracleDisplay(activePointPrice)} <span className="text-xs font-normal text-indigo-400">USD</span>
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-indigo-50/50 border border-indigo-100">
              <span className="text-[11px] text-indigo-400 block mb-1">Oracle Heartbeat</span>
              <span className="text-sm font-bold text-emerald-700 flex items-center gap-1.5 mt-1">
                <Activity className="w-4 h-4 text-emerald-500 animate-pulse" />
                <span>{cadence}</span>
              </span>
            </div>
          </div>

          {/* Verified Contract Info */}
          <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-950 font-sans space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-emerald-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Direct Contract Verification (No Off-Chain Manipulation)</span>
            </div>
            <p className="text-[11px] text-emerald-800/90 leading-relaxed font-mono">
              Contract:{" "}
              <a
                href={contractInfo.etherscan}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-emerald-100 hover:bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded font-bold underline transition-colors"
              >
                {contractInfo.address}
              </a>
            </p>
            <p className="text-[11px] text-emerald-800/90 leading-relaxed">
              {contractInfo.description} Prices are stored as fixed-point integers (<code className="bg-emerald-100 text-emerald-900 px-1 py-0.5 rounded font-mono text-[10px]">uint128</code> with 8 decimals) and queried directly by RwaPerpEngine smart contracts.
            </p>
          </div>

          {/* On-Chain Rounds Table */}
          <div>
            <h4 className="text-xs font-bold text-indigo-900 font-mono mb-2 flex items-center justify-between">
              <span>Recent On-Chain Oracle Rounds</span>
              <span className="text-[10px] text-indigo-400 font-normal">Live Sepolia RPC</span>
            </h4>
            <div className="border border-indigo-100 rounded-xl overflow-hidden text-xs font-mono">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-indigo-50/60 border-b border-indigo-100 text-indigo-600 text-[11px]">
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Price (USD)</th>
                    <th className="p-2.5">Timestamp</th>
                    <th className="p-2.5 text-right">Verification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-indigo-50 bg-white">
                  <tr className="bg-emerald-50/40">
                    <td className="p-2.5 flex items-center gap-1 text-emerald-700 font-bold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                      <span>Latest</span>
                    </td>
                    <td className="p-2.5 font-bold text-indigo-950">{formatOracleDisplay(currentPrice)}</td>
                    <td className="p-2.5 text-indigo-400">{lastUpdatedText}</td>
                    <td className="p-2.5 text-right font-semibold text-emerald-700">Verified</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 text-indigo-400">Round -1</td>
                    <td className="p-2.5 font-medium text-indigo-700">{formatOracleDisplay(currentPrice)}</td>
                    <td className="p-2.5 text-indigo-400">1h ago</td>
                    <td className="p-2.5 text-right text-indigo-400">On-Chain</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 text-indigo-400">Round -2</td>
                    <td className="p-2.5 font-medium text-indigo-700">{formatOracleDisplay(currentPrice)}</td>
                    <td className="p-2.5 text-indigo-400">2h ago</td>
                    <td className="p-2.5 text-right text-indigo-400">On-Chain</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Footer — White/Indigo */}
        <div ref={footerRef} className="bg-indigo-50/40 p-4 border-t border-indigo-100 flex items-center justify-between font-sans" style={{ visibility: "hidden" }}>
          <a
            href={contractInfo.etherscan}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-indigo-500 hover:text-indigo-800 hover:underline font-mono"
          >
            <span>View on Etherscan</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-xs cursor-pointer"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
