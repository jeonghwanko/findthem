import { isRecord } from './utils.js'

interface CachedPrice { usd: number; ts: number }

const MEM = new Map<string, CachedPrice>()
const TTL_MS  = 60_000       // 1 minute
const STALE_MS = 600_000     // 10 minutes

const COINGECKO_IDS: Record<string, string> = {
  APT: 'aptos',
  ETH: 'ethereum',
  BNB: 'binancecoin',
  SOL: 'solana',
}

const BINANCE_SYMBOLS: Record<string, string> = {
  APT: 'APTUSDT',
  ETH: 'ETHUSDT',
  BNB: 'BNBUSDT',
  SOL: 'SOLUSDT',
}

async function fetchFromCoinGecko(id: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(5_000) },
    )
    if (!res.ok) return null
    const json: unknown = await res.json().catch(() => null)
    if (!isRecord(json)) return null
    const coin = json[id]
    if (!isRecord(coin)) return null
    const usd = typeof coin.usd === 'number' ? coin.usd : Number.NaN
    return Number.isFinite(usd) && usd > 0 ? usd : null
  } catch {
    return null
  }
}

async function fetchFromBinance(sym: string): Promise<number | null> {
  const symbol = BINANCE_SYMBOLS[sym]
  if (!symbol) return null
  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
      { signal: AbortSignal.timeout(5_000) },
    )
    if (!res.ok) return null
    const json: unknown = await res.json().catch(() => null)
    if (!isRecord(json)) return null
    const price = Number(json.price)
    return Number.isFinite(price) && price > 0 ? price : null
  } catch {
    return null
  }
}

/** @internal — test-only: reset in-memory price cache */
export function _resetPriceCache(): void { MEM.clear() }

/**
 * Get USD price per token unit.
 * Returns 1 for stablecoins (USDC/USDT/USDt).
 * Uses memory → CoinGecko → Binance → stale cache fallback.
 */
export async function getUsdPerToken(symbol: string): Promise<number> {
  const sym = symbol.toUpperCase()
  if (sym === 'USDC' || sym === 'USDT' || sym === 'USDT') return 1

  const id = COINGECKO_IDS[sym]
  if (!id) throw new Error(`USD_PRICE_UNSUPPORTED_SYMBOL_${sym}`)

  const now = Date.now()
  const memKey = `${id}:usd`
  const m = MEM.get(memKey)
  if (m && now - m.ts < TTL_MS) return m.usd

  const usd = await fetchFromCoinGecko(id)
  if (usd) {
    MEM.set(memKey, { usd, ts: now })
    return usd
  }

  const binanceUsd = await fetchFromBinance(sym)
  if (binanceUsd) {
    MEM.set(memKey, { usd: binanceUsd, ts: now })
    return binanceUsd
  }

  if (m && now - m.ts < STALE_MS) return m.usd

  throw new Error(`${sym}_PRICE_USD_NOT_AVAILABLE`)
}
