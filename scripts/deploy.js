const hre = require("hardhat");

async function main() {
  const Chess = await hre.ethers.getContractFactory("Chess");
  const chess = await Chess.deploy();
  await chess.waitForDeployment();
  console.log("Chess deployed to:", await chess.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
