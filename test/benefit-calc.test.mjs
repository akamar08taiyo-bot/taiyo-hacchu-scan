import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

// main.jsx から関数定義を1つ取り出す（波かっこの対応をたどる）
function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} が見つかりません`);
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") { depth -= 1; if (depth === 0) return source.slice(start, i + 1); }
  }
  throw new Error(`${name} の終わりが見つかりません`);
}

// 給付計算に必要な関数だけを取り出して評価する（税計算・手入力金額は最小限の代用品）
const benefitCalc = new Function(`
  ${extractFunction("benefitNum")}
  ${extractFunction("benefitRatio")}
  function benefitDetails(e){return Array.isArray(e.benefitDetails)?e.benefitDetails:[]}
  function orderManualAmount(value, calculated){return calculated}
  function Ye(v){return v}
  ${extractFunction("benefitCalc")}
  return benefitCalc;
`)();

const calc = (total, burdenRatio, extra = {}) =>
  benefitCalc({ burdenRatio, benefitDetails: [], careInsuranceBalance: 200000, ...extra }, { grandTotalTaxIn: total, grandTotalTaxOut: 0 });

test("給付：利用者負担額＋保険者負担額が対象金額と一致する（1〜3割、小数誤差なし）", () => {
  for (const ratio of [1, 2, 3]) {
    for (let total = 1000; total <= 200000; total += 1) {
      const r = calc(total, ratio);
      assert.equal(r.userBurden + r.insurerBurden, total, `${ratio}割 ${total}円`);
    }
  }
});

test("給付：3割負担で 44,000円 は 13,200円／30,800円（以前は保険者負担が1円少なかった）", () => {
  const r = calc(44000, 3);
  assert.equal(r.userBurden, 13200);
  assert.equal(r.insurerBurden, 30800);
});

test("給付：生活保護は利用者負担0円・全額保険者負担", () => {
  const r = calc(44000, 1, { livingProtection: true });
  assert.equal(r.userBurden, 0);
  assert.equal(r.insurerBurden, 44000);
});
