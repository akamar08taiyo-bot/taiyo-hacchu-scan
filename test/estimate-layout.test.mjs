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
  const from = source.indexOf("'*{box-sizing:border-box}body{margin:0;background:#eef5fb");
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
