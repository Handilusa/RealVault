"use client";

import React, { useId } from "react";
import { ChartPoint } from "@/app/api/charts/[asset]/route";

export interface SparklineChartProps {
  asset: string;
  points: ChartPoint[];
  loading?: boolean;
  width?: number | string; // default 100%
  height?: number; // default 48px
  percentageChange?: number;
  showBadge?: boolean;
}

const ASSET_COLORS: Record<string, { stroke: string; fill: string; accent: string }> = {
  rGOLD: {
    stroke: "#F59E0B", // Amber 500
    fill: "rgba(245, 158, 11, 0.12)",
    accent: "#FBBF24",
  },
  rUSTB: {
    stroke: "#10B981", // Emerald 500
    fill: "rgba(16, 185, 129, 0.12)",
    accent: "#34D399",
  },
  rCRE: {
    stroke: "#8B5CF6", // Violet 500
    fill: "rgba(139, 92, 246, 0.12)",
    accent: "#A78BFA",
  },
};

export const SparklineChart: React.FC<SparklineChartProps> = ({
  asset,
  points,
  loading = false,
  height = 48,
  percentageChange = 0,
  showBadge = true,
}) => {
  const gradientId = useId();

  // Skeleton loading state maintaining exact dimensions (CLS < 0.1)
  if (loading || !points || points.length < 2) {
    return (
      <div
        className="w-full relative bg-slate-800/40 rounded flex items-center justify-center overflow-hidden animate-pulse"
        style={{ height: `${height}px`, aspectRatio: "16 / 5" }}
        aria-busy="true"
        aria-label={`Loading ${asset} sparkline chart...`}
      >
        <div className="w-3/4 h-1/2 bg-slate-700/50 rounded" />
      </div>
    );
  }

  const colors = ASSET_COLORS[asset.toUpperCase()] || ASSET_COLORS.rGOLD;

  // Calculate min/max range with padding
  const prices = points.map((p) => p.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const range = maxPrice - minPrice || 1;

  // Viewport dimensions
  const svgWidth = 240;
  const svgHeight = height;
  const paddingY = 6;

  // Convert points to SVG coordinates
  const coords = points.map((pt, idx) => {
    const x = (idx / (points.length - 1)) * svgWidth;
    const normalizedY = (pt.price - minPrice) / range;
    const y = svgHeight - paddingY - normalizedY * (svgHeight - paddingY * 2);
    return { x, y, isReal: pt.isRealOnChain };
  });

  // Separate coords into seed path (dashed/dim) vs on-chain real path (solid/bright)
  const seedCoords = coords.filter((c) => !c.isReal);
  const realCoords = coords.filter((c) => c.isReal);

  const fullPathD = coords
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(" ");

  const seedPathD =
    seedCoords.length > 1
      ? seedCoords
          .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
          .join(" ")
      : "";

  const realPathD =
    realCoords.length > 1
      ? realCoords
          .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
          .join(" ")
      : "";

  const areaD = `${fullPathD} L ${svgWidth} ${svgHeight} L 0 ${svgHeight} Z`;
  const lastPoint = coords[coords.length - 1];

  const hasRealOnChain = realCoords.length > 0;
  const isPositive = percentageChange >= 0;

  const accessibilityLabel = `${asset} price trend, last points range change ${
    isPositive ? "up" : "down"
  } ${Math.abs(percentageChange).toFixed(2)}%, containing ${realCoords.length} on-chain verified updates.`;

  return (
    <div
      className="w-full relative flex flex-col justify-end"
      aria-label={accessibilityLabel}
      role="img"
    >
      <div className="w-full relative overflow-hidden rounded" style={{ height: `${height}px` }}>
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-full overflow-visible"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={`grad-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.stroke} stopOpacity="0.25" />
              <stop offset="100%" stopColor={colors.stroke} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Fill under chart */}
          <path d={areaD} fill={`url(#grad-${gradientId})`} />

          {/* Continuous Sparkline Trend Line */}
          <path
            d={fullPathD}
            fill="none"
            stroke={colors.stroke}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Verified On-Chain Log Indicator Dots */}
          {realCoords.map((pt, i) => (
            <circle
              key={i}
              cx={pt.x}
              cy={pt.y}
              r="2.5"
              fill={colors.accent}
              stroke={colors.stroke}
              strokeWidth="1"
            />
          ))}

          {/* Glowing pulse dot on latest value */}
          {lastPoint && (
            <g>
              <circle
                cx={lastPoint.x}
                cy={lastPoint.y}
                r="4"
                fill={colors.stroke}
                className="animate-ping opacity-75"
              />
              <circle
                cx={lastPoint.x}
                cy={lastPoint.y}
                r="3"
                fill={colors.accent}
                stroke="#0F172A"
                strokeWidth="1"
              />
            </g>
          )}
        </svg>
      </div>

      {showBadge && (
        <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1 font-mono">
          <span className="flex items-center gap-1">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                hasRealOnChain ? "bg-emerald-400 animate-pulse" : "bg-amber-400/80"
              }`}
            />
            {hasRealOnChain ? `${realCoords.length} On-Chain Logs` : "Baseline History"}
          </span>
          <span className={isPositive ? "text-emerald-400" : "text-rose-400"}>
            {isPositive ? "+" : ""}
            {percentageChange.toFixed(2)}%
          </span>
        </div>
      )}
    </div>
  );
};
