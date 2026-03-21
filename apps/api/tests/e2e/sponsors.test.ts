import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestApp, authHeader } from '../helpers.js';
import { prisma } from '../../src/db/client.js';
import { clearRateLimitStore } from '../../src/middlewares/rateLimit.js';


// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaMock = prisma as any;

// config mock — tossSecretKey를 항상 설정하여 Toss API 블록이 실행되게 함
vi.mock('../../src/config.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/config.js')>();
  return {
    config: {
      ...original.config,
      tossSecretKey: 'test-toss-secret',
    },
  };
});

// @findthem/web3-payment mock (sponsors.ts가 import함)
vi.mock('@findthem/web3-payment', () => ({
  getUsdPerToken: vi.fn().mockResolvedValue(1),
  toAtomic: vi.fn().mockReturnValue('1000000'),
  fromUsdToTokenAmount: vi.fn().mockReturnValue(1),
  EVM_TOKENS: {},
  SOL_TOKENS: {},
  APT_NATIVE_COIN_TYPE: '0x1::aptos_coin::AptosCoin',
  APT_DECIMALS: 8,
  QUOTE_TTL_SECS: 300,
  SOLANA_USDC_MINT: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  isSupportedChainId: vi.fn().mockReturnValue(false),
  toSupportedChainId: vi.fn().mockReturnValue(1),
  verifyEvmTransfer: vi.fn(),
  verifySolanaTransfer: vi.fn(),
  verifyAptosTransfer: vi.fn(),
}));

const VALID_VERIFY_BODY = {
  paymentKey: 'test-payment-key',
  orderId: `image-matching-test-order-id`,
  amount: 10000,
  agentId: 'image-matching',
  displayName: '테스터',
  message: '응원합니다',
};

describe('Sponsors E2E — POST /api/sponsors/verify (RACE-05)', () => {
  const app = createTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
    clearRateLimitStore();
    prismaMock.user.findUnique.mockResolvedValue({ isBlocked: false });
    // global.fetch 기본값: Toss API 성공
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ totalAmount: 10000 }),
    }) as unknown as typeof fetch;
  });

  describe('정상 결제 확인', () => {
    it('Toss API 성공 + create 성공 → 200 { success: true }', async () => {
      prismaMock.sponsor.create.mockResolvedValue({ id: 'sponsor-1' });

      const res = await app
        .post('/api/sponsors/verify')
        .send(VALID_VERIFY_BODY);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('create 호출 시 올바른 데이터 전달', async () => {
      prismaMock.sponsor.create.mockResolvedValue({ id: 'sponsor-1' });

      await app
        .post('/api/sponsors/verify')
        .send(VALID_VERIFY_BODY);

      expect(prismaMock.sponsor.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            agentId: 'image-matching',
            amount: 10000,
            orderId: VALID_VERIFY_BODY.orderId,
            paymentKey: 'test-payment-key',
            displayName: '테스터',
            message: '응원합니다',
          }),
        }),
      );
    });
  });

  describe('중복 요청 (RACE-05 P2002)', () => {
    it('create가 P2002 던지면 → 400 ALREADY_VERIFIED', async () => {
      const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      prismaMock.sponsor.create.mockRejectedValue(p2002);

      const res = await app
        .post('/api/sponsors/verify')
        .send(VALID_VERIFY_BODY);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ALREADY_VERIFIED');
    });
  });

  describe('Toss API 실패', () => {
    it('Toss API non-ok → 400 PAYMENT_FAILED', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ message: 'invalid paymentKey' }),
      }) as unknown as typeof fetch;

      const res = await app
        .post('/api/sponsors/verify')
        .send(VALID_VERIFY_BODY);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('PAYMENT_FAILED');
    });

    it('Toss amount 불일치 → 400 AMOUNT_MISMATCH', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ totalAmount: 99999 }), // 요청 금액과 다름
      }) as unknown as typeof fetch;

      const res = await app
        .post('/api/sponsors/verify')
        .send(VALID_VERIFY_BODY);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('AMOUNT_MISMATCH');
    });
  });

  describe('유효성 검사', () => {
    it('paymentKey 누락 → 400', async () => {
      const { paymentKey: _, ...body } = VALID_VERIFY_BODY;

      const res = await app
        .post('/api/sponsors/verify')
        .send(body);

      expect(res.status).toBe(400);
    });

    it('amount 범위 미달(99) → 400', async () => {
      const res = await app
        .post('/api/sponsors/verify')
        .send({ ...VALID_VERIFY_BODY, amount: 99 });

      expect(res.status).toBe(400);
    });

    it('잘못된 agentId → 400', async () => {
      const res = await app
        .post('/api/sponsors/verify')
        .send({ ...VALID_VERIFY_BODY, agentId: 'invalid-agent' });

      expect(res.status).toBe(400);
    });
  });

});

describe('Sponsors E2E — GET /api/sponsors', () => {
  const app = createTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ isBlocked: false });
  });

  it('후원자 목록 반환 → 200 배열', async () => {
    prismaMock.sponsor.findMany.mockResolvedValue([
      {
        id: 'sp-1',
        agentId: 'image-matching',
        amount: 10000,
        currency: 'KRW',
        displayName: '테스터',
        message: '화이팅',
        createdAt: new Date('2025-01-01'),
      },
    ]);

    const res = await app.get('/api/sponsors');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty('agentId', 'image-matching');
  });

  it('agentId 쿼리로 필터링 → findMany에 where 조건 전달', async () => {
    prismaMock.sponsor.findMany.mockResolvedValue([]);

    await app.get('/api/sponsors?agentId=promotion');

    expect(prismaMock.sponsor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { agentId: 'promotion' },
      }),
    );
  });
});
