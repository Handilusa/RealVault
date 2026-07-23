import { ethers } from "ethers";
import { DEPLOYED_ADDRESSES, RPC_URL, createFallbackProvider } from "./contracts";

export const SEPOLIA_HEX_CHAIN_ID = "0xaa36a7"; // 11155111 in hex

/**
 * Robustly detects any injected Web3 wallet provider in the browser.
 * Supports OKX Wallet, MetaMask, Rabby, Coinbase Wallet, Phantom EVM, and EIP-6963 multi-wallet setups.
 */
export function getInjectedEthereumProvider(): any {
  if (typeof window === "undefined") return null;
  const win = window as any;

  // 1. Explicit OKX Wallet injection
  if (win.okxwallet?.ethereum) return win.okxwallet.ethereum;
  if (win.okxwallet) return win.okxwallet;

  // 2. Standard window.ethereum (with multi-provider array support)
  if (win.ethereum) {
    if (Array.isArray(win.ethereum.providers) && win.ethereum.providers.length > 0) {
      // Prefer OKX wallet if present in providers list
      const okx = win.ethereum.providers.find((p: any) => p.isOKExWallet || p.isOKX || p.isOkxWallet);
      if (okx) return okx;
      // Or return currently active provider in list
      const active = win.ethereum.providers.find((p: any) => p.isConnected?.() || p.selectedAddress);
      return active || win.ethereum.providers[0];
    }
    return win.ethereum;
  }

  // 3. Other wallet extensions
  if (win.phantom?.ethereum) return win.phantom.ethereum;
  if (win.coinbaseWalletExtension) return win.coinbaseWalletExtension;
  if (win.rabby) return win.rabby;

  return null;
}

/**
 * Returns a robust read-only provider, prioritizing the connected browser wallet (if available
 * and on Sepolia), or falling back to a multi-RPC fallback provider.
 */
export async function getReadOnlyProvider(): Promise<ethers.Provider> {
  const eth = getInjectedEthereumProvider();
  if (eth) {
    try {
      const browserProvider = new ethers.BrowserProvider(eth);
      const network = await browserProvider.getNetwork();
      if (Number(network.chainId) === 11155111) {
        return browserProvider;
      }
    } catch {
      // Wallet not connected or wrong network — fall through to fallback provider
    }
  }
  return createFallbackProvider();
}

/**
 * Safely creates an Ethers BrowserProvider and gets the active signer.
 * Throws a clean user-friendly error if no Web3 wallet extension is detected.
 */
export async function getBrowserSignerProvider(): Promise<{ provider: ethers.BrowserProvider; signer: ethers.Signer }> {
  const eth = getInjectedEthereumProvider();
  if (!eth) {
    throw new Error(
      "No Web3 wallet extension (OKX Wallet, MetaMask, Rabby, Coinbase Wallet, etc.) detected in browser. Please install or unlock your Web3 wallet extension."
    );
  }
  const provider = new ethers.BrowserProvider(eth);
  const signer = await provider.getSigner();
  return { provider, signer };
}

/**
 * Triggers a Web3 provider popup asking the user to switch to Sepolia (11155111).
 * If Sepolia is not added, requests adding it automatically.
 */
export async function ensureSepoliaNetwork(): Promise<boolean> {
  const ethereum = getInjectedEthereumProvider();
  if (!ethereum) {
    return false;
  }

  try {
    // Request network switch to Sepolia (0xaa36a7)
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_HEX_CHAIN_ID }],
    });
    return true;
  } catch (switchError: any) {
    // Error 4902: Chain has not been added to wallet yet
    if (switchError.code === 4902) {
      try {
        await ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: SEPOLIA_HEX_CHAIN_ID,
              chainName: "Ethereum Sepolia Testnet",
              rpcUrls: [RPC_URL],
              nativeCurrency: {
                name: "Sepolia Ether",
                symbol: "ETH",
                decimals: 18,
              },
              blockExplorerUrls: ["https://sepolia.etherscan.io"],
            },
          ],
        });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}
