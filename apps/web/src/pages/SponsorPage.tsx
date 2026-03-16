import { useState, useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ScanFace, Megaphone, MessageSquare, ArrowLeft } from 'lucide-react';
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

const PRESET_AMOUNTS = [1000, 3000, 5000, 10000];

export default function SponsorPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const { t } = useTranslation();

  const agent = AGENTS.find((a) => a.id === agentId);

  const [amount, setAmount] = useState<number>(3000);
  const [customAmount, setCustomAmount] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [message, setMessage] = useState('');
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const widgetRef = useRef<PaymentWidgetInstance | null>(null);

  useEffect(() => {
    const clientKey = import.meta.env.VITE_TOSS_CLIENT_KEY as string | undefined;
    if (!clientKey || !amount) return;

    let cancelled = false;

    loadPaymentWidget(clientKey, 'ANONYMOUS')
      .then((widget) => {
        if (cancelled) return;
        widgetRef.current = widget;
        widget.renderPaymentMethods('#payment-widget', { value: amount }, { variantKey: 'DEFAULT' });
        widget.renderAgreement('#agreement');
      })
      .catch(() => {
        // 결제 위젯 로드 실패 시 조용히 처리
      });

    return () => {
      cancelled = true;
    };
  }, [amount]);

  const handlePreset = (preset: number) => {
    setAmount(preset);
    setCustomAmount('');
  };

  const handleCustomAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    setCustomAmount(val);
    const num = parseInt(val, 10);
    if (!isNaN(num) && num > 0) {
      setAmount(num);
    }
  };

  const handlePay = async () => {
    if (!widgetRef.current) {
      setError(t('sponsor.processing'));
      return;
    }
    setPaying(true);
    setError(null);
    try {
      const result = await api.post<{ orderId: string }>('/sponsors/prepare', {
        agentId: agentId ?? '',
      });
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
      setError(err instanceof Error ? err.message : t('auth.errorFallback'));
      setPaying(false);
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

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      {/* 뒤로가기 */}
      <Link
        to="/team"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        {t('sponsor.backToTeam')}
      </Link>

      {/* 에이전트 정보 */}
      <div className="flex items-center gap-3 mb-8">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${agent.iconBg}`}>
          <Icon className={`w-7 h-7 ${agent.iconColor}`} aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">
          {t('sponsor.title', { name: t(agent.nameKey) })}
        </h1>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
        {/* 금액 선택 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            {t('sponsor.amountLabel')}
          </label>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {PRESET_AMOUNTS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handlePreset(preset)}
                className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                  amount === preset && !customAmount
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
            value={customAmount}
            onChange={handleCustomAmountChange}
            placeholder={t('sponsor.amount', { amount: '직접 입력' })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {/* 닉네임 */}
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

        {/* 응원 메시지 */}
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

        {/* Toss 결제 위젯 마운트 영역 */}
        <div id="payment-widget" />
        <div id="agreement" />

        {error && <p className="text-sm text-red-500">{error}</p>}

        {/* 결제 버튼 */}
        <button
          type="button"
          onClick={() => { void handlePay(); }}
          disabled={paying || !amount}
          className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium py-3 rounded-lg transition-colors"
        >
          {paying ? t('sponsor.processing') : t('sponsor.submit')}
        </button>
      </div>
    </div>
  );
}
