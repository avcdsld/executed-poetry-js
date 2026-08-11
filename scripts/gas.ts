/**
 * Gas report for deploy + full install + mint, reading assets from vendor/.
 *   npx hardhat run scripts/gas.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { network } from "hardhat";
import { formatEther } from "viem";
import { GALLERY, ROYALTY_BPS, poems } from "./install.ts";

type Hex = `0x${string}`;
const bytesOf = (rel: string): Hex =>
  ("0x" + readFileSync(path.join(process.cwd(), "vendor", rel)).toString("hex")) as Hex;

const HTML_PARTS = ["html_0", "html_1", "html_2", "html_3a", "html_3b", "html_3c"];
const SVG_PARTS = ["svg_0", "svg_1", "svg_2", "svg_3"];

async function main() {
  const { viem } = await network.connect();
  const pc = await viem.getPublicClient();
  const [owner] = await viem.getWalletClients();
  const artist = owner.account.address;
  const rows: { step: string; gas: bigint }[] = [];
  const gasOf = async (hash: Hex) => (await pc.getTransactionReceipt({ hash })).gasUsed;
  const deployGas = async () => {
    const blk = await pc.getBlock({ blockNumber: await pc.getBlockNumber(), includeTransactions: true });
    return (await pc.getTransactionReceipt({ hash: (blk.transactions[0] as any).hash })).gasUsed;
  };

  const rt = await viem.deployContract("Runtime");
  rows.push({ step: "deploy Runtime", gas: await deployGas() });
  rows.push({ step: "setFont", gas: await gasOf(await rt.write.setFont([bytesOf("font.txt")])) });
  rows.push({ step: "setLib", gas: await gasOf(await rt.write.setLib([bytesOf("lib.txt")])) });
  for (let i = 0; i < HTML_PARTS.length; i++) {
    rows.push({ step: `setHtmlPart ${i}`, gas: await gasOf(await rt.write.setHtmlPart([BigInt(i), bytesOf(`${HTML_PARTS[i]}.txt`)])) });
  }
  for (let i = 0; i < SVG_PARTS.length; i++) {
    rows.push({ step: `setSvgPart ${i}`, gas: await gasOf(await rt.write.setSvgPart([BigInt(i), bytesOf(`${SVG_PARTS[i]}.txt`)])) });
  }
  let figGas = 0n;
  for (let id = 0; id < poems.length; id++) figGas += await gasOf(await rt.write.setFigure([BigInt(id), bytesOf(`figure_${id}.txt`)]));
  rows.push({ step: `setFigure x${poems.length}`, gas: figGas });

  const splitter = await viem.deployContract("RoyaltySplitter", [artist, GALLERY]);
  rows.push({ step: "deploy Splitter", gas: await deployGas() });
  const token = await viem.deployContract("ExecutedPoetry", [rt.address, splitter.address, ROYALTY_BPS]);
  rows.push({ step: "deploy ExecutedPoetry", gas: await deployGas() });
  rows.push({ step: "setPoems", gas: await gasOf(await token.write.setPoems([poems.map((x) => x.title), poems.map((x) => x.poem)])) });
  let mintGas = 0n;
  for (let id = 0; id < 7; id++) mintGas += await gasOf(await token.write.mint([artist, BigInt(id)]));
  rows.push({ step: "mint x7", gas: mintGas });

  let total = 0n;
  for (const r of rows) { total += r.gas; console.log(r.step.padEnd(22), r.gas.toString().padStart(10)); }
  console.log("".padEnd(22, "-"), "----------");
  console.log("TOTAL".padEnd(22), total.toString().padStart(10));
  console.log("\nETH cost at gas prices:");
  for (const gwei of [1n, 5n, 20n, 50n]) {
    console.log(`  ${gwei.toString().padStart(3)} gwei  ->  ${formatEther(total * gwei * 1_000_000_000n)} ETH`);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
