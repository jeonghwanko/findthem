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

export const APT_NATIVE_COIN_TYPE = '0x1::aptos_coin::AptosCoin'
export const APT_DECIMALS = 8

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
