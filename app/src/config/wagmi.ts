import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'GhostNet',
  projectId: 'ghostnet-connect-id',
  chains: [sepolia],
  ssr: false,
});
