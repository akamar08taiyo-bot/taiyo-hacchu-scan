import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadParser } = require("./parser-harness.js");
const { nt, rt, $e, et } = loadParser();

// 管理情報の「利益額」「利益率」は、画面では
//   利益額 = 送料込合計(税抜) − 仕切り合計 = (販売金額 + 送料) − 仕切り×数量
// で表示している。入力欄に打ち込んだ値から販売単価を逆算する nt()/rt() が
// 送料を差し引いていないと、送料のある商品で「入力した値」と「再表示される値」が
// ずれる（利益額10,000と入れたら11,000で戻ってくる）。

function displayedProfit(order) {
  const totals = $e(order);
  return totals.grandTotalTaxOut - totals.costTotal;
}

function displayedProfitRate(order) {
  const totals = $e(order);
  const revenue = totals.grandTotalTaxOut;
  return revenue > 0 ? ((revenue - totals.costTotal) / revenue) * 100 : null;
}

test("利益額を入力したら、送料があっても同じ利益額で再表示される", () => {
  const base = { cost: "15435", quantity: "1", shippingFee: "1000", taxType: "10%", listPrice: "34300" };
  const saleUnitPrice = nt("10000", base.cost, base.quantity, base.shippingFee);
  const order = { ...base, saleUnitPrice: String(saleUnitPrice) };
  assert.equal(displayedProfit(order), 10000);
});

test("利益率を入力したら、送料があっても同じ利益率で再表示される", () => {
  const base = { cost: "15435", quantity: "1", shippingFee: "1000", taxType: "10%", listPrice: "34300" };
  const saleUnitPrice = rt("30", base.cost, base.quantity, base.shippingFee);
  const order = { ...base, saleUnitPrice: String(saleUnitPrice) };
  assert.equal(Math.round(displayedProfitRate(order) * 10) / 10, 30);
});

test("数量が複数でも利益額・利益率の往復が一致する", () => {
  // 販売単価は整数なので、数量で割り切れない端数は最大で数量−1円ずれる。
  // 送料を無視していた頃のような「送料ぶん丸ごとずれる」誤差でないことを見る。
  const base = { cost: "15435", quantity: "3", shippingFee: "500", taxType: "10%", listPrice: "34300" };

  const byProfit = { ...base, saleUnitPrice: String(nt("9000", base.cost, base.quantity, base.shippingFee)) };
  assert.ok(Math.abs(displayedProfit(byProfit) - 9000) < 3, `利益額=${displayedProfit(byProfit)}`);

  const byRate = { ...base, saleUnitPrice: String(rt("25", base.cost, base.quantity, base.shippingFee)) };
  assert.ok(Math.abs(displayedProfitRate(byRate) - 25) < 0.05, `利益率=${displayedProfitRate(byRate)}`);
});

test("送料が無い場合の従来の計算は変わらない", () => {
  const base = { cost: "15435", quantity: "1", shippingFee: "0", taxType: "10%", listPrice: "34300" };
  assert.equal(nt("10000", base.cost, base.quantity, base.shippingFee), 25435);
  assert.equal(rt("30", base.cost, base.quantity, base.shippingFee), 22050);
  // 送料の引数を渡さない呼び出し（旧シグネチャ）でも落ちない
  assert.equal(nt("10000", base.cost, base.quantity), 25435);
  assert.equal(rt("30", base.cost, base.quantity), 22050);
});

test("仕切りが未入力なら利益額・利益率の入力では販売単価を変えない", () => {
  assert.equal(nt("10000", "", "1", "1000"), "");
  assert.equal(rt("30", "", "1", "1000"), "");
});

test("送料が利益を食い切る場合でも販売単価は0で止まる（マイナスにしない）", () => {
  assert.equal(nt("0", "1000", "1", "5000"), 0);
  assert.equal(rt("0", "1000", "1", "5000"), 0);
});

test("割引率の逆算（定価と販売単価から）は従来どおり", () => {
  assert.equal(et(34300, 27440), 20);
  assert.equal(et(0, 100), 0);
});

test("新しい商品ページに前の商品の手入力訂正を持ち越さない", () => {
  // 手入力の訂正（送料込合計・仕切り税込）は商品ごとの値なので、
  // 商品を追加したり画像を読み直したときは自動計算に戻す。
  // 持ち越すと2件目の合計金額に1件目の訂正額が出たまま集計・見積書に乗る。
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const cleared = "manualGrandTotalTaxIn:``,manualGrandTotalTaxOut:``,manualCostTaxIn:``";
  const sliceAt = (marker, length) => {
    const at = source.indexOf(marker);
    assert.ok(at > 0, `${marker} が見つからない`);
    return source.slice(at, at + length);
  };
  assert.ok(sliceAt("function le(){", 400).includes(cleared), "再認識・商品追加時のクリアに手入力訂正が含まれていない");
  assert.ok(sliceAt("function multiBlankOrder(){", 400).includes(cleared), "新規商品ページの初期値に手入力訂正のクリアが無い");
});
