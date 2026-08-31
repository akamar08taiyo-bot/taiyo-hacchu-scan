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

test("benefit summary is assigned a stable layout beside the attached image", () => {
  assert.match(styles, /benefit order layout finalization/);
  assert.match(styles, /\.orderEntrySheet\.benefitMode \.management > \.benefitBreakdown/);
  assert.match(styles, /grid-template-areas: "benefitManagement benefitImage"/);
  assert.match(styles, /\.orderEntrySheet\.benefitMode \.orderAttachedImage img/);
});

test("benefit print stays on one A4 landscape page with its image", () => {
  assert.match(styles, /height: 202mm !important/);
  assert.match(styles, /grid-template-columns:[\s\S]{0,180}\.64fr \.72fr \.66fr/);
  assert.match(styles, /break-inside: avoid-page !important/);
  assert.match(styles, /page-break-inside: avoid !important/);
  assert.match(styles, /object-fit: contain !important/);
});
