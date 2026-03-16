import { AptosWalletAdapterProvider } from '@aptos-labs/wallet-adapter-react';
import { Network } from '@aptos-labs/ts-sdk';

export default function AptosProvider({ children }: { children: React.ReactNode }) {
  return (
    <AptosWalletAdapterProvider
      optInWallets={['Petra']}
      autoConnect
      dappConfig={{ network: Network.MAINNET }}
    >
      {children}
    </AptosWalletAdapterProvider>
  );
}
