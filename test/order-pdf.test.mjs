import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("販売受注簿はツールバーからそのままPDFにできる", () => {
  // ツールバーの「PDF保存」から呼ぶ（作成中は押せなくするので文言も切り替わる）
  assert.match(source, /onClick:pdfDownload,disabled:pdfBusy,children:pdfBusy\?`PDF作成中…`:`PDF保存`/);
  assert.match(source, /async function pdfDownload\(\)/);
  // A4横・余白6mm。1枚に収める（はみ出しても分割せず縮小）
  assert.match(source, /orientation:`landscape`,unit:`mm`,format:`a4`/);
  assert.match(source, /if\(imgH>availH\)\{imgW=imgW\*availH\/imgH;imgH=availH\}/);
});

test("PDFは印刷と同じ見た目にする（印刷用CSSを流用し、後始末する）", () => {
  // @media print の中身を取り出して一時的に適用する。印刷用CSSを二重に持たない
  assert.match(source, /function collectPrintCssText\(\)/);
  assert.match(source, /if\(rule\.media&&\/print\/\.test\(rule\.media\.mediaText\|\|``\)\)/);
  assert.match(source, /document\.head\.appendChild\(printCss\)/);
  assert.match(source, /finally\{\s*printCss\.remove\(\);/);
  // 画面幅で仕上がりが変わらないよう、取り込み中はA4横の実寸に固定する
  assert.match(source, /\.orderEntrySheet\{width:289mm!important;[^`]*min-height:202mm!important/);
});

test("複数ページは印刷と同じ並びで、入力欄は文字に置き換えてから描く", () => {
  // 印刷CSS適用後に見えているシートだけを対象にする（隠しページを二重に出さない）
  assert.match(source, /\[\.\.\.document\.querySelectorAll\(`\.orderEntrySheet`\)\]\.filter\(el=>\{/);
  assert.match(source, /return rect\.width>0&&rect\.height>0/);
  // html2canvas は input の値を本来と違う位置に描くので、複製側で文字に置き換える
  assert.match(source, /function pdfFreezeFormControls\(cloneDoc\)/);
  assert.match(source, /onclone:pdfFreezeFormControls/);
  assert.match(source, /if\(el\.type===`radio`\|\|el\.type===`checkbox`\)continue/);
});
