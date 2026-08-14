/**
 * Regenerate preview/ from the contract's own output.
 *
 *   npx hardhat run scripts/preview.ts
 *
 * Two states per poem, straight from the contract:
 *   <id>-0.{html,svg}  the unexecuted score (execution #0, zero values)
 *   <id>-1.{html,svg}  after one recorded execution (a zero-valued mock: #1,
 *                      0.000ms, epoch, pub/sig all zeros — a template, not a
 *                      real signature, which only a browser run produces)
 * No build step, no Python.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { network } from "hardhat";
import { deployAll, poems } from "./install.ts";

type Hex = `0x${string}`;
const Z32 = ("0x" + "00".repeat(32)) as Hex;
const Z64 = ("0x" + "00".repeat(64)) as Hex;
const ENV = "javascript:V8 | MacIntel";

async function main() {
  const { viem } = await network.connect();
  const [owner] = await viem.getWalletClients();
  const { token } = await deployAll(viem, owner.account.address);

  const dir = path.join(process.cwd(), "preview");
  mkdirSync(dir, { recursive: true });
  for (let id = 0; id < poems.length; id++) {
    writeFileSync(path.join(dir, `${id}-0.html`), await token.read.html([BigInt(id)]));
    writeFileSync(path.join(dir, `${id}-0.svg`), await token.read.svg([BigInt(id)]));
    await token.write.record([BigInt(id), 1n, 0n, 0n, ENV, Z32, Z64]);
    writeFileSync(path.join(dir, `${id}-1.html`), await token.read.html([BigInt(id)]));
    writeFileSync(path.join(dir, `${id}-1.svg`), await token.read.svg([BigInt(id)]));
  }
  console.log(`wrote ${poems.length} × (#0 score, #1 executed) into preview/`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
