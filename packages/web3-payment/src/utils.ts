export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function toStr(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'bigint') return String(v)
  return ''
}

/**
 * Convert a decimal token amount to atomic units using string parsing.
 * Avoids floating point precision loss for large decimals (e.g., ETH 18 decimals).
 * e.g. toAtomic(1.5, 6) → "1500000"
 */
export function toAtomic(amount: number, decimals: number): string {
  // Use toFixed to get exact string representation
  const str = amount.toFixed(decimals)
  const [whole, frac = ''] = str.split('.')
  const fracPadded = frac.padEnd(decimals, '0').slice(0, decimals)
  const combined = (whole ?? '0') + fracPadded
  // Remove leading zeros but keep at least one digit
  const trimmed = combined.replace(/^0+/, '') || '0'
  return trimmed
}

/**
 * Convert a USD amount to token amount given the USD-per-token rate.
 * e.g. fromUsdToTokenAmount(10, 2000) → 0.005 (ETH)
 */
export function fromUsdToTokenAmount(usdAmount: number, usdPerToken: number): number {
  return usdAmount / usdPerToken
}

export function toBigIntOrZero(v: unknown): bigint {
  try {
    if (typeof v === 'bigint') return v
    if (typeof v === 'number' && Number.isFinite(v)) return BigInt(Math.trunc(v))
    if (typeof v === 'string') return BigInt(v)
  } catch {
    // ignore
  }
  return 0n
}
