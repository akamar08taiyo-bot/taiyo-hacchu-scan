import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

// 特定福祉用具の販売見積書のページの中に出す受注簿（?embed=tokutei）。見積書から届いた内容と、受注簿で直した内容を合わせる部分
// （tokutei-live-begin〜end。ページを作るのは jutaku-import-begin〜end の tokuteiImportPages）を取り出して、実際に動かす。
const Ye = (value, taxType) => Math.floor(Number(value) * (1 + (taxType === "8%" ? 0.08 : taxType === "非課税" ? 0 : 0.1)));

function slice(begin, end) {
  const from = source.indexOf(begin);
  const to = source.indexOf(end);
  assert.ok(from > 0 && to > from, `${begin} が見つからない`);
  return source.slice(from, to);
}

function load(search = "?embed=tokutei") {
  const posted = [];
  const window = { parent: { postMessage: (m, origin) => posted.push({ m, origin }) } };
  const api = new Function(
    "localStorage",
    "location",
    "Ye",
    "window",
    "DRAFT_IMAGE_LIMIT",
    "j",
    `${slice("/* jutaku-import-begin", "/* jutaku-import-end */")}\n${slice("/* tokutei-live-begin", "/* tokutei-live-end */")}
return {tokuteiLiveMerge, tokuteiLiveChanges, tokuteiLiveSlim, tokuteiLiveBlankHeader, tokuteiLiveAdd, tokuteiLiveRemove, tokuteiLiveNow, TOKUTEI_EMBED};`,
  )({ getItem: () => null, setItem() {}, removeItem() {} }, { search, origin: "http://localhost" }, Ye, window, 1500000, {});
  return { ...api, posted };
}

const BASE = { createdAt: "2026-10-25", orderType: "販売", customerName: "", furigana: "", address: "", tel: "", sales: "久保", supplier: "ケアマックス", salesOrderNumber: "", orderNumber: "", deliveryDate: "", productName: "", catalogNumber: "", webCode: "", maker: "", modelNumber: "", quantity: 1, unit: "台", listPrice: "", listPriceTaxIn: "", cost: "", taxType: "10%", discountRate: 20, saleUnitPrice: "", note: "" };

// 見積書から届く内容（特定福祉用具のアプリの handoff.ts の hacchuImport と同じ形。商品に id）。名前・住所は架空
function data(over = {}, items) {
  return {
    kind: "taiyo-tokutei-order", v: 1, createdAt: 1, title: "見本 花子様 特定福祉用具",
    customerName: "見本 花子", furigana: "ミホン ハナコ", address: "福岡県行橋市中央1-1", tel: "0930-00-0000", sales: "久保", deliveryDate: "", burdenRatio: 1, welfare: false,
    items: items ?? [
      { id: "i1", productName: "シャワーベンチ 見本A", maker: "見本化成", modelNumber: "SB-01", supplier: "", quantity: 1, unit: "台", listPrice: 35000, cost: 21000, taxType: "10%", discountRate: 20, saleUnitPrice: 28000, totalTaxIn: 30800, careInsuranceBalance: 100000, benefit: { target: 30800, userBurden: 3080, aid: 0, insurerBurden: 27720 }, note: "" },
      { id: "i2", productName: "浴槽台 見本B", maker: "見本化成", modelNumber: "YD-02", supplier: "", quantity: 1, unit: "台", listPrice: 13800, cost: 8280, taxType: "10%", discountRate: 20, saleUnitPrice: 11040, totalTaxIn: 12144, careInsuranceBalance: 69200, benefit: { target: 12144, userBurden: 1215, aid: 0, insurerBurden: 10929 }, note: "" },
    ],
    ...over,
  };
}

test("受注簿の中に出すのは ?embed=tokutei のときだけ", () => {
  assert.equal(load().TOKUTEI_EMBED, true);
  assert.equal(load("").TOKUTEI_EMBED, false);
  assert.equal(load("?from=tokutei").TOKUTEI_EMBED, false);
});

test("見積書の商品1点が受注簿の1ページ（お客様の名前・読み・住所・電話・商品・型番・定価・仕切り・給付）", () => {
  const { tokuteiLiveMerge } = load();
  const { pages, sync } = tokuteiLiveMerge(data(), { pages: [], sync: {} }, BASE, 20);
  assert.equal(pages.length, 2);
  assert.deepEqual(
    pages.map((p) => [p._tokuteiId, p._multiId, p.orderType, p.customerName, p.furigana, p.address, p.tel, p.productName, p.modelNumber, p.listPrice, p.cost, p.saleUnitPrice]),
    [
      ["i1", "tokutei-i1", "給付", "見本 花子", "ミホン ハナコ", "福岡県行橋市中央1-1", "0930-00-0000", "シャワーベンチ 見本A", "SB-01", "35000", "21000", 28000],
      ["i2", "tokutei-i2", "給付", "見本 花子", "ミホン ハナコ", "福岡県行橋市中央1-1", "0930-00-0000", "浴槽台 見本B", "YD-02", "13800", "8280", 11040],
    ],
  );
  assert.deepEqual(Object.keys(sync), ["i1", "i2"]);
  assert.equal(sync.i1.productName, "シャワーベンチ 見本A");
  assert.equal(pages[1].tokuteiBenefit.userBurden, 1215);
});

test("見積書で直した欄は入れ直し、受注簿で直した欄（顧客名・受注番号など）はそのまま", () => {
  const { tokuteiLiveMerge } = load();
  const first = tokuteiLiveMerge(data(), { pages: [], sync: {} }, BASE, 20);
  // 受注簿で：1ページ目の顧客名を直し、受注番号・申込番号（カタログから）を入れた
  const edited = first.pages.map((p, i) => (i === 0 ? { ...p, customerName: "見本 花子（娘様）", salesOrderNumber: "J-001", catalogNumber: "123456" } : p));
  // 見積書で：住所・1つめの商品名・数量を直した
  const next = data({ address: "福岡県行橋市中央2-2" });
  next.items[0] = { ...next.items[0], productName: "シャワーベンチ 見本A（ひじ掛け付き）", quantity: 2 };
  const { pages } = tokuteiLiveMerge(next, { pages: edited, sync: first.sync }, BASE, 20);
  assert.equal(pages[0].customerName, "見本 花子（娘様）"); // 受注簿で直した
  assert.equal(pages[1].customerName, "見本 花子");
  assert.equal(pages[0].salesOrderNumber, "J-001");
  assert.equal(pages[0].catalogNumber, "123456");
  assert.equal(pages[0].address, "福岡県行橋市中央2-2"); // 見積書で直した
  assert.equal(pages[1].address, "福岡県行橋市中央2-2");
  assert.equal(pages[0].productName, "シャワーベンチ 見本A（ひじ掛け付き）");
  assert.equal(pages[0].quantity, "2");
});

test("受注簿で打っている途中に見積書から前の値が返ってきても、打った値を消さない。給付の計算の欄はいつも見積書の値", () => {
  const { tokuteiLiveMerge } = load();
  const first = tokuteiLiveMerge(data(), { pages: [], sync: {} }, BASE, 20);
  // カタログから読み取ると受注区分が「販売」になる → 見積書の商品のページは「給付」に戻す
  const typing = first.pages.map((p, i) => (i === 0 ? { ...p, productName: "シャワーベンチ 見本A 改", orderType: "販売", saleUnitPrice: 1 } : p));
  const { pages } = tokuteiLiveMerge(data(), { pages: typing, sync: first.sync }, BASE, 20);
  assert.equal(pages[0].productName, "シャワーベンチ 見本A 改");
  assert.equal(pages[0].orderType, "給付");
  assert.equal(pages[0].saleUnitPrice, 28000);
});

test("見積書で消した商品のページは消す。受注簿で足して見積書から返ってくる前の商品・見積書とつながっていないページは残す", () => {
  const { tokuteiLiveMerge } = load();
  const first = tokuteiLiveMerge(data(), { pages: [], sync: {} }, BASE, 20);
  const pending = { ...BASE, productName: "カタログの商品", _tokuteiId: "hx", _tokuteiPending: true, _multiId: "m3" };
  const loose = { ...BASE, productName: "つながっていない商品", _multiId: "m4" };
  const onlyFirst = data({}, [data().items[0]]);
  const { pages, sync } = tokuteiLiveMerge(onlyFirst, { pages: [...first.pages, pending, loose], sync: first.sync }, BASE, 20);
  assert.deepEqual(pages.map((p) => p.productName), ["シャワーベンチ 見本A", "カタログの商品", "つながっていない商品"]);
  assert.deepEqual(Object.keys(sync), ["i1"]);
  assert.equal(pages[2]._tokuteiId, "");
  // 見積書に入って返ってきたら、つながる（受注簿で読み取った申込番号・画像はそのまま）
  const back = data({}, [data().items[0], { ...data().items[1], id: "hx", productName: "カタログの商品" }]);
  const linked = tokuteiLiveMerge(back, { pages: pages.map((p) => (p._tokuteiId === "hx" ? { ...p, catalogNumber: "777", _imgSnap: { dataUrl: "data:x" } } : p)), sync }, BASE, 20);
  assert.equal(linked.pages[1]._tokuteiId, "hx");
  assert.equal(linked.pages[1]._tokuteiPending, false);
  assert.equal(linked.pages[1].catalogNumber, "777");
  assert.equal(linked.pages[1]._imgSnap.dataUrl, "data:x");
  assert.equal(linked.pages[1].orderType, "給付");
  assert.equal(linked.pages.length, 3);
});

test("受注簿で直した商品名・型番・定価・仕切りなどを見積書に送る（同じ直しは2度送らない）", () => {
  const { tokuteiLiveMerge, tokuteiLiveChanges } = load();
  const first = tokuteiLiveMerge(data(), { pages: [], sync: {} }, BASE, 20);
  const sent = {};
  assert.deepEqual(tokuteiLiveChanges(first.pages, first.sync, sent), []);
  const edited = first.pages.map((p, i) => (i === 1 ? { ...p, modelNumber: "YD-02W", listPrice: "14800", cost: "8880", customerName: "別の名前" } : p));
  assert.deepEqual(tokuteiLiveChanges(edited, first.sync, sent), [{ id: "i2", fields: { modelNumber: "YD-02W", listPrice: "14800", cost: "8880" } }]);
  assert.deepEqual(tokuteiLiveChanges(edited, first.sync, sent), []);
  // 見積書に入って返ってきたら、もう送らない
  const back = data();
  back.items[1] = { ...back.items[1], modelNumber: "YD-02W", listPrice: 14800, cost: 8880 };
  const after = tokuteiLiveMerge(back, { pages: edited, sync: first.sync }, BASE, 20);
  assert.equal(after.pages[1].modelNumber, "YD-02W");
  assert.deepEqual(tokuteiLiveChanges(after.pages, after.sync, sent), []);
  assert.deepEqual(sent, {});
});

test("受注簿で足した商品・消したページを見積書に知らせる", () => {
  const { tokuteiLiveAdd, tokuteiLiveRemove, tokuteiLiveNow, posted } = load();
  assert.equal(tokuteiLiveAdd({ ...BASE, productName: "x" })._tokuteiId, undefined); // 見積書から届く前は送らない
  tokuteiLiveNow.ready = true;
  tokuteiLiveNow.saleId = "s1";
  const page = tokuteiLiveAdd({ ...BASE, productName: "ポータブルトイレ 見本C", modelNumber: "PT-3", listPrice: "40000", cost: "24000", catalogNumber: "555", supplier: "介援隊" });
  assert.match(page._tokuteiId, /^h/);
  assert.equal(page._tokuteiPending, true);
  assert.equal(posted[0].origin, "http://localhost");
  assert.equal(posted[0].m.type, "taiyo-hacchu-add");
  assert.equal(posted[0].m.saleId, "s1");
  assert.deepEqual(
    [posted[0].m.item.id, posted[0].m.item.productName, posted[0].m.item.modelNumber, posted[0].m.item.listPrice, posted[0].m.item.cost, posted[0].m.item.supplier, posted[0].m.item.catalogNumber],
    [page._tokuteiId, "ポータブルトイレ 見本C", "PT-3", "40000", "24000", "介援隊", "555"],
  );
  tokuteiLiveRemove({ _tokuteiId: "i2" });
  tokuteiLiveRemove({ _tokuteiId: "" });
  assert.deepEqual(posted.slice(1).map((p) => [p.m.type, p.m.id]), [["taiyo-hacchu-remove", "i2"]]);
});

test("保存してもらう形：画像は 1.5MB までの1枚だけ。次の商品の空のページにはお客様の情報だけ", () => {
  const { tokuteiLiveSlim, tokuteiLiveBlankHeader } = load();
  const small = tokuteiLiveSlim({ productName: "a", _imgSnap: { dataUrl: "data:image/png;base64,AAAA", file: { name: "f" }, ocrText: "文字", thumbs: [{ dataUrl: "x" }], meta: { width: 1 } } });
  assert.deepEqual(small._imgSnap, { dataUrl: "data:image/png;base64,AAAA", file: null, meta: { width: 1 }, ocrText: "文字", thumbs: [], activeId: "" });
  assert.equal(tokuteiLiveSlim({ _imgSnap: { dataUrl: "x".repeat(1500001) } })._imgSnap.dataUrl, "");
  assert.deepEqual(tokuteiLiveSlim({ productName: "b" }), { productName: "b" });
  const header = tokuteiLiveBlankHeader(data({ welfare: true, burdenRatio: 2, deliveryDate: "2026-11-01" }));
  assert.deepEqual(header, { orderType: "給付", burdenRatio: 2, smartRentaSalesCategory: "特定福祉用具", customerName: "見本 花子", furigana: "ミホン ハナコ", address: "福岡県行橋市中央1-1", tel: "0930-00-0000", deliveryDate: "2026-11-01", livingProtection: true, sales: "久保" });
  assert.equal(tokuteiLiveBlankHeader(data()).livingProtection, false);
  assert.equal(tokuteiLiveBlankHeader(data()).deliveryDate, "");
});

test("画面：受注簿の中に出したときは受注簿だけ。カタログから自動認識のボタン・介援隊とウェルファンのカタログを開くボタン", () => {
  assert.match(source, /className:scanOpen\?`workspace twoColumn`:`workspace twoColumn tokuteiOrderOnly`/);
  assert.match(source, /onScan:TOKUTEI_EMBED\?openScan:undefined,scanOpen/);
  assert.match(source, /children:so\?`✕ 自動認識を閉じる`:`📷 カタログから商品を自動認識`/);
  assert.match(source, /url:`https:\/\/www\.kaientai\.cc\/Default\.aspx`/);
  assert.match(source, /url:`https:\/\/www\.welfan\.shop\/`/);
  assert.match(source, /\(0,j\.jsx\)\(CatalogLinks,\{order:e,onOpen:setCatalogTab\}\)/);
  assert.match(source, /!TOKUTEI_EMBED&&\(0,j\.jsx\)\(`button`,\{className:`softPrimary`,onClick:\(\)=>openSimpleEstimate/);
  // 相手が同じサイトの親の画面のときだけ受ける
  assert.match(source, /if\(event\.origin!==location\.origin\|\|event\.source!==window\.parent\)return;/);
  assert.match(styles, /\.workspace\.twoColumn\.tokuteiOrderOnly > \.imagePanel \{\s*display: none;/);
});
