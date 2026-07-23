import { ethers } from "ethers";
import { DEPLOYED_ADDRESSES, RPC_URL, createFallbackProvider } from "./contracts";

export const SEPOLIA_HEX_CHAIN_ID = "0xaa36a7"; // 11155111 in hex

/**
 * Returns a robust read-only provider, prioritizing the connected browser wallet (if available
 * and on Sepolia), or falling back to a multi-RPC fallback provider.
 */
export async function getReadOnlyProvider(): Promise<ethers.Provider> {
  if (typeof window !== "undefined" && (window as any).ethereum) {
    try {
      const browserProvider = new ethers.BrowserProvider((window as any).ethereum);
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
  if (typeof window === "undefined" || !(window as any).ethereum) {
    throw new Error("No Web3 wallet extension (MetaMask, Rabby, Coinbase Wallet) detected in browser. Please install or connect a Web3 wallet.");
  }
  const provider = new ethers.BrowserProvider((window as any).ethereum);
  const signer = await provider.getSigner();
  return { provider, signer };
}

/**
 * Triggers a Web3 provider popup asking the user to switch to Sepolia (11155111).
 * If Sepolia is not added, requests adding it automatically.
 */
export async function ensureSepoliaNetwork(): Promise<boolean> {
  if (typeof window === "undefined" || !(window as any).ethereum) {
    return false;
  }

  const ethereum = (window as any).ethereum;

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
