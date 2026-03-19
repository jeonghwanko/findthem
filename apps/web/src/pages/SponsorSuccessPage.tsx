import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { api } from '../api/client';

type VerifyState = 'loading' | 'success' | 'error';

export default function SponsorSuccessPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  const paymentKey = searchParams.get('paymentKey');
  const orderId = searchParams.get('orderId');
  const amount = searchParams.get('amount');
  const agentId = searchParams.get('agentId');
  const displayName = searchParams.get('displayName');
  const message = searchParams.get('message');

  const [state, setState] = useState<VerifyState>('loading');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const verified = useRef(false);

  useEffect(() => {
    if (verified.current) return;
    verified.current = true;

    api
      .post('/sponsors/verify', {
        paymentKey,
        orderId,
        amount: amount !== null ? Number(amount) : undefined,
        agentId,
        displayName: displayName ?? undefined,
        message: message ?? undefined,
      })
      .then(() => setState('success'))
      .catch((err: unknown) => {
        const code = err instanceof Error ? err.message : '';
        setErrorMsg(t(`errors.${code}`, { defaultValue: t('auth.errorFallback') }));
        setState('error');
      });
  }, [paymentKey, orderId, amount, agentId, displayName, message, t]);

  if (state === 'loading') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-gray-400">{t('loading')}</div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-20 text-center">
      {state === 'success' ? (
        <>
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-6" aria-hidden="true" />
          <h1 className="text-2xl font-bold text-gray-900 mb-3">{t('sponsor.successTitle')}</h1>
          <p className="text-gray-500 mb-8">
            {t('sponsor.successDesc', { name: displayName ?? t('sponsor.anonymous') })}
          </p>
        </>
      ) : (
        <>
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-6" aria-hidden="true" />
          <h1 className="text-2xl font-bold text-gray-900 mb-3">{t('auth.errorFallback')}</h1>
          <p className="text-gray-500 mb-8">{errorMsg}</p>
        </>
      )}
      <Link
        to="/team"
        className="inline-block bg-primary-600 hover:bg-primary-700 text-white font-medium px-6 py-3 rounded-lg transition-colors"
      >
        {t('sponsor.backToTeam')}
      </Link>
    </div>
  );
}
