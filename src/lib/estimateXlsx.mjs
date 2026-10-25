// 見積書（御見積書）の Excel（.xlsx）。ユーザーの指示「販売受注簿や見積もりは全てExcelで保存できるようにする。ページは3ページまでいけるようにする」（2026-10-25）。
// 見積書の別ウィンドウ（main.jsx の simpleEstimateHtml）の、そのときの中身（打ち直した値も）を読んで、印刷と同じ並び・位置・色の結合セルに書く。
// 単品の表（.itemTable）と複数商品の表（.estimateItemsTable）の両方（既知の落とし穴12）。
// 金額は見積書の計算と同じ式（金額＝数量×単価、消費税＝金額×税率の切り捨て、小計・消費税・合計は和）。見積書の上で手で直して式と合わない欄は、その値のまま。
// A4 縦・余白は印刷と同じ（上下 17mm・左右 22mm）。横は1ページに収め、縦は明細が多ければ2ページ・3ページと続く（明細の見出しを各ページの上にくり返す）。

import {createXlsxBook, gridOf, xlLineCount, XL_GOTHIC, XL_MINCHO, XL_PT_MM, xlRange, xlRef} from './xlsxBook.mjs';

const pt = (mm) => mm * XL_PT_MM;
// 空白は半角1つにまとめる（全角の空白「御　見　積　書」はそのまま。JS の \s は全角の空白も含むので使わない）
const SPACES = /[ \t\n\r\f\v\u00a0]+/g;
const text = (v) => String(v ?? '').replace(SPACES, ' ').replace(/^ | $/g, '');
/** 見積書の数（「¥12,640」「１」「¥-5,000」）。main.jsx の estNum と同じ読み方（全角も読む）。読めなければ null */
export function estimateNumber(s) {
  const t = String(s ?? '').normalize('NFKC').replace(/[ー−]/g, '-').replace(/[^0-9.-]/g, '');
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

/** 行（br・div で区切った行）ごとの文字。strong は色を変える所 */
function blockLines(el) {
  const lines = [[]];
  const cur = () => lines[lines.length - 1];
  const walk = (node, strong) => {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) {
        if (n.textContent) cur().push({t: n.textContent, strong});
        continue;
      }
      if (n.nodeType !== 1 || n.tagName === 'BUTTON') continue;
      if (n.tagName === 'BR') {
        lines.push([]);
        continue;
      }
      const block = n.tagName === 'DIV' || n.tagName === 'P';
      if (block && cur().length) lines.push([]);
      walk(n, strong || n.tagName === 'STRONG' || n.tagName === 'B');
      if (block && cur().length) lines.push([]);
    }
  };
  if (el) walk(el, false);
  while (lines.length && !lines[lines.length - 1].length) lines.pop();
  return lines.map((runs) => runs.map((r) => ({...r, t: r.t.replace(SPACES, ' ')})).filter((r) => r.t !== ''));
}
const lineText = (runs) => runs.map((r) => r.t).join('').replace(/^ | $/g, '');

/** 見積書の別ウィンドウの document から、印刷に出る中身を読む */
export function readEstimateDoc(doc) {
  const q = (s) => doc.querySelector(s);
  const win = doc.defaultView;
  const sizePt = (el, fallback) => {
    const v = el && win?.getComputedStyle ? parseFloat(win.getComputedStyle(el).fontSize) : NaN;
    return Number.isFinite(v) && v > 0 ? Math.round(v * 0.75 * 10) / 10 : fallback;
  };
  let defaultRate = 0.1;
  try {
    if (typeof win?.ESTIMATE_TAX_RATE === 'number') defaultRate = win.ESTIMATE_TAX_RATE;
  } catch {
    /* 見積書の窓の値が読めないときは 10% */
  }
  const field = (name) => q(`[data-field="${name}"]`);
  const suffix = field('honorific');
  const line1 = q('.clientLineTop');
  const line2 = q('.clientLineBottom');
  const multi = !!q('.estimateItemsTable');
  const table = q('.estimateItemsTable') || q('.itemTable');
  const rows = [...(table?.querySelectorAll('tbody tr.itemRow') ?? [])].map((tr) => {
    const td = [...tr.children];
    const nameCell = td[0];
    const title = nameCell?.querySelector('.productTitle, .editable') || nameCell;
    const sub = nameCell?.querySelector('.subline, .estimateItemsTableOption');
    const rateAttr = tr.getAttribute('data-tax-rate');
    return {
      name: text(title?.textContent),
      sub: text(sub?.textContent),
      qty: text(td[1]?.textContent),
      unit: text(td[2]?.textContent),
      amount: text(td[3]?.textContent),
      tax: text(td[4]?.textContent),
      rate: rateAttr !== null && rateAttr !== '' && Number.isFinite(Number(rateAttr)) ? Number(rateAttr) : tr.classList.contains('shippingRow') ? 0.1 : defaultRate,
      shipping: tr.classList.contains('shippingRow'),
    };
  });
  const summary = multi
    ? [...doc.querySelectorAll('.estimateAmountSummaryRow')].map((row) => ({label: text(row.querySelector('span')?.textContent), value: text(row.querySelector('strong')?.textContent), field: row.querySelector('strong')?.getAttribute('data-field') || '', overall: row.classList.contains('estimateOverallRow')}))
    : [...(table?.querySelectorAll('tbody tr.subtotalRow') ?? [])].map((row) => ({label: text(row.querySelector('.tableSubtotal span')?.textContent), value: text(row.querySelector('.tableSubtotal strong')?.textContent), field: row.querySelector('.tableSubtotal strong')?.getAttribute('data-field') || '', overall: row.classList.contains('totalSummaryRow')}));
  return {
    title: text(q('.title')?.textContent) || '御　見　積　書',
    client: [line1, line2].map((line, i) => ({name: text(field(i === 0 ? 'customerName' : 'customerName2')?.textContent), suffix: !!(suffix && line && suffix.parentNode === line)})),
    clientSize: sizePt(line1, 19),
    honorific: text(suffix?.textContent) || '様',
    lead: blockLines(q('.quoteLead')).map(lineText),
    conditions: [...doc.querySelectorAll('.condition tr')].map((tr) => [text(tr.querySelector('th')?.textContent), text(tr.querySelector('td')?.textContent)]),
    meta: [...doc.querySelectorAll('.companyMeta')].map((m) => [text(m.querySelector('label')?.textContent), text(m.querySelector('.companyMetaValue')?.textContent)]),
    company: blockLines(q('.companyName')).map(lineText).filter(Boolean),
    office: blockLines(q('.office')),
    stamps: [...doc.querySelectorAll('.stamp')].map((s) => text([...s.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('')) || text(s.textContent)),
    totalLabel: text(q('.totalLabel')?.textContent),
    totalValue: text(q('.totalValue')?.textContent),
    multi,
    category: multi ? '' : text(q('.category')?.textContent),
    head: [...(table?.querySelectorAll('thead th') ?? [])].map((th) => text(th.textContent)),
    rows,
    summary,
    remarksTitle: text(q('.remarksTitle')?.textContent) || '備考',
    remarks: blockLines(q('.remarksBody')).map(lineText),
  };
}

// 印刷の色（main.jsx の見積書の CSS）
const C = {
  title: '153F82',
  accent: '3B82D6',
  client: '1E293B',
  suffix: '1B6CB2',
  lead: '34495D',
  thInk: '1A5AA7',
  thBg: 'E9F4FF',
  condLine: 'C5D9ED',
  condInk: '334155',
  boxLine: 'B9D7F0',
  boxBg: 'EFF7FF',
  metaInk: '1D6DCC',
  metaLine: 'C2D9EC',
  office: '526174',
  stampLine: 'B9D1E8',
  line: 'C1D9EF',
  cell: '39495A',
  product: '263749',
  sub: '244F91',
  bar: '6FAAF0',
  headBg: 'DCECFF',
  subtotalBg: 'F7FBFF',
  subtotalInk: '1B4E91',
  summaryLine: 'D7E5F2',
  summaryStrong: '1F2937',
};
const YEN = '"¥"#,##0;"¥"-#,##0';
// 本文の幅 165.5mm の中の位置（mm）。上の段は左 86mm・右の会社の枠 70mm（間 10mm）
const W = 165.5;
const X = {
  condTh: 30,
  left: 86,
  box: 96,
  boxIn: 100,
  metaValue: 120,
  boxInR: 161.9,
  stamp1: [127.4, 142.4],
  stamp2: [146.9, 161.9],
  single: [0, 76, 99.1, 122.2, 145.3, W],
  singleValue: 140, // 単品の小計・消費税・合計の値の欄の左（印刷は「小計：¥12,640」を1つの欄に右寄せ。値の欄は金額が入る幅に）
  multi: [0, 99.1, 115.6, 132.2, 148.7, W],
};

/** 字間（letter-spacing .2em）のまね：字の間の全角の空白を「全角＋半角」に（taiyo-excel-export スキル） */
const spaced = (s) => String(s).replace(/　/g, '　 ');

/** 見積書の Excel を作る（model は readEstimateDoc の値） */
export function buildEstimateXlsx(m, title = '御見積書') {
  const book = createXlsxBook();
  const tableX = m.multi ? X.multi : X.single;
  const grid = gridOf([0, X.condTh, X.left, X.box, X.boxIn, X.metaValue, ...X.stamp1, ...X.stamp2, X.boxInR, ...tableX, ...(m.multi ? [] : [X.singleValue])]);
  const col = (mm) => grid.at(mm);
  const span = (a, b) => [col(a), col(b) - 1];
  const last = grid.cuts.length - 2;
  const ws = book.addSheet('御見積書', {orientation: 'portrait', margins: {l: 22, r: 22, t: 17, b: 17, h: 8, f: 8}, fitWidth: 1, fitHeight: 0});
  ws.setCols(grid.widths);
  const mincho = (sz, color = C.cell) => ({name: XL_MINCHO, sz, color});
  const gothic = (sz, color = C.cell) => ({name: XL_GOTHIC, sz, color});
  const thin = (c) => `thin:${c}`;
  const all = (c, w = 'thin') => ({l: `${w}:${c}`, r: `${w}:${c}`, t: `${w}:${c}`, b: `${w}:${c}`});

  // ---- 上の段：左（題名・宛名・前書き・条件）と右（会社の枠）を、縦の位置（mm）で同じ行にそろえる
  const officeLines = m.office.length ? m.office : [];
  const OFFICE_TOP = 31.1;
  const officeEnd = OFFICE_TOP + officeLines.length * 4.5;
  const stampTop = officeEnd + 4;
  const boxBottom = Math.max(78, stampTop + 3.9 + 15 + 3.4);
  const condTop = 68;
  const condEnd = condTop + m.conditions.length * 8.7;
  const companyRows = Math.max(1, m.company.length);
  const yEdges = [0, 3.6, 9.5, 15.4, 13.5, 18.4, 19.5, 28.2, 34.2, 42.9, 48.4, 54.9, 61.4, condEnd, boxBottom, stampTop, stampTop + 3.9, stampTop + 3.9 + 15];
  for (let i = 0; i <= companyRows; i++) yEdges.push(18.4 + (10.7 * i) / companyRows);
  for (let i = 0; i <= officeLines.length; i++) yEdges.push(OFFICE_TOP + i * 4.5);
  for (let i = 0; i <= m.conditions.length; i++) yEdges.push(condTop + i * 8.7);
  const yGrid = gridOf(yEdges, 0.6);
  yGrid.widths.forEach((h, i) => ws.height(i, pt(h)));
  const row = (mm) => yGrid.at(mm);
  const rows = (a, b) => [row(a), row(b) - 1];

  // 左
  {
    const [r1, r2] = rows(0, 13.5);
    const [c1, c2] = span(0, X.left);
    ws.box(r1, c1, r2, c2, spaced(m.title), {font: mincho(24, C.title), align: {h: 'left', v: 'top'}, border: {b: `medium:${C.accent}`}});
  }
  m.client.forEach((line, i) => {
    const [r1, r2] = i === 0 ? rows(19.5, 28.2) : rows(34.2, 42.9);
    const [c1, c2] = span(0, X.left);
    const runs = [{t: line.name || (line.suffix ? '　' : ''), font: mincho(m.clientSize, C.client)}];
    if (line.suffix) runs.push({t: '　' + m.honorific, font: mincho(12.5, C.suffix)});
    const underline = i === 1 && line.name ? {b: `thin:B7D4ED`} : {};
    ws.box(r1, c1, r2, c2, runs.some((x) => x.t.trim()) ? {rich: runs} : '', {font: mincho(m.clientSize, C.client), align: {h: 'left', v: 'bottom', shrink: true}, border: underline});
  });
  // 前書きは1行ずつ別の行（印刷の行間 1.75 に合わせる。2行まで。3行目からは2行目に続ける）
  m.lead.slice(0, 2).forEach((line, i) => {
    const [r1, r2] = i === 0 ? rows(48.4, 54.9) : rows(54.9, 61.4);
    const [c1, c2] = span(0, X.left);
    ws.box(r1, c1, r2, c2, i === 1 ? m.lead.slice(1).join(' ') : line, {font: mincho(10.5, C.lead), align: {h: 'left', v: 'center', shrink: true}});
  });
  m.conditions.forEach(([th, td], i) => {
    const [r1, r2] = rows(condTop + i * 8.7, condTop + (i + 1) * 8.7);
    const [a1, a2] = span(0, X.condTh);
    const [b1, b2] = span(X.condTh, X.left);
    ws.box(r1, a1, r2, a2, th, {font: gothic(9.5, C.thInk), fill: C.thBg, align: {h: 'left', v: 'center', indent: 1, shrink: true}, border: all(C.condLine)});
    ws.box(r1, b1, r2, b2, td, {font: mincho(9.5, C.condInk), align: {h: 'left', v: 'center', indent: 1, shrink: true}, border: all(C.condLine)});
  });

  // 右：会社の枠（薄い青の背景・枠線）。まず枠の中を全部塗ってから、中の欄を書く
  {
    const [r1, r2] = rows(0, boxBottom);
    const [c1, c2] = span(X.box, W);
    const frame = thin(C.boxLine);
    const edges = (a1, b1, a2, b2, own = {}) => ({l: b1 === c1 ? frame : own.l, r: b2 === c2 ? frame : own.r, t: a1 === r1 ? frame : own.t, b: a2 === r2 ? frame : own.b});
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) ws.box(r, c, r, c, null, {fill: C.boxBg, border: edges(r, c, r, c)});
    const put = (ra, rb, xa, xb, v, st) => {
      const [a1, a2] = rows(ra, rb);
      const [b1, b2] = span(xa, xb);
      ws.box(a1, b1, a2, b2, v, {fill: C.boxBg, ...st, border: edges(a1, b1, a2, b2, st.border)});
    };
    m.meta.forEach(([label, value], i) => {
      const y = 3.6 + i * 5.9;
      put(y, y + 5.9, X.boxIn, X.metaValue, label, {font: gothic(9.2, C.metaInk), align: {h: 'left', v: 'center', shrink: true}, border: {b: thin(C.metaLine)}});
      put(y, y + 5.9, X.metaValue, X.boxInR, value, {font: gothic(9.4, C.condInk), align: {h: 'right', v: 'center', shrink: true}, border: {b: thin(C.metaLine)}});
    });
    m.company.forEach((name, i) => {
      put(18.4 + (10.7 * i) / companyRows, 18.4 + (10.7 * (i + 1)) / companyRows, X.boxIn, X.boxInR, name, {font: gothic(11.2, C.title), align: {h: 'left', v: 'center', shrink: true}});
    });
    officeLines.forEach((runs, i) => {
      const v = runs.some((x) => x.strong) ? {rich: runs.map((x) => ({t: x.t, font: gothic(8.8, x.strong ? C.metaInk : C.office)}))} : lineText(runs);
      put(OFFICE_TOP + i * 4.5, OFFICE_TOP + (i + 1) * 4.5, X.boxIn, X.boxInR, v, {font: gothic(8.8, C.office), align: {h: 'left', v: 'center', shrink: true}});
    });
    [X.stamp1, X.stamp2].forEach(([xa, xb], i) => {
      if (!m.stamps[i]) return;
      put(stampTop, stampTop + 3.9, xa, xb, m.stamps[i], {font: gothic(8.6, C.metaInk), align: {h: 'center', v: 'center', shrink: true}});
      put(stampTop + 3.9, stampTop + 3.9 + 15, xa, xb, '', {fill: 'FFFFFF', border: all(C.stampLine)});
    });
  }

  // ---- ここから下は上から順に行を足す
  let r = yGrid.cuts.length - 1;
  const gap = (mm) => ws.height(r++, pt(mm));
  gap(9);

  // 御見積金額（あとで合計の欄を指す式にする）
  const totalRow = r;
  ws.height(r, pt(17));
  {
    const [a1, a2] = span(0, X.box);
    const [b1, b2] = span(X.box, W);
    const line = `medium:${C.accent}`;
    ws.box(r, a1, r, a2, m.totalLabel, {font: gothic(13.2, C.title), fill: C.boxBg, align: {h: 'left', v: 'center', indent: 1}, border: {l: line, t: line, b: line}});
    ws.box(r, b1, r, b2, null, {font: mincho(20, C.title), fill: C.boxBg, align: {h: 'right', v: 'center', indent: 1, shrink: true}, border: {r: line, t: line, b: line}, fmt: `${YEN.split(';')[0]}" —"`});
  }
  r++;
  gap(6.5);

  if (!m.multi && m.category) {
    ws.height(r, pt(8.5));
    ws.box(r, 0, r, last, m.category, {font: gothic(12, C.title), fill: C.boxBg, align: {h: 'left', v: 'center', indent: 1}, border: {l: thin(C.line), r: thin(C.line), t: thin(C.line)}});
    r++;
  }
  // 明細の見出し（各ページの上にくり返す）
  const headRow = r;
  ws.height(r, pt(m.multi ? 8.5 : 8.8));
  m.head.forEach((h, i) => {
    if (i + 1 >= tableX.length) return;
    const [c1, c2] = span(tableX[i], tableX[i + 1]);
    ws.box(r, c1, r, c2, h, m.multi ? {font: gothic(9.5, C.metaInk), fill: C.boxBg, align: {h: 'center', v: 'center', shrink: true}, border: all(C.line)} : {font: gothic(10.5, C.title), fill: C.headBg, align: {h: 'center', v: 'center', shrink: true}, border: all(C.line)});
  });
  r++;

  // 明細の行
  const cols = tableX.slice(0, 5).map((x, i) => span(x, tableX[i + 1]));
  const first = r;
  const num = (s) => estimateNumber(s);
  let amountSum = 0;
  let taxSum = 0;
  let amountsOk = true;
  let taxesOk = true;
  for (const it of m.rows) {
    const nameW = (tableX[1] - tableX[0]) - 5.6;
    // 商品名は印刷と同じ大きさ（複数商品は 11.2pt から2行に収まるまで小さく。見積書の fitToLines）
    let size = m.multi ? 11.2 : 10.5;
    let lines = xlLineCount(it.name || ' ', nameW, size);
    if (m.multi) while (lines > 2 && size > 7) lines = xlLineCount(it.name || ' ', nameW, (size -= 0.5));
    const subSize = m.multi ? 8.8 : 9;
    const subLines = it.sub ? xlLineCount(it.sub, nameW - 2, subSize) : 0;
    const contentPt = lines * size * 1.25 + (subLines ? pt(1.3) + subLines * subSize * 1.3 : 0);
    const minMm = m.multi ? 9 : it.shipping ? 8.8 : 13.5;
    ws.height(r, Math.max(pt(minMm), contentPt + pt(m.multi ? 3.6 : 4.4)));
    const runs = [{t: it.name, font: mincho(size, m.multi ? '29394C' : C.product)}];
    if (it.sub) runs.push({t: '\n', font: mincho(subSize, C.sub)}, {t: '｜', font: mincho(subSize, C.bar)}, {t: it.sub, font: mincho(subSize, C.sub)});
    const [n1, n2] = cols[0];
    ws.box(r, n1, r, n2, it.sub ? {rich: runs} : it.name, {font: mincho(size, m.multi ? '29394C' : C.product), fill: it.shipping && !m.multi ? 'FBFDFF' : undefined, align: {h: 'left', v: 'center', wrap: true, indent: 1}, border: all(C.line)});
    const q = num(it.qty);
    const u = num(it.unit);
    const a = num(it.amount);
    const t = num(it.tax);
    const ref = (i) => xlRef(r, cols[i][0]);
    // 金額＝数量×単価（見積書の estRecalcRow と同じ。円にまるめる）、消費税＝金額×税率の切り捨て
    const amount = q !== null && u !== null && a !== null && Math.round(q * u) === a ? {f: `ROUND(${ref(1)}*${ref(2)},0)`, v: a} : a ?? it.amount;
    const tax = a !== null && t !== null && Math.floor(a * it.rate) === t ? (it.rate ? {f: `INT(${ref(3)}*${it.rate})`, v: t} : 0) : t ?? it.tax;
    if (a === null) amountsOk = false;
    else amountSum += a;
    if (t === null) taxesOk = false;
    else taxSum += t;
    const cell = (sz) => ({font: mincho(sz, C.cell), fill: it.shipping && !m.multi ? 'FBFDFF' : undefined, align: {h: 'center', v: 'center', shrink: true}, border: all(C.line)});
    const sz = m.multi ? 9 : 10.5;
    ws.box(r, cols[1][0], r, cols[1][1], q ?? it.qty, cell(sz));
    ws.box(r, cols[2][0], r, cols[2][1], u ?? it.unit, {...cell(sz), fmt: YEN});
    ws.box(r, cols[3][0], r, cols[3][1], amount, {...cell(sz), fmt: YEN});
    ws.box(r, cols[4][0], r, cols[4][1], tax, {...cell(sz), fmt: YEN});
    r++;
  }
  const lastItem = r - 1;
  const sumRange = (i) => xlRange(first, cols[i][0], lastItem, cols[i][0]);

  // 小計・消費税・合計（見積書の表示と、明細の和が同じときだけ式）
  if (!m.multi) gap(5.5);
  else gap(4);
  const refs = {};
  m.summary.forEach((s, i) => {
    const shown = num(s.value);
    let v = shown ?? s.value;
    if (m.rows.length && shown !== null) {
      if (/subtotal/i.test(s.field) && amountsOk && amountSum === shown) v = {f: `SUM(${sumRange(3)})`, v: shown};
      else if (/^tax/i.test(s.field) && taxesOk && taxSum === shown) v = {f: `SUM(${sumRange(4)})`, v: shown};
      else if (/grandTotal/i.test(s.field) && refs.subtotal && refs.tax && refs.subtotal.v + refs.tax.v === shown) v = {f: `${refs.subtotal.ref}+${refs.tax.ref}`, v: shown};
    }
    const key = /subtotal/i.test(s.field) ? 'subtotal' : /^tax/i.test(s.field) ? 'tax' : /grandTotal/i.test(s.field) ? 'grand' : '';
    if (m.multi) {
      ws.height(r, pt(s.overall ? 8.2 : 7.2));
      const line = thin(C.line);
      const sep = i === 0 ? line : thin(C.summaryLine);
      const bottom = i === m.summary.length - 1 ? line : undefined;
      const [a1, a2] = span(0, X.multi[2]);
      const [b1, b2] = span(X.multi[2], W);
      ws.box(r, a1, r, a2, s.label, {font: gothic(9.5, s.overall ? C.title : C.office), fill: s.overall ? C.subtotalBg : undefined, align: {h: 'left', v: 'center', indent: 1}, border: {l: line, t: sep, b: bottom}});
      ws.box(r, b1, r, b2, v, {font: gothic(s.overall ? 13 : 10.5, s.overall ? C.title : C.summaryStrong), fill: s.overall ? C.subtotalBg : undefined, align: {h: 'right', v: 'center', indent: 1, shrink: true}, border: {r: line, t: sep, b: bottom}, fmt: YEN});
      if (key) refs[key] = {ref: xlRef(r, b1), v: shown};
    } else {
      ws.height(r, pt(8.8));
      const [p1, p2] = cols[0];
      const [a1, a2] = span(X.single[1], X.singleValue);
      const [b1, b2] = span(X.singleValue, W);
      ws.box(r, p1, r, p2, '', {border: all(C.line)});
      ws.box(r, a1, r, a2, s.label, {font: gothic(10.5, C.subtotalInk), fill: C.subtotalBg, align: {h: 'right', v: 'center'}, border: {t: thin(C.line), b: thin(C.line)}});
      ws.box(r, b1, r, b2, v, {font: gothic(13, C.subtotalInk), fill: C.subtotalBg, align: {h: 'right', v: 'center', indent: 1, shrink: true}, border: {r: thin(C.line), t: thin(C.line), b: thin(C.line)}, fmt: YEN});
      if (key) refs[key] = {ref: xlRef(r, b1), v: shown};
    }
    r++;
  });
  // 上の御見積金額は合計の欄を指す（同じ値のとき）
  {
    const shown = num(m.totalValue);
    const [b1] = span(X.box, W);
    const target = refs.grand;
    const v = target && shown !== null && target.v === shown ? {f: target.ref, v: shown} : (shown ?? m.totalValue);
    const st = ws.rows.get(totalRow).cells.get(b1);
    ws.rows.get(totalRow).cells.set(b1, {...st, v});
  }

  // 備考（1行ずつ別の行。taiyo-excel-export スキル）
  gap(8);
  ws.height(r, pt(8.2));
  ws.box(r, 0, r, last, m.remarksTitle, {font: gothic(10, C.metaInk), fill: C.boxBg, align: {h: 'left', v: 'center', indent: 1}, border: all(C.line)});
  r++;
  const lines = m.remarks.length ? m.remarks : [''];
  lines.forEach((line, i) => {
    const n = xlLineCount(line || ' ', W - 5.6, 10);
    const pad = (i === 0 ? pt(2.2) : 0) + (i === lines.length - 1 ? pt(2.2) : 0);
    ws.height(r, Math.max(lines.length === 1 ? pt(13) : 0, n * 15 + pad));
    const side = thin(C.line);
    ws.box(r, 0, r, last, line, {font: mincho(10, C.cell), align: {h: 'left', v: lines.length === 1 ? 'center' : i === 0 ? 'bottom' : i === lines.length - 1 ? 'top' : 'center', wrap: true, indent: 1}, border: {l: side, r: side, b: i === lines.length - 1 ? side : undefined}});
    r++;
  });

  ws.page.printArea = [0, 0, r - 1, last];
  ws.page.printTitles = [headRow, headRow];
  return book.toBytes(title);
}

/** 保存の名前（PDF保存と同じ名前の .xlsx） */
export const estimateXlsxName = (doc) => (String(doc.title || '御見積').replace(/[\/:*?"<>|]/g, '').trim() || '御見積') + '.xlsx';
