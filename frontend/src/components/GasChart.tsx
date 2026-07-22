"use client";

import { useState } from "react";
import { GAS_BENCHMARKS } from "@/lib/contracts";

export default function GasChart() {
  const [showRawTable, setShowRawTable] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState<{
    n: number;
    grant: number;
    revoke: number;
    aggregate: number;
  } | null>(null);

  const width = 600;
  const height = 240;
  const padding = { top: 20, right: 24, bottom: 32, left: 56 };

  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const minX = 1;
  const maxX = 8;
  const minY = 0;
  const maxY = 1200000;

  const getX = (n: number) => padding.left + ((n - minX) / (maxX - minX)) * innerW;
  const getY = (val: number) => padding.top + innerH - ((val - minY) / (maxY - minY)) * innerH;

  const pointsGrant = GAS_BENCHMARKS.map((d) => `${getX(d.n)},${getY(d.grant)}`).join(" ");
  const pointsRevoke = GAS_BENCHMARKS.map((d) => `${getX(d.n)},${getY(d.revoke)}`).join(" ");
  const pointsAggregate = GAS_BENCHMARKS.map((d) => `${getX(d.n)},${getY(d.aggregate)}`).join(" ");

  const yTicks = [0, 300000, 600000, 900000, 1200000];

  return (
    <div className="vault-card p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-zinc-200">
        <div>
          <h3 className="text-base font-bold text-zinc-900">
            Gas Benchmarks - O(n) Handle Rotation
          </h3>
          <p className="text-sm text-zinc-500 mt-1">
            Gas consumption per operation relative to investor cohort size (N) on Sepolia
          </p>
        </div>

        <div className="flex items-center gap-5 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
            <span className="text-zinc-500">Grant</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="text-zinc-500">Revoke O(n)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-zinc-500">NAV Aggregation</span>
          </div>
        </div>
      </div>

      {/* SVG Chart */}
      <div className="gas-chart-container relative bg-zinc-50 rounded-lg border border-zinc-200 p-3 overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full"
          aria-label="Gas benchmark chart"
        >
          {/* Grid lines */}
          {yTicks.map((tick) => {
            const y = getY(tick);
            return (
              <g key={tick}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="#E4E4E7"
                  strokeDasharray="3 3"
                />
                <text
                  x={padding.left - 10}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="9"
                  fill="#A1A1AA"
                  className="font-mono"
                >
                  {(tick / 1000).toFixed(0)}k
                </text>
              </g>
            );
          })}

          {/* X Axis Ticks */}
          {GAS_BENCHMARKS.map((d) => {
            const x = getX(d.n);
            return (
              <g key={d.n}>
                <line
                  x1={x}
                  y1={padding.top + innerH}
                  x2={x}
                  y2={padding.top + innerH + 4}
                  stroke="#E4E4E7"
                />
                <text
                  x={x}
                  y={padding.top + innerH + 18}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#A1A1AA"
                  className="font-mono"
                >
                  N={d.n}
                </text>
              </g>
            );
          })}

          {/* Lines */}
          <polyline
            fill="none"
            stroke="#3F3F46"
            strokeWidth="2"
            points={pointsGrant}
            strokeLinejoin="round"
          />
          <polyline
            fill="none"
            stroke="#EF4444"
            strokeWidth="2"
            points={pointsRevoke}
            strokeLinejoin="round"
          />
          <polyline
            fill="none"
            stroke="#22C55E"
            strokeWidth="2"
            points={pointsAggregate}
            strokeLinejoin="round"
          />

          {/* Interactive Points */}
          {GAS_BENCHMARKS.map((d) => {
            const x = getX(d.n);
            const yG = getY(d.grant);
            const yR = getY(d.revoke);
            const yA = getY(d.aggregate);

            return (
              <g key={d.n} className="cursor-pointer">
                <rect
                  x={x - 18}
                  y={padding.top}
                  width="36"
                  height={innerH}
                  fill="transparent"
                  onMouseEnter={() => setHoveredPoint(d)}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
                <circle cx={x} cy={yG} r="3.5" fill="#3F3F46" stroke="#FFFFFF" strokeWidth="1.5" />
                <circle cx={x} cy={yR} r="3.5" fill="#EF4444" stroke="#FFFFFF" strokeWidth="1.5" />
                <circle cx={x} cy={yA} r="3.5" fill="#22C55E" stroke="#FFFFFF" strokeWidth="1.5" />
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip */}
        {hoveredPoint && (
          <div
            className="gas-chart-tooltip font-mono space-y-1.5 text-xs"
            style={{
              left: `${(getX(hoveredPoint.n) / width) * 100}%`,
              top: "12px",
              transform: "translateX(-50%)",
            }}
          >
            <div className="font-bold text-white">
              Cohort Size: N = {hoveredPoint.n}
            </div>
            <div className="text-zinc-300">
              Grant: {hoveredPoint.grant.toLocaleString("en-US")} gas
            </div>
            <div className="text-red-400">
              Revoke: {hoveredPoint.revoke.toLocaleString("en-US")} gas
            </div>
            <div className="text-emerald-400">
              Aggregate: {hoveredPoint.aggregate.toLocaleString("en-US")} gas
            </div>
          </div>
        )}
      </div>

      <button
        onClick={() => setShowRawTable(!showRawTable)}
        className="btn-secondary text-sm py-2.5 px-5 font-mono"
      >
        {showRawTable ? "Hide Benchmark Table" : "View Benchmark Table"}
      </button>

      {showRawTable && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200">
          <table className="data-table font-mono">
            <thead>
              <tr>
                <th>Investor Cohort (N)</th>
                <th>Grant Access</th>
                <th className="text-red-600">Revoke O(n)</th>
                <th className="text-emerald-600">FHE Aggregation</th>
              </tr>
            </thead>
            <tbody>
              {GAS_BENCHMARKS.map((row) => (
                <tr key={row.n}>
                  <td className="font-semibold text-zinc-900">N = {row.n}</td>
                  <td className="text-zinc-500">{row.grant.toLocaleString("en-US")} gas</td>
                  <td className="text-red-600 font-semibold">{row.revoke.toLocaleString("en-US")} gas</td>
                  <td className="text-emerald-600">{row.aggregate.toLocaleString("en-US")} gas</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
