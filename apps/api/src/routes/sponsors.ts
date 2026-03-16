import type { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/client.js';
import { config } from '../config.js';
import { validateBody, validateQuery } from '../middlewares/validate.js';
import { ApiError } from '../middlewares/errors.js';
import { ERROR_CODES } from '@findthem/shared';
import { createLogger } from '../logger.js';
import { randomUUID } from 'node:crypto';
import {
  getUsdPerToken,
  toAtomic,
  fromUsdToTokenAmount,
  EVM_TOKENS,
  SOL_TOKENS,
  APT_NATIVE_COIN_TYPE,
  APT_DECIMALS,
  QUOTE_TTL_SECS,
  SOLANA_USDC_MINT,
  isSupportedChainId,
  toSupportedChainId,
  verifyEvmTransfer,
  verifySolanaTransfer,
  verifyAptosTransfer,
} from '@findthem/web3-payment';

const log = createLogger('sponsors');

const cryptoQuoteSchema = z.object({
  agentId: z.enum(['image-matching', 'promotion', 'chatbot-alert']),
  amountUsdCents: z.number().int().min(100).max(10_000_000),
  walletAddress: z.string().min(10).max(200),
  tokenSymbol: z.enum(['APT', 'USDC', 'USDt', 'ETH', 'BNB', 'SOL']),
  chainId: z.number().int().optional(),
});

const cryptoVerifySchema = z.object({
  quoteId: z.string(),
  txHash: z.string().min(10).max(200),
  displayName: z.string().max(30).optional(),
  message: z.string().max(100).optional(),
});

const listQuerySchema = z.object({
  agentId: z.enum(['image-matching', 'promotion', 'chatbot-alert']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const prepareSchema = z.object({
  agentId: z.enum(['image-matching', 'promotion', 'chatbot-alert']),
});

const verifySchema = z.object({
  paymentKey: z.string(),
  orderId: z.string(),
  amount: z.number().int().min(100).max(1_000_000),
  agentId: z.enum(['image-matching', 'promotion', 'chatbot-alert']),
  displayName: z.string().max(30).optional(),
  message: z.string().max(100).optional(),
});

export function registerSponsorRoutes(router: Router) {
  // 후원자 목록 (최신순)
  router.get('/sponsors/payment-status', (_req, res): void => {
    res.json({
      tossEnabled: !!config.tossSecretKey,
      cryptoEnabled: !!(config.merchantWalletEvm || config.merchantWalletAptos),
      evmEnabled: !!config.merchantWalletEvm,
      aptosEnabled: !!config.merchantWalletAptos,
    });
  });

  router.get('/sponsors', validateQuery(listQuerySchema), async (req, res) => {
    const { agentId, limit } = req.query as unknown as z.infer<typeof listQuerySchema>;

    const where = agentId ? { agentId } : {};

    const sponsors = await prisma.sponsor.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        agentId: true,
        amount: true,
        displayName: true,
        message: true,
        createdAt: true,
      },
    });

    res.json(
      sponsors.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })),
    );
  });

  // orderId 생성
  router.post('/sponsors/prepare', validateBody(prepareSchema), (req, res) => {
    const { agentId } = req.body as z.infer<typeof prepareSchema>;
    const orderId = `${agentId}-${randomUUID()}`;

    log.info({ orderId, agentId }, 'Sponsor order prepared');

    res.json({ orderId });
  });

  // Toss 결제 확인 후 DB 저장
  router.post('/sponsors/verify', validateBody(verifySchema), async (req, res) => {
    const { paymentKey, orderId, amount, agentId, displayName, message } =
      req.body as z.infer<typeof verifySchema>;

    // 중복 검증 방지
    const existing = await prisma.sponsor.findUnique({ where: { orderId } });
    if (existing) {
      throw new ApiError(400, ERROR_CODES.ALREADY_VERIFIED);
    }

    // Toss API 호출 (secretKey 없으면 dev 환경에서 스킵)
    if (config.tossSecretKey) {
      const credentials = Buffer.from(`${config.tossSecretKey}:`).toString('base64');

      const tossRes = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ paymentKey, orderId, amount }),
      });

      if (!tossRes.ok) {
        const errBody = await tossRes.json().catch(() => ({}));
        log.warn({ orderId, status: tossRes.status, errBody }, 'Toss payment confirm failed');
        throw new ApiError(400, ERROR_CODES.PAYMENT_FAILED);
      }

      const tossData = (await tossRes.json()) as { totalAmount?: number };
      if (tossData.totalAmount !== amount) {
        log.warn(
          { orderId, expected: amount, received: tossData.totalAmount },
          'Toss amount mismatch',
        );
        throw new ApiError(400, ERROR_CODES.AMOUNT_MISMATCH);
      }
    } else {
      log.warn({ orderId }, 'TOSS_SECRET_KEY not set — skipping Toss API call (dev mode)');
    }

    await prisma.sponsor.create({
      data: { agentId, amount, orderId, paymentKey, displayName, message },
    });

    log.info({ orderId, agentId, amount }, 'Sponsor payment verified and saved');

    res.json({ success: true });
  });

  // 크립토 결제 견적 생성
  router.post('/sponsors/crypto/quote', validateBody(cryptoQuoteSchema), async (req, res) => {
    const { agentId, amountUsdCents, walletAddress, tokenSymbol, chainId } =
      req.body as z.infer<typeof cryptoQuoteSchema>;

    // 체인 판별
    const isAptos = tokenSymbol === 'APT';
    const isSolana = tokenSymbol === 'SOL' || (
      (tokenSymbol === 'USDC' || tokenSymbol === 'USDt') &&
      (!chainId || !isSupportedChainId(chainId))
    );

    let merchantWallet: string;
    let resolvedChainId: number | null;
    let tokenContract: string | null;
    let decimals: number;

    if (isAptos) {
      merchantWallet = config.merchantWalletAptos;
      resolvedChainId = null;
      tokenContract = null;
      decimals = APT_DECIMALS;
    } else if (isSolana) {
      merchantWallet = config.merchantWalletSolana;
      resolvedChainId = null;
      if (tokenSymbol === 'SOL') {
        tokenContract = null;
        decimals = SOL_TOKENS['SOL']?.decimals ?? 9;
      } else {
        // USDC or USDt on Solana
        const solToken = SOL_TOKENS[tokenSymbol];
        tokenContract = solToken?.mint ?? SOLANA_USDC_MINT;
        decimals = solToken?.decimals ?? 6;
      }
    } else {
      // EVM
      merchantWallet = config.merchantWalletEvm;
      const evmChainId = chainId && isSupportedChainId(chainId)
        ? chainId
        : toSupportedChainId(chainId);
      resolvedChainId = evmChainId;
      const evmToken = EVM_TOKENS[evmChainId]?.[tokenSymbol];
      if (!evmToken) {
        throw new ApiError(400, ERROR_CODES.PAYMENT_FAILED);
      }
      tokenContract = evmToken.address === 'ETH' || evmToken.address === 'BNB'
        ? null
        : evmToken.address;
      decimals = evmToken.decimals;
    }

    if (!merchantWallet) {
      throw new ApiError(503, ERROR_CODES.PAYMENT_FAILED);
    }

    const usdPerToken = await getUsdPerToken(tokenSymbol);
    const tokenAmount = fromUsdToTokenAmount(amountUsdCents / 100, usdPerToken);
    const amountAtomic = toAtomic(tokenAmount, decimals);

    const expiresAt = new Date(Date.now() + QUOTE_TTL_SECS * 1000);

    const quote = await prisma.sponsorCryptoQuote.create({
      data: {
        agentId,
        amountUsdCents,
        walletAddress,
        tokenSymbol,
        chainId: resolvedChainId,
        amountAtomic,
        merchantWallet,
        expiresAt,
      },
    });

    log.info({ quoteId: quote.id, tokenSymbol, amountUsdCents }, 'Crypto quote created');

    res.json({
      quoteId: quote.id,
      merchantWallet,
      amountAtomic,
      tokenSymbol,
      chainId: resolvedChainId,
      tokenContract,
      quoteExpiresAt: expiresAt.toISOString(),
    });
  });

  // 크립토 결제 온체인 검증 후 DB 저장
  router.post('/sponsors/crypto/verify', validateBody(cryptoVerifySchema), async (req, res) => {
    const { quoteId, txHash, displayName, message } =
      req.body as z.infer<typeof cryptoVerifySchema>;

    const quote = await prisma.sponsorCryptoQuote.findUnique({ where: { id: quoteId } });
    if (!quote) {
      throw new ApiError(404, ERROR_CODES.QUOTE_NOT_FOUND);
    }

    // 1. 견적 만료 확인
    if (new Date() > quote.expiresAt) {
      throw new ApiError(400, ERROR_CODES.PAYMENT_FAILED);
    }

    // 2. 원자적 선점: verifiedAt이 null인 경우에만 verifiedAt을 설정
    const claimed = await prisma.sponsorCryptoQuote.updateMany({
      where: { id: quoteId, verifiedAt: null },
      data: { verifiedAt: new Date() },
    });
    if (claimed.count === 0) {
      // 이미 처리 중이거나 완료된 견적
      throw new ApiError(400, ERROR_CODES.ALREADY_VERIFIED);
    }

    // 3. TX 해시 중복 체크 (다른 quoteId로 같은 TX 재사용 방지)
    if (txHash) {
      const existingTxSponsor = await prisma.sponsor.findUnique({ where: { txHash } });
      if (existingTxSponsor) {
        // 선점 롤백
        await prisma.sponsorCryptoQuote.update({ where: { id: quoteId }, data: { verifiedAt: null } });
        throw new ApiError(400, ERROR_CODES.ALREADY_VERIFIED);
      }
    }

    const minAmountAtomic = BigInt(quote.amountAtomic);
    const { tokenSymbol, walletAddress, merchantWallet } = quote;

    const isAptos = tokenSymbol === 'APT';
    const isSolana = quote.chainId === null && tokenSymbol !== 'APT';

    let verified = false;
    let actualAmount = 0n;
    let pending = false;

    if (isAptos) {
      try {
        const result = await verifyAptosTransfer({
          txHash,
          expectedFrom: walletAddress,
          expectedTo: merchantWallet,
          coinType: APT_NATIVE_COIN_TYPE,
          minAmountAtomic,
          rpcUrl: config.aptosRpcUrl,
          apiKey: config.aptosRpcApiKey || undefined,
        });
        verified = result.verified;
        actualAmount = result.actualAmount;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : '';
        if (msg === 'TX_NOT_FOUND_ON_CHAIN') {
          pending = true;
        } else {
          throw e;
        }
      }
    } else if (isSolana) {
      let tokenMint: string | null;
      if (tokenSymbol === 'SOL') {
        tokenMint = null;
      } else {
        const solToken = SOL_TOKENS[tokenSymbol];
        tokenMint = solToken?.mint ?? SOLANA_USDC_MINT;
      }
      try {
        const result = await verifySolanaTransfer({
          txHash,
          expectedPayer: walletAddress,
          expectedRecipient: merchantWallet,
          tokenMint,
          minAmountAtomic,
          rpcUrl: config.solanaRpcUrl,
        });
        verified = result.verified;
        actualAmount = result.actualAmount;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : '';
        if (msg === 'TX_NOT_FOUND_ON_CHAIN') {
          pending = true;
        } else {
          throw e;
        }
      }
    } else {
      // EVM
      const chainId = quote.chainId ?? 1;
      if (!isSupportedChainId(chainId)) {
        await prisma.sponsorCryptoQuote.update({ where: { id: quoteId }, data: { verifiedAt: null } });
        throw new ApiError(400, ERROR_CODES.PAYMENT_FAILED);
      }
      const evmToken = EVM_TOKENS[chainId]?.[tokenSymbol];
      const tokenContract = evmToken
        ? (evmToken.address === 'ETH' || evmToken.address === 'BNB' ? null : evmToken.address)
        : null;

      if (!txHash.startsWith('0x')) {
        await prisma.sponsorCryptoQuote.update({ where: { id: quoteId }, data: { verifiedAt: null } });
        throw new ApiError(400, ERROR_CODES.PAYMENT_FAILED);
      }

      const result = await verifyEvmTransfer({
        txHash: txHash as `0x${string}`,
        chainId,
        expectedFrom: walletAddress,
        expectedTo: merchantWallet,
        tokenContract,
        minAmountAtomic,
      });
      verified = result.verified;
      actualAmount = result.actualAmount;
      pending = result.pending ?? false;
    }

    if (pending) {
      // 선점 롤백 (재시도 허용)
      await prisma.sponsorCryptoQuote.update({ where: { id: quoteId }, data: { verifiedAt: null } });
      log.warn({ quoteId, txHash }, 'Crypto TX still pending on chain');
      throw new ApiError(408, ERROR_CODES.PAYMENT_PENDING);
    }

    if (!verified) {
      // 선점 롤백 (재시도 허용)
      await prisma.sponsorCryptoQuote.update({ where: { id: quoteId }, data: { verifiedAt: null } });
      log.warn({ quoteId, txHash, actualAmount: String(actualAmount) }, 'Crypto TX verification failed');
      throw new ApiError(400, ERROR_CODES.AMOUNT_MISMATCH);
    }

    await prisma.sponsor.create({
      data: {
        agentId: quote.agentId,
        amount: quote.amountUsdCents,
        currency: 'USD_CENTS',
        orderId: quoteId,
        txHash,
        chainId: quote.chainId,
        tokenSymbol,
        walletAddress,
        displayName: displayName ?? null,
        message: message ?? null,
      },
    });

    log.info({ quoteId, txHash, tokenSymbol, agentId: quote.agentId }, 'Crypto sponsor payment verified and saved');

    res.json({ success: true });
  });
}
