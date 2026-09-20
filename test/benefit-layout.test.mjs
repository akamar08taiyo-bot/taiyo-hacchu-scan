import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("switching order type preserves the rest of the order state", () => {
  assert.match(source, /let r=\{\.\.\.t,\[e\]:n\}/);
  assert.match(source, /onChange:\(\)=>o\(`orderType`,t\)/);
  assert.doesNotMatch(source, /e===`orderType`[^}]{0,300}(burdenRatio|productName|listPrice|cost)=/);
});

test("benefit mode keeps the sales layout and only appends the breakdown", () => {
  assert.match(styles, /benefit order layout finalization/);
  assert.match(styles, /\.orderEntrySheet\.benefitMode \.management > \.benefitBreakdown/);

  // 給付でも帳票下部の組み方は販売と同じ。以前は世代違いの上書きが
  // .management を display:contents にしたり entryBottom を別のグリッドに
  // 組み替えたりして、管理情報が消える・給付内訳が重なる原因になっていた。
  assert.doesNotMatch(styles, /benefitMode[^{]*\{[^}]*display:\s*contents/);
  assert.doesNotMatch(styles, /benefitMode \.entryBottom \{[^}]*grid-template-areas/);
  assert.doesNotMatch(styles, /:has\([^)]*orderTypeChecks/);

  // 使われていない旧給付パネルのクラスにスタイルを付け直さない。
  assert.doesNotMatch(styles, /\.benefitPanel(Blue)?\b/);
  assert.doesNotMatch(source, /benefitPanel(Blue)?/);
});

test("benefit summary states the ratio and both burden shares", () => {
  assert.match(source, /給付割合/);
  assert.match(source, /利用者負担額\(\$\{bc\.ratio\}割・税込\)/);
  assert.match(source, /保険者負担額\(\$\{bc\.insurerRatio\}割・税込\)/);
  assert.match(source, /insurerRatio:10-l/);
});

test("benefit print stays on one A4 landscape page with its image", () => {
  // A4横・余白4mmで使える高さは202mm。ぴったり202mmを指定すると枠線ぶんの端数で
  // はみ出して2ページに割れたため、少しだけ小さい高さに固定して1ページへ収める。
  const forcedHeight = styles.match(/\.orderEntrySheet\.benefitMode \{\s*box-sizing: border-box !important;\s*height: (\d+)mm !important/);
  assert.ok(forcedHeight, "給付モードの印刷高さの指定が見つからない");
  const heightMm = Number(forcedHeight[1]);
  assert.ok(heightMm <= 200 && heightMm >= 190, `印刷高さ ${heightMm}mm は 190〜200mm の範囲にする`);
  assert.match(styles, /min-height: \d+mm !important/);
  assert.match(styles, /max-height: \d+mm !important/);
  assert.match(styles, /grid-template-columns:[\s\S]{0,180}\.64fr \.72fr \.66fr/);
  assert.match(styles, /break-inside: avoid-page !important/);
  assert.match(styles, /page-break-inside: avoid !important/);
  assert.match(styles, /object-fit: contain !important/);
});
