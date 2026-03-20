import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestApp, authHeader } from '../helpers.js';
import { prisma } from '../../src/db/client.js';

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

// @findthem/web3-payment mock
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
  orderId: `image-matching-xp-order-id`,
  amount: 10000,
  agentId: 'image-matching',
  displayName: '테스터',
  message: '응원합니다',
};

describe('Sponsors E2E — XP 지급 통합', () => {
  const app = createTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ isBlocked: false });
    // global.fetch 기본값: Toss API 성공
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ totalAmount: 10000 }),
    }) as unknown as typeof fetch;
    // XP 관련 mock — grantXp 내부 (SPONSOR dailyLimit:null → xpLog.create)
    prismaMock.xpLog = {
      create: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    };
    prismaMock.$executeRaw = vi.fn().mockResolvedValue(1);
    prismaMock.$queryRaw = vi.fn().mockResolvedValue([{ sponsorXp: 0 }]);
    prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      return callback(prismaMock);
    });
    prismaMock.user.update.mockResolvedValue({});
  });

  it('로그인 유저의 Toss 결제 성공 시 SPONSOR XP 지급 시도 (fire-and-forget)', async () => {
    prismaMock.sponsor.create.mockResolvedValue({ id: 'sponsor-xp-1' });

    const res = await app
      .post('/api/sponsors/verify')
      .set('Authorization', authHeader())
      .send(VALID_VERIFY_BODY);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // fire-and-forget 실행 대기
    await new Promise((r) => setTimeout(r, 20));
    // amount=10000 KRW → xpAmount = Math.floor(10000/100) * XP_PER_KRW_100 > 0
    // SPONSOR는 dailyLimit:null → xpLog.create 호출
    expect(prismaMock.xpLog.create).toHaveBeenCalled();
  });

  it('비로그인 유저의 결제 성공 시 XP 미지급 + 결제는 성공', async () => {
    prismaMock.sponsor.create.mockResolvedValue({ id: 'sponsor-anon-1' });

    const res = await app
      .post('/api/sponsors/verify')
      // Authorization 헤더 없음
      .send(VALID_VERIFY_BODY);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    // 비로그인이므로 XP 지급 없음
    expect(prismaMock.xpLog.create).not.toHaveBeenCalled();
  });

  it('XP 지급 실패해도 결제 응답은 성공 (fire-and-forget)', async () => {
    prismaMock.sponsor.create.mockResolvedValue({ id: 'sponsor-err-1' });
    // grantXp 내부에서 에러 발생 — xpLog.create 실패
    prismaMock.xpLog.create.mockRejectedValue(new Error('DB error'));

    const res = await app
      .post('/api/sponsors/verify')
      .set('Authorization', authHeader())
      .send(VALID_VERIFY_BODY);

    // XP 실패와 무관하게 결제는 성공
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('amount=100 KRW (최소 결제) → XP 지급 (xpAmount > 0)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ totalAmount: 100 }),
    }) as unknown as typeof fetch;

    prismaMock.sponsor.create.mockResolvedValue({ id: 'sponsor-min-1' });

    const res = await app
      .post('/api/sponsors/verify')
      .set('Authorization', authHeader())
      .send({ ...VALID_VERIFY_BODY, amount: 100 });

    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));
    expect(prismaMock.xpLog.create).toHaveBeenCalled();
  });
});
