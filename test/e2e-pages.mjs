// 複数ページ・集計・見積書の金額を、ビルドした dist/ で実際に操作して確かめる（Playwright。node --test には含めない）。
//   npm run build && node test/e2e-pages.mjs
// 2026-11-17 のコードの読み直しで見つけた不具合の再発防止：
//   ① 全額自己負担のページを見たあと別のページへ戻っても、そのページの給付内訳が変わらない
//   ② 単品の見積書の送料の行は数量1。欄を出入りしても送料が2倍にならない
//   ③ 集計の明細の合計金額(税込)は各ページと同じ。販売合計(税込)は開いているページによらない
//   ④ 複数商品の見積書も、受注簿で打った合計金額(税込)どおり（明細の消費税の和＝消費税）
// 架空のデータ（見本 花子・見本A/B）だけを使う。外への通信はしない。
import {createServer} from 'node:http';
import {existsSync, readFileSync} from 'node:fs';
import {extname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const {chromium} = await import('playwright').catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));
const root = fileURLToPath(new URL('../dist', import.meta.url));
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webmanifest': 'application/json'};
const server = createServer((req, res) => {
  let p = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\/taiyo-hacchu-scan/, '');
  if (p.endsWith('/')) p += 'index.html';
  const f = join(root, p);
  if (!existsSync(f)) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, {'content-type': types[extname(f)] ?? 'application/octet-stream'});
  res.end(readFileSync(f));
});
await new Promise((done) => server.listen(0, done));
const base = `http://localhost:${server.address().port}/taiyo-hacchu-scan/`;
const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];

async function open(seed, url = base) {
  const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
  await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await ctx.addInitScript((s) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v));
  }, seed);
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForTimeout(600);
  return {ctx, page};
}
/** 見えているページの給付内訳（見出し → 金額） */
const benefit = (page) =>
  page.evaluate(() => {
    const dl = document.querySelector('section[aria-label="販売受注簿入力"] .benefitBreakdown');
    return Object.fromEntries([...dl.querySelectorAll('div')].map((d) => [d.querySelector('dt').textContent.trim(), d.querySelector('dd').textContent.trim()]));
  });
const goPage = (page, label) => page.getByRole('navigation', {name: '商品ページ'}).first().getByRole('button', {name: label}).click();
const blank = {createdAt: '2026-11-17', orderType: '販売', rentalStatus: '無', paymentMethod: '集金', customerName: '見本 花子', furigana: '', address: '', tel: '', sales: '', staff: '', purchaser: '', supplier: '', salesOrderNumber: '', orderNumber: '', requester: '', deliveryDate: '', arrivalDate: '', receiptCheck: '', salesDate: '', catalogNumber: '', webCode: '', maker: '', modelNumber: '', color: '', size: '', unit: '台', note: ''};
const page = (over) => ({...blank, productName: '見本A', listPrice: '10000', listPriceTaxIn: '', cost: '6000', taxType: '10%', discountRate: 0, saleUnitPrice: 10000, quantity: 1, shippingFee: 0, ...over});

// ① 特定福祉用具から2点（2点目は今年度の残りが0＝全額自己負担）→ 1ページ目 → 2ページ目 → 1ページ目
{
  const now = Date.now();
  const item = (name, price, balance, b) => ({productName: name, quantity: 1, unit: '台', listPrice: price, cost: Math.round(price * 0.6), saleUnitPrice: price, taxType: '10%', discountRate: 0, totalTaxIn: Math.floor(price * 1.1), careInsuranceBalance: balance, benefit: b});
  const data = {kind: 'taiyo-tokutei-order', v: 1, createdAt: now, saleId: 'e2e-1', title: '見本 花子様 特定福祉用具', customerName: '見本 花子', burdenRatio: 1,
    items: [item('見本A', 4546, 200000, {target: 5000, userBurden: 500, aid: 0, insurerBurden: 4500}), item('見本B', 10000, 0, {target: 0, userBurden: 0, aid: 0, insurerBurden: 0})]};
  const {ctx, page: p} = await open({'taiyo-hacchu-import-v1': data}, `${base}?from=tokutei`);
  await p.getByRole('button', {name: '受注簿に入れる'}).click();
  await p.waitForTimeout(300);
  const first = await benefit(p);
  assert.equal(first['利用者負担額(1割・税込)'], '500円');
  await goPage(p, '2/3');
  await p.waitForTimeout(200);
  assert.equal((await benefit(p))['利用者負担額(1割・税込)'], '11,000円', '2ページ目は全額自己負担');
  await goPage(p, '1/3');
  await p.waitForTimeout(200);
  assert.deepEqual(await benefit(p), first, '1ページ目に戻っても給付内訳は同じ（全額自己負担を持ち越さない）');
  await goPage(p, '3/3'); // 次の商品の空のページにも持ち越さない
  await p.waitForTimeout(200);
  await goPage(p, '1/3');
  await p.waitForTimeout(200);
  assert.deepEqual(await benefit(p), first);
  console.log('① 全額自己負担のページを見たあとも、ほかのページの給付内訳は変わらない: OK');
  await ctx.close();
}

// ② 単品の見積書：数量2・送料500円
{
  const draft = {order: page({quantity: 2, saleUnitPrice: 8000, discountRate: 20, shippingFee: 500}), multiSaved: [], multiPageIndex: 0, image: '', pricing: 2, savedAt: Date.now()};
  const {ctx, page: p} = await open({'hatchu-ai-scan-draft-v1': draft});
  await p.getByRole('button', {name: '続きから入力する'}).click();
  await p.waitForTimeout(300);
  const [pop] = await Promise.all([ctx.waitForEvent('page'), p.getByRole('button', {name: '見積もり作成'}).click()]);
  await pop.waitForLoadState();
  await pop.waitForTimeout(600);
  const ship = () => pop.evaluate(() => [...document.querySelectorAll('tr.shippingRow td')].slice(1).map((td) => td.textContent.trim()).join(' | '));
  const total = () => pop.evaluate(() => document.querySelector('.totalValue').textContent.trim());
  assert.equal(await ship(), '1 | ¥500 | ¥500 | ¥50');
  const before = await total();
  await pop.locator('tr.shippingRow [data-field="shippingUnitPrice"]').click();
  await pop.locator('tr.shippingRow [data-field="shippingQuantity"]').click();
  await pop.locator('.toolbar').click({position: {x: 5, y: 5}});
  await pop.waitForTimeout(200);
  assert.equal(await ship(), '1 | ¥500 | ¥500 | ¥50', '欄を出入りしても送料は変わらない');
  assert.equal(await total(), before);
  assert.match(before, /18,150/);
  console.log('② 単品の見積書の送料の行は数量1・出入りしても変わらない: OK');
  await ctx.close();
}

// ③ 集計：見本A（8%・送料500円）・見本B（10%・送料なし）
{
  const a = page({productName: '見本A', taxType: '8%', shippingFee: 500, _multiId: 'a'});
  const b = page({productName: '見本B', taxType: '10%', _multiId: 'b'});
  const draft = {order: a, multiSaved: [a, b], multiPageIndex: 0, image: '', pricing: 2, savedAt: Date.now()};
  const {ctx, page: p} = await open({'hatchu-ai-scan-draft-v1': draft});
  await p.getByRole('button', {name: '続きから入力する'}).click();
  await p.waitForTimeout(400);
  const summary = () => p.evaluate(() => {
    const s = document.querySelector('.multiSummarySheet');
    const rows = [...s.querySelectorAll('.multiSummaryTable tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent.trim()));
    const mg = Object.fromEntries([...s.querySelectorAll('.multiSummaryManagement th')].map((th) => [th.textContent.trim(), th.nextElementSibling.textContent.trim()]));
    return {rows, mg};
  });
  const s1 = await summary();
  assert.equal(s1.rows[0][8], '11,350円', '見本A：10,800円＋送料550円（送料の税は10%）＝受注簿の合計金額(税込)');
  assert.equal(s1.rows[1][8], '11,000円');
  assert.equal(s1.mg['送料込み合計(税込)'], '22,350円', '明細の和＝送料込み合計(税込)');
  assert.equal(s1.mg['販売合計(税込)'], '21,800円', '10,800円＋11,000円');
  await goPage(p, '2/3');
  await p.waitForTimeout(300);
  assert.equal((await summary()).mg['販売合計(税込)'], '21,800円', '開いているページの税区分によらない');
  console.log('③ 集計の金額は各ページと同じ・販売合計(税込)は開いているページによらない: OK');
  await ctx.close();
}

// ④ 複数商品の見積書：受注簿で割り切れない合計金額(税込)を打ったページ（見本A 8,810円）があっても、明細の消費税の和＝消費税・合計＝受注簿の合計
{
  const a = page({productName: '見本A', saleUnitPrice: 8009, discountRate: 19.91, manualGrandTotalTaxIn: '8810', _multiId: 'a'});
  const b = page({productName: '見本B', saleUnitPrice: 8000, discountRate: 20, _multiId: 'b'});
  const draft = {order: a, multiSaved: [a, b], multiPageIndex: 0, image: '', pricing: 2, savedAt: Date.now()};
  const {ctx, page: p} = await open({'hatchu-ai-scan-draft-v1': draft});
  await p.getByRole('button', {name: '続きから入力する'}).click();
  await p.waitForTimeout(400);
  const [pop] = await Promise.all([ctx.waitForEvent('page'), p.getByRole('button', {name: '見積もり作成'}).click()]);
  await pop.waitForLoadState();
  await pop.waitForTimeout(600);
  const yen = (t) => Number(String(t).replace(/[^0-9]/g, '')) || 0;
  const read = () => pop.evaluate(() => ({
    taxes: [...document.querySelectorAll('.estimateItemsTable [data-field^="tax-"]')].map((e) => e.textContent.trim()),
    tax: document.querySelector('[data-field="taxTable"]')?.textContent.trim(),
    total: document.querySelector('[data-field="grandTotalTable"]')?.textContent.trim(),
  }));
  const r1 = await read();
  assert.equal(yen(r1.total), 17610, '受注簿の合計 8,810円＋8,800円');
  assert.equal(r1.taxes.map(yen).reduce((x, y) => x + y, 0), yen(r1.tax), '明細の消費税の和＝消費税');
  // 打ち直しても受注簿で打った合計の1円が消えない（数量の欄を出入りする）
  await pop.locator('.estimateItemsTable [data-field^="saleTotal-"]').first().click();
  await pop.locator('.toolbar').click({position: {x: 5, y: 5}});
  await pop.waitForTimeout(200);
  assert.equal(yen((await read()).total), 17610);
  console.log('④ 複数商品の見積書：手入力の合計があっても明細の和＝消費税・合計: OK');
  await ctx.close();
}

await browser.close();
server.close();
assert.deepEqual(errors, [], 'ページのエラーなし');
console.log('ok: e2e-pages');
