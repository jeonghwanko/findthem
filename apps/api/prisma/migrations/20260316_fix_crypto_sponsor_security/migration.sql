-- Fix 1: Add @unique constraint to sponsor.txHash (TX reuse prevention)
CREATE UNIQUE INDEX IF NOT EXISTS "sponsor_txHash_key" ON "sponsor"("txHash") WHERE "txHash" IS NOT NULL;

-- Fix 2: Add verifiedAt field to sponsor_crypto_quote (TOCTOU prevention)
ALTER TABLE "sponsor_crypto_quote" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3);
