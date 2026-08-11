import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { network } from "hardhat";
import { deployAll, poems, GALLERY } from "../scripts/install.ts";

type Hex = `0x${string}`;
const preview = (rel: string) => readFileSync(path.join(process.cwd(), "preview", rel), "utf8");
const fixture = (rel: string) => readFileSync(path.join(process.cwd(), "test", "fixtures", rel), "utf8");
const b64ToUtf8 = (uri: string) => Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64").toString("utf8");

type Vector = { id: number; n: number; micros: number; unix: number; env: string; pub: string; sig: string };
const vectors: Vector[] = JSON.parse(fixture("vectors.json"));

async function setup() {
  const { viem } = await network.connect();
  const [owner, other] = await viem.getWalletClients();
  const { runtime, splitter, token } = await deployAll(viem, owner.account.address);
  return { viem, runtime, splitter, c: token, owner, other };
}

describe("byte-for-byte assembly (unexecuted score)", () => {
  let c: any;
  before(async () => { ({ c } = await setup()); });

  it("svg(id) matches preview/<id>-0.svg for all 14", async () => {
    for (let id = 0; id < poems.length; id++) {
      assert.equal(await c.read.svg([BigInt(id)]), preview(`${id}-0.svg`), `svg id=${id}`);
    }
  });

  it("html(id) with count=0 matches preview/<id>-0.html for all 14", async () => {
    for (let id = 0; id < poems.length; id++) {
      assert.equal(await c.read.html([BigInt(id)]), preview(`${id}-0.html`), `html id=${id}`);
    }
  });

  it("titles(id) / poems(id) return the poem verbatim (Etherscan Read tab)", async () => {
    for (let id = 0; id < poems.length; id++) {
      assert.equal(await c.read.poems([BigInt(id)]), poems[id].poem);
      assert.equal(await c.read.titles([BigInt(id)]), poems[id].title);
    }
  });
});

describe("record() + recorded svg (byte-for-byte)", () => {
  let c: any; let other: any;
  before(async () => { ({ c, other } = await setup()); });

  it("permissionless record then svg(id) matches golden (5-row, 6-row wrap, formatting)", async () => {
    for (const v of vectors) {
      await c.write.record(
        [BigInt(v.id), BigInt(v.n), BigInt(v.micros), BigInt(v.unix), v.env,
         ("0x" + v.pub) as Hex, ("0x" + v.sig) as Hex],
        { account: other.account }
      );
      assert.equal(await c.read.svg([BigInt(v.id)]), fixture(`recorded-${v.id}.svg`), `recorded svg id=${v.id}`);
      assert.equal(await c.read.counts([BigInt(v.id)]), 1n, `count id=${v.id}`);
    }
  });

  it("html(id) injects the current count (let n=<count>)", async () => {
    const html = await c.read.html([BigInt(vectors[0].id)]);
    assert.ok(html.includes("let n=1;"), "count injection let n=1");
    assert.ok(!html.includes("let n=0;"), "old count gone");
  });
});

describe("tokenURI", () => {
  let c: any;
  before(async () => { ({ c } = await setup()); });

  it("returns on-chain JSON with title, statement, image=svg, animation_url=html", async () => {
    const id = 3;
    const uri: string = await c.read.tokenURI([BigInt(id)]);
    assert.ok(uri.startsWith("data:application/json;base64,"));
    const json = JSON.parse(b64ToUtf8(uri));
    assert.equal(json.name, poems[id].title);
    assert.ok(json.description.startsWith("Executed Poetry for JavaScript is a series"));
    assert.equal(b64ToUtf8(json.image), await c.read.svg([BigInt(id)]));
    assert.equal(b64ToUtf8(json.animation_url), await c.read.html([BigInt(id)]));
    const traits = Object.fromEntries(json.attributes.map((a: any) => [a.trait_type, a.value]));
    assert.equal(traits.Title, poems[id].title);
    assert.equal(traits.Executions, 0);
  });
});

describe("ERC721 + ERC2981 royalties", () => {
  let c: any; let splitter: any; let owner: any;
  before(async () => { ({ c, splitter, owner } = await setup()); });

  it("mint issues the exhibited 7 (ids 0..6); the other 7 stay on-chain, unminted", async () => {
    for (let id = 0; id < 7; id++) await c.write.mint([owner.account.address, BigInt(id)]);
    assert.equal(await c.read.balanceOf([owner.account.address]), 7n);
    assert.equal((await c.read.ownerOf([0n])).toLowerCase(), owner.account.address.toLowerCase());
    assert.equal(await c.read.total(), 14n);
    await assert.rejects(c.read.ownerOf([7n]));
    assert.ok((await c.read.poems([7n])).length > 0);
    assert.ok((await c.read.svg([7n])).includes("<svg"));
    assert.equal(await c.read.name(), "Executed Poetry for JavaScript");
    assert.equal(await c.read.symbol(), "POEM");
  });

  it("royaltyInfo returns the splitter and 10% of sale price", async () => {
    const [receiver, amount] = await c.read.royaltyInfo([0n, 10000n]);
    assert.equal(receiver.toLowerCase(), splitter.address.toLowerCase());
    assert.equal(amount, 1000n);
  });

  it("splitter splits 75/25 artist/gallery", async () => {
    assert.equal((await splitter.read.artist()).toLowerCase(), owner.account.address.toLowerCase());
    assert.equal((await splitter.read.gallery()).toLowerCase(), GALLERY.toLowerCase());
    assert.equal(await splitter.read.ARTIST_BPS(), 7500n);
  });

  it("supportsInterface: ERC721 (0x80ac58cd) and ERC2981 (0x2a55205a)", async () => {
    assert.equal(await c.read.supportsInterface(["0x80ac58cd"]), true);
    assert.equal(await c.read.supportsInterface(["0x2a55205a"]), true);
  });
});

describe("record guards + owner mutability", () => {
  let c: any; let owner: any;
  before(async () => { ({ c, owner } = await setup()); });

  const z32 = ("0x" + "00".repeat(32)) as Hex;
  const z64 = ("0x" + "00".repeat(64)) as Hex;
  const okEnv = "javascript:es2025 | V8";

  it("record reverts on unknown id", async () => {
    await assert.rejects(c.write.record([99n, 1n, 100n, 1n, okEnv, z32, z64]), /unknown|reverted/);
  });

  it("record reverts when sig is not 64 bytes", async () => {
    await assert.rejects(c.write.record([0n, 1n, 100n, 1n, okEnv, z32, z32]), /sig|reverted/);
  });

  it("record reverts when env lacks the javascript: prefix or is too long", async () => {
    await assert.rejects(c.write.record([0n, 1n, 100n, 1n, "python:es2025", z32, z64]), /env|reverted/);
    const long = "javascript:" + "x".repeat(40);
    await assert.rejects(c.write.record([0n, 1n, 100n, 1n, long, z32, z64]), /env|reverted/);
  });

  it("env is injection-safe: markup is escaped in the SVG", async () => {
    await c.write.record([0n, 1n, 100n, 1704164645n, "javascript:<script>x", z32, z64]);
    const svg = await c.read.svg([0n]);
    assert.ok(!svg.includes("<script>"), "raw markup must not appear");
    assert.ok(svg.includes("javascript:&lt;script&gt;x"), "markup escaped to entities");
  });

  it("no seal: owner can re-set poems and repoint the runtime (work stays mutable)", async () => {
    await c.write.setRuntime([owner.account.address]);
    assert.equal((await c.read.runtime()).toLowerCase(), owner.account.address.toLowerCase());
    await c.write.setPoems([["Later."], ["later();"]]);
    assert.equal(await c.read.total(), 1n);
    assert.equal(await c.read.poems([0n]), "later();");
  });

  it("setDefaultRoyalty can change receiver/bps", async () => {
    await c.write.setDefaultRoyalty([owner.account.address, 500n]);
    const [receiver, amount] = await c.read.royaltyInfo([0n, 10000n]);
    assert.equal(receiver.toLowerCase(), owner.account.address.toLowerCase());
    assert.equal(amount, 500n);
  });
});
