import { createEthersHandleClient } from "@iexec-nox/handle";

/**
 * Gets or initializes the Nox Handle Client from a Web3 provider.
 */
export async function getHandleClient(provider: any) {
  return await createEthersHandleClient(provider);
}

/**
 * Encrypts an input value using Nox FHE for a specific target contract.
 * @param provider Browser Web3 provider
 * @param amount Amount to encrypt (BigInt uint256)
 * @param targetContract Address of the destination contract (e.g. FundVault or RwaPerpEngine)
 * @returns { handle: string, handleProof: string }
 */
export async function encryptAmount(
  provider: any,
  amount: bigint,
  targetContract: string
): Promise<{ handle: `0x${string}`; handleProof: `0x${string}` }> {
  const client = await getHandleClient(provider);
  const result = await client.encryptInput(
    amount,
    "uint256",
    targetContract as `0x${string}`
  );
  return {
    handle: result.handle as `0x${string}`,
    handleProof: result.handleProof as `0x${string}`,
  };
}
