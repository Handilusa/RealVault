"use client";

import { useEffect, useState } from "react";
import { loadGasBenchmarks, GasBenchmarkData } from "@/lib/contracts";

export default function GasChart() {
  const [showRawTable, setShowRawTable] = useState(false);
  const [benchmarkData, setBenchmarkData] = useState<GasBenchmarkData | null>(null);
  const [loading, setLoading] = useState(true);

  const [hoveredPoint, setHoveredPoint] = useState<{
    n: number;
    grant: number;
    revoke: number;
    aggregate: number;
  } | null>(null);

  useEffect(() => {
    loadGasBenchmarks()
      .then((data) => setBenchmarkData(data))
      .finally(() => setLoading(false));
  }, []);

  // Format array for chart plotting if data exists
  const benchmarks = benchmarkData
    ? benchmarkData.grant.map((g, i) => ({
        n: g.investors,
        grant: g.gas,
        revoke: benchmarkData.revoke[i]?.gas || 0,
        aggregate: benchmarkData.aggregate[i]?.gas || 0,
      }))
    : [];

  const width = 600;
  const height = 240;
  const padding = { top: 20, right: 24, bottom: 32, left: 56 };

  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const minX = benchmarks.length > 0 ? Math.min(...benchmarks.map((d) => d.n)) : 1;
  const maxX = benchmarks.length > 0 ? Math.max(...benchmarks.map((d) => d.n)) : 8;
  const minY = 0;
  const maxY = benchmarks.length > 0 ? Math.max(...benchmarks.map((d) => Math.max(d.grant, d.revoke, d.aggregate))) * 1.1 : 1200000;

  const getX = (n: number) =>
    maxX === minX
      ? padding.left + innerW / 2
      : padding.left + ((n - minX) / (maxX - minX)) * innerW;

  const getY = (val: number) => padding.top + innerH - ((val - minY) / (maxY - minY)) * innerH;

  const pointsGrant = benchmarks.map((d) => `${getX(d.n)},${getY(d.grant)}`).join(" ");
  const pointsRevoke = benchmarks.map((d) => `${getX(d.n)},${getY(d.revoke)}`).join(" ");
  const pointsAggregate = benchmarks.map((d) => `${getX(d.n)},${getY(d.aggregate)}`).join(" ");

  const yTicks = [0, maxY * 0.25, maxY * 0.5, maxY * 0.75, maxY];

  return (
    <div className="vault-card p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-zinc-200">
        <div>
          <h3 className="text-base font-bold text-zinc-900">
            Gas Benchmarks — On-Chain Execution Scaling
          </h3>
          <p className="text-sm text-zinc-500 mt-1">
            Gas consumption per operation relative to investor cohort size (N) measured on Sepolia
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

      {loading ? (
        <div className="p-12 text-center font-mono text-xs text-zinc-400 border border-zinc-200 rounded-lg bg-zinc-50">
          Loading benchmark results from chain metrics...
        </div>
      ) : benchmarks.length === 0 ? (
        <div className="p-8 text-center font-mono text-xs text-zinc-500 border border-zinc-200 rounded-lg bg-zinc-50 space-y-2">
          <div className="font-bold text-zinc-700">No Hardcoded Gas Metrics</div>
          <p className="text-zinc-400 max-w-md mx-auto">
            Gas benchmarks are populated exclusively from live on-chain measurements. Run <code className="bg-zinc-200 text-zinc-800 px-1 py-0.5 rounded">node scripts/gas-scaling-benchmark.js</code> to generate real metrics.
          </p>
        </div>
      ) : (
        <>
          {/* SVG Chart */}
          <div className="gas-chart-container relative bg-zinc-50 rounded-lg border border-zinc-200 p-3 overflow-hidden">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-full"
              aria-label="Gas benchmark chart"
            >
              {/* Grid lines */}
              {yTicks.map((tick, i) => {
                const y = getY(tick);
                return (
                  <g key={i}>
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
              {benchmarks.map((d) => {
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
              {benchmarks.map((d) => {
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
                    <th className="text-emerald-600">TEE Aggregation</th>
                  </tr>
                </thead>
                <tbody>
                  {benchmarks.map((row) => (
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
        </>
      )}
    </div>
  );
}
