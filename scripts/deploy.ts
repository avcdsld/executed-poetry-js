/**
 * Deploy + install for Executed Poetry for JavaScript.
 *
 *   npx hardhat run scripts/deploy.ts                 # in-memory
 *   npx hardhat run scripts/deploy.ts --network sepolia
 *
 * 構成:
 *   Runtime          — 執行装置（font/lib/雛形/figure + 組み立て）。seal まで差し替え可。
 *   RoyaltySplitter  — ロイヤリティ 7.5% 作者 / 2.5% ギャラリー。
 *   ExecutedPoetry   — 詩(storage)＋台帳＋ERC721/2981。runtime と splitter を指す。
 *
 * 手順:
 *   1. Runtime をデプロイ → font/lib/HTML・SVG 雛形/figure を設置
 *   2. RoyaltySplitter をデプロイ（作者=deployer, ギャラリー=下記）
 *   3. ExecutedPoetry をデプロイ（runtime, splitter, 1000bps=10%）
 *   4. 七篇（title/source）を addPoem、mintAll で owner へ発行
 *
 * seal は無い。owner は Runtime/詩/ロイヤリティを後から更新できる（意図的に可変）。
 *
 * 素材は out/ から読む。事前に:
 *   node build/bundle_crypto.mjs && python3 build/build.py
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { network } from "hardhat";

type Hex = `0x${string}`;
const root = process.cwd();
const p = (rel: string) => path.join(root, rel);
const bytesOf = (rel: string): Hex => ("0x" + readFileSync(p(rel)).toString("hex")) as Hex;

const GALLERY = "0x56A673D2a738478f4A27F2D396527d779A1eD6d3"; // katevassgallery.eth (2.5%)
const ROYALTY_BPS = 1000n; // 10% total (7.5% artist / 2.5% gallery via splitter)
const EXHIBITED = 7; // ids 0..6 are minted; ids 7..13 stay on-chain, unminted

const HTML_PARTS = ["html_0", "html_1", "html_2", "html_3a", "html_3b", "html_3c"];
const SVG_PARTS = ["svg_0", "svg_1", "svg_2", "svg_3"];

async function main() {
  const { viem } = await network.connect();
  const [owner] = await viem.getWalletClients();
  const artist = owner.account.address;
  console.log("deployer / artist:", artist);

  // 1. Runtime + 装置一式
  const rt = await viem.deployContract("Runtime");
  console.log("Runtime:", rt.address);
  console.log("  setFont / setLib …");
  await rt.write.setFont([bytesOf("out/font.b64.txt")]);
  await rt.write.setLib([bytesOf("out/parts/lib.txt")]);
  console.log("  setHtmlPart 0..5 …");
  for (let i = 0; i < HTML_PARTS.length; i++) {
    await rt.write.setHtmlPart([BigInt(i), bytesOf(`out/parts/${HTML_PARTS[i]}.txt`)]);
  }
  console.log("  setSvgPart 0..3 …");
  for (let i = 0; i < SVG_PARTS.length; i++) {
    await rt.write.setSvgPart([BigInt(i), bytesOf(`out/parts/${SVG_PARTS[i]}.txt`)]);
  }
  const manifest: { slug: string; title: string; poem: string }[] =
    JSON.parse(readFileSync(p("out/manifest.json"), "utf8"));
  console.log(`  setFigure ×${manifest.length} …`);
  for (let id = 0; id < manifest.length; id++) {
    await rt.write.setFigure([BigInt(id), bytesOf(`out/parts/figure_${manifest[id].slug}.txt`)]);
  }

  // 2. RoyaltySplitter
  const splitter = await viem.deployContract("RoyaltySplitter", [artist, GALLERY]);
  console.log("RoyaltySplitter:", splitter.address, "(artist 75% / gallery 25%)");

  // 3. ExecutedPoetry
  const token = await viem.deployContract("ExecutedPoetry", [rt.address, splitter.address, ROYALTY_BPS]);
  console.log("ExecutedPoetry:", token.address);

  // 4. 詩の設置 + mint
  console.log(`  setPoems ×${manifest.length} (all 14; ids 0..6 exhibited, 7..13 unminted) …`);
  await token.write.setPoems([manifest.map((m) => m.title), manifest.map((m) => m.poem)]);
  console.log("  mint ids 0..6 to artist …");
  for (let id = 0; id < EXHIBITED; id++) await token.write.mint([artist, BigInt(id)]);

  console.log(`\ndone. total=${await token.read.total()}; ${EXHIBITED} minted to ${artist}; the rest remain on-chain, unminted.`);
  console.log("owner retains update rights (no seal); verify svg()/html()/tokenURI on-chain.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
