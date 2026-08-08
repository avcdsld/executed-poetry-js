/**
 * Gas report for deploy + full install (Runtime + Splitter + ExecutedPoetry).
 *   npx hardhat run scripts/gas.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { network } from "hardhat";
import { formatEther } from "viem";

type Hex = `0x${string}`;
const root = process.cwd();
const p = (rel: string) => path.join(root, rel);
const bytesOf = (rel: string): Hex => ("0x" + readFileSync(p(rel)).toString("hex")) as Hex;

const GALLERY = "0x56A673D2a738478f4A27F2D396527d779A1eD6d3";
const HTML_PARTS = ["html_0", "html_1", "html_2", "html_3a", "html_3b", "html_3c"];
const SVG_PARTS = ["svg_0", "svg_1", "svg_2", "svg_3"];

async function main() {
  const { viem } = await network.connect();
  const pc = await viem.getPublicClient();
  const rows: { step: string; gas: bigint }[] = [];
  const gasOf = async (hash: Hex) => (await pc.getTransactionReceipt({ hash })).gasUsed;
  const deployGas = async () => {
    const blk = await pc.getBlock({ blockNumber: await pc.getBlockNumber(), includeTransactions: true });
    return (await pc.getTransactionReceipt({ hash: (blk.transactions[0] as any).hash })).gasUsed;
  };

  const [owner] = await viem.getWalletClients();
  const artist = owner.account.address;

  const rt = await viem.deployContract("Runtime");
  rows.push({ step: "deploy Runtime", gas: await deployGas() });
  rows.push({ step: "setFont", gas: await gasOf(await rt.write.setFont([bytesOf("out/font.b64.txt")])) });
  rows.push({ step: "setLib", gas: await gasOf(await rt.write.setLib([bytesOf("out/parts/lib.txt")])) });
  for (let i = 0; i < HTML_PARTS.length; i++) {
    rows.push({ step: `setHtmlPart ${i}`, gas: await gasOf(await rt.write.setHtmlPart([BigInt(i), bytesOf(`out/parts/${HTML_PARTS[i]}.txt`)])) });
  }
  for (let i = 0; i < SVG_PARTS.length; i++) {
    rows.push({ step: `setSvgPart ${i}`, gas: await gasOf(await rt.write.setSvgPart([BigInt(i), bytesOf(`out/parts/${SVG_PARTS[i]}.txt`)])) });
  }
  const manifest: { slug: string; title: string; poem: string }[] =
    JSON.parse(readFileSync(p("out/manifest.json"), "utf8"));
  for (let id = 0; id < manifest.length; id++) {
    rows.push({ step: `setFigure ${manifest[id].slug}`, gas: await gasOf(await rt.write.setFigure([BigInt(id), bytesOf(`out/parts/figure_${manifest[id].slug}.txt`)])) });
  }

  const splitter = await viem.deployContract("RoyaltySplitter", [artist, GALLERY]);
  rows.push({ step: "deploy Splitter", gas: await deployGas() });

  const token = await viem.deployContract("ExecutedPoetry", [rt.address, splitter.address, 1000n]);
  rows.push({ step: "deploy ExecutedPoetry", gas: await deployGas() });
  rows.push({ step: "setPoems", gas: await gasOf(await token.write.setPoems([manifest.map((m) => m.title), manifest.map((m) => m.poem)])) });
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
