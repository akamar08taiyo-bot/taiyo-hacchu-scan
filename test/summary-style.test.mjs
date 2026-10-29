// 集計（2枚目）は受注簿（1枚目）と同じ書式にする（ユーザーの指示「販売受注簿の2枚目だけ、書式が少し違います。1枚目と統一してください」2026-10-29）。
// 前の集計は本文が明朝体・見出しが太いゴシック・水色の細い線で、受注簿（ゴシック・受注簿の見出しの色と線）と違っていた
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildOrderXlsx } from "../src/lib/orderXlsx.mjs";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
/** コメントを外した CSS（コメントには「前は明朝体」と書いてある） */
const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

/** 無圧縮の zip（xlsxBook の zipStore）の中の文字のファイルを読む */
function unzip(bytes) {
  const files = {};
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    const size = view.getUint32(at + 18, true);
    const nameLen = view.getUint16(at + 26, true);
    const extra = view.getUint16(at + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + nameLen));
    const start = at + 30 + nameLen + extra;
    files[name] = new TextDecoder().decode(bytes.subarray(start, start + size));
    at = start + size;
  }
  return files;
}

test("画面・印刷・PDF：集計に明朝体を使わない。集計の書式の指定は1か所（古い世代を積み増さない）", () => {
  assert.doesNotMatch(rules, /Mincho|明朝/);
  for (const sel of [".multiSummarySheet", ".multiSummaryHead", ".multiSummaryTable", ".multiSummaryManagement"]) {
    assert.equal(css.split(`\n${sel} {`).length - 1, 1, sel);
  }
  assert.doesNotMatch(css, /\.multiManagement/);
  const block = css.slice(css.indexOf("\n.multiSummarySheet {"), css.indexOf("\n.multiCostError {"));
  assert.match(block, /font-family: inherit/);
  // 受注簿と同じ見出しの色と線（販売：#08375d・#1b506a、給付：#0b568f・#e5f4ff、明細の表：#bcdbe7・#c8e0e9）。太い明朝の見出しの色（#dcecff・#153f82）は使わない
  for (const v of ["#08375d", "#1b506a", "#eaf8fc", "#0b568f", "#e5f4ff", "#bcdbe7", "#c8e0e9", "#6b7f8f"]) assert.ok(block.includes(v), v);
  for (const v of ["#dcecff", "#153f82", "#c1d9ef"]) assert.ok(!block.includes(v), v);
});

test("集計の題名は受注簿と同じ字の間。商品がすべて給付なら給付の色。スマホの幅では明細の表を横に動かす", () => {
  assert.ok(source.includes("`受 注 簿 【 販 売 】 集 計`"));
  assert.ok(source.includes("multiSummarySheet${t.every(i=>i?.orderType===`給付`)?` summaryBenefit`:``}"));
  assert.ok(source.includes("className:`multiSummaryScroll`"));
  assert.match(css, /@media \(max-width: 640px\) \{\n  \.multiSummaryHead \{\n    grid-template-columns: 1fr;/);
  // 印刷・PDF は画面の幅によらずパソコンと同じ並び
  assert.match(css, /@media print \{[^}]*\n  \.multiSummaryHead \{\n    grid-template-columns: 1\.4fr \.8fr \.8fr !important;/);
});

test("Excel：集計のシートも受注簿のページと同じ字（游ゴシック）・見出しの色・題名の上の線", () => {
  const summary = {
    title: "受 注 簿 【 販 売 】 集 計",
    head: [["顧客名", "見本 花子"], ["商品数", "2件"], ["日付", "2026/10/29"]],
    cols: ["商品名", "申込番号", "WEBコード", "型番", "色・サイズ", "数量", "送料(税抜)", "販売金額(税抜)", "合計金額(税込)", "仕切り(税抜)"],
    rows: [["シャワーチェア 見本A", "", "", "A-100", "", "1台", "0円", "12,640円", "13,904円", "9,480円"], ["浴槽台 見本B", "", "", "B-200", "", "1台", "0円", "11,040円", "12,144円", "8,280円"]],
    mgmt: [["販売合計(税抜)", "23,680円", "販売合計(税込)", "26,048円"], ["送料合計(税抜)", "0円", "送料込み合計(税込)", "26,048円"], ["仕切り合計(税抜)", "17,760円", "仕切り合計(税込)", "19,536円"], ["利益額", "5,920円", "利益率", "25%"]],
    error: "",
  };
  const files = unzip(buildOrderXlsx([], summary));
  const styles = files["xl/styles.xml"];
  // 1つめの字はブックの既定（セルには使わない）。セルの字はみな游ゴシック
  const fonts = [...styles.matchAll(/<font>[\s\S]*?<\/font>/g)].map(([f]) => f.match(/<name val="([^"]*)"/)?.[1]).slice(1);
  assert.ok(fonts.length > 1);
  assert.deepEqual([...new Set(fonts)], ["游ゴシック"]);
  // 受注簿のページの見出しの地（EAF4FF）・明細の表の見出しの地（EAF8FC）。前の集計の DCECFF・EFF7FF は使わない
  assert.match(styles, /EAF4FF/);
  assert.match(styles, /EAF8FC/);
  assert.doesNotMatch(styles, /DCECFF|EFF7FF|C1D9EF/);
  assert.ok(files["xl/sharedStrings.xml"].includes("受 注 簿 【 販 売 】 集 計"));
});
