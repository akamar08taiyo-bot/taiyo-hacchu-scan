import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

// 受け取りの部分（jutaku-import-begin〜end）を取り出して、実際に動かす。
// 税込の計算 Ye は受注簿と同じ式（切り捨て）を渡す。
function loadImport({ stored, search = "" }) {
  const from = source.indexOf("/* jutaku-import-begin");
  const to = source.indexOf("/* jutaku-import-end */");
  assert.ok(from > 0 && to > from, "受け取りの部分が見つからない");
  const store = new Map(stored === undefined ? [] : [["taiyo-hacchu-import-v1", JSON.stringify(stored)]]);
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const Ye = (value, taxType) => Math.floor(Number(value) * (1 + (taxType === "8%" ? 0.08 : taxType === "非課税" ? 0 : 0.1)));
  const api = new Function(
    "localStorage",
    "location",
    "Ye",
    `${source.slice(from, to)}\nreturn {readJutakuImport, clearJutakuImport, jutakuImportPages, JUTAKU_IMPORT_KEY};`,
  )(localStorage, { search }, Ye);
  return { ...api, store };
}

const payload = (over = {}) => ({
  kind: "taiyo-jutaku-order",
  v: 1,
  createdAt: Date.now(),
  title: "山田様邸 住宅改修",
  customerName: "山田",
  address: "福岡県行橋市中央1-1",
  sales: "藤田",
  supplier: "",
  items: [
    { productName: "BAUHAUS 35アッシュ丸棒 φ35×4000mm", maker: "マツ六", modelNumber: "BD-134", quantity: 1, unit: "本", listPrice: 18600, cost: 6000, note: "使う長さ 600mm×2本＋1600mm×1本＝2800mm（0.7本）→ 4000mm 1本（余り 1200mm）" },
    { productName: "ブラケット", maker: "マツ六", modelNumber: "BR-1", quantity: 5, unit: "個", listPrice: 1000, cost: 500, note: "" },
    { productName: "丸棒 2000mm", maker: "マツ六", modelNumber: "", quantity: 1, unit: "本", listPrice: 0, cost: 0, note: "" },
  ],
  ...over,
});

test("住宅改修の見積もりから届いた部材を読む（読めないもの・古いものは消す）", () => {
  const ok = loadImport({ stored: payload(), search: "?from=jutaku" });
  assert.equal(ok.JUTAKU_IMPORT_KEY, "taiyo-hacchu-import-v1");
  assert.equal(ok.readJutakuImport().items.length, 3);
  ok.clearJutakuImport();
  assert.equal(ok.store.size, 0);

  // リンクから開いていなくても、1日以内のものは出す
  assert.ok(loadImport({ stored: payload() }).readJutakuImport());
  // リンクから開いていない古いものは、黙って消す
  const old = loadImport({ stored: payload({ createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000 }) });
  assert.equal(old.readJutakuImport(), null);
  assert.equal(old.store.size, 0);
  // 別のアプリのもの・部材が空のものは使わない
  for (const bad of [payload({ kind: "other" }), payload({ items: [] })]) {
    const r = loadImport({ stored: bad, search: "?from=jutaku" });
    assert.equal(r.readJutakuImport(), null);
    assert.equal(r.store.size, 0);
  }
  assert.equal(loadImport({}).readJutakuImport(), null);
});

test("部材1点を受注簿の1ページにする（数量・単位・定価・仕切り・販売単価・顧客名）", () => {
  const { jutakuImportPages } = loadImport({});
  const base = { createdAt: "2026-10-20", orderType: "販売", customerName: "", address: "", sales: "久保", supplier: "ケアマックス", purchaser: "藤田", quantity: 1, unit: "台" };
  const pages = jutakuImportPages(payload(), base, 20);
  assert.equal(pages.length, 3);
  assert.deepEqual(
    pages.map((p) => [p.productName, p.modelNumber, p.quantity, p.unit, p.listPrice, p.listPriceTaxIn, p.cost, p.saleUnitPrice]),
    [
      ["BAUHAUS 35アッシュ丸棒 φ35×4000mm", "BD-134", "1", "本", "18600", 20460, "6000", 14880],
      ["ブラケット", "BR-1", "5", "個", "1000", 1100, "500", 800],
      ["丸棒 2000mm", "", "1", "本", "", "", "", ""], // 価格の分からない品は空欄（仕切り未入力として知らせる）
    ],
  );
  for (const p of pages) {
    assert.deepEqual([p.customerName, p.address, p.sales, p.supplier, p.purchaser, p.orderType, p.taxType], ["山田", "福岡県行橋市中央1-1", "藤田", "ケアマックス", "藤田", "販売", "10%"]);
  }
  assert.match(pages[0].note, /4000mm 1本/);
  assert.equal(new Set(pages.map((p) => p._multiId)).size, 3);
  // 発注先が入っていればそれを使う。数量は1以上の整数
  const other = jutakuImportPages(payload({ supplier: "ウェルファン", items: [{ productName: "キャップ", quantity: 0.4 }] }), base, 20);
  assert.deepEqual([other[0].supplier, other[0].quantity, other[0].unit], ["ウェルファン", "1", "個"]);
});

test("受注簿に入れるか選ぶダイアログ（入力途中の受注簿は確認してから置き換える）", () => {
  // 特定福祉用具の販売見積書の「スクショから自動認識」の中（?embed=scan）では、届いた部材のダイアログを出さない
  assert.match(source, /let\[jutakuOffer,setJutakuOffer\]=\(0,A\.useState\)\(\(\)=>TOKUTEI_SCAN\?null:readJutakuImport\(\)\)/);
  assert.match(source, /jutakuOffer&&\(0,j\.jsx\)\(JutakuImportDrawer,\{data:jutakuOffer,hasDraft:!!draftOffer/);
  // 届いた部材を選んでいるあいだは「前回の入力」のダイアログを重ねない
  assert.match(source, /draftOffer&&!jutakuOffer&&\(0,j\.jsx\)\(`div`,\{className:`drawer`/);
  // 特定福祉用具の見積もりからは「商品」（tokutei-import.test.mjs）。住宅改修の発注書からは「部材」
  assert.match(source, /function acceptJutakuImport\(\)\{[\s\S]{0,300}what=tokutei\?`商品`:`部材`[\s\S]{0,200}if\(draftOffer\)\{[\s\S]{0,200}window\.confirm\(`前回の入力[\s\S]{0,60}は消えて、見積もりの\$\{what\}に置き換わります。よろしいですか？`\)/);
  // 入れたら全部を商品ページにして、1ページ目を開く
  assert.match(source, /setMultiSaved\(pages\);\s*setMultiDraft\(null\);\s*setMultiPageIndex\(0\);\s*t\(\{\.\.\.pages\[0\]\}\);/);
  assert.match(source, /function declineJutakuImport\(\)\{\s*clearJutakuImport\(jutakuOffer\);/);
  assert.match(source, /children:`受注簿に入れる`/);
  assert.match(source, /children:`入れない`/);
  assert.match(styles, /\.jutakuImportList \{/);
});

test("数量に単位を付けて、何が何個・何本か分かるようにする", () => {
  // 集計ページ
  assert.match(source, /\(0,j\.jsx\)\(`td`,\{children:e\.quantity\?`\$\{e\.quantity\}\$\{e\.unit\|\|``\}`:``\}\)/);
  // 商品ページ：入力欄の横（画面だけ）と印刷・PDF（printValue）
  assert.match(source, /className:`qtyWithUnit no-print`[\s\S]{0,200}className:`qtyUnit`,children:e\.unit/);
  assert.match(source, /className:`printValue`,children:e\.quantity\?`\$\{e\.quantity\}\$\{e\.unit\|\|``\}`:e\.quantity/);
  // 別ページで作る販売受注簿（HTML）
  assert.match(source, /<td>'\+esc\(e\.quantity\)\+esc\(e\.quantity\?e\.unit:''\)\+'<\/td>/);
  assert.match(styles, /\.qtyWithUnit \{/);
});
