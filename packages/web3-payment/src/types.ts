export interface TransferVerifyResult {
  verified: boolean
  actualAmount: bigint
  /** true when TX not yet indexed (EVM receipt timeout) */
  pending?: boolean
}
