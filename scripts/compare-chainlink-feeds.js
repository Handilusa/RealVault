const hre = require("hardhat");

async function main() {
  console.log("\n🔍 Checking Contract Bytecode and Details...\n");

  const [signer] = await hre.ethers.getSigners();
  const provider = signer.provider;

  const addr1 = "0xC5981F461d74c46eB4b0CF3f4Ec79f025573B0Ea";
  const addr2 = "0x214eD9Da11D2fbe465a6fc601a91E62EbEc1a0D6";

  const code1 = await provider.getCode(addr1);
  const code2 = await provider.getCode(addr2);

  console.log(`Address 0xC598... (Current):   Bytecode length = ${code1.length} chars (Is Contract: ${code1 !== "0x"})`);
  console.log(`Address 0x214e... (Candidate): Bytecode length = ${code2.length} chars (Is Contract: ${code2 !== "0x"})`);

}

main().catch(console.error);
