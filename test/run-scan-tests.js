/*
 * 介援隊カタログのスキャン解析を、実際に出荷されているコードで検証する。
 *   実行: node test/run-scan-tests.js
 */
const { loadParser } = require('./parser-harness.js');
const { cases } = require('./scan-cases.js');

const parser = loadParser();
let passed = 0;
const failures = [];

for (const c of cases) {
  const rawText = c.lines.join('\n');
  let got;
  try {
    got = parser.wt(rawText);
  } catch (e) {
    failures.push({ name: c.name, errors: ['解析中に例外: ' + e.message] });
    continue;
  }

  const errors = [];
  const num = (v) => (v === '' || v == null ? null : Number(v));

  for (const [key, want] of Object.entries(c.expect)) {
    if (key === 'productNameNotIncludes') {
      if (String(got.productName || '').includes(want)) {
        errors.push(`商品名にゴミ文字が残っている: "${want}" → "${got.productName}"`);
      }
      continue;
    }
    const actual = key === 'listPrice' || key === 'cost' ? num(got[key]) : got[key];
    if (actual !== want) {
      errors.push(`${key}: 期待 ${JSON.stringify(want)} / 実際 ${JSON.stringify(actual)}`);
    }
  }

  if (errors.length) failures.push({ name: c.name, errors, got });
  else passed++;
}

console.log(`\n=== 介援隊スキャン検証: ${passed}/${cases.length} 件 合格 ===\n`);
for (const f of failures) {
  console.log('✗ ' + f.name);
  for (const e of f.errors) console.log('    ' + e);
  if (f.got) {
    console.log('    [実際の解析結果] 商品名=' + JSON.stringify(f.got.productName) +
      ' 定価=' + JSON.stringify(f.got.listPrice) + ' 仕切り=' + JSON.stringify(f.got.cost) +
      ' 申込番号=' + JSON.stringify(f.got.catalogNumber) + ' WEB=' + JSON.stringify(f.got.webCode) +
      ' 税=' + JSON.stringify(f.got.taxType));
  }
  console.log('');
}
process.exit(failures.length ? 1 : 0);
