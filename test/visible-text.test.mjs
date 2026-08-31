import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("status messages, PDF filename and known price notes are readable Japanese", () => {
  assert.match(source, /自動認識中/);
  assert.match(source, /画像を選択しました/);
  assert.match(source, /再認識する画像がありません/);
  assert.match(source, /販売受注簿_/);
  assert.match(source, /片足 3,795円\(税込\) \/ 両足 7,590円\(税込\)/);

  for (const broken of [
    "閾ｪ蜍戊ｪ崎ｭ倅ｸｭ",
    "逕ｻ蜒上ｒ驕ｸ謚槭＠縺ｾ縺励◆",
    "蜀崎ｪ崎ｭ倥☆繧狗判蜒上′縺ゅｊ縺ｾ縺帙ｓ",
    "雋ｩ螢ｲ蜿玲ｳｨ邁ｿ",
  ]) {
    assert.equal(source.includes(broken), false, `mojibake remains: ${broken}`);
  }
});

test("OCR recognizes readable Japanese labels for identifiers and prices", () => {
  assert.match(source, /JAN\(\?:コード\|CODE\)/);
  assert.match(source, /TAIS\(\?:コード\|CODE\)/);
  assert.match(source, /WEB\(\?:コード\|CODE\)/);
  assert.match(source, /小売価格\|小売\|定価/);
  assert.match(source, /卸売価格\|卸売\|仕切り\|仕切\|卸価格\|原価/);
});

test("the page has one consistent application title", () => {
  assert.equal([...indexHtml.matchAll(/<title>/g)].length, 1);
  assert.match(indexHtml, /<title>販売受注簿作成ツール<\/title>/);
  assert.equal(indexHtml.includes("<title>発注スキャン</title>"), false);
});
