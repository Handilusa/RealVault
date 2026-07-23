"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, lightTheme, connectorsForWallets } from "@rainbow-me/rainbowkit";
import { metaMaskWallet, injectedWallet, coinbaseWallet } from "@rainbow-me/rainbowkit/wallets";
import { createConfig, WagmiProvider, http, fallback } from "wagmi";
import { sepolia } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";
import { SEPOLIA_RPC_FALLBACKS } from "@/lib/contracts";

const connectors = connectorsForWallets(
  [
    {
      groupName: "Supported Wallets",
      wallets: [metaMaskWallet, injectedWallet, coinbaseWallet],
    },
  ],
  {
    appName: "RealVault Confidential RWA Fund",
    projectId: "00000000000000000000000000000000",
  }
);

const config = createConfig({
  connectors,
  chains: [sepolia],
  transports: {
    [sepolia.id]: fallback(
      SEPOLIA_RPC_FALLBACKS.map((url) => http(url))
    ),
  },
  ssr: true,
});

export function Web3Provider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={lightTheme({
            accentColor: "#4F46E5",
            accentColorForeground: "white",
            borderRadius: "medium",
            fontStack: "system",
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
