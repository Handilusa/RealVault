/**
 * Formats a number with compact suffixes (K, M, B) for large values.
 * Values < 1,000 are shown with full precision.
 * Values >= 1,000 use K/M/B suffixes with up to 2 decimal places.
 *
 * @example
 * formatCompact(500)       → "500.00"
 * formatCompact(1234)      → "1.23K"
 * formatCompact(999800)    → "999.80K"
 * formatCompact(1500000)   → "1.50M"
 * formatCompact(2300000000)→ "2.30B"
 */
export function formatCompact(value: number, decimals = 2): string {
  if (Math.abs(value) < 1_000) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
  if (Math.abs(value) < 1_000_000) {
    return (value / 1_000).toFixed(decimals) + "K";
  }
  if (Math.abs(value) < 1_000_000_000) {
    return (value / 1_000_000).toFixed(decimals) + "M";
  }
  return (value / 1_000_000_000).toFixed(decimals) + "B";
}

/**
 * Formats a USD amount with compact suffixes when large.
 * Prepends $ sign and appends unit label.
 *
 * @example
 * formatUsdCompact(100)     → "$100.00"
 * formatUsdCompact(999800)  → "$999.80K"
 */
export function formatUsdCompact(value: number, unit = ""): string {
  const formatted = formatCompact(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

/**
 * Safely converts an 8-decimal precision oracle/NAV value (priceE8 or navE8) to a JavaScript number.
 * Handles bigint, string, and number input types.
 *
 * @example
 * formatOracleValue(1023000000n) → 10.23
 * formatOracleValue("265050000000") → 2650.50
 * formatOracleValue(10.23) → 10.23
 */
export function formatOracleValue(valueE8: bigint | number | string | undefined | null): number {
  if (valueE8 === undefined || valueE8 === null) return 0;

  if (typeof valueE8 === "bigint") {
    // Convert to string first to prevent integer overflow before division
    const str = valueE8.toString();
    const sign = str.startsWith("-") ? "-" : "";
    const absStr = str.replace("-", "").padStart(9, "0");
    const intPart = absStr.slice(0, -8) || "0";
    const decPart = absStr.slice(-8);
    return parseFloat(`${sign}${intPart}.${decPart}`);
  }

  if (typeof valueE8 === "string") {
    try {
      const b = BigInt(valueE8);
      return formatOracleValue(b);
    } catch {
      const num = Number(valueE8);
      return isNaN(num) ? 0 : num > 1e6 ? num / 1e8 : num;
    }
  }

  // If already a JavaScript number
  if (valueE8 > 1e6) {
    return valueE8 / 1e8;
  }
  return valueE8;
}

/**
 * Formats an 8-decimal oracle value directly as a currency string.
 *
 * @example
 * formatOracleDisplay(265050000000n) → "$2,650.50"
 */
export function formatOracleDisplay(
  valueE8: bigint | number | string | undefined | null,
  decimals = 2,
  prefix = "$"
): string {
  const num = formatOracleValue(valueE8);
  return `${prefix}${num.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

