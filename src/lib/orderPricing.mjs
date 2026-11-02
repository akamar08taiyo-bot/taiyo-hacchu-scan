/* 受注簿の管理情報の金額を、どれを打っても全部が連動して動くようにする計算（ユーザーの指示「全ての数字が連動して動くようにする
   利益率、税抜、税込み、などすべて」2026-11-02。Learnings.md 第51項）。

   もとになる値（受注簿に持つ値）：定価(税抜) listPrice・定価(税込) listPriceTaxIn・仕切り(税抜) cost・販売単価(税抜) saleUnitPrice・
   割引率 discountRate・送料(税抜) shippingFee・数量 quantity・税区分 taxType。
   ほかの欄（仕切り(税込)・販売金額・送料込合計(税抜)・送料込合計(税込)・利益額・利益率）は、もとになる値から出す。
   出す欄を打ったときは、もとになる値を逆に求める（applyPriceEdit）。

   1円単位に割り切れないとき（数量2で合計が奇数、税込から税抜にすると1.1倍で1つ飛ぶ金額）は、打った金額をそのまま
   manualGrandTotalTaxOut・manualGrandTotalTaxIn・manualCostTaxIn に残して、その金額で出す（見積書もこの金額）。
   残した金額は、もとになる値がそこから求めた値のままのときだけ使う（priceOverrides）。読み取り・設定・リセットなどで販売単価や
   仕切りが別の値になったら、古い金額は使わない（前は手入力の金額が残り続けて、合計だけが動かなかった）。

   利益額は 送料込合計(税抜) − 仕切り合計（前から画面・印刷・集計はこの式。送料も売上に入れる）。利益率は 利益額 ÷ 送料込合計(税抜)。 */

export const num = (value) => {
  const n = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/* 打った文字を数にする。空・「-」だけ・「20.」の途中（type=number は空で届く）は null（＝まだ決まっていない） */
export const parseEntry = (value) => {
  const text = String(value ?? '').normalize('NFKC').trim();
  if (text === '') return null;
  const n = Number(text.replace(/[^\d.-]/g, ''));
  return text.replace(/[^\d]/g, '') === '' || !Number.isFinite(n) ? null : n;
};

const manualValue = (value) => (value === '' || value == null ? null : num(value));

export const taxRateOf = (taxType) => (taxType === '8%' ? 0.08 : taxType === '非課税' ? 0 : 0.1);

/* 税込（切り捨て）。main.jsx の Ye と同じ式 */
export const withTax = (value, taxType) => Math.floor(num(value) * (1 + taxRateOf(taxType)));

/* 税込から税抜。税を足して切り捨てるとその税込になる税抜があればそれ（10%・8% では1つしかない）、なければ割り戻して四捨五入。 */
export function withoutTax(taxIn, taxType) {
  const target = Math.max(0, Math.round(num(taxIn)));
  const guess = Math.max(0, Math.round(target / (1 + taxRateOf(taxType))));
  for (const x of [guess, guess - 1, guess + 1]) {
    if (x >= 0 && withTax(x, taxType) === target) return { value: x, exact: true };
  }
  return { value: guess, exact: false };
}

/* 割引率（定価に対して何％引きか。0.1％単位）。main.jsx の et と同じ式 */
export const discountFor = (listPrice, saleUnit) => {
  const list = num(listPrice);
  return list <= 0 ? 0 : Math.max(0, Math.round((1 - num(saleUnit) / list) * 1000) / 10);
};

const saleUnitFromDiscount = (listPrice, rate) => Math.floor(num(listPrice) * (100 - num(rate)) / 100);

const quantityOf = (order) => Math.max(0, num(order.quantity));

const baseSaleUnit = (order) =>
  order.saleUnitPrice === '' ? saleUnitFromDiscount(order.listPrice, order.discountRate) : num(order.saleUnitPrice);

/* 残した金額のうち、いまも使えるもの（もとになる値がそこから求めた値のまま）。使えないものは null */
export function priceOverrides(order) {
  const o = order || {};
  const shipping = num(o.shippingFee || 0);
  const qty = quantityOf(o);
  const unit = baseSaleUnit(o);
  let saleTotal = Math.floor(unit * qty);
  let grandTotalTaxOut = null;
  const out = manualValue(o.manualGrandTotalTaxOut);
  if (out !== null && out >= shipping) {
    const sale = out - shipping;
    if (Math.round(sale / Math.max(1, qty)) === unit) {
      grandTotalTaxOut = out;
      saleTotal = sale;
    }
  }
  let grandTotalTaxIn = null;
  const shippingTaxIn = withTax(shipping, '10%');
  const taxIn = manualValue(o.manualGrandTotalTaxIn);
  if (taxIn !== null && taxIn >= shippingTaxIn && withoutTax(taxIn - shippingTaxIn, o.taxType).value === saleTotal) {
    grandTotalTaxIn = taxIn;
  }
  let costTaxIn = null;
  const costIn = manualValue(o.manualCostTaxIn);
  if (costIn !== null && o.cost !== '' && o.cost != null && withoutTax(costIn, o.taxType).value === num(o.cost)) {
    costTaxIn = costIn;
  }
  return { grandTotalTaxOut, grandTotalTaxIn, costTaxIn };
}

/* 受注簿の合計（main.jsx の $e）。キーは前と同じ＋仕切り(税込)の単価・合計と、使った手入力の金額 */
export function orderPriceTotals(order) {
  const o = order || {};
  const qty = quantityOf(o);
  const list = num(o.listPrice);
  const cost = o.cost === '' ? null : num(o.cost);
  const saleUnit = baseSaleUnit(o);
  const shipping = num(o.shippingFee || 0);
  const ov = priceOverrides(o);
  const saleTotal = ov.grandTotalTaxOut === null ? Math.floor(saleUnit * qty) : ov.grandTotalTaxOut - shipping;
  const grandTotalTaxOut = saleTotal + shipping;
  const shippingTaxIn = withTax(shipping, '10%');
  const grandTotalTaxIn = ov.grandTotalTaxIn === null ? withTax(saleTotal, o.taxType) + shippingTaxIn : ov.grandTotalTaxIn;
  const costTotal = cost === null ? null : Math.floor(cost * qty);
  const costTaxIn = cost === null ? null : ov.costTaxIn === null ? withTax(cost, o.taxType) : ov.costTaxIn;
  const costTotalTaxIn = cost === null ? null : ov.costTaxIn === null ? withTax(costTotal, o.taxType) : Math.floor(ov.costTaxIn * qty);
  const profit = costTotal === null ? null : grandTotalTaxOut - costTotal;
  return {
    saleUnit,
    saleTotal,
    shippingFee: shipping,
    grandTotalTaxOut,
    grandTotalTaxIn,
    costTotal,
    costTaxIn,
    costTotalTaxIn,
    profit,
    profitRate: profit === null || grandTotalTaxOut <= 0 ? null : (profit / grandTotalTaxOut) * 100,
    listPriceTaxIn: o.listPriceTaxIn ? num(o.listPriceTaxIn) : withTax(list, o.taxType),
    saleTotalTaxIn: grandTotalTaxIn - shippingTaxIn,
    manualTaxOut: ov.grandTotalTaxOut,
    manualTaxIn: ov.grandTotalTaxIn,
  };
}

const CLEAR_SALE = { manualGrandTotalTaxOut: '', manualGrandTotalTaxIn: '' };

/* 送料込合計(税抜) を決めて、販売単価・割引率を逆に求める */
function setGrandTotalTaxOut(order, value) {
  const shipping = num(order.shippingFee || 0);
  const total = Math.max(Math.round(value), shipping);
  const sale = total - shipping;
  const qty = quantityOf(order);
  const unit = Math.max(0, Math.round(sale / Math.max(1, qty)));
  return {
    ...order,
    saleUnitPrice: unit,
    discountRate: discountFor(order.listPrice, unit),
    manualGrandTotalTaxOut: Math.floor(unit * qty) === sale ? '' : String(total),
    manualGrandTotalTaxIn: '',
  };
}

const yenText = (n) => String(Math.max(0, Math.round(n)));

/* 管理情報などの欄を1つ打ったときの受注簿。field は受注簿の値の名前か、出す欄の名前
   （costTaxIn・saleTotal・grandTotalTaxOut・grandTotalTaxIn・profit・profitRate）。 */
export function applyPriceEdit(order, field, raw) {
  const o = order || {};
  const v = parseEntry(raw);
  switch (field) {
    case 'listPrice': {
      if (v === null) return { ...o, listPrice: '', listPriceTaxIn: '', saleUnitPrice: '', ...CLEAR_SALE };
      const listPrice = yenText(v);
      return { ...o, listPrice, listPriceTaxIn: withTax(listPrice, o.taxType), saleUnitPrice: saleUnitFromDiscount(listPrice, o.discountRate), ...CLEAR_SALE };
    }
    case 'listPriceTaxIn': {
      if (v === null) return { ...o, listPriceTaxIn: '', listPrice: '', saleUnitPrice: '', ...CLEAR_SALE };
      const listPriceTaxIn = yenText(v);
      const rate = taxRateOf(o.taxType);
      const listPrice = rate === 0 ? num(listPriceTaxIn) : Math.round(num(listPriceTaxIn) / (1 + rate));
      return { ...o, listPriceTaxIn, listPrice, saleUnitPrice: saleUnitFromDiscount(listPrice, o.discountRate), ...CLEAR_SALE };
    }
    case 'taxType':
      return {
        ...o,
        taxType: raw,
        listPriceTaxIn: o.listPrice ? withTax(o.listPrice, raw) : o.listPriceTaxIn,
        manualGrandTotalTaxIn: '',
        manualCostTaxIn: '',
      };
    case 'cost':
      return { ...o, cost: v === null ? '' : yenText(v), manualCostTaxIn: '' };
    case 'costTaxIn': {
      if (v === null) return { ...o, cost: '', manualCostTaxIn: '' };
      const target = Math.max(0, Math.round(v));
      const { value, exact } = withoutTax(target, o.taxType);
      return { ...o, cost: String(value), manualCostTaxIn: exact ? '' : String(target) };
    }
    case 'saleUnitPrice': {
      const unit = Math.max(0, v ?? 0);
      return { ...o, saleUnitPrice: unit, discountRate: discountFor(o.listPrice, unit), ...CLEAR_SALE };
    }
    case 'discountRate': {
      const rate = v === null ? '' : Math.min(100, Math.max(0, v));
      return { ...o, discountRate: rate, saleUnitPrice: saleUnitFromDiscount(o.listPrice, rate), ...CLEAR_SALE };
    }
    case 'quantity':
      return { ...o, quantity: v === null ? '' : String(Math.max(1, Math.round(v))), ...CLEAR_SALE };
    case 'shippingFee': {
      const shippingFee = v === null ? '' : yenText(v);
      /* 割り切れない合計を残しているときは、商品の分はそのままで送料の差だけ動かす */
      const keep = priceOverrides(o).grandTotalTaxOut;
      const sale = keep === null ? null : keep - num(o.shippingFee || 0);
      return { ...o, shippingFee, manualGrandTotalTaxOut: sale === null ? '' : String(sale + num(shippingFee)), manualGrandTotalTaxIn: '' };
    }
    case 'saleTotal':
      if (v === null) return { ...o, ...CLEAR_SALE };
      return setGrandTotalTaxOut(o, Math.max(0, v) + num(o.shippingFee || 0));
    case 'grandTotalTaxOut':
      if (v === null) return { ...o, ...CLEAR_SALE };
      return setGrandTotalTaxOut(o, v);
    case 'grandTotalTaxIn': {
      if (v === null) return { ...o, ...CLEAR_SALE };
      const shipping = num(o.shippingFee || 0);
      const shippingTaxIn = withTax(shipping, '10%');
      const target = Math.max(Math.round(v), shippingTaxIn);
      const sale = withoutTax(target - shippingTaxIn, o.taxType).value;
      const next = setGrandTotalTaxOut(o, sale + shipping);
      return { ...next, manualGrandTotalTaxIn: withTax(sale, o.taxType) + shippingTaxIn === target ? '' : String(target) };
    }
    case 'profit': {
      if (v === null || o.cost === '' || o.cost == null) return o;
      const costTotal = Math.floor(num(o.cost) * quantityOf(o));
      return setGrandTotalTaxOut(o, costTotal + Math.round(v));
    }
    case 'profitRate': {
      if (v === null || o.cost === '' || o.cost == null) return o;
      const rate = Math.min(99.9, Math.max(-999, v)) / 100;
      const costTotal = Math.floor(num(o.cost) * quantityOf(o));
      return setGrandTotalTaxOut(o, Math.round(costTotal / (1 - rate)));
    }
    default:
      return { ...o, [field]: raw };
  }
}

export const PRICE_EDIT_FIELDS = new Set([
  'listPrice', 'listPriceTaxIn', 'taxType', 'cost', 'costTaxIn', 'saleUnitPrice', 'discountRate', 'quantity',
  'shippingFee', 'saleTotal', 'grandTotalTaxOut', 'grandTotalTaxIn', 'profit', 'profitRate',
]);

/* 前の版で保存した下書き：手入力の合計は、ほかの金額とは別に残っていた（見積書はその金額で出ていた）。
   開き直したときに、その金額から販売単価などを求め直して、全部をそろえる。仕切り(税込)は、税抜とどちらが正しいか分からないので触らない
   （合わなければ税抜から出す）。 */
export function adoptLegacyManualTotals(order) {
  const o = order || {};
  if (!o || typeof o !== 'object') return o;
  const ov = priceOverrides(o);
  const taxIn = manualValue(o.manualGrandTotalTaxIn);
  const taxOut = manualValue(o.manualGrandTotalTaxOut);
  if (taxIn !== null) return ov.grandTotalTaxIn === null ? applyPriceEdit(o, 'grandTotalTaxIn', taxIn) : o;
  if (taxOut !== null && ov.grandTotalTaxOut === null) return applyPriceEdit(o, 'grandTotalTaxOut', taxOut);
  return o;
}
