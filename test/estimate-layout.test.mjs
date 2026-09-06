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
  // 帳票の要素に 800/900 の太字を残さない（画面だけのツールバーは対象外）
  const heavy = [...sheetCss.matchAll(/\.[A-Za-z][^{]*\{[^}]*font-weight:\s*(?:800|900)[^}]*\}/g)]
    .map((m) => m[0].slice(0, m[0].indexOf("{")))
    .filter((selector) => !selector.includes(".toolbar"));
  assert.deepEqual(heavy, []);
  // 強調は表題・自社名・金額に絞る
  assert.match(sheetCss, /\.title\{[^}]*font-weight:700/);
  assert.match(sheetCss, /\.companyName\{[^}]*font-weight:700/);
  assert.match(sheetCss, /\.totalValue\{[^}]*font-weight:700/);
  assert.match(sheetCss, /\.itemTable th\{[^}]*font-weight:500\}/);
  assert.match(sheetCss, /\.productTitle\{[^}]*font-weight:500/);
});
