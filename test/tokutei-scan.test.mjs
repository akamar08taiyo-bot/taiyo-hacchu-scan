import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

// 特定福祉用具の販売見積書の「📷 スクショから自動認識」の窓の中に、画像の欄（スクリーンショットの読み取り）だけを出す（?embed=scan）。
// tokutei-scan-begin〜end を取り出して、実際に動かす。
function load(search = "?embed=scan", parent) {
  const posted = [];
  const self = {};
  const window = { parent: parent ?? { postMessage: (m, origin) => posted.push({ m, origin }) } };
  if (parent === "self") window.parent = window;
  const from = source.indexOf("/* tokutei-scan-begin");
  const to = source.indexOf("/* tokutei-scan-end */");
  assert.ok(from > 0 && to > from, "tokutei-scan-begin が見つからない");
  const api = new Function("location", "window", `${source.slice(from, to)}\nreturn {TOKUTEI_SCAN, tokuteiScanItem, tokuteiScanPost};`)(
    { search, origin: "http://localhost" },
    window,
    self,
  );
  return { ...api, posted };
}

test("読み取りだけを出すのは ?embed=scan のときだけ", () => {
  assert.equal(load().TOKUTEI_SCAN, true);
  assert.equal(load("").TOKUTEI_SCAN, false);
  assert.equal(load("?from=tokutei").TOKUTEI_SCAN, false);
  assert.equal(load("?embed=scanner").TOKUTEI_SCAN, false);
});

test("読み取った商品を、受注簿の欄と同じ値で見積書の窓に送る（同じサイトの親の画面だけ）", () => {
  const { tokuteiScanItem, tokuteiScanPost, posted } = load();
  const item = tokuteiScanItem({ productName: " シャワーベンチ 見本A ", maker: "見本化成", modelNumber: "SB-01", catalogNumber: "123456", webCode: "W1", listPrice: "35000", listPriceTaxIn: "38500", cost: "21000", taxType: "10%", unit: "台", supplier: "介援隊", customerName: "見本 花子" });
  assert.deepEqual(item, { productName: "シャワーベンチ 見本A", maker: "見本化成", modelNumber: "SB-01", catalogNumber: "123456", webCode: "W1", color: "", size: "", unit: "台", listPrice: "35000", listPriceTaxIn: "38500", cost: "21000", taxType: "10%", supplier: "介援隊", note: "" });
  assert.equal("customerName" in item, false); // お客様の情報は送らない
  tokuteiScanPost({ type: "taiyo-hacchu-scanned", item });
  assert.deepEqual(posted, [{ m: { type: "taiyo-hacchu-scanned", item }, origin: "http://localhost" }]);
  // ふつうに開いたとき・親の画面がないときは送らない
  const plain = load("");
  plain.tokuteiScanPost({ type: "x" });
  assert.deepEqual(plain.posted, []);
  const alone = load("?embed=scan", "self");
  alone.tokuteiScanPost({ type: "x" });
  assert.deepEqual(alone.posted, []);
});

test("画面：読み取りのときは画像の欄だけ（受注簿・上の段・ポータルへのリンクを出さない）。親の画面から画像を受ける", () => {
  assert.match(source, /className:TOKUTEI_SCAN\?`workspace twoColumn tokuteiScanOnly`:`workspace twoColumn`/);
  assert.match(source, /!TOKUTEI_SCAN&&\(0,j\.jsx\)\(`a`,\{href:`https:\/\/akamar08taiyo-bot\.github\.io\/taiyo-portal\/`/);
  assert.match(source, /!TOKUTEI_SCAN&&\(0,j\.jsxs\)\(`header`,\{className:`topbar`/);
  assert.match(source, /!TOKUTEI_SCAN&&\(0,j\.jsxs\)\(j\.Fragment,\{children:\[\(0,j\.jsx\)\(kt,\{order:e,/);
  assert.match(source, /if\(event\.origin!==location\.origin\|\|event\.source!==window\.parent\)return;/);
  assert.match(source, /msg\.type===`taiyo-scan-image`&&msg\.file instanceof Blob&&msg\.file\.type\.startsWith\(`image\/`\)&&pasteImgRef\.current\)pasteImgRef\.current\(msg\.file\)/);
  assert.match(source, /h\(f\?\(TOKUTEI_SCAN\?`右の欄に入れました`:`販売受注簿へ転記しました`\):/);
  assert.match(styles, /\.workspace\.twoColumn\.tokuteiScanOnly \{\s*grid-template-columns: minmax\(0, 1fr\);/);
});

test("顧客名の上にフリガナ（特定福祉用具の見積もりから転記したときの読み）。別ページの受注簿にも", () => {
  assert.match(source, /e\.furigana&&\(0,j\.jsx\)\(`input`,\{className:`furiganaInput`,"aria-label":`フリガナ`/);
  assert.match(source, /\(e\.furigana\?'<small class="furigana">'\+esc\(e\.furigana\)\+'<\/small>':''\)\+esc\(e\.customerName\)/);
});
