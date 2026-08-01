"use client";

import { useState, useEffect, useCallback } from "react";
import { ChartPoint, ChartApiResponse } from "@/app/api/charts/[asset]/route";

export interface UseOracleChartOptions {
  asset: string; // "rGOLD" | "rUSTB" | "rCRE"
  range?: "24h" | "7d" | "30d" | "all";
  pollIntervalMs?: number; // default 30000ms
}

export interface UseOracleChartReturn {
  points: ChartPoint[];
  loading: boolean;
  error: string | null;
  cadence: string;
  heartbeatMs: number;
  lastUpdatedText: string;
  percentageChange: number;
  currentPrice: number;
  realPointCount: number;
  seedPointCount: number;
  refetch: () => Promise<void>;
}

/**
 * Custom React hook for fetching RWA oracle chart data with dynamic cadence reporting.
 */
export function useOracleChart({
  asset,
  range = "7d",
  pollIntervalMs = 30_000,
}: UseOracleChartOptions): UseOracleChartReturn {
  const [data, setData] = useState<ChartApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!asset) return;
    try {
      setError(null);
      const res = await fetch(`/api/charts/${asset}?range=${range}`);
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }
      const json: ChartApiResponse = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err?.message || "Failed to load chart data");
    } finally {
      setLoading(false);
    }
  }, [asset, range]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const interval = setInterval(fetchData, pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchData, pollIntervalMs]);

  // Derived statistics
  const points = data?.points || [];
  const realPointCount = points.filter((p) => p.isRealOnChain).length;
  const seedPointCount = points.length - realPointCount;

  const firstPrice = points.length > 0 ? points[0].price : 0;
  const currentPrice = points.length > 0 ? points[points.length - 1].price : 0;

  const percentageChange =
    firstPrice > 0 ? ((currentPrice - firstPrice) / firstPrice) * 100 : 0;

  // Format honest "Last updated X ago (Cadence Schedule)" text
  let lastUpdatedText = "Updating...";
  if (data?.lastUpdated) {
    const diffMs = Date.now() - data.lastUpdated;
    const diffMins = Math.max(0, Math.floor(diffMs / 60_000));
    const diffHours = Math.floor(diffMins / 60);

    let timeAgo = `${diffMins} min${diffMins === 1 ? "" : "s"} ago`;
    if (diffHours >= 1) {
      timeAgo = `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
    }

    lastUpdatedText = `Updated ${timeAgo} (${data.cadence})`;
  }

  return {
    points,
    loading,
    error,
    cadence: data?.cadence || "Periodic Oracle Feed",
    heartbeatMs: data?.heartbeatMs || 3600_000,
    lastUpdatedText,
    percentageChange,
    currentPrice,
    realPointCount,
    seedPointCount,
    refetch: fetchData,
  };
}
