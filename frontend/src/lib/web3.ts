import { ethers } from "ethers";
import { DEPLOYED_ADDRESSES, RPC_URL } from "./contracts";

export const SEPOLIA_HEX_CHAIN_ID = "0xaa36a7"; // 11155111 in hex

/**
 * Triggers a MetaMask / Web3 provider popup asking the user to switch to Sepolia (11155111).
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
