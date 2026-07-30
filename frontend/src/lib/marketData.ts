"use client";

/**
 * Verified Real-time Market Data Feed
 * 
 * Source:
 * - US Treasury Bills: Official US Treasury FiscalData API (avg_interest_rates)
 * 
 * Returns exact official rate or null when API is unreachable.
 */

export interface MarketDataPoint {
  treasuryYield: number | null; // e.g. 3.706 (%)
  treasuryDate: string | null;  // e.g. "2026-06-30"
  lastFetched: number;          // Unix timestamp
  source: "official_api" | "unavailable";
}

const CACHE_KEY = "rv_market_data";
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function getCachedData(): MarketDataPoint | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MarketDataPoint;
    if (Date.now() - parsed.lastFetched < CACHE_TTL_MS) return parsed;
    return null;
  } catch {
    return null;
  }
}

function setCachedData(data: MarketDataPoint) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // localStorage disabled/full
  }
}

/**
 * Fetch real US Treasury Bill yield from the official US Treasury FiscalData API.
 */
export async function fetchMarketData(): Promise<MarketDataPoint> {
  const cached = getCachedData();
  if (cached) return cached;

  try {
    const res = await fetch(
      "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?" +
      "filter=security_desc:eq:Treasury Bills&sort=-record_date&page[size]=1",
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error(`Treasury API ${res.status}`);
    const json = await res.json();
    const record = json.data?.[0];
    if (record && record.avg_interest_rate_amt) {
      const data: MarketDataPoint = {
        treasuryYield: parseFloat(record.avg_interest_rate_amt),
        treasuryDate: record.record_date,
        lastFetched: Date.now(),
        source: "official_api",
      };
      setCachedData(data);
      return data;
    }
  } catch (err) {
    console.warn("Official US Treasury API fetch failed:", err);
  }

  return {
    treasuryYield: null,
    treasuryDate: null,
    lastFetched: Date.now(),
    source: "unavailable",
  };
}

