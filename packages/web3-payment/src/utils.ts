export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function toStr(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'bigint') return String(v)
  return ''
}

/**
 * Convert a decimal token amount to atomic units.
 * e.g. toAtomic(1.5, 6) → "1500000"
 */
export function toAtomic(amount: number, decimals: number): string {
  const factor = Math.pow(10, decimals)
  return String(Math.round(amount * factor))
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
