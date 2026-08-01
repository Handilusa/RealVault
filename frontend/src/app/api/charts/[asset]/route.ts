import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { DEPLOYED_ADDRESSES, createFallbackProvider, ASSET_IDS } from "@/lib/contracts";
import { formatOracleValue } from "@/lib/format";

export interface ChartPoint {
  t: number; // Unix timestamp in ms
  price: number; // Normalized price/NAV float
  isRealOnChain: boolean;
}

export interface ChartApiResponse {
  asset: string;
  range: string;
  cadence: string;
  heartbeatMs: number;
  lastUpdated: number;
  points: ChartPoint[];
}

// In-memory cache for serverless execution
interface CacheEntry {
  timestamp: number;
  data: ChartApiResponse;
}

const CACHE_TTL_MS = 30_000; // 30 seconds
const cacheMap = new Map<string, CacheEntry>();

// Asset Configuration
const ASSET_CONFIGS: Record<
  string,
  {
    name: string;
    cadence: string;
    heartbeatMs: number;
    fallbackPrice: number; // Only used if on-chain oracle is unreachable
    trendType: "market" | "daily_yield" | "weekly_step";
    assetId: string;
    oracleType: "chainlink" | "signedNav";
    annualVolatility: number; // For realistic seed generation
  }
> = {
  rGOLD: {
    name: "rGOLD (Tokenized Gold)",
    cadence: "1h (Chainlink Market Feed)",
    heartbeatMs: 3600_000,
    fallbackPrice: 4044.53,
    trendType: "market",
    assetId: ethers.keccak256(ethers.toUtf8Bytes("rGOLD")),
    oracleType: "chainlink",
    annualVolatility: 0.15, // Gold ~15% annual vol
  },
  rUSTB: {
    name: "rUSTB (US Treasury Bills)",
    cadence: "Daily (24h Signed NAV)",
    heartbeatMs: 86400_000,
    fallbackPrice: 105.42,
    trendType: "daily_yield",
    assetId: ethers.keccak256(ethers.toUtf8Bytes("rUSTB")),
    oracleType: "signedNav",
    annualVolatility: 0.001, // T-Bills near zero vol
  },
  rCRE: {
    name: "rCRE (Commercial Real Estate)",
    cadence: "Weekly (7d Signed NAV)",
    heartbeatMs: 604800_000,
    fallbackPrice: 250.0,
    trendType: "weekly_step",
    assetId: ethers.keccak256(ethers.toUtf8Bytes("rCRE")),
    oracleType: "signedNav",
    annualVolatility: 0.04, // CRE ~4% annual vol
  },
};

const ORACLE_ABI = [
  "function latestPrice(bytes32 assetId) external view returns (uint256 priceE8, uint256 updatedAt, bytes32 sourceId, uint256 confidence, bool settlementEnabled)",
];

/**
 * Fetches the REAL current price from the on-chain oracle (Chainlink or SignedNav).
 * Falls back to the config fallbackPrice if the RPC call fails.
 */
async function fetchLiveOraclePrice(config: typeof ASSET_CONFIGS[string]): Promise<number> {
  try {
    const provider = await createFallbackProvider();
    const oracleAddr =
      config.oracleType === "chainlink"
        ? DEPLOYED_ADDRESSES.contracts.ChainlinkOracle
        : DEPLOYED_ADDRESSES.contracts.SignedNavOracle;

    if (!oracleAddr) return config.fallbackPrice;

    const oracle = new ethers.Contract(oracleAddr, ORACLE_ABI, provider);
    const result = await oracle.latestPrice(config.assetId);
    const price = formatOracleValue(result.priceE8);

    // Sanity check: if oracle returns 0 or negative, use fallback
    return price > 0 ? price : config.fallbackPrice;
  } catch (error) {
    console.warn(`Failed to fetch live oracle price for ${config.name}, using fallback:`, error);
    return config.fallbackPrice;
  }
}

/**
 * Seeded pseudo-random number generator (deterministic per timestamp seed).
 * Produces values in [0, 1). Uses a simple mulberry32 PRNG.
 */
function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates historical baseline chart points using deterministic Geometric Brownian Motion
 * seeded by the asset key and current day. Produces realistic market-like noise scaled to
 * each asset's annualVolatility, while still anchoring start→end to the real oracle price.
 */
function generateHistoricalSeed(
  assetKey: string,
  rangeMs: number,
  nowMs: number,
  currentPrice: number
): ChartPoint[] {
  const config = ASSET_CONFIGS[assetKey];
  if (!config) return [];

  let stepMs = 3600_000; // 1h default for market assets
  if (config.trendType === "daily_yield") {
    stepMs = 86400_000; // 24h
  } else if (config.trendType === "weekly_step") {
    stepMs = 86400_000 * 7; // 7d
  }

  const numSteps = Math.floor(rangeMs / stepMs);
  if (numSteps < 1) return [{ t: nowMs, price: currentPrice, isRealOnChain: false }];

  // Calculate deterministic historical start price based on annual drift rate
  let annualDrift = 0.0;
  if (config.trendType === "market") annualDrift = 0.08;        // Gold ~8% historical trend
  else if (config.trendType === "daily_yield") annualDrift = 0.052; // T-Bills ~5.2% annualized
  else if (config.trendType === "weekly_step") annualDrift = 0.06;  // CRE ~6.0% annualized

  const rangeYears = rangeMs / (365.25 * 24 * 3600_000);
  const startPrice = currentPrice / (1 + annualDrift * rangeYears);
  const startTime = nowMs - rangeMs;

  // Deterministic seed: hash of assetKey + day boundary so chart is stable within a day
  const dayBoundary = Math.floor(nowMs / 86400_000);
  let seedNum = dayBoundary;
  for (let c = 0; c < assetKey.length; c++) seedNum = (seedNum * 31 + assetKey.charCodeAt(c)) | 0;
  const rng = seededRandom(seedNum);

  // Box-Muller transform for Gaussian noise from uniform [0,1) pairs
  const gaussianNoise = (): number => {
    const u1 = Math.max(1e-10, rng()); // avoid log(0)
    const u2 = rng();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  };

  // Step volatility scaled from annual volatility
  const stepsPerYear = (365.25 * 24 * 3600_000) / stepMs;
  const stepVol = config.annualVolatility / Math.sqrt(stepsPerYear);

  // 1) Generate raw GBM path forward from startPrice
  const rawPrices: number[] = [startPrice];
  for (let i = 1; i <= numSteps; i++) {
    const prev = rawPrices[i - 1];
    const drift = annualDrift / stepsPerYear;
    const shock = stepVol * gaussianNoise();
    rawPrices.push(prev * (1 + drift + shock));
  }

  // 2) Bridge-correct so the path ends exactly at currentPrice
  //    Apply linear scaling: correctedPrice[i] = rawPrice[i] * (1 + i/N * (targetRatio - 1))
  const rawEnd = rawPrices[numSteps];
  const targetRatio = currentPrice / rawEnd;
  const points: ChartPoint[] = [];

  for (let i = 0; i <= numSteps; i++) {
    const blend = i / numSteps;
    const correctionFactor = 1 + blend * (targetRatio - 1);
    const price = rawPrices[i] * correctionFactor;
    const t = startTime + i * stepMs;
    points.push({
      t: Math.min(t, nowMs),
      price: Number(price.toFixed(4)),
      isRealOnChain: false,
    });
  }

  return points;
}

/**
 * Fetches verified NavSubmitted on-chain logs from SignedNavOracleAdapter.
 * Filters out extreme initialization artifacts (e.g. initial setup $1.00 or $1000.00 logs).
 */
async function fetchOnChainNavLogs(assetId: string, currentPrice: number): Promise<ChartPoint[]> {
  try {
    const provider = await createFallbackProvider();
    const navOracleAddr = DEPLOYED_ADDRESSES.contracts.SignedNavOracle;
    if (!navOracleAddr) return [];

    const navAbi = [
      "event NavSubmitted(bytes32 indexed assetId, uint256 navE8, uint256 publishedAt, uint256 validUntil, uint256 nonce, address indexed publisher)"
    ];
    const contract = new ethers.Contract(navOracleAddr, navAbi, provider);

    const filter = contract.filters.NavSubmitted(assetId);
    const logs = await contract.queryFilter(filter, DEPLOYED_ADDRESSES.deploymentBlock || 0);

    const realPoints: ChartPoint[] = [];
    for (const log of logs) {
      const eventLog = log as ethers.EventLog;
      if (eventLog.args) {
        const navE8 = eventLog.args[1];
        const publishedAt = Number(eventLog.args[2]) * 1000;
        const normalizedPrice = formatOracleValue(navE8);

        // Filter out extreme outlier setup logs (e.g. test $1.00 vs $105.42)
        if (currentPrice > 0) {
          const ratio = normalizedPrice / currentPrice;
          if (ratio < 0.5 || ratio > 2.0) {
            continue;
          }
        }

        realPoints.push({
          t: publishedAt,
          price: normalizedPrice,
          isRealOnChain: true,
        });
      }
    }

    return realPoints;
  } catch (error) {
    console.warn("Failed to fetch on-chain logs for chart, falling back to seed data:", error);
    return [];
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ asset: string }> }
) {
  const params = await context.params;
  const rawAsset = params?.asset || "";

  // Case-insensitive asset key matching (e.g. rGOLD, RGOLD, rgold)
  const matchedKey =
    Object.keys(ASSET_CONFIGS).find(
      (k) => k.toLowerCase() === rawAsset.toLowerCase()
    ) || rawAsset;

  const searchParams = request.nextUrl.searchParams;
  const range = searchParams.get("range") || "7d";

  const cacheKey = `${matchedKey}:${range}`;
  const now = Date.now();

  // Check 30s in-memory server cache
  const cached = cacheMap.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  const config = ASSET_CONFIGS[matchedKey];
  if (!config) {
    return NextResponse.json(
      { error: `Invalid asset '${rawAsset}'. Valid assets: rGOLD, rUSTB, rCRE` },
      { status: 400 }
    );
  }

  // Calculate range window in milliseconds
  let rangeMs = 7 * 86400_000; // 7d default
  if (range === "24h") rangeMs = 86400_000;
  else if (range === "30d") rangeMs = 30 * 86400_000;
  else if (range === "all") rangeMs = 90 * 86400_000;

  // 1. Fetch the REAL current price from the on-chain oracle
  const livePrice = await fetchLiveOraclePrice(config);

  // 2. Generate seed baseline anchored to real oracle price
  const seedPoints = generateHistoricalSeed(matchedKey, rangeMs, now, livePrice);

  // 3. Fetch verified on-chain logs
  const onChainPoints = await fetchOnChainNavLogs(config.assetId, livePrice);

  // 4. Merge seed baseline with real on-chain points (on-chain overrides overlapping times)
  const mergedMap = new Map<number, ChartPoint>();
  for (const pt of seedPoints) {
    mergedMap.set(pt.t, pt);
  }
  for (const pt of onChainPoints) {
    const roundedT = Math.floor(pt.t / 300_000) * 300_000;
    mergedMap.set(roundedT, pt);
  }

  const points = Array.from(mergedMap.values()).sort((a, b) => a.t - b.t);
  const lastUpdated = points.length > 0 ? points[points.length - 1].t : now;

  const responseData: ChartApiResponse = {
    asset: matchedKey,
    range,
    cadence: config.cadence,
    heartbeatMs: config.heartbeatMs,
    lastUpdated,
    points,
  };

  // Cache response
  cacheMap.set(cacheKey, { timestamp: now, data: responseData });

  return NextResponse.json(responseData);
}
