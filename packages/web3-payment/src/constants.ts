export const EVM_CHAIN_IDS = { ETHEREUM: 1, BSC: 56, BASE: 8453 } as const
export type SupportedChainId = 1 | 56 | 8453

export const EVM_TOKENS: Record<SupportedChainId, Partial<Record<string, { address: string; decimals: number }>>> = {
  1: {
    'USDC': { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6 },
    'USDt': { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', decimals: 6 },
    'ETH':  { address: 'ETH', decimals: 18 },
  },
  56: {
    'USDC': { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
    'USDt': { address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
    'BNB':  { address: 'BNB', decimals: 18 },
  },
  8453: {
    'USDC': { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
    'ETH':  { address: 'ETH', decimals: 18 },
  },
}

export const SOLANA_USDC_MINT    = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
export const SOLANA_USDC_DECIMALS = 6
export const SOLANA_USDT_MINT    = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
export const SOLANA_USDT_DECIMALS = 6

export const SOL_TOKENS: Record<string, { mint: string; decimals: number }> = {
  'USDC': { mint: SOLANA_USDC_MINT, decimals: SOLANA_USDC_DECIMALS },
  'USDt': { mint: SOLANA_USDT_MINT, decimals: SOLANA_USDT_DECIMALS },
  'USDT': { mint: SOLANA_USDT_MINT, decimals: SOLANA_USDT_DECIMALS },
  'SOL':  { mint: 'SOL', decimals: 9 },
}

export { SUPPORTED_PAY_TOKENS, type SupportedPayToken } from '@findthem/shared'

export const QUOTE_TTL_SECS = 300

export function isSupportedChainId(id: number): id is SupportedChainId {
  return id === 1 || id === 56 || id === 8453
}

export function toSupportedChainId(id: number | undefined): SupportedChainId {
  if (id === 56) return 56
  if (id === 8453) return 8453
  return 1
}

/** 체인의 토큰 심볼 목록 */
export function getChainTokenSymbols(chainId: SupportedChainId): string[] {
  return Object.keys(EVM_TOKENS[chainId] ?? {})
}

/** 토큰 컨트랙트 주소. 네이티브 토큰('ETH','BNB')은 null 반환 */
export function getTokenContract(chainId: SupportedChainId, symbol: string): `0x${string}` | null {
  const token = EVM_TOKENS[chainId]?.[symbol]
  if (!token) return null
  if (!token.address.startsWith('0x')) return null // 네이티브 토큰 (ETH, BNB)
  return token.address as `0x${string}`
}

/** 체인 표시 메타데이터 (이름, 네이티브 통화) */
export const EVM_CHAIN_META: Record<SupportedChainId, { name: string; nativeCurrency: string }> = {
  1: { name: 'Ethereum', nativeCurrency: 'ETH' },
  56: { name: 'BNB Chain', nativeCurrency: 'BNB' },
  8453: { name: 'Base', nativeCurrency: 'ETH' },
} as const
