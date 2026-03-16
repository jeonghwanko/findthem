import type { TransferVerifyResult } from './types.js'
import { isRecord, toBigIntOrZero } from './utils.js'
import { APT_NATIVE_COIN_TYPE } from './constants.js'

const DEFAULT_APTOS_RPC = 'https://fullnode.mainnet.aptoslabs.com/v1'
const TIMEOUT_MS = 15_000

export function normalizeCoinType(s: string): string {
  const trimmed = s.startsWith('fa::') ? s.slice(4) : s
  return trimmed.toLowerCase()
}

export function normalizeAddr64(s: string): string {
  const v = s.replace(/^0x/i, '').toLowerCase()
  if (!v) return ''
  return v.padStart(64, '0')
}

async function fetchTx(txHash: string, rpcUrl: string): Promise<Record<string, unknown>> {
  const url = `${rpcUrl}/transactions/by_hash/${txHash}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
  if (res.status === 404) throw new Error('TX_NOT_FOUND_ON_CHAIN')
  if (!res.ok) throw new Error(`Aptos RPC HTTP ${String(res.status)}`)
  const json: unknown = await res.json()
  if (!isRecord(json)) throw new Error('TX_INVALID_RESPONSE')
  return json
}

export async function verifyAptosTransfer(params: {
  txHash: string
  expectedFrom: string   // 0x-prefixed hex address
  expectedTo: string     // merchant wallet
  coinType: string       // e.g. '0x1::aptos_coin::AptosCoin'
  minAmountAtomic: bigint
  rpcUrl?: string
}): Promise<TransferVerifyResult> {
  const { txHash, expectedFrom, expectedTo, coinType, minAmountAtomic, rpcUrl } = params
  const url = rpcUrl ?? DEFAULT_APTOS_RPC

  const tx = await fetchTx(txHash, url)

  if (typeof tx.type !== 'string' || tx.type !== 'user_transaction') throw new Error('TX_NOT_USER')
  if (tx.success !== true && tx.success !== 'true') throw new Error('TX_NOT_SUCCESS')

  const payload = tx.payload
  if (!isRecord(payload)) throw new Error('TX_NO_PAYLOAD')

  const func = typeof payload.function === 'string' ? payload.function : ''

  const ALLOWED_TRANSFER_FUNCS = new Set([
    '0x1::coin::transfer',
    '0x1::aptos_account::transfer',
  ])
  if (!ALLOWED_TRANSFER_FUNCS.has(func)) throw new Error('TX_NOT_TRANSFER')

  const args: unknown[] = Array.isArray(payload.arguments) ? payload.arguments : []
  const tyArgs: string[] = Array.isArray(payload.type_arguments)
    ? payload.type_arguments.filter((t): t is string => typeof t === 'string')
    : []

  // coin::transfer<CoinType>(to, amount) or aptos_account::transfer(to, amount)
  const isAptosCoinTransfer = func === '0x1::coin::transfer'
  const isAptosAccountTransfer = func === '0x1::aptos_account::transfer'
  // aptos_account::transfer is APT-only (no type argument needed)
  const expectedCoinType = isAptosCoinTransfer ? (tyArgs[0] ?? '') : (isAptosAccountTransfer ? APT_NATIVE_COIN_TYPE : '')
  const toAddr = typeof args[0] === 'string' ? args[0] : ''
  const amount = typeof args[1] === 'string' ? args[1]
    : typeof args[1] === 'number' ? String(args[1]) : '0'

  if (normalizeCoinType(expectedCoinType) !== normalizeCoinType(coinType)) {
    return { verified: false, actualAmount: 0n }
  }

  const senderNorm   = normalizeAddr64(typeof tx.sender === 'string' ? tx.sender : '')
  const fromNorm     = normalizeAddr64(expectedFrom)
  const toNorm       = normalizeAddr64(toAddr)
  const merchantNorm = normalizeAddr64(expectedTo)

  if (senderNorm !== fromNorm) return { verified: false, actualAmount: 0n }
  if (toNorm !== merchantNorm) return { verified: false, actualAmount: 0n }

  const paid = toBigIntOrZero(amount)
  return { verified: paid >= minAmountAtomic, actualAmount: paid }
}
