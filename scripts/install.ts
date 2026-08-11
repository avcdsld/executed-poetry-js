/**
 * Shared deploy + install, reading every asset from vendor/.
 *
 * vendor/ holds the finished on-chain material — the font, the key-derivation
 * library, the HTML/SVG template parts, the per-poem figures, and the poems
 * themselves — plus the test goldens. Nothing here is generated at run time;
 * these files are the source. deploy / preview / gas / tests all go through this.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

type Hex = `0x${string}`;
const vendor = (rel: string) => path.join(process.cwd(), "vendor", rel);
const bytesOf = (rel: string): Hex => ("0x" + readFileSync(vendor(rel)).toString("hex")) as Hex;
const read = (rel: string) => readFileSync(vendor(rel), "utf8");

export const GALLERY = "0x56A673D2a738478f4A27F2D396527d779A1eD6d3"; // katevassgallery.eth
export const ROYALTY_BPS = 1000n; // 10% (7.5% artist / 2.5% gallery)
export const EXHIBITED = 7; // ids 0..6 are minted; 7..13 stay on-chain, unminted

export const poems: { title: string; poem: string }[] = JSON.parse(read("poems.json"));

const HTML_PARTS = ["html_0", "html_1", "html_2", "html_3a", "html_3b", "html_3c"];
const SVG_PARTS = ["svg_0", "svg_1", "svg_2", "svg_3"];

export async function deployAll(viem: any, artist: string) {
  const runtime = await viem.deployContract("Runtime");
  await runtime.write.setFont([bytesOf("font.txt")]);
  await runtime.write.setLib([bytesOf("lib.txt")]);
  for (let i = 0; i < HTML_PARTS.length; i++) {
    await runtime.write.setHtmlPart([BigInt(i), bytesOf(`${HTML_PARTS[i]}.txt`)]);
  }
  for (let i = 0; i < SVG_PARTS.length; i++) {
    await runtime.write.setSvgPart([BigInt(i), bytesOf(`${SVG_PARTS[i]}.txt`)]);
  }
  for (let id = 0; id < poems.length; id++) {
    await runtime.write.setFigure([BigInt(id), bytesOf(`figure_${id}.txt`)]);
  }

  const splitter = await viem.deployContract("RoyaltySplitter", [artist, GALLERY]);
  const token = await viem.deployContract("ExecutedPoetry", [runtime.address, splitter.address, ROYALTY_BPS]);
  await token.write.setPoems([poems.map((x) => x.title), poems.map((x) => x.poem)]);
  return { runtime, splitter, token };
}
