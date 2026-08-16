// 給付（介護保険）の利用者負担額・保険者負担額の計算を検証する。
//
// src/main.jsx はミニファイ済みバンドルのため import できない。
// バンドル内の benefitCalc と同じ実装をここに写して検証する。
// main.jsx 側を変更したときは、この写しも必ず同時に更新すること。

import test from 'node:test'
import assert from 'node:assert/strict'

const benefitNum = (v) => Number(String(v ?? '').replace(/[^\d.-]/g, '')) || 0
const benefitRatio = (o) => {
  const r = benefitNum(o.burdenRatio || 1)
  return r === 2 ? 2 : r === 3 ? 3 : 1
}
const benefitDetails = (o) => {
  const list = Array.isArray(o.benefitDetails) && o.benefitDetails.length
    ? o.benefitDetails
    : [{ amount: o.saleUnitPrice || '', cost: o.cost || '' }]
  return list.map((d) => ({ amount: d?.amount ?? '', cost: d?.cost ?? '' }))
}

// 税込への換算（バンドルの Ye 相当）。テストでは 10% のみ使う。
const taxIn = (v, taxType) => {
  const n = benefitNum(v)
  if (taxType === '8%') return Math.round(n * 1.08)
  if (taxType === '非課税') return n
  return Math.round(n * 1.1)
}

// 手入力で上書きされていればその値を使う（バンドルの orderManualAmount 相当）
const orderManualAmount = (value, calculated) => (value === '' || value == null ? calculated : value)

function benefitCalc(order, totals) {
  const details = benefitDetails(order)
  const amountSum = details.reduce((s, d) => s + benefitNum(d.amount), 0)
  const costSum = details.reduce((s, d) => s + benefitNum(d.cost), 0)
  // 給付割合は「送料込合計(税込)」を基準に計算する
  const total = benefitNum(orderManualAmount(order.manualGrandTotalTaxIn, totals.grandTotalTaxIn)) || amountSum
  const cost = costSum > 0
    ? costSum
    : benefitNum(order.cost === '' ? 0 : taxIn(order.cost, order.taxType)) * benefitNum(order.quantity || 1)
      + benefitNum(taxIn(order.shippingFee || 0, order.taxType))
  const balance = benefitNum(order.careInsuranceBalance || 200000)
  const target = order.fullSelfPay ? 0 : Math.min(total, balance > 0 ? balance : total)
  const ratio = benefitRatio(order)
  const userRate = order.livingProtection ? 0 : ratio / 10
  const userBurden = order.fullSelfPay ? total : Math.ceil(target * userRate)
  const insurerBurden = order.fullSelfPay ? 0 : Math.floor(target * (1 - userRate))
  const userPay = order.fullSelfPay ? total : userBurden + Math.max(0, total - target)
  return {
    totalTaxIn: Math.round(total),
    costTaxIn: Math.round(cost),
    target: Math.round(target),
    userBurden: Math.round(userBurden),
    insurerBurden: Math.round(insurerBurden),
    userPay: Math.round(userPay),
    ratio,
    insurerRatio: 10 - ratio,
  }
}

// 画面の例：販売金額(税抜) 23,200 / 税込 25,520
// saleUnitPrice（税抜）が入っていても、税込合計を基準にすることを確かめる
const baseOrder = { orderType: '給付', taxType: '10%', quantity: 1, cost: '13050', shippingFee: 0, saleUnitPrice: '23200' }
const baseTotals = { grandTotalTaxIn: 25520, grandTotalTaxOut: 23200 }

test('1割負担：利用者と保険者に分かれる', () => {
  const r = benefitCalc({ ...baseOrder, burdenRatio: 1 }, baseTotals)
  assert.equal(r.ratio, 1)
  assert.equal(r.userBurden, 2552) // 25,520 の1割
  assert.equal(r.insurerBurden, 22968) // 残り9割
  assert.equal(r.userBurden + r.insurerBurden, 25520)
})

test('2割負担', () => {
  const r = benefitCalc({ ...baseOrder, burdenRatio: 2 }, baseTotals)
  assert.equal(r.ratio, 2)
  assert.equal(r.userBurden, 5104)
  assert.equal(r.insurerBurden, 20416)
  assert.equal(r.userBurden + r.insurerBurden, 25520)
})

test('3割負担', () => {
  const r = benefitCalc({ ...baseOrder, burdenRatio: 3 }, baseTotals)
  assert.equal(r.ratio, 3)
  assert.equal(r.userBurden, 7656)
  assert.equal(r.insurerBurden, 17864)
  assert.equal(r.userBurden + r.insurerBurden, 25520)
})

test('負担割合が未設定なら1割として扱う', () => {
  const r = benefitCalc({ ...baseOrder }, baseTotals)
  assert.equal(r.ratio, 1)
  assert.equal(r.userBurden, 2552)
})

test('不正な負担割合は1割に丸める', () => {
  assert.equal(benefitCalc({ ...baseOrder, burdenRatio: 0 }, baseTotals).ratio, 1)
  assert.equal(benefitCalc({ ...baseOrder, burdenRatio: 5 }, baseTotals).ratio, 1)
  assert.equal(benefitCalc({ ...baseOrder, burdenRatio: -2 }, baseTotals).ratio, 1)
})

test('端数は利用者負担を切り上げ、保険者負担を切り捨てる', () => {
  // 1割で端数が出る金額
  const r = benefitCalc({ ...baseOrder, burdenRatio: 1 }, { grandTotalTaxIn: 25525, grandTotalTaxOut: 23205 })
  assert.equal(r.userBurden, 2553) // 2552.5 → 切り上げ
  assert.equal(r.insurerBurden, 22972) // 22972.5 → 切り捨て
})

test('支給限度額を超えた分は全額が利用者負担に乗る', () => {
  // 残高 20,000 に対して 25,520 の売上 → 5,520 が超過
  const r = benefitCalc({ ...baseOrder, burdenRatio: 1, careInsuranceBalance: 20000 }, baseTotals)
  assert.equal(r.target, 20000)
  assert.equal(r.userBurden, 2000) // 保険対象分の1割
  assert.equal(r.insurerBurden, 18000)
  assert.equal(r.userPay, 7520) // 2,000 + 超過 5,520
})

test('全額自費なら保険者負担は0', () => {
  const r = benefitCalc({ ...baseOrder, burdenRatio: 1, fullSelfPay: true }, baseTotals)
  assert.equal(r.userBurden, 25520)
  assert.equal(r.insurerBurden, 0)
})

test('生活保護なら利用者負担は0', () => {
  const r = benefitCalc({ ...baseOrder, burdenRatio: 1, livingProtection: true }, baseTotals)
  assert.equal(r.userBurden, 0)
  assert.equal(r.insurerBurden, 25520)
})

test('税込金額を基準に計算している（税抜ではない）', () => {
  const r = benefitCalc({ ...baseOrder, burdenRatio: 1 }, baseTotals)
  // 税抜 23,200 の1割は 2,320。税込 25,520 の1割 2,552 になっていること
  assert.notEqual(r.userBurden, 2320)
  assert.equal(r.userBurden, 2552)
})

test('送料込合計(税込)を手入力で上書きしたらその値を基準にする', () => {
  const r = benefitCalc(
    { ...baseOrder, burdenRatio: 1, manualGrandTotalTaxIn: '30000' },
    baseTotals
  )
  assert.equal(r.totalTaxIn, 30000)
  assert.equal(r.userBurden, 3000)
  assert.equal(r.insurerBurden, 27000)
})

test('数量が複数でも、合計(税込)から按分される', () => {
  // 送料込合計(税込) 51,040（2個分）
  const r = benefitCalc({ ...baseOrder, burdenRatio: 1, quantity: 2 }, { grandTotalTaxIn: 51040, grandTotalTaxOut: 46400 })
  assert.equal(r.userBurden, 5104)
  assert.equal(r.insurerBurden, 45936)
  assert.equal(r.userBurden + r.insurerBurden, 51040)
})
