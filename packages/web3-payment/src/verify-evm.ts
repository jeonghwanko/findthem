import { createPublicClient, http, fallback, type Transport, WaitForTransactionReceiptTimeoutError } from 'viem'
import * as chains from 'viem/chains'
import type { SupportedChainId } from './constants.js'
import type { TransferVerifyResult } from './types.js'

/** ERC20 Transfer event topic: Transfer(address,address,uint256) */
export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as const

function buildTransports(chainId: number, customRpcUrl?: string): Transport[] {
  const ts: Transport[] = []
  if (customRpcUrl) ts.push(http(customRpcUrl))
  if (chainId === 1) {
    ts.push(http('https://eth.drpc.org'))
    ts.push(http('https://1rpc.io/eth'))
    ts.push(http('https://eth.llamarpc.com'))
    ts.push(http('https://rpc.ankr.com/eth'))
  } else if (chainId === 56) {
    ts.push(http('https://bsc-dataseed.binance.org'))
    ts.push(http('https://bsc-dataseed1.defibit.io'))
    ts.push(http('https://bsc.drpc.org'))
    ts.push(http('https://1rpc.io/bnb'))
  } else if (chainId === 8453) {
    ts.push(http('https://mainnet.base.org'))
    ts.push(http('https://base.drpc.org'))
    ts.push(http('https://1rpc.io/base'))
  }
  return ts
}

function getViemChain(chainId: number) {
  if (chainId === 56) return chains.bsc
  if (chainId === 8453) return chains.base
  return chains.mainnet
}

export async function verifyEvmTransfer(params: {
  txHash: `0x${string}`
  chainId: SupportedChainId
  expectedFrom: string      // lowercase
  expectedTo: string        // lowercase
  tokenContract: string | null  // null or 'ETH'/'BNB' = native; else ERC20 address
  minAmountAtomic: bigint
  rpcUrl?: string
}): Promise<TransferVerifyResult> {
  const { txHash, chainId, tokenContract, minAmountAtomic, rpcUrl } = params
  const from = params.expectedFrom.toLowerCase()
  const to = params.expectedTo.toLowerCase()

  const client = createPublicClient({
    chain: getViemChain(chainId),
    transport: fallback(buildTransports(chainId, rpcUrl)),
  })

  try {
    const receipt = await client.waitForTransactionReceipt({
      hash: txHash,
      timeout: 30_000,
      pollingInterval: 2_000,
    })

    if (receipt.status !== 'success') {
      return { verified: false, actualAmount: 0n }
    }

    const isNative = tokenContract === null || tokenContract === 'ETH' || tokenContract === 'BNB'

    if (isNative) {
      const tx = await client.getTransaction({ hash: txHash })
      const match = tx.to?.toLowerCase() === to && tx.from.toLowerCase() === from && tx.value >= minAmountAtomic
      return { verified: match, actualAmount: tx.value }
    }

    const expectedAddr = tokenContract.toLowerCase()
    let paidSum = 0n
    for (const log of receipt.logs) {
      try {
        if (log.address.toLowerCase() !== expectedAddr) continue
        if (log.topics.length !== 3 || log.topics[0] !== TRANSFER_TOPIC) continue
        const t1 = log.topics[1]
        const t2 = log.topics[2]
        if (!t1 || !t2) continue
        const logFrom = `0x${t1.slice(26)}`.toLowerCase()
        const logTo   = `0x${t2.slice(26)}`.toLowerCase()
        if (logFrom === from && logTo === to) paidSum += BigInt(log.data)
      } catch { continue }
    }
    return { verified: paidSum >= minAmountAtomic, actualAmount: paidSum }

  } catch (e: unknown) {
    if (e instanceof WaitForTransactionReceiptTimeoutError) {
      return { verified: false, actualAmount: 0n, pending: true }
    }
    throw e
  }
}
