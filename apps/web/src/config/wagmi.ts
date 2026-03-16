import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { mainnet, bsc, base } from 'wagmi/chains';
import { http } from 'wagmi';

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID;
if (!projectId) {
  // eslint-disable-next-line no-console
  console.warn('[wagmi] VITE_REOWN_PROJECT_ID is not set — WalletConnect will not work');
}

const ethRpc = (import.meta.env.VITE_ETH_RPC_URL as string | undefined)?.trim();
const bscRpc = (import.meta.env.VITE_BSC_RPC_URL as string | undefined)?.trim();
const baseRpc = (import.meta.env.VITE_BASE_RPC_URL as string | undefined)?.trim();

export const wagmiConfig = getDefaultConfig({
  appName: '찾아줘',
  projectId: projectId || 'placeholder',
  chains: [mainnet, bsc, base],
  transports: {
    [mainnet.id]: http(ethRpc || undefined),
    [bsc.id]: http(bscRpc || undefined),
    [base.id]: http(baseRpc || undefined),
  },
});
