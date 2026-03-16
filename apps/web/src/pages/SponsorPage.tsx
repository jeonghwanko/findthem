import { useState, useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ScanFace, Megaphone, MessageSquare, ArrowLeft, Copy, CheckCircle } from 'lucide-react';
import { loadPaymentWidget, type PaymentWidgetInstance } from '@tosspayments/payment-widget-sdk';
import { api, type AgentId } from '../api/client';

interface AgentConfig {
  id: AgentId;
  nameKey: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
}

const AGENTS: AgentConfig[] = [
  {
    id: 'image-matching',
    nameKey: 'team.agentImageMatching.name',
    icon: ScanFace,
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-500',
  },
  {
    id: 'promotion',
    nameKey: 'team.agentPromotion.name',
    icon: Megaphone,
    iconBg: 'bg-pink-50',
    iconColor: 'text-pink-500',
  },
  {
    id: 'chatbot-alert',
    nameKey: 'team.agentChatbotAlert.name',
    icon: MessageSquare,
    iconBg: 'bg-green-50',
    iconColor: 'text-green-500',
  },
];

const TOSS_PRESET_AMOUNTS = [1000, 3000, 5000, 10000];

// USD cents presets: $1 / $5 / $10 / $25
const CRYPTO_USD_PRESETS = [100, 500, 1000, 2500];

type TokenSymbol = 'ETH' | 'USDC' | 'USDt' | 'BNB' | 'SOL' | 'APT';

interface TokenOption {
  symbol: TokenSymbol;
  label: string;
  chains?: { id: number; label: string }[];
}

const TOKEN_OPTIONS: TokenOption[] = [
  { symbol: 'ETH', label: 'ETH', chains: [{ id: 1, label: 'Ethereum' }, { id: 8453, label: 'Base' }] },
  { symbol: 'USDC', label: 'USDC', chains: [{ id: 1, label: 'Ethereum' }, { id: 56, label: 'BSC' }, { id: 8453, label: 'Base' }] },
  { symbol: 'USDt', label: 'USDt', chains: [{ id: 1, label: 'Ethereum' }, { id: 56, label: 'BSC' }] },
  { symbol: 'BNB', label: 'BNB', chains: [{ id: 56, label: 'BSC' }] },
  { symbol: 'SOL', label: 'SOL' },
  { symbol: 'APT', label: 'APT' },
];

interface CryptoQuote {
  quoteId: string;
  merchantWallet: string;
  amountAtomic: string;
  tokenSymbol: string;
  chainId: number | null;
  tokenContract: string | null;
  quoteExpiresAt: string;
  displayAmount: string;
}

function formatAtomicAmount(amountAtomic: string, tokenSymbol: string, chainId: number | null): string {
  // decimals per token
  const decimalsMap: Record<string, number> = {
    ETH: 18, BNB: 18, SOL: 9, APT: 8,
    USDC: chainId === 56 ? 18 : 6,
    USDt: chainId === 56 ? 18 : 6,
  };
  const dec = decimalsMap[tokenSymbol] ?? 6;
  const raw = BigInt(amountAtomic);
  const factor = BigInt(10 ** dec);
  const whole = raw / factor;
  const frac = raw % factor;
  if (frac === 0n) return `${whole.toString()} ${tokenSymbol}`;
  const fracStr = frac.toString().padStart(dec, '0').replace(/0+$/, '');
  return `${whole.toString()}.${fracStr} ${tokenSymbol}`;
}

export default function SponsorPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const { t } = useTranslation();

  const agent = AGENTS.find((a) => a.id === agentId);

  // Payment method tab
  const [tab, setTab] = useState<'toss' | 'crypto'>('toss');

  // ── Toss state ──
  const [tossAmount, setTossAmount] = useState<number>(3000);
  const [tossCustomAmount, setTossCustomAmount] = useState('');
  const [tossPaying, setTossPaying] = useState(false);
  const [tossError, setTossError] = useState<string | null>(null);
  const widgetRef = useRef<PaymentWidgetInstance | null>(null);

  // ── Crypto state ──
  const [cryptoUsdCents, setCryptoUsdCents] = useState<number>(500);
  const [selectedToken, setSelectedToken] = useState<TokenSymbol>('USDC');
  const [selectedChainId, setSelectedChainId] = useState<number | undefined>(1);
  const [walletAddress, setWalletAddress] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [message, setMessage] = useState('');
  const [cryptoQuote, setCryptoQuote] = useState<CryptoQuote | null>(null);
  const [txHash, setTxHash] = useState('');
  const [cryptoLoading, setCryptoLoading] = useState(false);
  const [cryptoError, setCryptoError] = useState<string | null>(null);
  const [cryptoSuccess, setCryptoSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  // 결제 기능 활성화 여부
  const [tossEnabled, setTossEnabled] = useState<boolean | null>(null);
  const [cryptoEnabled, setCryptoEnabled] = useState<boolean | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ tossEnabled: boolean; cryptoEnabled: boolean }>('/sponsors/payment-status')
      .then((res) => { setTossEnabled(res.tossEnabled); setCryptoEnabled(res.cryptoEnabled); })
      .catch(() => { setTossEnabled(false); setCryptoEnabled(false); });
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // Load Toss widget when tab = toss
  useEffect(() => {
    if (tab !== 'toss') return;
    const clientKey = import.meta.env.VITE_TOSS_CLIENT_KEY as string | undefined;
    if (!clientKey || !tossAmount) return;

    let cancelled = false;

    loadPaymentWidget(clientKey, 'ANONYMOUS')
      .then((widget) => {
        if (cancelled) return;
        widgetRef.current = widget;
        widget.renderPaymentMethods('#payment-widget', { value: tossAmount }, { variantKey: 'DEFAULT' });
        widget.renderAgreement('#agreement');
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [tab, tossAmount]);

  // Reset chain when token changes
  useEffect(() => {
    const token = TOKEN_OPTIONS.find((t) => t.symbol === selectedToken);
    if (token?.chains && token.chains.length > 0) {
      setSelectedChainId(token.chains[0].id);
    } else {
      setSelectedChainId(undefined);
    }
    setCryptoQuote(null);
  }, [selectedToken]);

  const handleTossPreset = (preset: number) => {
    setTossAmount(preset);
    setTossCustomAmount('');
  };

  const handleTossCustom = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    setTossCustomAmount(val);
    const num = parseInt(val, 10);
    if (!isNaN(num) && num > 0) setTossAmount(num);
  };

  const handleTossPay = async () => {
    if (tossEnabled === false) {
      showToast(t('sponsor.paymentNotReady'));
      return;
    }
    if (!widgetRef.current) {
      setTossError(t('sponsor.processing'));
      return;
    }
    setTossPaying(true);
    setTossError(null);
    try {
      const result = await api.post<{ orderId: string }>('/sponsors/prepare', { agentId: agentId ?? '' });
      const agentName = agent ? t(agent.nameKey) : (agentId ?? '');
      const successUrl = new URL('/team/sponsor/success', window.location.origin);
      successUrl.searchParams.set('agentId', agentId ?? '');
      successUrl.searchParams.set('displayName', displayName);
      successUrl.searchParams.set('message', message);

      await widgetRef.current.requestPayment({
        orderId: result.orderId,
        orderName: `${agentName} ${t('sponsor.title', { name: '' }).trim()}`,
        successUrl: successUrl.toString(),
        failUrl: `${window.location.origin}/team/sponsor/${agentId ?? ''}`,
      });
    } catch (err) {
      setTossError(err instanceof Error ? err.message : t('auth.errorFallback'));
      setTossPaying(false);
    }
  };

  const handleGetQuote = async () => {
    if (cryptoEnabled === false) {
      showToast(t('sponsor.paymentNotReady'));
      return;
    }
    if (!walletAddress.trim()) {
      setCryptoError(t('sponsor.crypto.walletRequired'));
      return;
    }
    setCryptoLoading(true);
    setCryptoError(null);
    setCryptoQuote(null);
    try {
      const body: Record<string, unknown> = {
        agentId: agentId ?? '',
        amountUsdCents: cryptoUsdCents,
        walletAddress: walletAddress.trim(),
        tokenSymbol: selectedToken,
      };
      if (selectedChainId !== undefined) body.chainId = selectedChainId;

      const result = await api.post<CryptoQuote>('/sponsors/crypto/quote', body);
      result.displayAmount = formatAtomicAmount(result.amountAtomic, result.tokenSymbol, result.chainId);
      setCryptoQuote(result);
    } catch {
      setCryptoError(t('sponsor.crypto.quoteError'));
    } finally {
      setCryptoLoading(false);
    }
  };

  const handleCopyWallet = async () => {
    if (!cryptoQuote) return;
    await navigator.clipboard.writeText(cryptoQuote.merchantWallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCryptoVerify = async () => {
    if (!cryptoQuote || !txHash.trim()) {
      setCryptoError(t('sponsor.crypto.txHashRequired'));
      return;
    }
    setCryptoLoading(true);
    setCryptoError(null);
    try {
      await api.post('/sponsors/crypto/verify', {
        quoteId: cryptoQuote.quoteId,
        txHash: txHash.trim(),
        displayName: displayName || undefined,
        message: message || undefined,
      });
      setCryptoSuccess(true);
    } catch {
      setCryptoError(t('sponsor.crypto.verifyError'));
    } finally {
      setCryptoLoading(false);
    }
  };

  if (!agent) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <p className="text-gray-500">{t('detail.notFound')}</p>
        <Link to="/team" className="mt-4 inline-block text-primary-600 hover:underline">
          {t('sponsor.backToTeam')}
        </Link>
      </div>
    );
  }

  const Icon = agent.icon;
  const currentToken = TOKEN_OPTIONS.find((tk) => tk.symbol === selectedToken);

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      {/* 토스트 */}
      {toast && (
        <div className="fixed top-6 left-1/2 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg animate-fade-in whitespace-nowrap">
          {toast}
        </div>
      )}

      {/* 뒤로가기 */}
      <Link
        to="/team"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        {t('sponsor.backToTeam')}
      </Link>

      {/* 에이전트 정보 */}
      <div className="flex items-center gap-3 mb-6">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${agent.iconBg}`}>
          <Icon className={`w-7 h-7 ${agent.iconColor}`} aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">
          {t('sponsor.title', { name: t(agent.nameKey) })}
        </h1>
      </div>

      {/* 결제 방식 탭 */}
      <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
        <button
          type="button"
          onClick={() => setTab('toss')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
            tab === 'toss' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {t('sponsor.tabCard')}
        </button>
        <button
          type="button"
          onClick={() => setTab('crypto')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
            tab === 'crypto' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {t('sponsor.tabCrypto')}
        </button>
      </div>

      {/* ── Toss 결제 ── */}
      {tab === 'toss' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              {t('sponsor.amountLabel')}
            </label>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {TOSS_PRESET_AMOUNTS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleTossPreset(preset)}
                  className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                    tossAmount === preset && !tossCustomAmount
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-primary-400'
                  }`}
                >
                  {preset.toLocaleString()}
                </button>
              ))}
            </div>
            <input
              type="text"
              inputMode="numeric"
              value={tossCustomAmount}
              onChange={handleTossCustom}
              placeholder={t('sponsor.customAmountPlaceholder')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('sponsor.nicknameLabel')}
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('sponsor.nicknamePlaceholder')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('sponsor.messageLabel')}
            </label>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('sponsor.messagePlaceholder')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>

          <div id="payment-widget" />
          <div id="agreement" />

          {tossError && <p className="text-sm text-red-500">{tossError}</p>}

          <button
            type="button"
            onClick={() => { void handleTossPay(); }}
            disabled={tossPaying || !tossAmount}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium py-3 rounded-lg transition-colors"
          >
            {tossPaying ? t('sponsor.processing') : t('sponsor.submit')}
          </button>
        </div>
      )}

      {/* ── 크립토 결제 ── */}
      {tab === 'crypto' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">

          {cryptoSuccess ? (
            <div className="text-center py-6">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" aria-hidden="true" />
              <p className="text-lg font-semibold text-gray-900">{t('sponsor.successTitle')}</p>
              <p className="text-sm text-gray-500 mt-1">{t('sponsor.successDesc', { name: t(agent.nameKey) })}</p>
              <Link to="/team" className="mt-4 inline-block text-primary-600 hover:underline text-sm">
                {t('sponsor.backToTeam')}
              </Link>
            </div>
          ) : (
            <>
              {/* USD 금액 선택 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  {t('sponsor.crypto.amountLabel')}
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {CRYPTO_USD_PRESETS.map((cents) => (
                    <button
                      key={cents}
                      type="button"
                      onClick={() => { setCryptoUsdCents(cents); setCryptoQuote(null); }}
                      className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                        cryptoUsdCents === cents
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-primary-400'
                      }`}
                    >
                      ${(cents / 100).toFixed(0)}
                    </button>
                  ))}
                </div>
              </div>

              {/* 토큰 선택 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('sponsor.crypto.tokenLabel')}
                </label>
                <div className="flex flex-wrap gap-2">
                  {TOKEN_OPTIONS.map((tk) => (
                    <button
                      key={tk.symbol}
                      type="button"
                      onClick={() => setSelectedToken(tk.symbol)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        selectedToken === tk.symbol
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-primary-400'
                      }`}
                    >
                      {tk.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 체인 선택 (EVM 토큰만) */}
              {currentToken?.chains && currentToken.chains.length > 1 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('sponsor.crypto.chainLabel')}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {currentToken.chains.map((chain) => (
                      <button
                        key={chain.id}
                        type="button"
                        onClick={() => { setSelectedChainId(chain.id); setCryptoQuote(null); }}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                          selectedChainId === chain.id
                            ? 'bg-gray-800 text-white border-gray-800'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                        }`}
                      >
                        {chain.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 지갑 주소 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('sponsor.crypto.walletLabel')}
                </label>
                <input
                  type="text"
                  value={walletAddress}
                  onChange={(e) => { setWalletAddress(e.target.value); setCryptoQuote(null); }}
                  placeholder={t('sponsor.crypto.walletPlaceholder')}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* 견적 결과 */}
              {cryptoQuote && (
                <div className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {t('sponsor.crypto.quoteTitle')}
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs text-gray-500 shrink-0">{t('sponsor.crypto.sendAmount')}</span>
                      <span className="text-sm font-bold text-gray-900 text-right">{cryptoQuote.displayAmount}</span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs text-gray-500 shrink-0">{t('sponsor.crypto.sendTo')}</span>
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-xs font-mono text-gray-700 truncate max-w-[200px]">
                          {cryptoQuote.merchantWallet}
                        </span>
                        <button
                          type="button"
                          onClick={() => { void handleCopyWallet(); }}
                          className="shrink-0 text-gray-400 hover:text-gray-700 transition-colors"
                          title={t('share.copyLink')}
                        >
                          {copied
                            ? <CheckCircle className="w-3.5 h-3.5 text-green-500" aria-hidden="true" />
                            : <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                          }
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-amber-600">
                      {t('sponsor.crypto.expiresAt', {
                        time: new Date(cryptoQuote.quoteExpiresAt).toLocaleTimeString(),
                      })}
                    </p>
                  </div>

                  {/* txHash 입력 */}
                  <div className="pt-2 border-t border-gray-200">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      {t('sponsor.crypto.txHashLabel')}
                    </label>
                    <input
                      type="text"
                      value={txHash}
                      onChange={(e) => setTxHash(e.target.value)}
                      placeholder={t('sponsor.crypto.txHashPlaceholder')}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>

                  {/* 닉네임 / 메시지 */}
                  <div className="space-y-2 pt-2 border-t border-gray-200">
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={t('sponsor.nicknamePlaceholder')}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <textarea
                      rows={2}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={t('sponsor.messagePlaceholder')}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                    />
                  </div>

                  {cryptoError && <p className="text-sm text-red-500">{cryptoError}</p>}

                  <button
                    type="button"
                    onClick={() => { void handleCryptoVerify(); }}
                    disabled={cryptoLoading || !txHash.trim()}
                    className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
                  >
                    {cryptoLoading ? t('sponsor.processing') : t('sponsor.crypto.verifyBtn')}
                  </button>
                </div>
              )}

              {!cryptoQuote && (
                <>
                  {cryptoError && <p className="text-sm text-red-500">{cryptoError}</p>}
                  <button
                    type="button"
                    onClick={() => { void handleGetQuote(); }}
                    disabled={cryptoLoading || !walletAddress.trim()}
                    className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium py-3 rounded-lg transition-colors"
                  >
                    {cryptoLoading ? t('sponsor.processing') : t('sponsor.crypto.quoteBtn')}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
