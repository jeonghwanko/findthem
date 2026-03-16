-- CreateTable
CREATE TABLE "sponsor" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KRW',
    "orderId" TEXT NOT NULL,
    "paymentKey" TEXT,
    "txHash" TEXT,
    "chainId" INTEGER,
    "tokenSymbol" TEXT,
    "walletAddress" TEXT,
    "displayName" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sponsor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsor_crypto_quote" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "amountUsdCents" INTEGER NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "tokenSymbol" TEXT NOT NULL,
    "chainId" INTEGER,
    "amountAtomic" TEXT NOT NULL,
    "merchantWallet" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sponsor_crypto_quote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sponsor_orderId_key" ON "sponsor"("orderId");

-- CreateIndex
CREATE INDEX "sponsor_agentId_idx" ON "sponsor"("agentId");

-- CreateIndex
CREATE INDEX "sponsor_crypto_quote_agentId_idx" ON "sponsor_crypto_quote"("agentId");
