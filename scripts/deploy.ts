/**
 * Deploy + install for Executed Poetry for JavaScript.
 *
 *   npx hardhat run scripts/deploy.ts
 *   npx hardhat run scripts/deploy.ts --network sepolia
 *
 * Deploys Runtime + RoyaltySplitter + ExecutedPoetry, installs every asset from
 * vendor/, sets the 14 poems, and mints ids 0..6 (the exhibited seven) to the
 * artist. Ids 7..13 stay on-chain, unminted. No seal — the owner keeps update
 * rights.
 */
import { network } from "hardhat";
import { deployAll, EXHIBITED } from "./install.ts";

async function main() {
  const { viem } = await network.connect();
  const [owner] = await viem.getWalletClients();
  const artist = owner.account.address;
  console.log("deployer / artist:", artist);

  const { runtime, splitter, token } = await deployAll(viem, artist);
  console.log("Runtime:        ", runtime.address);
  console.log("RoyaltySplitter:", splitter.address, "(artist 75% / gallery 25%)");
  console.log("ExecutedPoetry: ", token.address);

  for (let id = 0; id < EXHIBITED; id++) await token.write.mint([artist, BigInt(id)]);

  console.log(`\ndone. total=${await token.read.total()}; ${EXHIBITED} minted to ${artist}; the rest remain on-chain, unminted.`);
  console.log("owner retains update rights (no seal); verify svg()/html()/tokenURI on-chain.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
