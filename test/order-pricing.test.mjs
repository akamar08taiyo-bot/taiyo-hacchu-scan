import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyPriceEdit, orderPriceTotals, adoptLegacyManualTotals, withoutTax, withTax } from "../src/lib/orderPricing.mjs";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

// 不具合の報告のスクリーンショットと同じ値（定価8,980円・仕切り5,388円・割引25%）
const base = { listPrice: "8980", listPriceTaxIn: "9878", cost: "5388", saleUnitPrice: 6735, shippingFee: 0, discountRate: 25, taxType: "10%", quantity: 1 };

// 管理情報の12の欄に出る値（画面の PriceInput に渡す値と同じ）
const view = (o) => {
  const t = orderPriceTotals(o);
  return {
    定価税抜: Number(o.listPrice), 定価税込: Number(o.listPriceTaxIn), 仕切り税抜: Number(o.cost), 仕切り税込: t.costTaxIn,
    販売単価: Number(o.saleUnitPrice), 送料: Number(o.shippingFee), 割引率: Number(o.discountRate),
    合計税抜: t.grandTotalTaxOut, 合計税込: t.grandTotalTaxIn, 利益額: t.profit, 利益率: Math.round(t.profitRate * 10) / 10,
  };
};

// どの欄を打っても、ほかの欄は同じ式でそろっている（税込＝切り捨て、利益額＝送料込合計(税抜)−仕切り、利益率＝利益額÷送料込合計(税抜)）
const assertConsistent = (o) => {
  const v = view(o), t = orderPriceTotals(o);
  const qty = Number(o.quantity);
  assert.equal(v.合計税抜, t.saleTotal + v.送料);
  if (!o.manualGrandTotalTaxOut) assert.equal(t.saleTotal, Math.floor(v.販売単価 * qty));
  if (!o.manualGrandTotalTaxIn) assert.equal(v.合計税込, withTax(t.saleTotal, o.taxType) + withTax(v.送料, "10%"));
  if (!o.manualCostTaxIn) assert.equal(v.仕切り税込, withTax(o.cost, o.taxType));
  assert.equal(v.利益額, v.合計税抜 - Math.floor(v.仕切り税抜 * qty));
  assert.equal(v.利益率, Math.round((v.利益額 / v.合計税抜) * 1000) / 10);
  assert.equal(v.割引率, Math.max(0, Math.round((1 - v.販売単価 / v.定価税抜) * 1000) / 10));
};

test("送料込合計(税抜)を打つと、販売単価・割引率・税込・利益額・利益率が動く（報告の 6,700円）", () => {
  const o = applyPriceEdit(base, "grandTotalTaxOut", "6700");
  assert.deepEqual(view(o), {
    定価税抜: 8980, 定価税込: 9878, 仕切り税抜: 5388, 仕切り税込: 5926, 販売単価: 6700, 送料: 0, 割引率: 25.4,
    合計税抜: 6700, 合計税込: 7370, 利益額: 1312, 利益率: 19.6,
  });
  assertConsistent(o);
});

test("送料込合計(税込)を打つと、税抜に割り戻して全部が動く", () => {
  const o = applyPriceEdit(base, "grandTotalTaxIn", "8000");
  assert.equal(view(o).販売単価, 7273);
  assert.equal(view(o).合計税込, 8000);
  assertConsistent(o);
  // 1.1倍で1つ飛ぶ税込（10円＝9円の税込9円と10円の税込11円の間）は、打った金額のまま出す
  const odd = applyPriceEdit(base, "grandTotalTaxIn", "100000");
  assert.equal(odd.saleUnitPrice, 90909);
  assert.equal(orderPriceTotals(odd).grandTotalTaxIn, 100000);
});

test("利益率・利益額を打つと、販売単価・合計・割引率が動く（送料があっても打った値になる）", () => {
  let o = applyPriceEdit(base, "profitRate", "30");
  assert.equal(view(o).利益率, 30);
  assertConsistent(o);
  o = applyPriceEdit(o, "profit", "2000");
  assert.equal(view(o).利益額, 2000);
  assertConsistent(o);
  // 前は送料を入れずに販売単価を出していたので、送料500円だと利益額が2,500円になっていた
  const ship = applyPriceEdit({ ...base, shippingFee: "500" }, "profit", "2000");
  assert.equal(view(ship).利益額, 2000);
  assertConsistent(ship);
  const shipRate = applyPriceEdit({ ...base, shippingFee: "500" }, "profitRate", "25");
  assert.equal(view(shipRate).利益率, 25);
  assertConsistent(shipRate);
});

test("仕切り(税込)を打つと仕切り(税抜)・利益が動き、仕切り(税抜)・税区分を変えると仕切り(税込)が動く", () => {
  let o = applyPriceEdit(base, "costTaxIn", "5000");
  assert.equal(o.cost, "4546");
  assert.equal(view(o).仕切り税込, 5000);
  assertConsistent(o);
  o = applyPriceEdit(o, "cost", "5388");
  assert.equal(view(o).仕切り税込, 5926);
  o = applyPriceEdit(o, "taxType", "8%");
  assert.equal(view(o).仕切り税込, 5819);
  assert.equal(view(o).定価税込, 9698);
  assertConsistent(o);
});

test("販売単価・割引率・定価・送料・数量を打っても、合計・税込・利益がついてくる（前の手入力の合計で止まらない）", () => {
  let o = applyPriceEdit(base, "grandTotalTaxOut", "6700");
  for (const [field, value] of [["discountRate", "20"], ["saleUnitPrice", "7000"], ["listPrice", "10000"], ["listPriceTaxIn", "9878"], ["shippingFee", "800"], ["quantity", "3"]]) {
    o = applyPriceEdit(o, field, value);
    assertConsistent(o);
  }
  // 定価を変えたときは割引率（22%）のまま販売単価を出し直す：8,980円×78%＝7,004円
  assert.deepEqual(view(o), {
    定価税抜: 8980, 定価税込: 9878, 仕切り税抜: 5388, 仕切り税込: 5926, 販売単価: 7004, 送料: 800, 割引率: 22,
    合計税抜: 21812, 合計税込: 23993, 利益額: 5648, 利益率: 25.9,
  });
});

test("数量で割り切れない合計は打った金額のまま出し、販売単価が別の値に変わったら古い金額は使わない", () => {
  let o = applyPriceEdit({ ...base, quantity: "2" }, "grandTotalTaxOut", "13401");
  assert.equal(o.saleUnitPrice, 6701);
  assert.equal(orderPriceTotals(o).grandTotalTaxOut, 13401);
  assert.equal(orderPriceTotals(o).profit, 13401 - 5388 * 2);
  // 送料を変えても、商品の分（13,401円）はそのまま
  o = applyPriceEdit(o, "shippingFee", "500");
  assert.equal(orderPriceTotals(o).grandTotalTaxOut, 13901);
  // 読み取り・設定などで販売単価だけ変わったときは、残っていた金額を使わない
  const rescanned = { ...o, saleUnitPrice: 7000 };
  assert.equal(orderPriceTotals(rescanned).grandTotalTaxOut, 14500);
});

test("打っている途中（空・「-」）では、ほかの欄を書きかえない", () => {
  for (const field of ["grandTotalTaxOut", "grandTotalTaxIn", "profit", "profitRate"]) {
    const o = applyPriceEdit(base, field, "");
    assert.equal(o.saleUnitPrice, 6735, field);
    assert.equal(applyPriceEdit(base, field, "-").saleUnitPrice, 6735, field);
  }
  // 仕切りが空なら、利益から販売単価は出せない（そのまま）
  assert.equal(applyPriceEdit({ ...base, cost: "" }, "profit", "1000").saleUnitPrice, 6735);
  // 全角で打っても数字として読む
  assert.equal(applyPriceEdit(base, "grandTotalTaxOut", "６７００").saleUnitPrice, 6700);
});

test("税込から税抜は、税を足して切り捨てるとその税込になる金額", () => {
  for (const taxType of ["10%", "8%", "非課税"]) {
    for (let x = 0; x < 3000; x += 7) {
      const r = withoutTax(withTax(x, taxType), taxType);
      assert.deepEqual(r, { value: x, exact: true }, `${taxType} ${x}`);
    }
  }
  assert.deepEqual(withoutTax(10, "10%"), { value: 9, exact: false });
});

test("前の版の下書き（手入力の合計がほかと別に残っていた）は、開き直すとその金額にそろえる", () => {
  const legacy = { ...base, manualGrandTotalTaxOut: "6700" };
  // そのままでは使わない（販売単価 6,735円から出す）
  assert.equal(orderPriceTotals(legacy).grandTotalTaxOut, 6735);
  const adopted = adoptLegacyManualTotals(legacy);
  assert.equal(adopted.saleUnitPrice, 6700);
  assertConsistent(adopted);
  assert.equal(adoptLegacyManualTotals(base), base);
});

test("受注簿の画面は、管理情報・販売金額・合計金額の欄をすべて連動の計算につなぐ", () => {
  assert.match(source, /function \$e\(e\)\{return orderPriceTotals\(e\)\}/);
  assert.match(source, /function D\(e,n\)\{if\(PRICE_EDIT_FIELDS\.has\(e\)\)\{t\(t=>applyPriceEdit\(t,e,n\)\);return\}/);
  // 前は「手入力の値を残すだけ」で、ほかの欄に届いていなかった
  assert.doesNotMatch(source, /o\(`manualCostTaxIn`|o\(`manualGrandTotalTaxOut`|o\(`manualGrandTotalTaxIn`/);
  for (const field of ["costTaxIn", "grandTotalTaxOut", "grandTotalTaxIn"]) {
    assert.match(source, new RegExp(`\\(0,j\\.jsx\\)\\(PriceInput,\\{[^}]*onChange:e=>o\\(\`${field}\`,e\\)`));
  }
  for (const handler of ["discountRate", "saleUnitPrice", "saleTotal", "profit", "profitRate"]) {
    assert.match(source, new RegExp(`applyPriceEdit\\(e,\`${handler}\`,n\\)`));
  }
  // 打っている間は打った文字のまま（欄を離れたら計算した値）
  assert.match(source, /value:draft\?\?\(v\?\?``\),onFocus:ev=>\{setDraft\(String\(v\?\?``\)\);ev\.currentTarget\.select\(\)\},onBlur:\(\)=>setDraft\(null\)/);
  // 見積書・給付・印刷も、同じ計算の合計を使う
  assert.match(source, /var ov=priceOverrides\(o\), manualTaxOut=ov\.grandTotalTaxOut, manualTaxIn=ov\.grandTotalTaxIn;/);
  assert.match(source, /a=benefitNum\(t\.grandTotalTaxIn\)\|\|r/);
  assert.doesNotMatch(source, /orderManualAmount/);
});
