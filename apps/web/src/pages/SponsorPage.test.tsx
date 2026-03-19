import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// ── Mocks must be declared before component import ──

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
    },
  };
});

vi.mock('wagmi', () => ({
  useAccount: vi.fn(() => ({ address: undefined, isConnected: false, chain: undefined })),
  useSendTransaction: vi.fn(() => ({ sendTransactionAsync: vi.fn() })),
  useWriteContract: vi.fn(() => ({ writeContractAsync: vi.fn() })),
  useSwitchChain: vi.fn(() => ({ switchChainAsync: vi.fn() })),
}));

vi.mock('@rainbow-me/rainbowkit', () => ({
  ConnectButton: {
    Custom: ({ children }: { children: (args: Record<string, unknown>) => React.ReactNode }) =>
      children({
        openConnectModal: vi.fn(),
        openAccountModal: vi.fn(),
        account: null,
        mounted: true,
      }),
  },
}));

vi.mock('@aptos-labs/wallet-adapter-react', () => ({
  useWallet: vi.fn(() => ({
    account: null,
    connected: false,
    signAndSubmitTransaction: vi.fn(),
    connect: vi.fn(),
    wallets: [],
    notDetectedWallets: [],
  })),
}));

vi.mock('../providers/Web3Provider', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@tosspayments/payment-widget-sdk', () => ({
  loadPaymentWidget: vi.fn(() =>
    Promise.resolve({
      renderPaymentMethods: vi.fn(),
      renderAgreement: vi.fn(),
      requestPayment: vi.fn(),
    }),
  ),
}));

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    parseAbi: vi.fn(() => []),
  };
});

import SponsorPage from './SponsorPage';
import { api } from '../api/client';
import { useAccount } from 'wagmi';
import { useWallet } from '@aptos-labs/wallet-adapter-react';

const mockApiGet = vi.mocked(api.get);
const mockApiPost = vi.mocked(api.post);
const mockUseAccount = vi.mocked(useAccount);
const mockUseWallet = vi.mocked(useWallet);

function renderSponsorPage(agentId = 'image-matching') {
  return render(
    <MemoryRouter initialEntries={[`/team/sponsor/${agentId}`]}>
      <Routes>
        <Route path="/team/sponsor/:agentId" element={<SponsorPage />} />
        <Route path="/team" element={<div>팀 페이지</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SponsorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: payment status API succeeds
    mockApiGet.mockResolvedValue({ tossEnabled: true, cryptoEnabled: true });
    // Default: wagmi disconnected
    mockUseAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
      chain: undefined,
    } as ReturnType<typeof useAccount>);
    // Default: aptos disconnected
    mockUseWallet.mockReturnValue({
      account: null,
      connected: false,
      signAndSubmitTransaction: vi.fn(),
      connect: vi.fn(),
      wallets: [],
      notDetectedWallets: [],
    } as ReturnType<typeof useWallet>);
  });

  // ────────────────────────────────────────────────────────
  // 기본 렌더링
  // ────────────────────────────────────────────────────────
  describe('기본 렌더링', () => {
    it('유효한 agentId로 에이전트 정보를 표시한다', async () => {
      renderSponsorPage('image-matching');
      // 에이전트 이름이 title에 포함됨 (i18n 키로 렌더됨)
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });
    });

    it('잘못된 agentId → "찾을 수 없음" 메시지 표시', () => {
      renderSponsorPage('unknown-agent-xyz');
      expect(screen.getByText(/detail\.notFound|찾을 수 없|Not found/i)).toBeInTheDocument();
    });

    it('잘못된 agentId → 팀 페이지 링크 표시', () => {
      renderSponsorPage('unknown-agent-xyz');
      const link = screen.getByRole('link', { name: /backToTeam|팀 페이지|team/i });
      expect(link).toBeInTheDocument();
    });

    it('payment-status API 호출 — agent 있을 때', async () => {
      renderSponsorPage('image-matching');
      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalledWith('/sponsors/payment-status');
      });
    });

    it('payment-status API 실패 시 안전하게 처리 (crash 없음)', async () => {
      mockApiGet.mockRejectedValue(new Error('Network error'));
      expect(() => renderSponsorPage('image-matching')).not.toThrow();
    });
  });

  // ────────────────────────────────────────────────────────
  // 탭 전환
  // ────────────────────────────────────────────────────────
  describe('탭 전환', () => {
    it('기본 탭은 크립토 탭이다', async () => {
      renderSponsorPage('image-matching');
      await waitFor(() => {
        // 크립토 탭 버튼이 활성 스타일
        const cryptoTab = screen.getByRole('button', { name: /tabCrypto|크립토/i });
        expect(cryptoTab.className).toContain('bg-white');
      });
    });

    it('카드 탭 클릭 시 카드 결제 패널이 표시된다', async () => {
      renderSponsorPage('image-matching');

      const cardTab = screen.getByRole('button', { name: /tabCard|카드/i });
      fireEvent.click(cardTab);

      // 카드 탭 패널 — 금액 레이블이 KRW 포함
      await waitFor(() => {
        expect(
          screen.getByText(/amountLabel|후원 금액/i),
        ).toBeInTheDocument();
      });
    });

    it('크립토 탭 클릭 시 크립토 결제 패널이 표시된다', async () => {
      renderSponsorPage('image-matching');

      // 먼저 카드로 전환
      const cardTab = screen.getByRole('button', { name: /tabCard|카드/i });
      fireEvent.click(cardTab);

      // 다시 크립토로
      const cryptoTab = screen.getByRole('button', { name: /tabCrypto|크립토/i });
      fireEvent.click(cryptoTab);

      await waitFor(() => {
        // EVM / Aptos 모드 버튼이 보여야 함
        expect(screen.getByRole('button', { name: 'EVM' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Aptos' })).toBeInTheDocument();
      });
    });
  });

  // ────────────────────────────────────────────────────────
  // 크립토 모드 전환 (EVM / Aptos)
  // ────────────────────────────────────────────────────────
  describe('크립토 모드 전환', () => {
    it('기본 크립토 모드는 EVM이다', async () => {
      renderSponsorPage('image-matching');

      await waitFor(() => {
        const evmBtn = screen.getByRole('button', { name: 'EVM' });
        expect(evmBtn.className).toContain('bg-white');
      });
    });

    it('Aptos 버튼 클릭 → Aptos 모드로 전환', async () => {
      renderSponsorPage('image-matching');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Aptos' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Aptos' }));

      await waitFor(() => {
        const aptosBtn = screen.getByRole('button', { name: 'Aptos' });
        expect(aptosBtn.className).toContain('bg-white');
      });
    });

    it('EVM 모드 — 체인 선택 버튼 표시 (Ethereum, BSC, Base)', async () => {
      renderSponsorPage('image-matching');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Ethereum' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'BSC' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Base' })).toBeInTheDocument();
      });
    });

    it('EVM 모드 — 토큰 선택 버튼 표시 (Ethereum 기본: USDC, USDt, ETH)', async () => {
      renderSponsorPage('image-matching');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'USDC' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'USDt' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'ETH' })).toBeInTheDocument();
      });
    });

    it('Aptos 모드 — APT 토큰 레이블만 표시', async () => {
      renderSponsorPage('image-matching');

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Aptos' }));
      });

      await waitFor(() => {
        // APT span이 표시 (버튼이 아닌 span)
        const aptSpan = screen.getAllByText('APT');
        expect(aptSpan.length).toBeGreaterThan(0);
      });
    });

    it('Aptos 모드 — EVM 체인 선택 버튼 미표시', async () => {
      renderSponsorPage('image-matching');

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Aptos' }));
      });

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Ethereum' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'BSC' })).not.toBeInTheDocument();
      });
    });
  });

  // ────────────────────────────────────────────────────────
  // 금액 프리셋 (크립토)
  // ────────────────────────────────────────────────────────
  describe('크립토 금액 프리셋', () => {
    it('$1, $5, $10, $25 프리셋 버튼이 표시된다', async () => {
      renderSponsorPage('image-matching');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '$1' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '$5' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '$10' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '$25' })).toBeInTheDocument();
      });
    });

    it('기본 선택 금액은 $5 (500 cents)', async () => {
      renderSponsorPage('image-matching');

      await waitFor(() => {
        const fiveBtn = screen.getByRole('button', { name: '$5' });
        // Selected state uses bg-primary-50 border-primary-500
        expect(fiveBtn.className).toMatch(/bg-primary|border-primary/);
      });
    });

    it('$10 클릭 → $10 버튼이 활성화된다', async () => {
      renderSponsorPage('image-matching');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '$10' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: '$10' }));

      await waitFor(() => {
        // $10 selected: bg-primary-50 border-primary-500
        expect(screen.getByRole('button', { name: '$10' }).className).toMatch(/bg-primary|border-primary/);
        // $5 deselected: bg-white border-gray-200
        expect(screen.getByRole('button', { name: '$5' }).className).toContain('bg-white');
      });
    });
  });

  // ────────────────────────────────────────────────────────
  // EVM 체인/토큰 선택
  // ────────────────────────────────────────────────────────
  describe('EVM 체인 선택 시 토큰 목록 변경', () => {
    it('BSC 체인 선택 → BNB 토큰이 나타난다', async () => {
      renderSponsorPage('image-matching');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'BSC' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'BSC' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'BNB' })).toBeInTheDocument();
      });
    });

    it('BSC 선택 → ETH 버튼은 미표시 (BSC는 ETH 없음)', async () => {
      renderSponsorPage('image-matching');

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: 'BSC' }));
      });

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'ETH' })).not.toBeInTheDocument();
      });
    });

    it('Base 체인 선택 → USDt 버튼 미표시 (Base에서 지원 안 함)', async () => {
      renderSponsorPage('image-matching');

      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Base' }));
      });

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'USDt' })).not.toBeInTheDocument();
      });
    });
  });

  // ────────────────────────────────────────────────────────
  // 지갑 미연결 상태에서 결제 버튼
  // ────────────────────────────────────────────────────────
  describe('지갑 미연결 상태', () => {
    it('EVM 지갑 미연결 — 결제 버튼이 disabled 상태', async () => {
      renderSponsorPage('image-matching');

      await waitFor(() => {
        const payBtn = screen.getByRole('button', {
          name: /connectFirst|지갑을 먼저/i,
        });
        expect(payBtn).toBeDisabled();
      });
    });

    it('EVM 미연결 — 지갑 연결 버튼 표시', async () => {
      renderSponsorPage('image-matching');

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /connectWallet|지갑 연결/i }),
        ).toBeInTheDocument();
      });
    });

    it('Aptos 미연결 + 지갑 없음 — Aptos Connect 링크 표시', async () => {
      mockUseWallet.mockReturnValue({
        account: null,
        connected: false,
        signAndSubmitTransaction: vi.fn(),
        connect: vi.fn(),
        wallets: [],
      } as unknown as ReturnType<typeof useWallet>);

      renderSponsorPage('image-matching');

      fireEvent.click(screen.getByRole('button', { name: 'Aptos' }));

      await waitFor(() => {
        const connectLink = screen.getByRole('link', {
          name: /connectWallet|지갑 연결/i,
        });
        expect(connectLink).toBeInTheDocument();
        expect(connectLink).toHaveAttribute('href', 'https://aptosconnect.app');
      });
    });
  });

  // ────────────────────────────────────────────────────────
  // 지갑 연결 상태에서 결제 버튼
  // ────────────────────────────────────────────────────────
  describe('EVM 지갑 연결 상태', () => {
    beforeEach(() => {
      mockUseAccount.mockReturnValue({
        address: '0xabcdef1234567890abcdef1234567890abcdef12',
        isConnected: true,
        chain: { id: 1 },
      } as unknown as ReturnType<typeof useAccount>);
    });

    it('지갑 연결 시 결제 버튼이 활성화된다', async () => {
      renderSponsorPage('image-matching');

      await waitFor(() => {
        const allButtons = screen.getAllByRole('button');
        const payBtn = allButtons.find((btn) => /결제하기/.test(btn.textContent ?? ''));
        expect(payBtn).toBeDefined();
        expect(payBtn).not.toBeDisabled();
      });
    });

    it('결제 버튼에 선택 금액과 토큰 심볼이 표시된다', async () => {
      renderSponsorPage('image-matching');

      // Pay button contains both amount and token symbol (from payBtn i18n key)
      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /\$5.*USDC|USDC.*결제/i }),
        ).toBeInTheDocument();
      });
    });
  });

  // ────────────────────────────────────────────────────────
  // Aptos 지갑 연결 상태
  // ────────────────────────────────────────────────────────
  describe('Aptos 지갑 연결 상태', () => {
    const aptosAddress = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    beforeEach(() => {
      mockUseWallet.mockReturnValue({
        account: {
          address: { toString: () => aptosAddress },
        },
        connected: true,
        signAndSubmitTransaction: vi.fn(),
        connect: vi.fn(),
        wallets: [{ name: 'Petra' }],
        notDetectedWallets: [],
      } as unknown as ReturnType<typeof useWallet>);
    });

    it('Aptos 모드에서 지갑 연결 시 주소 앞뒤 일부 표시', async () => {
      renderSponsorPage('image-matching');
      fireEvent.click(screen.getByRole('button', { name: 'Aptos' }));

      await waitFor(() => {
        const addressEl = screen.getByText(/0x123456.*abcdef/i);
        expect(addressEl).toBeInTheDocument();
      });
    });
  });

  // ────────────────────────────────────────────────────────
  // 닉네임 / 메시지 입력
  // ────────────────────────────────────────────────────────
  describe('닉네임 / 메시지 입력', () => {
    it('닉네임 입력 가능', async () => {
      renderSponsorPage('image-matching');

      const nicknameInput = screen.getByPlaceholderText(/nicknamePlaceholder|익명으로 표시/i);
      fireEvent.change(nicknameInput, { target: { value: '테스터' } });

      expect(nicknameInput).toHaveValue('테스터');
    });

    it('메시지 입력 가능', async () => {
      renderSponsorPage('image-matching');

      const messageInput = screen.getByPlaceholderText(/messagePlaceholder|응원 한마디/i);
      fireEvent.change(messageInput, { target: { value: '파이팅!' } });

      expect(messageInput).toHaveValue('파이팅!');
    });
  });

  // ────────────────────────────────────────────────────────
  // 결제 흐름 — EVM 성공
  // ────────────────────────────────────────────────────────
  describe('EVM 결제 흐름', () => {
    beforeEach(() => {
      mockUseAccount.mockReturnValue({
        address: '0xabcdef1234567890abcdef1234567890abcdef12',
        isConnected: true,
        chain: { id: 1 },
      } as unknown as ReturnType<typeof useAccount>);
    });

    it('결제 버튼 클릭 시 quote API를 호출한다', async () => {
      // Verify that clicking the pay button triggers the quote API call
      // (Full payment flow with wagmi sendTransaction is tested at integration level)
      mockApiPost.mockResolvedValue({
        quoteId: 'q-1',
        merchantWallet: '0xMerchant1234567890abcdef1234567890abcdef',
        amountAtomic: '1000000',
        tokenSymbol: 'USDC',
        chainId: 1,
        tokenContract: null,
        quoteExpiresAt: new Date(Date.now() + 300_000).toISOString(),
      });

      renderSponsorPage('image-matching');

      // Wait for enabled pay button then click
      await waitFor(() => {
        const allButtons = screen.getAllByRole('button');
        const payBtn = allButtons.find((btn) => /결제하기/.test(btn.textContent ?? ''));
        expect(payBtn).not.toBeDisabled();
      });

      const allButtons = screen.getAllByRole('button');
      const payBtn = allButtons.find((btn) => /결제하기/.test(btn.textContent ?? ''));
      fireEvent.click(payBtn!);

      await waitFor(() => {
        expect(mockApiPost).toHaveBeenCalledWith(
          '/sponsors/crypto/quote',
          expect.objectContaining({
            agentId: 'image-matching',
            amountUsdCents: 500,
            tokenSymbol: 'USDC',
            chainId: 1,
          }),
        );
      });
    });

    it('quote 만료 에러 시 quoteExpired 또는 일반 에러 메시지 표시', async () => {
      // Use a quote that's expired (quoteExpiresAt in the past)
      mockApiPost.mockResolvedValue({
        quoteId: 'q-expired',
        merchantWallet: '0xMerchant1234567890abcdef1234567890abcdef',
        amountAtomic: '1000000',
        tokenSymbol: 'USDC',
        chainId: 1,
        tokenContract: null,
        quoteExpiresAt: '2020-01-01T00:00:00.000Z', // definitely expired
      });

      renderSponsorPage('image-matching');

      // Wait for enabled pay button
      let payBtn: HTMLElement | undefined;
      await waitFor(() => {
        const allButtons = screen.getAllByRole('button');
        payBtn = allButtons.find((btn) => /결제하기/.test(btn.textContent ?? ''));
        expect(payBtn).not.toBeDisabled();
      });

      fireEvent.click(payBtn!);

      // After the expired quote is processed, an error message should appear
      // Either quoteExpired ("견적이 만료") or payError ("결제에 실패")
      await waitFor(
        () => {
          const errorEl = screen.queryByText(/견적이 만료|결제에 실패/i);
          expect(errorEl).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });

    it('API quote 호출 실패 시 일반 에러 메시지 표시', async () => {
      mockApiPost.mockRejectedValue(new Error('Network error'));

      renderSponsorPage('image-matching');

      await waitFor(() => {
        const allButtons = screen.getAllByRole('button');
        const payBtn = allButtons.find((btn) => /결제하기/.test(btn.textContent ?? ''));
        expect(payBtn).not.toBeDisabled();
      });

      const allButtons = screen.getAllByRole('button');
      const payBtn = allButtons.find((btn) => /결제하기/.test(btn.textContent ?? ''));
      fireEvent.click(payBtn!);

      await waitFor(
        () => {
          expect(
            screen.queryByText(/payError|결제에 실패/i),
          ).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });
  });

  // ────────────────────────────────────────────────────────
  // 카드 결제 탭 — 금액 프리셋
  // ────────────────────────────────────────────────────────
  describe('카드 결제 탭 — 금액 프리셋', () => {
    it('Toss 프리셋 금액 버튼 4개 표시', async () => {
      renderSponsorPage('image-matching');

      const cardTab = screen.getByRole('button', { name: /tabCard|카드/i });
      fireEvent.click(cardTab);

      await waitFor(() => {
        // 1000, 3000, 5000, 10000
        expect(screen.getByRole('button', { name: '1,000' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '3,000' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '5,000' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '10,000' })).toBeInTheDocument();
      });
    });

    it('프리셋 버튼 클릭 시 해당 금액이 선택된다', async () => {
      renderSponsorPage('image-matching');

      fireEvent.click(screen.getByRole('button', { name: /tabCard|카드/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '10,000' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: '10,000' }));

      await waitFor(() => {
        const btn10k = screen.getByRole('button', { name: '10,000' });
        expect(btn10k.className).toContain('bg-primary-600');
      });
    });

    it('직접 입력 시 숫자만 허용된다', async () => {
      renderSponsorPage('image-matching');
      fireEvent.click(screen.getByRole('button', { name: /tabCard|카드/i }));

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText(/customAmountPlaceholder|직접 입력/i),
        ).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/customAmountPlaceholder|직접 입력/i);
      fireEvent.change(input, { target: { value: 'abc123xyz' } });

      // 숫자만 남아야 함 (컴포넌트가 /[^0-9]/g로 필터링)
      expect(input).toHaveValue('123');
    });
  });

  // ────────────────────────────────────────────────────────
  // 다른 에이전트 ID들
  // ────────────────────────────────────────────────────────
  describe('에이전트 목록', () => {
    it('promotion 에이전트 렌더링', async () => {
      renderSponsorPage('promotion');
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });
      expect(mockApiGet).toHaveBeenCalledWith('/sponsors/payment-status');
    });

    it('chatbot-alert 에이전트 렌더링', async () => {
      renderSponsorPage('chatbot-alert');
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });
    });
  });

  // ────────────────────────────────────────────────────────
  // 팀 페이지 뒤로가기 링크
  // ────────────────────────────────────────────────────────
  describe('네비게이션', () => {
    it('팀 페이지로 돌아가기 링크가 있다', async () => {
      renderSponsorPage('image-matching');

      await waitFor(() => {
        const link = screen.getByRole('link', { name: /backToTeam|팀 페이지로/i });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', '/team');
      });
    });
  });
});
