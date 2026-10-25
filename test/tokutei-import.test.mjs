import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

// 特定福祉用具 購入申請書・見積もり作成（太陽ポータルの tokutei/）の見積もりから、商品を受け取る。
// 受け取りの部分（jutaku-import-begin〜end）と、給付内訳の差し替え（tokutei-benefit-begin〜end）を取り出して、実際に動かす。
const Ye = (value, taxType) => Math.floor(Number(value) * (1 + (taxType === "8%" ? 0.08 : taxType === "非課税" ? 0 : 0.1)));

function slice(begin, end) {
  const from = source.indexOf(begin);
  const to = source.indexOf(end);
  assert.ok(from > 0 && to > from, `${begin} が見つからない`);
  return source.slice(from, to);
}

function loadImport({ stored, search = "" }) {
  const store = new Map(stored === undefined ? [] : [["taiyo-hacchu-import-v1", JSON.stringify(stored)]]);
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const api = new Function(
    "localStorage",
    "location",
    "Ye",
    `${slice("/* jutaku-import-begin", "/* jutaku-import-end */")}\nreturn {readJutakuImport, clearJutakuImport, tokuteiImportPages, tokuteiFixedBenefit};`,
  )(localStorage, { search }, Ye);
  return { ...api, store };
}

// 受注簿の給付の計算（benefitCalc とその部品は1行ずつの関数）に、差し替えをかぶせたもの
function loadBenefitCalc() {
  const line = (name) => {
    const m = source.match(new RegExp(`^\\s*function ${name}\\(.*$`, "m"));
    assert.ok(m, `${name} が見つからない`);
    return m[0];
  };
  // benefitNum は長い行の途中にある1文の関数（中に「}」がない）
  const num = source.indexOf("function benefitNum(");
  assert.ok(num > 0, "benefitNum が見つからない");
  const code = [
    source.slice(num, source.indexOf("}", num) + 1),
    line("benefitRatio"),
    line("benefitDetails"),
    line("benefitCalc"),
    slice("/* jutaku-import-begin", "/* jutaku-import-end */"),
    slice("/* tokutei-benefit-begin", "/* tokutei-benefit-end */"),
    "return {benefitCalc, tokuteiImportPages};",
  ].join("\n");
  const orderManualAmount = (value, calculated) => (value === "" || value == null ? calculated : value);
  return new Function("Ye", "orderManualAmount", "localStorage", "location", code)(Ye, orderManualAmount, {}, { search: "" });
}

// ページの合計（受注簿の $e と同じ：販売金額＝販売単価×数量、税込＝切り捨て）
const totalsOf = (page) => {
  const sale = Math.floor(Number(page.saleUnitPrice) * Number(page.quantity));
  return { grandTotalTaxOut: sale, grandTotalTaxIn: Ye(sale, page.taxType) };
};

// 特定福祉用具のアプリが送る形（架空のお客様）。13,904円（税込）の商品2点・1割：
// ページごとに切り上げると 1,391＋1,391＝2,782円 だが、見積書の利用者負担は 27,808円の1割の切り上げ 2,781円。
const payload = (over = {}) => ({
  kind: "taiyo-tokutei-order",
  v: 1,
  createdAt: Date.now(),
  title: "見本 花子様 特定福祉用具",
  customerName: "見本 花子",
  furigana: "ミホン ハナコ",
  address: "福岡県行橋市中央1-1",
  tel: "0930-00-0000",
  sales: "久保",
  deliveryDate: "2026-11-05",
  insurer: "行橋市",
  payMethod: "受領委任払い",
  burdenRatio: 1,
  welfare: false,
  items: [
    { productName: "シャワーチェア 見本A", maker: "見本メーカー", modelNumber: "A-100", tais: "00000-000001", category: "入浴補助用具（入浴用いす）", supplier: "ケアマックス",
      quantity: 1, unit: "台", listPrice: 15800, cost: 9480, taxType: "10%", discountRate: 20, saleUnitPrice: 12640, totalTaxIn: 13904,
      careInsuranceBalance: 100000, benefit: { target: 13904, userBurden: 1391, aid: 0, insurerBurden: 12513 }, note: "" },
    { productName: "浴槽台 見本B", maker: "見本メーカー", modelNumber: "B-200", tais: "", category: "入浴補助用具（浴槽内いす）", supplier: "ウェルファン",
      quantity: 1, unit: "台", listPrice: 15800, cost: 9480, taxType: "10%", discountRate: 20, saleUnitPrice: 12640, totalTaxIn: 13904,
      careInsuranceBalance: 86096, benefit: { target: 13904, userBurden: 1390, aid: 0, insurerBurden: 12514 }, note: "" },
  ],
  ...over,
});

test("特定福祉用具の見積もりから届いた商品を読む（?from=tokutei。住宅改修のものも今までどおり読む）", () => {
  const ok = loadImport({ stored: payload(), search: "?from=tokutei" });
  assert.equal(ok.readJutakuImport().items.length, 2);
  ok.clearJutakuImport();
  assert.equal(ok.store.size, 0);
  // リンクから開いていなくても、1日以内のものは出す。古いものは黙って消す
  assert.ok(loadImport({ stored: payload() }).readJutakuImport());
  const old = loadImport({ stored: payload({ createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000 }) });
  assert.equal(old.readJutakuImport(), null);
  assert.equal(old.store.size, 0);
  // 古くても、特定福祉用具のリンクから開いたら出す（住宅改修のリンクの印では出さない）
  assert.ok(loadImport({ stored: payload({ createdAt: 0 }), search: "?from=tokutei" }).readJutakuImport());
  assert.equal(loadImport({ stored: payload({ createdAt: 0 }), search: "?from=jutaku" }).readJutakuImport(), null);
  // 知らない kind・商品が空は使わない
  for (const bad of [payload({ kind: "taiyo-other-order" }), payload({ kind: "constructor" }), payload({ items: [] })]) {
    const r = loadImport({ stored: bad, search: "?from=tokutei" });
    assert.equal(r.readJutakuImport(), null);
    assert.equal(r.store.size, 0);
  }
  // 住宅改修の発注書からの部材は今までどおり
  const jutaku = loadImport({ stored: { kind: "taiyo-jutaku-order", v: 1, createdAt: Date.now(), items: [{ productName: "手すり" }] }, search: "?from=jutaku" });
  assert.equal(jutaku.readJutakuImport().kind, "taiyo-jutaku-order");
});

test("商品1点を受注簿の給付の1ページにする（給付割合・SMARTれん太の販売分類・販売単価・介護保険の残り）", () => {
  const { tokuteiImportPages } = loadImport({});
  const base = { createdAt: "2026-10-22", orderType: "販売", customerName: "", address: "", sales: "久保", supplier: "ケアマックス", purchaser: "藤田", quantity: 1, unit: "台", taxType: "10%", discountRate: 20 };
  const pages = tokuteiImportPages(payload({ sales: "土居" }), base, 20);
  assert.equal(pages.length, 2);
  for (const p of pages) {
    assert.deepEqual(
      [p.orderType, p.burdenRatio, p.smartRentaSalesCategory, p.customerName, p.furigana, p.address, p.tel, p.sales, p.purchaser, p.deliveryDate, p.createdAt],
      ["給付", 1, "特定福祉用具", "見本 花子", "ミホン ハナコ", "福岡県行橋市中央1-1", "0930-00-0000", "土居", "藤田", "2026-11-05", "2026-10-22"],
    );
    assert.equal(p.livingProtection, undefined);
    assert.equal(p.fullSelfPay, undefined);
  }
  assert.deepEqual(
    pages.map((p) => [p.productName, p.maker, p.modelNumber, p.supplier, p.quantity, p.unit, p.listPrice, p.listPriceTaxIn, p.cost, p.taxType, p.saleUnitPrice, p.careInsuranceBalance]),
    [
      ["シャワーチェア 見本A", "見本メーカー", "A-100", "ケアマックス", "1", "台", "15800", 17380, "9480", "10%", 12640, 100000],
      ["浴槽台 見本B", "見本メーカー", "B-200", "ウェルファン", "1", "台", "15800", 17380, "9480", "10%", 12640, 86096],
    ],
  );
  assert.equal(new Set(pages.map((p) => p._multiId)).size, 2);
  // 定価のない商品（仕切×125%）・非課税・2割負担・数量2・生活保護
  const other = tokuteiImportPages(
    payload({
      burdenRatio: 2,
      welfare: true,
      deliveryDate: "",
      items: [{ productName: "ポータブルトイレ 見本C", quantity: 2, unit: "", listPrice: 0, cost: 10000, taxType: "非課税", discountRate: 20, saleUnitPrice: 12500, totalTaxIn: 25000, careInsuranceBalance: 0, benefit: {} }],
    }),
    base,
    20,
  );
  assert.deepEqual(
    [other[0].burdenRatio, other[0].livingProtection, other[0].quantity, other[0].unit, other[0].listPrice, other[0].saleUnitPrice, other[0].taxType, other[0].supplier, other[0].deliveryDate],
    [2, true, "2", "台", "", 12500, "非課税", "ケアマックス", undefined],
  );
  // 今年度の残りがないページは全額自己負担
  assert.deepEqual([other[0].careInsuranceBalance, other[0].fullSelfPay], [0, true]);
});

test("ページの給付内訳は、特定福祉用具のアプリが分けた金額（合計が見積書の利用者負担・保険者負担と同じ）", () => {
  const { benefitCalc, tokuteiImportPages } = loadBenefitCalc();
  const pages = tokuteiImportPages(payload(), { createdAt: "2026-10-22", sales: "久保", supplier: "ケアマックス" }, 20);
  const calc = pages.map((p) => benefitCalc(p, totalsOf(p)));
  assert.deepEqual(
    calc.map((b) => [b.totalTaxIn, b.target, b.userBurden, b.insurerBurden, b.ratio, b.insurerRatio]),
    [
      [13904, 13904, 1391, 12513, 1, 9],
      [13904, 13904, 1390, 12514, 1, 9],
    ],
  );
  assert.equal(calc[0].userBurden + calc[1].userBurden, 2781); // 見積書の利用者負担（27,808円の1割の切り上げ）

  // 受注簿で金額・数量・給付割合・商品名を直したら、ふつうの計算に戻る
  const edited = [{ ...pages[1], quantity: "2" }, { ...pages[1], burdenRatio: 2 }, { ...pages[1], productName: "浴槽台 見本B2" }, { ...pages[1], manualGrandTotalTaxIn: "13000" }];
  assert.deepEqual(
    edited.map((p) => benefitCalc(p, totalsOf(p)).userBurden),
    [2781, 2781, 1391, 1300],
  );
  // ほかの給付のページ（手で入れたもの）は今までどおり
  const manual = { orderType: "給付", burdenRatio: 3, saleUnitPrice: 82, quantity: "1", taxType: "10%", careInsuranceBalance: 200000 };
  assert.deepEqual([benefitCalc(manual, totalsOf(manual)).userBurden, benefitCalc(manual, totalsOf(manual)).insurerBurden], [27, 62]);

  // 3割：受注簿の計算（保険者負担＝切り捨て(対象×0.7)）では 90円 → 62円 になるが、アプリの金額（63円）を出す
  const three = tokuteiImportPages(
    payload({ burdenRatio: 3, items: [{ productName: "見本D", quantity: 1, listPrice: 0, cost: 0, taxType: "非課税", saleUnitPrice: 90, totalTaxIn: 90, careInsuranceBalance: 100000, benefit: { target: 90, userBurden: 27, insurerBurden: 63 } }] }),
    {},
    20,
  )[0];
  assert.deepEqual([benefitCalc(three, totalsOf(three)).userBurden, benefitCalc(three, totalsOf(three)).insurerBurden], [27, 63]);

  // 生活保護：利用者負担は 0、保険者負担は 9割の分（1割の分は介護扶助なので出さない）
  const welfare = tokuteiImportPages(payload({ welfare: true }), {}, 20);
  assert.deepEqual(
    welfare.map((p) => {
      p.tokuteiBenefit.userBurden = 0; // アプリは生活保護のとき利用者負担 0 で送る
      const b = benefitCalc(p, totalsOf(p));
      return [b.userBurden, b.insurerBurden];
    }),
    [
      [0, 12513],
      [0, 12514],
    ],
  );

  // 今年度の残りをこえたページ：対象は残りまで。残りがないページは全額自己負担（ふつうの計算で購入金額を利用者負担に）
  const over = tokuteiImportPages(
    payload({
      items: [
        { ...payload().items[0], careInsuranceBalance: 10000, benefit: { target: 10000, userBurden: 1000, insurerBurden: 9000 }, note: "限度額をこえた分 3,904円は全額自己負担" },
        { ...payload().items[1], careInsuranceBalance: 0, benefit: { target: 0, userBurden: 0, insurerBurden: 0 } },
      ],
    }),
    {},
    20,
  );
  assert.deepEqual(
    over.map((p) => {
      const b = benefitCalc(p, totalsOf(p));
      return [b.target, b.userBurden, b.insurerBurden, b.userPay];
    }),
    [
      [10000, 1000, 9000, 4904],
      [0, 13904, 0, 13904],
    ],
  );
  assert.match(over[0].note, /3,904円は全額自己負担/);
});

test("届いた商品を選ぶダイアログ・入れる・入れない（住宅改修と同じ口を kind で分ける）", () => {
  assert.match(source, /let tokutei=data\.kind===`taiyo-tokutei-order`,what=tokutei\?`商品`:`部材`/);
  assert.match(source, /tokutei\?`特定福祉用具の見積もりから商品が届いています`:`住宅改修の見積もりから部材が届いています`/);
  assert.match(source, /1点ずつ受注区分「給付」（\$\{ratio\}割）の商品ページになります/);
  assert.match(source, /tokutei&&\(0,j\.jsx\)\(`th`,\{children:`購入金額\(税込\)`\}\)/);
  assert.match(source, /let pages=\(tokutei\?tokuteiImportPages:jutakuImportPages\)\(data,/);
  assert.match(source, /h\(tokutei\?`特定福祉用具\$\{pages\.length\}点を入れました`:`見積もりの部材\$\{pages\.length\}点を入れました`\)/);
  assert.match(source, /`特定福祉用具は入れませんでした`:`見積もりの部材は入れませんでした`/);
  // 給付内訳の差し替えは、受注簿の画面・印刷・PDF のどれでも同じ benefitCalc を通る
  assert.match(source, /var benefitCalcBeforeTokutei=benefitCalc;\nbenefitCalc=function\(e,t\)\{/);
  assert.equal((source.match(/let bc=benefitCalc\(bpOrder,bpTotals\)/g) || []).length, 2);
  // 数量の見出しも右にそろえる（特定福祉用具は4列）
  assert.match(styles, /\.jutakuImportList th:nth-child\(3\),\n\.jutakuImportList th:last-child,/);
  // お知らせは短く（第29項）
  for (const m of ["特定福祉用具9点を入れました", "特定福祉用具は入れませんでした"]) assert.ok(m.length <= 16, m);
});

test("承認した見積もり（自動で送られた列 taiyo-hacchu-import-queue-v1）：受け取り口が空なら古い順に1つずつ。出したものは列から消す・30日より前は消す", () => {
  const order = (saleId, createdAt, name) => ({ kind: "taiyo-tokutei-order", v: 1, createdAt, saleId, title: `${name}様 特定福祉用具`, customerName: name, items: [{ productName: "見本の商品", quantity: 1, listPrice: 10000, saleUnitPrice: 8000, totalTaxIn: 8800, benefit: { target: 8800, userBurden: 880, aid: 0, insurerBurden: 7920 } }] });
  const now = Date.now();
  const { readJutakuImport, clearJutakuImport, store } = loadImport({});
  store.set("taiyo-hacchu-import-queue-v1", JSON.stringify([order("old", now - 40 * 24 * 3600 * 1000, "見本 古子"), order("s1", now - 1000, "見本 花子"), order("s2", now, "見本 太郎")]));
  const first = readJutakuImport();
  assert.equal(first.customerName, "見本 花子"); // 30日より前のものは黙って消す
  assert.equal(first.fromQueue, true);
  assert.equal(JSON.parse(store.get("taiyo-hacchu-import-queue-v1")).length, 2);
  clearJutakuImport(first);
  const second = readJutakuImport();
  assert.equal(second.customerName, "見本 太郎");
  clearJutakuImport(second);
  assert.equal(store.has("taiyo-hacchu-import-queue-v1"), false);
  assert.equal(readJutakuImport(), null);
  // 「📤 販売受注簿に転記」（受け取り口）が先。消すのは受け取り口のほうだけ
  store.set("taiyo-hacchu-import-v1", JSON.stringify(order("direct", now, "見本 直子")));
  store.set("taiyo-hacchu-import-queue-v1", JSON.stringify([order("s3", now, "見本 三郎")]));
  const direct = readJutakuImport();
  assert.equal(direct.customerName, "見本 直子");
  clearJutakuImport(direct);
  assert.equal(store.has("taiyo-hacchu-import-v1"), false);
  assert.equal(readJutakuImport().customerName, "見本 三郎");
});
