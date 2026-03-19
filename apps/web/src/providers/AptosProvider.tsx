import { useCallback } from 'react';
import { AptosWalletAdapterProvider } from '@aptos-labs/wallet-adapter-react';
import { Network } from '@aptos-labs/ts-sdk';

export default function AptosProvider({ children }: { children: React.ReactNode }) {
  const handleError = useCallback((error: unknown) => {
    // Silently ignore user rejection errors — handled in SponsorPage catch blocks
    const msg = error instanceof Error ? error.message.toLowerCase() : '';
    if (msg.includes('rejected') || msg.includes('cancel')) return;
    // Other errors: no-op (component-level error handling takes precedence)
  }, []);

  return (
    <AptosWalletAdapterProvider
      optInWallets={['Continue with Google', 'Continue with Apple', 'Petra Web']}
      autoConnect={false}
      dappConfig={{ network: Network.MAINNET }}
      onError={handleError}
    >
      {children}
    </AptosWalletAdapterProvider>
  );
}
