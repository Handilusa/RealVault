const hre = require("hardhat");

async function main() {
  console.log("\n🔎 Deep Querying Chainlink AggregatorV3 Feed on Sepolia...\n");

  const feedAbi = [
    "function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
    "function getRoundData(uint80 _roundId) external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
    "function decimals() external view returns (uint8)",
    "function description() external view returns (string memory)"
  ];

  const feedAddress = "0xC5981F461d74c46eB4b0CF3f4Ec79f025573B0Ea";
  const [signer] = await hre.ethers.getSigners();
  const feed = new hre.ethers.Contract(feedAddress, feedAbi, signer);

  const current = await feed.latestRoundData();
  const dec = Number(await feed.decimals());

  console.log(`Current Round (${current.roundId.toString()}): $${(Number(current.answer)/10**dec).toFixed(2)} at ${new Date(Number(current.updatedAt)*1000).toISOString()}`);

  console.log("\nSampled rounds history:");
  const steps = [1, 2, 5, 10, 24, 48, 100, 200, 500];
  for (const step of steps) {
    try {
      const rId = BigInt(current.roundId) - BigInt(step);
      const r = await feed.getRoundData(rId);
      console.log(`Round -${step} (ID: ${rId}): $${(Number(r.answer)/10**dec).toFixed(2)} | ${new Date(Number(r.updatedAt)*1000).toISOString()}`);
    } catch (e) {
      console.log(`Round -${step}: error (${e.message})`);
    }
  }
}

main().catch(console.error);
