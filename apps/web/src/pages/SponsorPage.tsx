import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ScanFace, Megaphone, MessageSquare, ArrowLeft, CheckCircle, Wallet, Loader2 } from 'lucide-react';
import { loadPaymentWidget, type PaymentWidgetInstance } from '@tosspayments/payment-widget-sdk';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useSendTransaction, useWriteContract, useSwitchChain } from 'wagmi';
import { parseAbi } from 'viem';
import { useWallet as useAptosWallet } from '@aptos-labs/wallet-adapter-react';
import { api, type AgentId } from '../api/client';
import Web3Provider from '../providers/Web3Provider';

// ── Constants ──

interface AgentConfig {
  id: AgentId;
  nameKey: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
}

const AGENTS: AgentConfig[] = [
  { id: 'image-matching', nameKey: 'team.agentImageMatching.name', icon: ScanFace, iconBg: 'bg-blue-50', iconColor: 'text-blue-500' },
  { id: 'promotion', nameKey: 'team.agentPromotion.name', icon: Megaphone, iconBg: 'bg-pink-50', iconColor: 'text-pink-500' },
  { id: 'chatbot-alert', nameKey: 'team.agentChatbotAlert.name', icon: MessageSquare, iconBg: 'bg-green-50', iconColor: 'text-green-500' },
];

const TOSS_PRESET_AMOUNTS = [1000, 3000, 5000, 10000];

/** USD cents: $1 / $5 / $10 / $25 */
const CRYPTO_PRESETS_CENTS = [100, 500, 1000, 2500] as const;

type CryptoMode = 'evm' | 'aptos';
type EvmTokenSymbol = 'ETH' | 'USDC' | 'USDt' | 'BNB';
type TokenSymbol = EvmTokenSymbol | 'APT';

/** Token symbol → icon path mapping */
const TOKEN_ICONS: Record<string, string> = {
  ETH: '/icon/eth.svg',
  USDC: '/icon/usdc.svg',
  USDt: '/icon/usdt.svg',
  BNB: '/icon/bnb.png',
  APT: '/icon/apt.svg',
  SOL: '/icon/sol.svg',
};

interface ChainOption { id: number; label: string; icon: string }

const EVM_CHAINS: ChainOption[] = [
  { id: 1, label: 'Ethereum', icon: '/icon/eth.svg' },
  { id: 56, label: 'BSC', icon: '/icon/bnb.png' },
  { id: 8453, label: 'Base', icon: '/icon/base.svg' },
];

const EVM_TOKENS_BY_CHAIN: Record<number, EvmTokenSymbol[]> = {
  1: ['ETH', 'USDC', 'USDt'],
  56: ['BNB', 'USDC', 'USDt'],
  8453: ['ETH', 'USDC'],
};

const EVM_TOKEN_CONTRACTS: Record<number, Record<string, `0x${string}` | null>> = {
  1: { ETH: null, USDC: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', USDt: '0xdac17f958d2ee523a2206206994597c13d831ec7' },
  56: { BNB: null, USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', USDt: '0x55d398326f99059fF775485246999027B3197955' },
  8453: { ETH: null, USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
};

const ERC20_ABI = parseAbi(['function transfer(address to, uint256 amount) returns (bool)']);

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const APTOS_ADDRESS_RE = /^0x[0-9a-fA-F]{1,64}$/;

interface CryptoQuote {
  quoteId: string;
  merchantWallet: string;
  amountAtomic: string;
  tokenSymbol: string;
  chainId: number | null;
  tokenContract: string | null;
  quoteExpiresAt: string;
}

function isUserRejection(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : '';
  return msg.includes('rejected') || msg.includes('denied') || msg.includes('cancel') || msg.includes('4001');
}

/** Verify with retry for pending TXs (pure function — no closures) */
async function verifyWithRetry(
  quoteId: string,
  txHash: string,
  opts: { displayName?: string; message?: string },
  retries = 5,
) {
  for (let i = 0; i < retries; i++) {
    try {
      await api.post('/sponsors/crypto/verify', {
        quoteId,
        txHash,
        displayName: opts.displayName || undefined,
        message: opts.message || undefined,
      });
      return;
    } catch (err) {
      const isPending = err instanceof Error && (err.message.includes('PAYMENT_PENDING') || err.message.includes('408'));
      if (isPending && i < retries - 1) {
        await new Promise((r) => setTimeout(r, 3000 * (i + 1)));
        continue;
      }
      throw err;
    }
  }
}

// ── Component ──

export default function SponsorPage() {
  return (
    <Web3Provider>
      <SponsorPageInner />
    </Web3Provider>
  );
}

function SponsorPageInner() {
  const { agentId } = useParams<{ agentId: string }>();
  const { t } = useTranslation();
  const agent = AGENTS.find((a) => a.id === agentId);

  // Tab
  const [tab, setTab] = useState<'toss' | 'crypto'>('crypto');

  // ── Toss state ──
  const [tossAmount, setTossAmount] = useState<number>(3000);
  const [tossCustomAmount, setTossCustomAmount] = useState('');
  const [tossPaying, setTossPaying] = useState(false);
  const [tossError, setTossError] = useState<string | null>(null);
  const widgetRef = useRef<PaymentWidgetInstance | null>(null);

  // ── Crypto state ──
  const [cryptoMode, setCryptoMode] = useState<CryptoMode>('evm');
  const [evmChainId, setEvmChainId] = useState<number>(1);
  const [evmToken, setEvmToken] = useState<EvmTokenSymbol>('USDC');
  const [cryptoUsdCents, setCryptoUsdCents] = useState<number>(500);
  const [displayName, setDisplayName] = useState('');
  const [message, setMessage] = useState('');
  const [cryptoLoading, setCryptoLoading] = useState(false);
  const [cryptoError, setCryptoError] = useState<string | null>(null);
  const [cryptoSuccess, setCryptoSuccess] = useState(false);
  const [payStep, setPayStep] = useState<'idle' | 'quoting' | 'signing' | 'verifying'>('idle');

  // Double-click prevention
  const isPayingRef = useRef(false);

  // Payment status
  const [tossEnabled, setTossEnabled] = useState<boolean | null>(null);
  const [cryptoEnabled, setCryptoEnabled] = useState<boolean | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Wagmi (EVM) ──
  const { address: evmAddress, isConnected: evmConnected, chain: evmChain } = useAccount();
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();

  // ── Aptos ──
  const {
    account: aptosAccount,
    connected: aptosConnected,
    signAndSubmitTransaction,
    connect: aptosConnect,
    wallets: aptosWallets,
    notDetectedWallets,
  } = useAptosWallet();

  // Cleanup toast timer on unmount
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!agent) return;
    api.get<{ tossEnabled: boolean; cryptoEnabled: boolean }>('/sponsors/payment-status')
      .then((res) => { setTossEnabled(res.tossEnabled); setCryptoEnabled(res.cryptoEnabled); })
      .catch(() => { setTossEnabled(false); setCryptoEnabled(false); });
  }, [agent]);

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // Clear error on mode switch
  useEffect(() => { setCryptoError(null); }, [cryptoMode]);

  // Reset token when chain changes
  useEffect(() => {
    const available = EVM_TOKENS_BY_CHAIN[evmChainId] ?? [];
    if (!available.includes(evmToken)) {
      setEvmToken(available[0] ?? 'ETH');
    }
  }, [evmChainId, evmToken]);

  // ── Toss handlers ──
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

  const handleTossPreset = (preset: number) => { setTossAmount(preset); setTossCustomAmount(''); };

  const handleTossCustom = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    setTossCustomAmount(val);
    const num = parseInt(val, 10);
    if (!isNaN(num) && num > 0) setTossAmount(num);
  };

  const handleTossPay = async () => {
    if (tossEnabled === false) { showToast(t('sponsor.paymentNotReady')); return; }
    if (!widgetRef.current) { setTossError(t('sponsor.processing')); return; }
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

  // Snapshot displayName/message as refs for stable closure access
  const displayNameRef = useRef(displayName);
  const messageRef = useRef(message);
  useEffect(() => { displayNameRef.current = displayName; }, [displayName]);
  useEffect(() => { messageRef.current = message; }, [message]);

  // ── Crypto Pay (EVM) ──
  const handleEvmPay = useCallback(async () => {
    if (isPayingRef.current) return;
    if (cryptoEnabled === false) { showToast(t('sponsor.paymentNotReady')); return; }
    if (!evmConnected || !evmAddress) { setCryptoError(t('sponsor.crypto.connectFirst')); return; }

    isPayingRef.current = true;
    setCryptoLoading(true);
    setCryptoError(null);
    setPayStep('quoting');

    try {
      // 1. Switch chain if needed
      if (evmChain?.id !== evmChainId) {
        await switchChainAsync({ chainId: evmChainId });
      }

      // 2. Get quote
      const tokenSymbol = evmToken;
      const quote = await api.post<CryptoQuote>('/sponsors/crypto/quote', {
        agentId: agentId ?? '',
        amountUsdCents: cryptoUsdCents,
        walletAddress: evmAddress,
        tokenSymbol,
        chainId: evmChainId,
      });

      // Validate merchant wallet address
      if (!EVM_ADDRESS_RE.test(quote.merchantWallet)) {
        throw new Error('Invalid merchant wallet address');
      }

      // Check quote expiration before signing
      if (new Date(quote.quoteExpiresAt) <= new Date()) {
        throw new Error('QUOTE_EXPIRED');
      }

      const amountBigInt = BigInt(quote.amountAtomic);
      const merchantWallet = quote.merchantWallet as `0x${string}`;
      const tokenContract = EVM_TOKEN_CONTRACTS[evmChainId]?.[tokenSymbol] ?? null;

      // 3. Send TX
      setPayStep('signing');
      let txHash: `0x${string}`;

      if (tokenContract) {
        txHash = await writeContractAsync({
          address: tokenContract,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [merchantWallet, amountBigInt],
        });
      } else {
        txHash = await sendTransactionAsync({
          to: merchantWallet,
          value: amountBigInt,
        });
      }

      // 4. Verify on backend
      setPayStep('verifying');
      await verifyWithRetry(quote.quoteId, txHash, {
        displayName: displayNameRef.current,
        message: messageRef.current,
      });

      setCryptoSuccess(true);
    } catch (err) {
      if (isUserRejection(err)) {
        setCryptoError(t('sponsor.crypto.rejected'));
      } else {
        const msg = err instanceof Error ? err.message : '';
        setCryptoError(msg === 'QUOTE_EXPIRED' ? t('sponsor.crypto.quoteExpired') : t('sponsor.crypto.payError'));
      }
    } finally {
      isPayingRef.current = false;
      setCryptoLoading(false);
      setPayStep('idle');
    }
  }, [evmConnected, evmAddress, evmChain, evmChainId, evmToken, cryptoUsdCents, agentId, cryptoEnabled, t, showToast, switchChainAsync, writeContractAsync, sendTransactionAsync]);

  // ── Crypto Pay (Aptos) ──
  const handleAptosPay = useCallback(async () => {
    if (isPayingRef.current) return;
    if (cryptoEnabled === false) { showToast(t('sponsor.paymentNotReady')); return; }
    if (!aptosConnected || !aptosAccount?.address) { setCryptoError(t('sponsor.crypto.connectFirst')); return; }

    isPayingRef.current = true;
    setCryptoLoading(true);
    setCryptoError(null);
    setPayStep('quoting');

    try {
      // 1. Get quote
      const quote = await api.post<CryptoQuote>('/sponsors/crypto/quote', {
        agentId: agentId ?? '',
        amountUsdCents: cryptoUsdCents,
        walletAddress: aptosAccount.address.toString(),
        tokenSymbol: 'APT',
      });

      // Validate Aptos merchant wallet address
      if (!APTOS_ADDRESS_RE.test(quote.merchantWallet)) {
        throw new Error('Invalid merchant wallet address');
      }

      // Check quote expiration before signing
      if (new Date(quote.quoteExpiresAt) <= new Date()) {
        throw new Error('QUOTE_EXPIRED');
      }

      const amountBigInt = BigInt(quote.amountAtomic);

      // 2. Send TX
      setPayStep('signing');
      const response = await signAndSubmitTransaction({
        data: {
          function: '0x1::coin::transfer',
          typeArguments: ['0x1::aptos_coin::AptosCoin'],
          functionArguments: [quote.merchantWallet, amountBigInt.toString()],
        },
      });

      // Extract TX hash — handle both adapter-unwrapped and raw UserResponse formats
      let txHash: string;
      if (typeof response === 'object' && response !== null) {
        if ('hash' in response) {
          txHash = (response as { hash: string }).hash;
        } else if ('status' in response && (response as { status: string }).status === 'Rejected') {
          throw new Error('User rejected the request');
        } else {
          throw new Error('Unexpected transaction response format');
        }
      } else {
        throw new Error('Unexpected transaction response format');
      }

      // 3. Verify on backend
      setPayStep('verifying');
      await verifyWithRetry(quote.quoteId, txHash, {
        displayName: displayNameRef.current,
        message: messageRef.current,
      });

      setCryptoSuccess(true);
    } catch (err) {
      if (isUserRejection(err)) {
        setCryptoError(t('sponsor.crypto.rejected'));
      } else {
        const msg = err instanceof Error ? err.message : '';
        setCryptoError(msg === 'QUOTE_EXPIRED' ? t('sponsor.crypto.quoteExpired') : t('sponsor.crypto.payError'));
      }
    } finally {
      isPayingRef.current = false;
      setCryptoLoading(false);
      setPayStep('idle');
    }
  }, [aptosConnected, aptosAccount, cryptoUsdCents, agentId, cryptoEnabled, t, showToast, signAndSubmitTransaction]);

  const handleCryptoPay = cryptoMode === 'aptos' ? handleAptosPay : handleEvmPay;

  const isWalletConnected = cryptoMode === 'aptos' ? aptosConnected : evmConnected;

  const selectedTokenSymbol: TokenSymbol = cryptoMode === 'aptos' ? 'APT' : evmToken;
  const quoteDisplayAmount = `$${(cryptoUsdCents / 100).toFixed(0)}`;

  // Step labels for progress
  const stepLabel = payStep === 'quoting' ? t('sponsor.crypto.stepQuoting')
    : payStep === 'signing' ? t('sponsor.crypto.stepSigning')
    : payStep === 'verifying' ? t('sponsor.crypto.stepVerifying')
    : '';

  if (!agent) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <p className="text-gray-500">{t('detail.notFound')}</p>
        <Link to="/team" className="mt-4 inline-block text-primary-600 hover:underline">{t('sponsor.backToTeam')}</Link>
      </div>
    );
  }

  const Icon = agent.icon;
  const availableEvmTokens = EVM_TOKENS_BY_CHAIN[evmChainId] ?? [];

  // Petra wallet detection
  const petraWallet = aptosWallets?.find((w) => w.name === 'Petra');
  const petraNotDetected = notDetectedWallets?.find((w) => w.name === 'Petra');

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      {/* Toast */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg animate-fade-in whitespace-nowrap">
          {toast}
        </div>
      )}

      {/* Back */}
      <Link to="/team" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        {t('sponsor.backToTeam')}
      </Link>

      {/* Agent info */}
      <div className="flex items-center gap-3 mb-6">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${agent.iconBg}`}>
          <Icon className={`w-7 h-7 ${agent.iconColor}`} aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{t('sponsor.title', { name: t(agent.nameKey) })}</h1>
      </div>

      {/* Payment tabs */}
      <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
        <button type="button" onClick={() => setTab('crypto')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'crypto' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          {t('sponsor.tabCrypto')}
        </button>
        <button type="button" onClick={() => setTab('toss')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'toss' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          {t('sponsor.tabCard')}
        </button>
      </div>

      {/* ── Toss ── */}
      {tab === 'toss' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">{t('sponsor.amountLabel')}</label>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {TOSS_PRESET_AMOUNTS.map((preset) => (
                <button key={preset} type="button" onClick={() => handleTossPreset(preset)}
                  className={`py-2 rounded-lg text-sm font-medium border transition-colors ${tossAmount === preset && !tossCustomAmount ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-700 border-gray-200 hover:border-primary-400'}`}>
                  {preset.toLocaleString()}
                </button>
              ))}
            </div>
            <input type="text" inputMode="numeric" value={tossCustomAmount} onChange={handleTossCustom}
              placeholder={t('sponsor.customAmountPlaceholder')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('sponsor.nicknameLabel')}</label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('sponsor.nicknamePlaceholder')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('sponsor.messageLabel')}</label>
            <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)}
              placeholder={t('sponsor.messagePlaceholder')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
          </div>
          <div id="payment-widget" />
          <div id="agreement" />
          {tossError && <p className="text-sm text-red-500">{tossError}</p>}
          <button type="button" onClick={() => { void handleTossPay(); }} disabled={tossPaying || !tossAmount}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium py-3 rounded-lg transition-colors">
            {tossPaying ? t('sponsor.processing') : t('sponsor.submit')}
          </button>
        </div>
      )}

      {/* ── Crypto ── */}
      {tab === 'crypto' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
          {cryptoSuccess ? (
            <div className="text-center py-6">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" aria-hidden="true" />
              <p className="text-lg font-semibold text-gray-900">{t('sponsor.successTitle')}</p>
              <p className="text-sm text-gray-500 mt-1">{t('sponsor.successDesc', { name: t(agent.nameKey) })}</p>
              <Link to="/team" className="mt-4 inline-block text-primary-600 hover:underline text-sm">{t('sponsor.backToTeam')}</Link>
            </div>
          ) : (
            <>
              {/* Crypto mode: EVM / Aptos */}
              <div className="flex bg-gray-50 rounded-lg p-0.5 gap-0.5">
                <button type="button" onClick={() => setCryptoMode('evm')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-md transition-colors ${cryptoMode === 'evm' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  <img src="/icon/eth.svg" alt="" className="w-4 h-4" />
                  EVM
                </button>
                <button type="button" onClick={() => setCryptoMode('aptos')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-md transition-colors ${cryptoMode === 'aptos' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  <img src="/icon/apt.svg" alt="" className="w-4 h-4" />
                  Aptos
                </button>
              </div>

              {/* EVM: Chain select */}
              {cryptoMode === 'evm' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('sponsor.crypto.chainLabel')}</label>
                  <div className="flex flex-wrap gap-2">
                    {EVM_CHAINS.map((chain) => (
                      <button key={chain.id} type="button" onClick={() => setEvmChainId(chain.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all ${evmChainId === chain.id ? 'bg-gray-800 text-white border-gray-800 shadow-sm' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'}`}>
                        <img src={chain.icon} alt="" className="w-5 h-5 rounded-full" />
                        {chain.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* EVM: Token select */}
              {cryptoMode === 'evm' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('sponsor.crypto.tokenLabel')}</label>
                  <div className="flex flex-wrap gap-2">
                    {availableEvmTokens.map((tk) => (
                      <button key={tk} type="button" onClick={() => setEvmToken(tk)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all ${evmToken === tk ? 'bg-primary-50 text-primary-700 border-primary-500 shadow-sm' : 'bg-white text-gray-700 border-gray-200 hover:border-primary-300'}`}>
                        <img src={TOKEN_ICONS[tk]} alt="" className="w-5 h-5 rounded-full" />
                        {tk}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Aptos: Token label */}
              {cryptoMode === 'aptos' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('sponsor.crypto.tokenLabel')}</label>
                  <div className="flex flex-wrap gap-2">
                    <span className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border-2 bg-primary-50 text-primary-700 border-primary-500 shadow-sm">
                      <img src={TOKEN_ICONS.APT} alt="" className="w-5 h-5 rounded-full" />
                      APT
                    </span>
                  </div>
                </div>
              )}

              {/* Amount selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">{t('sponsor.crypto.amountLabel')}</label>
                <div className="grid grid-cols-4 gap-2">
                  {CRYPTO_PRESETS_CENTS.map((cents) => (
                    <button key={cents} type="button" onClick={() => setCryptoUsdCents(cents)}
                      className={`py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${cryptoUsdCents === cents ? 'bg-primary-50 text-primary-700 border-primary-500 shadow-sm scale-[1.02]' : 'bg-white text-gray-700 border-gray-200 hover:border-primary-300'}`}>
                      ${(cents / 100).toFixed(0)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Wallet connect */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('sponsor.crypto.walletLabel')}</label>
                {cryptoMode === 'evm' ? (
                  <div className="flex items-center gap-3">
                    <ConnectButton.Custom>
                      {({ openConnectModal, openAccountModal, account: rkAccount, mounted }) => {
                        if (!mounted) return null;
                        if (rkAccount) {
                          return (
                            <button type="button" onClick={openAccountModal}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:border-gray-400 transition-colors text-sm">
                              <div className="w-2 h-2 rounded-full bg-green-400" />
                              <span className="font-mono text-gray-700 truncate max-w-[240px]">{rkAccount.displayName}</span>
                            </button>
                          );
                        }
                        return (
                          <button type="button" onClick={openConnectModal}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition-colors text-sm font-medium">
                            <Wallet className="w-4 h-4" aria-hidden="true" />
                            {t('sponsor.crypto.connectWallet')}
                          </button>
                        );
                      }}
                    </ConnectButton.Custom>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    {aptosConnected ? (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm">
                        <div className="w-2 h-2 rounded-full bg-green-400" />
                        <span className="font-mono text-gray-700 truncate max-w-[240px]">
                          {aptosAccount?.address?.toString().slice(0, 8)}...{aptosAccount?.address?.toString().slice(-6)}
                        </span>
                      </div>
                    ) : petraWallet ? (
                      <button type="button"
                        onClick={() => aptosConnect(petraWallet.name)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition-colors text-sm font-medium">
                        <Wallet className="w-4 h-4" aria-hidden="true" />
                        {t('sponsor.crypto.connectWallet')}
                      </button>
                    ) : (
                      <a
                        href={petraNotDetected?.url ?? 'https://petra.app'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors text-sm font-medium"
                      >
                        <Wallet className="w-4 h-4" aria-hidden="true" />
                        {t('sponsor.crypto.installPetra')}
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Nickname / Message */}
              <div className="space-y-2">
                <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t('sponsor.nicknamePlaceholder')}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                <textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)}
                  placeholder={t('sponsor.messagePlaceholder')}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
              </div>

              {/* Error */}
              {cryptoError && <p className="text-sm text-red-500">{cryptoError}</p>}

              {/* Pay button */}
              <button type="button"
                onClick={() => { void handleCryptoPay(); }}
                disabled={cryptoLoading || !isWalletConnected}
                className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2">
                {cryptoLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>{stepLabel || t('sponsor.processing')}</span>
                  </>
                ) : isWalletConnected ? (
                  <>
                    <img src={TOKEN_ICONS[selectedTokenSymbol]} alt="" className="w-5 h-5 rounded-full" />
                    <span>{t('sponsor.crypto.payBtn', { amount: quoteDisplayAmount, token: selectedTokenSymbol })}</span>
                  </>
                ) : (
                  <span>{t('sponsor.crypto.connectFirst')}</span>
                )}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
