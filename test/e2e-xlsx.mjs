// 受注簿と見積書の「Excel保存」を、ビルドした dist/ で実際に押して確かめる（Playwright。node --test には含めない）。
//   npm run build && node test/e2e-xlsx.mjs <出力フォルダ>
// 架空のデータ（見本 花子・見本商事）だけを使う。保存した .xlsx は出力フォルダに置くので、
// taiyo-excel-export スキルの validate.py・recalc.py・render.sh で検査・画像にできる。
import {createServer} from 'node:http';
import {existsSync, mkdirSync, readFileSync} from 'node:fs';
import {extname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const {chromium} = await import('playwright').catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));
const root = fileURLToPath(new URL('../dist', import.meta.url));
const out = process.argv[2] || fileURLToPath(new URL('../dist-xlsx-check', import.meta.url));
mkdirSync(out, {recursive: true});
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
// 日本語のファイル名で保存させる（LANG が C だと「download」になる）
const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});

/** 受注簿を入れる。products は [商品名, 型番, 定価, 仕切り] の並び。paste なら最初の商品に画像を貼り付ける */
async function fillOrder(page, products, {paste = false} = {}) {
  await page.goto(base);
  await page.waitForTimeout(800);
  const S = '(//section[@aria-label="販売受注簿入力"])[1]';
  const cell = (label) => page.locator(`xpath=${S}//div[contains(concat(' ', @class, ' '), ' sheetCell ')][b[normalize-space()="${label}"]]//*[self::input[not(@type="radio") and not(@type="checkbox")] or self::textarea or self::select]`).first();
  const mgmt = (label) => page.locator(`xpath=${S}//dt[normalize-space()="${label}"]/following-sibling::dd[1]//*[self::input or self::select]`).first();
  await cell('顧客名').fill('見本 花子');
  await cell('住所（任意）').fill('福岡県行橋市中央1-1');
  await cell('電話番号（任意）').fill('0930-00-0000');
  for (const [i, [name, model, list, cost]] of products.entries()) {
    if (paste && i === 0) {
      // 架空のカタログの画面（字と四角だけ）を画像にして貼り付ける
      await page.evaluate(async () => {
        const c = document.createElement('canvas');
        c.width = 480;
        c.height = 320;
        const g = c.getContext('2d');
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, 480, 320);
        g.fillStyle = '#3b82d6';
        g.fillRect(20, 20, 200, 200);
        g.fillStyle = '#111111';
        g.font = '28px sans-serif';
        g.fillText('見本の商品', 240, 80);
        const blob = await new Promise((done) => c.toBlob(done, 'image/png'));
        const dt = new DataTransfer();
        dt.items.add(new File([blob], 'sample.png', {type: 'image/png'}));
        window.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true}));
      });
      await page.waitForTimeout(1500);
    }
    await page.locator(`xpath=${S}//div[contains(@class, "productNameBlock")]/textarea`).first().fill(name);
    await page.locator(`xpath=${S}//table//tbody/tr[1]/td[3]//input`).first().fill(model);
    await mgmt('定価(税抜)').fill(String(list));
    await mgmt('仕切り(税抜)').fill(String(cost));
    if (products.length > 1) {
      await page.getByRole('button', {name: '商品を追加'}).first().click();
      await page.waitForTimeout(300);
    }
  }
}

const save = async (download, name) => {
  const file = join(out, name);
  await download.saveAs(file);
  const bytes = readFileSync(file);
  assert.equal(bytes.subarray(0, 2).toString(), 'PK', `${name} は zip（xlsx）`);
  return {file, text: bytes.toString('utf8')};
};

// 1) 商品2つ（画像つき）：受注簿の Excel（1点1ページ＋集計）
{
  const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
  await ctx.route('https://cdn.jsdelivr.net/**', (r) => r.abort());
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await fillOrder(page, [['シャワーチェア 見本A', 'A-100', 15800, 9480], ['浴槽台 見本B', 'B-200', 13800, 8280]], {paste: true});
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: 'Excel保存', exact: true}).click()]);
  const name = dl.suggestedFilename();
  assert.match(name, /^販売受注簿_見本花子_.*\.xlsx$/, name); // PDF保存と同じ名前（拡張子だけ .xlsx）
  const {text} = await save(dl, '受注簿_2点.xlsx');
  assert.match(text, /<sheet name="受注簿"[^>]*\/><sheet name="集計"/);
  assert.match(text, /シャワーチェア 見本A/);
  assert.match(text, /浴槽台 見本B/);
  assert.match(text, /<rowBreaks count="1"/, '2点なので受注簿のシートに改ページが1つ');
  assert.match(text, /xl\/media\/image1\.jpeg/, '貼り付けた画像も入る');
  assert.match(text, /<f>SUM\(/, '集計の合計は式');
  console.log('受注簿（2点）:', name);

  // メール（Excel付き・PDF付き）：Outlook で開く下書き（.eml）。添付は Excel保存・PDF保存と同じもの、本文に顧客名と商品
  // （ユーザーの依頼 2026-10-27「メールでそのまま、PDFかもしくは、Excelの資料送れる機能…添付とメールの文面の作成をワンタッチで」）
  for (const [button, ext, magic] of [['Excelでメール', 'xlsx', 'PK'], ['PDFでメール', 'pdf', '%PDF-']]) {
    const [mail] = await Promise.all([page.waitForEvent('download', {timeout: 60000}), page.getByRole('button', {name: button}).click()]);
    assert.equal(mail.suggestedFilename(), '発注依頼（販売受注簿送付）の件 見本 花子様.eml');
    await mail.saveAs(join(out, `メール_${ext}.eml`));
    const eml = readFileSync(join(out, `メール_${ext}.eml`), 'latin1');
    const head = eml.split('\r\n\r\n')[0];
    assert.match(head, /\r\nX-Unsent: 1\r\n/);
    const boundary = /boundary="([^"]+)"/.exec(head)[1];
    const parts = eml.split(`--${boundary}`).slice(1, -1).map((p) => p.replace(/^\r\n/, ''));
    const b64 = (x) => Buffer.from(x.replace(/\r\n/g, ''), 'base64');
    const body = b64(parts[0].split('\r\n\r\n')[1]).toString('utf8');
    for (const t of ['表題の通り、発注をお願いします。', '顧客名：見本 花子 様', '・シャワーチェア 見本A（A-100）', '・浴槽台 見本B（B-200）']) assert.ok(body.includes(t), body);
    const [fileHead, fileData] = parts[1].split('\r\n\r\n');
    assert.match(fileHead, ext === 'pdf' ? /application\/pdf/ : /spreadsheetml\.sheet/);
    const file = b64(fileData);
    assert.equal(file.subarray(0, magic.length).toString('latin1'), magic);
    if (ext === 'xlsx') assert.match(file.toString('latin1'), /xl\/worksheets\/sheet1\.xml/);
    console.log(`${button}: OK（添付 ${file.length} バイト）`);
  }

  // 2) 同じ受注簿から見積書を開き、数量を全角で直してから Excel保存（複数商品の表）
  const [pop] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('button', {name: '見積もり作成'}).click()]);
  await pop.waitForLoadState();
  await pop.waitForTimeout(800);
  const qty = pop.locator('[data-field="quantity-0"]');
  await qty.click();
  await pop.keyboard.press('Control+A');
  await pop.keyboard.type('２');
  await pop.locator('[data-field="remarks"]').click();
  await pop.waitForTimeout(300);
  const shown = await pop.evaluate(() => ({amount: document.querySelector('[data-field="saleTotal-0"]').textContent, total: document.querySelector('[data-field="grandTotalTable"]').textContent}));
  assert.equal(shown.amount, '¥25,280');
  const [dl2] = await Promise.all([pop.waitForEvent('download'), pop.locator('#xlsxButton').click()]);
  const {text: est} = await save(dl2, '見積書_複数.xlsx');
  assert.match(dl2.suggestedFilename(), /\.xlsx$/);
  assert.match(est, /<f>ROUND\([A-Z]+\d+\*[A-Z]+\d+,0\)<\/f><v>25280<\/v>/, '金額＝数量×単価の式（直した数量で）');
  assert.match(est, /<f>SUM\([A-Z]+\d+:[A-Z]+\d+\)<\/f>/, '小計は明細の和の式');
  assert.match(est, new RegExp(`<v>${shown.total.replace(/[^0-9]/g, '')}</v>`), '合計（税込）は見積書の表示と同じ');
  assert.match(est, /_xlnm\.Print_Titles/, '明細の見出しを各ページにくり返す');
  assert.ok(est.includes('御　 見　 積　 書'), '題名（全角の空白はそのまま＋字間）');
  assert.ok(est.includes('見本 花子'), '宛名');
  console.log('見積書（複数）:', dl2.suggestedFilename(), '合計', shown.total);
  await ctx.close();
}

// 3) 商品1つ：単品の見積書（.itemTable）と、1ページの受注簿
{
  const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
  await ctx.route('https://cdn.jsdelivr.net/**', (r) => r.abort());
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await fillOrder(page, [['シャワーチェア 見本A', 'A-100', 15800, 9480]]);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: 'Excel保存', exact: true}).click()]);
  const {text} = await save(dl, '受注簿_1点.xlsx');
  assert.doesNotMatch(text, /<sheet name="集計"/, '1点のときは集計のシートなし');
  assert.doesNotMatch(text, /<rowBreaks/, '1ページ');
  const [pop] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('button', {name: '見積もり作成'}).click()]);
  await pop.waitForLoadState();
  await pop.waitForTimeout(800);
  const [dl2] = await Promise.all([pop.waitForEvent('download'), pop.locator('#xlsxButton').click()]);
  const {text: est} = await save(dl2, '見積書_単品.xlsx');
  assert.match(est, /シャワーチェア 見本A/);
  assert.match(est, /<f>INT\([A-Z]+\d+\*0\.1\)<\/f><v>1264<\/v>/, '消費税＝金額×10%の切り捨て');
  console.log('受注簿（1点）・見積書（単品）: OK');
  await ctx.close();
}

await browser.close();
server.close();
console.log('保存したファイル:', out);
