import type { TransferVerifyResult } from './types.js'
import { isRecord, toStr, toBigIntOrZero } from './utils.js'

const DEFAULT_SOLANA_RPC = 'https://api.mainnet-beta.solana.com'
const TIMEOUT_MS = 10_000

async function rpcCall(url: string, method: string, params: unknown[]): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) throw new Error(`Solana RPC HTTP ${String(res.status)}`)
  const json: unknown = await res.json()
  if (isRecord(json) && isRecord(json.error) && typeof json.error.message === 'string') {
    throw new Error(`Solana RPC: ${json.error.message}`)
  }
  return isRecord(json) ? json.result : null
}

export async function verifySolanaTransfer(params: {
  txHash: string
  expectedPayer: string
  expectedRecipient: string
  tokenMint: string | null   // null = SOL native
  minAmountAtomic: bigint
  rpcUrl?: string
}): Promise<TransferVerifyResult> {
  const { txHash, expectedPayer, expectedRecipient, tokenMint, minAmountAtomic, rpcUrl } = params
  const url = rpcUrl ?? DEFAULT_SOLANA_RPC

  const tx = await rpcCall(url, 'getTransaction', [
    txHash,
    { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
  ])

  if (!tx) throw new Error('TX_NOT_FOUND_ON_CHAIN')
  const txRec = isRecord(tx) ? tx : null
  const meta = isRecord(txRec?.meta) ? txRec.meta : null
  if (meta?.err != null) throw new Error('TX_FAILED_ON_CHAIN')

  const txTransaction = isRecord(txRec?.transaction) ? (txRec!.transaction as Record<string, unknown>) : null
  const msg = isRecord(txTransaction?.message) ? txTransaction.message : null
  const instructions: unknown[] = Array.isArray(isRecord(msg) ? (msg as Record<string, unknown>).instructions : null)
    ? ((msg as Record<string, unknown>).instructions as unknown[])
    : []

  let paidSum = 0n
  const isSol = tokenMint === null || tokenMint === 'SOL'

  if (isSol) {
    for (const ix of instructions) {
      const ixr = isRecord(ix) ? ix : null
      const parsed = isRecord(ixr?.parsed) ? ixr.parsed : null
      if (typeof ixr?.program !== 'string' || ixr.program !== 'system') continue
      if (!parsed || parsed.type !== 'transfer') continue
      const info = isRecord(parsed.info) ? parsed.info : {}
      const source      = typeof info.source === 'string' ? info.source : ''
      const destination = typeof info.destination === 'string' ? info.destination : ''
      const lamports    = toBigIntOrZero(info.lamports)
      if (source === expectedPayer && destination === expectedRecipient) paidSum += lamports
    }
  } else {
    const accountKeys: unknown[] = Array.isArray(isRecord(msg) ? (msg as Record<string, unknown>).accountKeys : null)
      ? ((msg as Record<string, unknown>).accountKeys as unknown[])
      : []
    const keyToStr = (k: unknown) => {
      if (typeof k === 'string') return k
      if (isRecord(k) && typeof k.pubkey === 'string') return k.pubkey
      return ''
    }

    const postTokenBalances: unknown[] = Array.isArray(meta?.postTokenBalances) ? (meta.postTokenBalances as unknown[]) : []
    const postByAccount = new Map<string, unknown>()
    for (const b of postTokenBalances) {
      const br = isRecord(b) ? b : null
      const idx = Number(br?.accountIndex)
      if (!Number.isFinite(idx)) continue
      const pubkey = keyToStr(accountKeys[idx])
      if (pubkey) postByAccount.set(pubkey, b)
    }

    for (const ix of instructions) {
      const ixr = isRecord(ix) ? ix : null
      const parsed = isRecord(ixr?.parsed) ? ixr.parsed as Record<string, unknown> : null
      if (typeof ixr?.program !== 'string' || ixr.program !== 'spl-token') continue
      if (!parsed) continue
      const t = typeof parsed.type === 'string' ? parsed.type : ''
      if (t !== 'transfer' && t !== 'transferChecked') continue
      const info = isRecord(parsed.info) ? parsed.info as Record<string, unknown> : {}
      const authority    = typeof info.authority === 'string' ? info.authority : ''
      const destination  = typeof info.destination === 'string' ? info.destination : ''
      const mintInIx     = typeof info.mint === 'string' ? info.mint : ''
      if (authority !== expectedPayer) continue
      if (mintInIx && mintInIx !== tokenMint) continue

      const destMeta = postByAccount.get(destination)
      if (!destMeta || !isRecord(destMeta)) continue
      const destRecord = destMeta as Record<string, unknown>
      const destOwner = typeof destRecord.owner === 'string' ? destRecord.owner : ''
      const destMint  = typeof destRecord.mint  === 'string' ? destRecord.mint  : ''
      if (destOwner !== expectedRecipient) continue
      if (destMint !== tokenMint) continue

      const amtStr = t === 'transferChecked'
        ? toStr(isRecord(info.tokenAmount) ? (info.tokenAmount as Record<string, unknown>).amount : '0')
        : toStr(info.amount ?? '0')
      const amt = toBigIntOrZero(amtStr)
      if (amt > 0n) paidSum += amt
    }
  }

  return { verified: paidSum >= minAmountAtomic, actualAmount: paidSum }
}
