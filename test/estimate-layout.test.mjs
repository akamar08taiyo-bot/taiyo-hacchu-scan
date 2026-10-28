import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("顧客名は Shift+Enter / Alt+Enter で2段まで分けられる", () => {
  // 1行入力の <input> では改行を保持できないため textarea を使う
  assert.match(source, /function CustomerNameField/);
  assert.match(source, /className:`customerNameInput`/);
  assert.doesNotMatch(source, /label:`顧客名`,children:\(0,j\.jsx\)\(`input`/);
  // Enter 単独では改行しない（Shift か Alt を伴うときだけ）
  assert.match(source, /if\(ev\.key!==`Enter`\)return;\s*ev\.preventDefault\(\);\s*if\(!\(ev\.shiftKey\|\|ev\.altKey\)\)return;/);
  // 3段以上には増やさない
  assert.match(source, /customerNameLines\(value\)\.slice\(0,2\)\.join\(`\\n`\)/);
  assert.match(styles, /textarea\.customerNameInput/);
});

test("見積書の宛名は2行構成で、御中は文字のある最後の行に付く", () => {
  assert.match(source, /clientLineTop/);
  assert.match(source, /clientLineBottom/);
  assert.match(source, /function syncClientLines\(\)/);
  assert.match(source, /el\.line2\.classList\.toggle\("clientSecond",has2\)/);
  assert.match(source, /if\(el\.suffix\)\{var host=has2\?el\.line2:el\.line1/);
  // 宛名の長さに応じて文字サイズを段階的に下げる
  assert.match(source, /clientLong5.*clientLong4.*clientLong3.*clientLong2/s);
  // 御中は縦積みにしない（.editable の pre-wrap に負けないよう後ろで指定）
  const suffixIndex = source.indexOf(".clientSuffix{flex:0 0 auto;white-space:nowrap}");
  const editableIndex = source.indexOf(".editable{outline:0.25mm dashed transparent");
  assert.ok(suffixIndex > editableIndex && editableIndex > 0);
});

test("見積書のPDFはウィンドウ幅によらずA4レイアウトで1ページに収める", () => {
  // 取り込み中だけ A4 固定レイアウトへ切り替える（狭い窓のスマホ表示でPDF化されていた）
  assert.match(source, /html\.pdfExport \.sheet\{width:210mm/);
  assert.match(source, /html\.pdfExport \.quoteTop\{grid-template-columns:86mm 70mm/);
  assert.match(source, /docRoot\.classList\.add\("pdfExport"\)/);
  assert.match(source, /finally\{[^}]*classList\.remove\("pdfExport"\)/);
  // わずかなはみ出しで2ページに割らず、1ページに収める
  assert.match(source, /if\(imgH<=availH\*1\.45\)\{if\(imgH>availH\)\{imgW=imgW\*availH\/imgH;imgH=availH;\}/);
  // PDFのファイル名に改行が混ざらないようにする
  assert.match(source, /order\.customerName\) \|\| ''\)\.replace\(\/\\s\+\/g, ' '\)\.trim\(\)/);
});

test("見積書は太字を使いすぎない", () => {
  const from = source.indexOf("'*{box-sizing:border-box}body{margin:0;background:#f2f6f4");
  const to = source.indexOf("@media print{body{background:#fff}", from);
  assert.ok(from > 0 && to > from);
  const sheetCss = source.slice(from, to);
  // 帳票の要素に太字（700以上）を残さない（画面だけのツールバーは対象外）
  const heavy = [...sheetCss.matchAll(/\.[A-Za-z][^{]*\{[^}]*font-weight:\s*(?:[7-9]00|bold)[^}]*\}/g)]
    .map((m) => m[0].slice(0, m[0].indexOf("{")))
    .filter((selector) => !selector.includes(".toolbar"));
  assert.deepEqual(heavy, []);
  // 表題も含め、すべて標準の太さで刷る
  assert.match(sheetCss, /\.title\{[^}]*font-weight:500/);
  assert.match(sheetCss, /\.companyName\{[^}]*font-weight:500\}/);
  assert.match(sheetCss, /\.totalValue\{[^}]*font-weight:500/);
  assert.match(sheetCss, /\.itemTable th\{[^}]*font-weight:500\}/);
  assert.match(sheetCss, /\.productTitle\{[^}]*font-weight:500/);
  assert.doesNotMatch(sheetCss, /totalSummaryRow \.tableSubtotal strong\{font-weight:700\}/);
});

test("明細表は品目と集計を分け、集計は消費税の列まで寄せる", () => {
  // 品目（商品・送料）は続けて並べ、そのあとに空行を挟んで集計へ移る
  assert.match(source, /'\+shippingRow\+'<tr class="spacerRow">(<td[^>]*><\/td>){5}<\/tr><tr class="subtotalRow">/);
  // 空行は罫線を消した余白にし、集計は枠と地色を持つ右側のブロックとして独立させる
  assert.match(source, /\.itemTable \.spacerRow td\{height:4\.5mm;background:#fff;border:0\}/);
  assert.match(source, /\.itemTable \.tableSubtotalPad\{background:#fff;border:0\}/);
  assert.match(source, /\.itemTable \.subtotalRow \.tableSubtotal\{background:#f4faff;border:0\.3mm solid #c1d9ef\}/);
  assert.match(source, /\.itemTable \.totalSummaryRow \.tableSubtotal\{background:#e6f2ff;border-top:0\.5mm solid #7fb0e2\}/);
  // 集計行は先頭に空セルを置いて1列ずらし、右端が消費税の列に来る
  const shifted = [...source.matchAll(/<tr class="subtotalRow[^"]*"><td class="tableSubtotalPad"><\/td><td colspan="4" class="tableSubtotal">/g)];
  assert.equal(shifted.length, 3);
  assert.doesNotMatch(source, /class="tableSubtotal">[^<]*<span[\s\S]{0,400}?<\/td><td><\/td><\/tr>/);
});

test("見積書は明細行と備考行を追加・削除でき、金額は明細から再計算される", () => {
  // ツールバーの操作ボタン
  assert.match(source, /<button type="button" id="addRowButton">明細行を追加<\/button>/);
  assert.match(source, /<button type="button" id="addRemarkButton">備考行を追加<\/button>/);
  // 商品行・送料行は明細行として印を付け、追加行と同じ扱いにする
  assert.match(source, /<tbody><tr class="itemRow">/);
  assert.match(source, /<tr class="shippingRow itemRow">/);
  // 追加・削除・備考追加
  assert.match(source, /function estAddItemRow\(\)/);
  assert.match(source, /function estAddRemarkLine\(\)/);
  assert.match(source, /className="rowDelete"/);
  assert.match(source, /if\(estItemRows\(\)\.length<=1\)return;row\.parentNode\.removeChild\(row\);estRecalcTotals\(\)/);
  // 小計・消費税・合計・上部の御見積金額は明細の合計から出す
  assert.match(source, /function estRecalcTotals\(\)/);
  for (const field of ["subtotalTable", "taxTable", "grandTotalTable"]) {
    assert.match(source, new RegExp(`put\\("\\[data-field=${field}\\]"`));
  }
  assert.match(source, /data-field=grandTotalTaxIn/);
  // 行の削除ボタンは印刷にもPDFにも出さない
  assert.match(source, /html\.pdfExport \.rowDelete\{display:none\}/);
  assert.match(source, /@media print\{[^}]*\}\.rowDelete\{display:none!important\}|\.rowDelete\{display:none!important\}/);
});

test("見積書の帳票内にフォーム部品を置かない（PDFで文字が切れるため）", () => {
  const from = source.indexOf("function simpleEstimateHtmlReference(e,t,n,q){");
  const to = source.indexOf("const simpleEstimateHtmlReferenceBeforeSummary", from);
  assert.ok(from > 0 && to > from);
  const builder = source.slice(from, to);
  // html2canvas は input の値テキストを下にずらして描くため、発行日が切れていた。
  // 帳票（.sheet）内の編集項目は contenteditable の span に統一する。
  // ツールバーの営業所セレクトは印刷・PDFに出ないので対象外。
  const formTags = [...builder.matchAll(/<(input|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.deepEqual(formTags, []);
  assert.match(builder, /<span id="quoteDate" class="editable companyMetaValue" contenteditable="true" data-field="quoteDate">/);
});

test("商品名にすでに入っている色・サイズは明細の下段に重ねて出さない", () => {
  // 例:「…FSフィット/536-057 ブルー」＋色「ブルー」で「ブルー」が二重に並んでいた
  assert.match(source, /\.filter\(function\(part\)\{return !tidy\(rawProduct\)\.includes\(part\)\}\)/);
  // 型番も同じ考え方で重複を避けている（既存の扱いを壊していないこと）
  assert.match(source, /model&&rawProduct&&!rawProduct\.includes\(model\)/);
});

// 見積書（文字列連結のHTML）を組み立てる部分を取り出し、受注簿と同じ値を渡して実際に作らせる
function loadEstimateBuilders() {
  // 1行で書かれた補助関数（行の途中から始まるものもある）を行末まで取り出す
  const helper = (name) => {
    const m = source.match(new RegExp(`function ${name}\\(.*$`, "m"));
    assert.ok(m, `${name} が見つからない`);
    return m[0];
  };
  const slice = (startText, endText) => {
    const from = source.indexOf(startText);
    const to = source.indexOf(endText, from);
    assert.ok(from > 0 && to > from, `${startText} 〜 ${endText} が見つからない`);
    return source.slice(from, to);
  };
  return new Function([
    "var simpleEstimateHtml, simpleEstimateHtmlReadable, latestEstimateItems = [];",
    "var sanitizeScanSize=function(v){return String(v||'')};",
    // 複数商品の集計は受注簿側（multiProductTotals）で作る。テストでは allTotals として渡す
    "var multiProductTotals=function(){throw new Error('allTotals を渡すこと')};",
    ...["simpleEstimateNumber", "simpleEstimateEscape", "simpleEstimateQty", "simpleEstimateQtyNumber", "simpleEstimateJapaneseDate"].map(helper),
    slice("/* estimate-print-reference-v3 */", "simpleEstimateHtmlReadable=simpleEstimateHtmlReference;"),
    "simpleEstimateHtmlReadable=simpleEstimateHtmlReference;",
    "var single=simpleEstimateHtmlReference;",
    slice("function estimateHtmlEscape(value)", "simpleEstimateHtml = simpleEstimateHtmlReadable;"),
    "return {single:single, multi:simpleEstimateHtmlReadable};",
  ].join("\n"))();
}
const builders = loadEstimateBuilders();
const buildEstimate = builders.single;
const buildMultiEstimate = builders.multi;
const yen = (value) => "¥" + value.toLocaleString("ja-JP");
const field = (html, name) => {
  const m = html.match(new RegExp(`data-field="${name}">([^<]*)<`));
  return m ? m[1].replace(/&nbsp;|&mdash;/g, "").trim() : null;
};
const amounts = (html) => ({
  header: field(html, "grandTotalTaxIn"),
  unitPrice: field(html, "unitPrice"),
  amount: field(html, "amount"),
  tax: field(html, "tax"),
  subtotal: field(html, "subtotalTable"),
  taxTotal: field(html, "taxTable"),
  grandTotal: field(html, "grandTotalTable"),
});
// 不具合の報告と同じ商品（定価123,000円・割引20%で販売金額98,400円）
const toiletOrder = {
  customerName: "テスト 太郎",
  productName: "安寿 家具調 トイレセレクトR はねあげ",
  modelNumber: "533-870 暖房・快適脱臭",
  listPrice: "123000",
  listPriceTaxIn: "135300",
  quantity: "1",
  taxType: "10%",
  shippingFee: "0",
};

test("見積書の定価には税抜・税込を書き添える", () => {
  // 受注簿の定価は税抜。以前は「定価123,000円」だけで、税抜かどうかを手で書き足していた
  const html = buildEstimate(toiletOrder, { saleTotal: 98400, shippingFee: 0 }, null, {});
  assert.equal(field(html, "productNote"), "定価123,000円（税抜）");
  // 税込の定価しか無いときは、その金額を税込として出す
  const taxInOnly = buildEstimate({ ...toiletOrder, listPrice: "" }, { saleTotal: 98400, shippingFee: 0 }, null, {});
  assert.equal(field(taxInOnly, "productNote"), "定価135,300円（税込）");
  // 色・サイズと並ぶときも同じ
  const withColor = buildEstimate({ ...toiletOrder, color: "ブラウン" }, { saleTotal: 98400, shippingFee: 0 }, null, {});
  assert.equal(field(withColor, "productNote"), "ブラウン / 定価123,000円（税抜）");
});

test("受注簿で合計金額を手入力で直すと、見積書の御見積金額・明細・合計もその金額になる", () => {
  // 手入力なし：従来どおり販売金額から計算する
  assert.deepEqual(amounts(buildEstimate(toiletOrder, { saleTotal: 98400, shippingFee: 0 }, null, {})), {
    header: yen(108240), unitPrice: yen(98400), amount: yen(98400), tax: yen(9840),
    subtotal: yen(98400), taxTotal: yen(9840), grandTotal: yen(108240),
  });
  // 合計金額（税込）だけを100,000円に直した：税抜と消費税は合計から割り戻す（以前は108,240円のままだった）
  const rounded = {
    header: yen(100000), unitPrice: yen(90909), amount: yen(90909), tax: yen(9091),
    subtotal: yen(90909), taxTotal: yen(9091), grandTotal: yen(100000),
  };
  assert.deepEqual(amounts(buildEstimate({ ...toiletOrder, manualGrandTotalTaxIn: "100000" }, { saleTotal: 98400, shippingFee: 0 }, null, {})), rounded);
  // 販売金額を90,909円にしたうえで合計を100,000円に直した：販売金額はそのまま、端数1円を消費税で合わせる
  assert.deepEqual(amounts(buildEstimate({ ...toiletOrder, saleUnitPrice: 90909, manualGrandTotalTaxIn: "100000" }, { saleTotal: 90909, shippingFee: 0 }, null, {})), rounded);
  // 手入力した値が自動計算と同じなら、明細は1円も動かさない
  assert.deepEqual(amounts(buildEstimate({ ...toiletOrder, manualGrandTotalTaxIn: "99999" }, { saleTotal: 90909, shippingFee: 0 }, null, {})), {
    header: yen(99999), unitPrice: yen(90909), amount: yen(90909), tax: yen(9090),
    subtotal: yen(90909), taxTotal: yen(9090), grandTotal: yen(99999),
  });
  // 空欄に戻したら自動計算へ戻る
  assert.equal(field(buildEstimate({ ...toiletOrder, manualGrandTotalTaxIn: "" }, { saleTotal: 98400, shippingFee: 0 }, null, {}), "grandTotalTaxIn"), yen(108240));
  // 送料込合計（税抜）を直したときは、それを小計にする
  assert.deepEqual(amounts(buildEstimate({ ...toiletOrder, manualGrandTotalTaxOut: "90000" }, { saleTotal: 98400, shippingFee: 0 }, null, {})), {
    header: yen(99000), unitPrice: yen(90000), amount: yen(90000), tax: yen(9000),
    subtotal: yen(90000), taxTotal: yen(9000), grandTotal: yen(99000),
  });
});

test("送料がある見積書でも、受注簿と同じく送料は10%で計算し、直した合計に合わせる", () => {
  const withShipping = { ...toiletOrder, shippingFee: "1000" };
  const shippingRow = (html) => [field(html, "shippingAmount"), field(html, "shippingTax")];
  // 合計金額（税込）を110,000円に直した：送料はそのまま、商品行で合計に合わせる
  const html = buildEstimate({ ...withShipping, manualGrandTotalTaxIn: "110000" }, { saleTotal: 98400, shippingFee: 1000 }, null, {});
  assert.deepEqual(shippingRow(html), [yen(1000), yen(100)]);
  assert.deepEqual(amounts(html), {
    header: yen(110000), unitPrice: yen(99000), amount: yen(99000), tax: yen(9900),
    subtotal: yen(100000), taxTotal: yen(10000), grandTotal: yen(110000),
  });
  // 軽減税率(8%)の商品でも送料の税は10%（受注簿の合計金額と一致させる）
  const reduced = buildEstimate({ ...withShipping, taxType: "8%" }, { saleTotal: 10000, shippingFee: 1000 }, null, {});
  assert.deepEqual(shippingRow(reduced), [yen(1000), yen(100)]);
  assert.equal(field(reduced, "tax"), yen(800));
  assert.equal(field(reduced, "grandTotalTaxIn"), yen(Math.floor(10000 * 1.08) + Math.floor(1000 * 1.1)));
});

test("見積書で金額を打ち直すと、全角数字でも上部の御見積金額まで計算し直す", () => {
  const html = buildEstimate({ ...toiletOrder, taxType: "8%", shippingFee: "1000" }, { saleTotal: 10000, shippingFee: 1000 }, null, {});
  const from = html.indexOf("var ESTIMATE_TAX_RATE=");
  const to = html.indexOf("function estRecalcTotals()", from);
  assert.ok(from > 0 && to > from);
  const { estNum, estRecalcRow } = new Function(`${html.slice(from, to)};return {estNum:estNum,estRecalcRow:estRecalcRow};`)();
  // 日本語入力のまま打つと全角になる。以前は0円として扱われ、合計も御見積金額も¥0になっていた
  assert.equal(estNum("９５，０００"), 95000);
  assert.equal(estNum("￥１２３，４５６"), 123456);
  assert.equal(estNum("ー５，０００"), -5000);
  assert.equal(estNum("¥90,909"), 90909);
  // 行の消費税：商品は商品の税率、送料の行は受注簿と同じ10%
  const row = (className, amount) => ({
    classList: { contains: (name) => className.split(" ").includes(name) },
    getAttribute: () => null,
    children: [{}, { textContent: "1" }, { textContent: amount }, { textContent: amount }, { textContent: "" }],
  });
  const product = row("itemRow", "１０，０００");
  estRecalcRow(product, 3);
  assert.equal(product.children[4].textContent, yen(800));
  const shipping = row("shippingRow itemRow", "1000");
  estRecalcRow(shipping, 3);
  assert.equal(shipping.children[4].textContent, yen(100));
});

// 商品2つ（トイレ1台・防水シーツ2枚）。受注簿の集計（multiProductTotals）と同じ計算で allTotals を作って渡す
const sheetItem = { ...toiletOrder, productName: "安寿 ポータブルトイレ用防水シーツ", modelNumber: "533-195", listPrice: "3000", listPriceTaxIn: "3300", quantity: "2", saleTotal: 4800 };
const multiTotals = (items) => items.reduce((t, item) => {
  const rate = item.taxType === "8%" ? 0.08 : item.taxType === "非課税" ? 0 : 0.1;
  const shipping = Number(item.shippingFee) || 0;
  t.saleTotal += item.saleTotal;
  t.shippingFee += shipping;
  t.grandTotalTaxOut += item.saleTotal + shipping;
  t.grandTotalTaxIn += Math.floor(item.saleTotal * (1 + rate)) + Math.floor(shipping * 1.1);
  return t;
}, { saleTotal: 0, shippingFee: 0, grandTotalTaxOut: 0, grandTotalTaxIn: 0 });
const buildMulti = (items) => buildMultiEstimate(items[0], { saleTotal: items[0].saleTotal, shippingFee: Number(items[0].shippingFee) || 0 }, null, {}, items, multiTotals(items));
// 明細の行ごとに、行の印（class・税率）と 数量・単価・金額・消費税 を読み取る
const multiRows = (html) => {
  const start = html.indexOf('<table class="estimateItemsTable">');
  const table = html.slice(start, html.indexOf("</table>", start));
  return [...table.matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/g)].filter((m) => !m[2].includes("<th")).map((m) => ({
    attrs: m[1].trim(),
    cells: [...m[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].slice(1).map((c) => c[1].replace(/<[^>]+>/g, "").trim()),
  }));
};

test("商品が2つ以上の見積書も、明細の合計と小計・消費税・御見積金額が一致する", () => {
  const html = buildMulti([{ ...toiletOrder, saleTotal: 98400, shippingFee: "1000" }, { ...sheetItem, taxType: "8%", shippingFee: "500" }]);
  const rows = multiRows(html);
  // 商品の行は税率を持つ（8%の商品が混ざっても行ごとに計算し直せる）。送料は単品の見積書と同じく送料の行にまとめる
  assert.deepEqual(rows.map((row) => row.attrs), ['class="itemRow" data-tax-rate="0.1"', 'class="itemRow" data-tax-rate="0.08"', 'class="shippingRow itemRow"']);
  assert.deepEqual(rows.map((row) => row.cells), [
    ["1", yen(98400), yen(98400), yen(9840)],
    ["2", yen(2400), yen(4800), yen(384)],
    // 以前は送料が見えず（小計と商品の消費税にだけ入っていた）、明細を足しても小計にならなかった
    ["1", yen(1500), yen(1500), yen(150)],
  ]);
  const sum = (index) => rows.reduce((total, row) => total + Number(row.cells[index].replace(/\D/g, "")), 0);
  assert.equal(field(html, "subtotalTable"), yen(sum(2)));
  assert.equal(field(html, "taxTable"), yen(sum(3)));
  assert.deepEqual([field(html, "subtotalTable"), field(html, "taxTable"), field(html, "grandTotalTable"), field(html, "grandTotalTaxIn")], [yen(104700), yen(10374), yen(115074), yen(115074)]);
  // 送料が無ければ送料の行は出さない
  const plain = buildMulti([{ ...toiletOrder, saleTotal: 98400 }, sheetItem]);
  assert.equal(multiRows(plain).length, 2);
  assert.equal(field(plain, "grandTotalTaxIn"), yen(113520));
});

test("商品が2つ以上の見積書でも、金額を打ち直すと小計・消費税・合計・御見積金額を計算し直す", () => {
  const html = buildMulti([{ ...toiletOrder, saleTotal: 98400 }, { ...sheetItem, taxType: "8%" }]);
  const from = html.indexOf("var ESTIMATE_TAX_RATE=");
  const to = html.indexOf("function estEnsureRowTools()", from);
  assert.ok(from > 0 && to > from);
  const cell = (text) => ({ textContent: text });
  const fakeRow = (rate, qty, unit, amount, tax) => ({
    classList: { contains: (name) => name === "itemRow" },
    getAttribute: (name) => (name === "data-tax-rate" ? rate : null),
    children: [cell(""), cell(qty), cell(unit), cell(amount), cell(tax)],
  });
  const rows = [fakeRow("0.1", "1", yen(98400), yen(98400), yen(9840)), fakeRow("0.08", "2", yen(2400), yen(4800), yen(384))];
  const fields = { subtotalTable: cell(""), taxTable: cell(""), grandTotalTable: cell(""), grandTotalTaxIn: { innerHTML: "" } };
  const document = {
    // 明細の行は、複数商品の表（.estimateItemsTable）からも拾うこと（以前は単品の表だけで、何も計算し直さなかった）
    querySelectorAll: (selector) => (selector.split(",").map((s) => s.trim()).includes(".estimateItemsTable tbody tr.itemRow") ? rows : []),
    querySelector: (selector) => fields[(selector.match(/^\[data-field=(\w+)\]$/) || [])[1]] || null,
  };
  const est = new Function("document", `${html.slice(from, to)};return {estRecalcRow:estRecalcRow,estRecalcTotals:estRecalcTotals};`)(document);
  // 1行目の金額を 90,909 に打ち直す
  rows[0].children[3].textContent = "90909";
  est.estRecalcRow(rows[0], 3);
  // 2行目（8%の商品）の数量を全角で「３」に打ち直す → 金額 2,400×3、消費税は8%
  rows[1].children[1].textContent = "３";
  est.estRecalcRow(rows[1], 1);
  est.estRecalcTotals();
  assert.equal(rows[0].children[4].textContent, yen(9090));
  assert.deepEqual([rows[1].children[3].textContent, rows[1].children[4].textContent], [yen(7200), yen(576)]);
  assert.deepEqual([fields.subtotalTable.textContent, fields.taxTable.textContent, fields.grandTotalTable.textContent], [yen(98109), yen(9666), yen(107775)]);
  assert.equal(fields.grandTotalTaxIn.innerHTML, yen(107775) + "&nbsp;&mdash;");
});

test("商品が2つ以上の見積書でも、明細行の追加・×での削除ができる", () => {
  const html = buildMulti([{ ...toiletOrder, saleTotal: 98400 }, sheetItem]);
  const script = html.slice(html.indexOf("function setupEstimateEditing()"), html.indexOf("setupOffice();setupClientLines();setupEstimateEditing();"));
  // 打ち直しの監視・行の追加は、単品の表と複数商品の表のどちらにも効く
  assert.match(script, /document\.querySelector\("\.itemTable, \.estimateItemsTable"\)/);
  const addRow = html.slice(html.indexOf("function estAddItemRow()"), html.indexOf("function estAddRemarkLine()"));
  assert.match(addRow, /document\.querySelector\("\.itemTable tbody, \.estimateItemsTable tbody"\)/);
  // 追加した行も複数商品の表の見た目（商品名の欄）にそろえる
  assert.match(addRow, /estimateItemsTableName/);
  // × は商品名の欄の右上に置く（位置の基準を作る）
  assert.match(html, /\.estimateItemsTable \.estimateItemsTableName\{[^}]*position:relative/);
  // 打ち直して桁が増えても欄からはみ出さないよう、文字の大きさを合わせ直す
  assert.match(html, /addEventListener\('focusout',function\(\)\{setTimeout\(autoFitEstimateItems,0\)\}\)/);
});

test("商品が2つ以上の見積書も太字を使わない", () => {
  const from = source.indexOf("const multiEstimateCss = '<style>");
  const to = source.indexOf("</style>';", from);
  assert.ok(from > 0 && to > from);
  const css = source.slice(from, to);
  const heavy = [...css.matchAll(/([^{}]+)\{[^}]*font-weight:\s*(?:[7-9]00|bold)[^}]*\}/g)].map((m) => m[1]);
  assert.deepEqual(heavy, []);
  // 見出し（th）と集計の金額（strong）はブラウザの既定が太字なので、500を明記する
  assert.match(css, /\.estimateItemsTable thead th\{[^}]*font-weight:500/);
  assert.match(css, /\.estimateAmountSummaryRow strong\{[^}]*font-weight:500/);
});

test("商品が2つ以上の見積書のPDFも、画面の幅によらず同じ文字の大きさで作る", () => {
  // 文字の大きさの自動調整（autoFitEstimateItems）は表示中のレイアウトで測る。以前は画面幅で測った大きさのまま
  // A4のレイアウト（html.pdfExport）に切り替えて取り込んでいたため、狭い画面で作るとPDFの文字の大きさが変わっていた
  assert.match(source, /docRoot\.classList\.add\("pdfExport"\);window\.dispatchEvent\(new Event\("estimatelayoutchange"\)\);await new Promise/);
  assert.match(source, /finally\{[^}]*classList\.remove\("pdfExport"\);window\.dispatchEvent\(new Event\("estimatelayoutchange"\)\);\}/);
  assert.match(source, /window\.addEventListener\('estimatelayoutchange',autoFitEstimateItems\)/);
});
