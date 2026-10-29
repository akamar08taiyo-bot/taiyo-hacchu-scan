// 販売受注簿の Excel（.xlsx）。ユーザーの指示「販売受注簿や見積もりは全てExcelで保存できるようにする」（2026-10-25）。
// 中身は PDF・印刷と同じ：印刷する受注簿のシート（.orderEntrySheet。商品が2つ以上なら印刷用の控え＝1点1ページ）の欄の値を読んで、
// PDF と同じ並び・位置（PDF を作るときの幅 289mm で測った mm）の結合セルに書く。1つのシートに1点1ページずつ並べて、ページの間で改ページ。
// 商品が2つ以上のときは「集計」のシート（受注簿【販売】集計）も。貼り付けた画像も同じ枠に入れる。
// 金額は受注簿で手で直せる欄が多いので、受注簿の値をそのまま書く（集計の合計だけ、明細の和と同じときは式）。

import {createXlsxBook, gridOf, imageToJpeg, XL_PT_MM, XL_YUGOTHIC, xlRange, xlRef} from './xlsxBook.mjs';

// 印刷の色（styles.css の印刷の受注簿。太字は使わない＝デザイン方針）
const INK = '06111F';
const LABEL_INK = '08375D';
const LABEL_BG = 'EAF4FF';
const HEAD_INK = '1B506A';
const HEAD_BG = 'EAF8FC';
const INPUT_BG = 'FBFEFF';
const LINE = 'thin:8FA3B3';
const SOFT = 'thin:BCDBE7';
const ACCENT = 'thick:15A8DF';
const ALL = {l: LINE, r: LINE, t: LINE, b: LINE};
const SOFT_ALL = {l: SOFT, r: SOFT, t: SOFT, b: SOFT};
const YEN = '#,##0"円"';

// PDF の受注簿（幅 289mm。styles.css の pdfExport）で測った位置（mm。シートの内側の左端から）。給付のときは上の段が9つ（給付割合が入る）
const W = 282.4;
export const ORDER_EDGES = {
  primary: [0, 29.6, 62.1, 90.7, 126.4, 168.1, 205.8, 243.5, W],
  primaryBenefit: [0, 26, 55, 81.6, 107.4, 138.9, 186.4, 217.9, 250.1, W],
  customer: [0, 56.7, 113.1, 240, W],
  name: [0, 22.2, W],
  product: [0, 25.5, 53.7, 101.7, 152.4, 180.7, 200.4, 239.9, W],
  secondary: [0, 47.2, 94.3, 141.3, 188.3, 235.3, W],
  mgmt: [0, 44.2, 96.9, 141.1, 193.8],
  benefit: [0, 55.8, 96.9, 152.7, 193.8],
  image: [196.4, W],
};
const pt = (mm) => mm * XL_PT_MM;
const px = (n) => n * 0.75; // 画面の字の大きさ（px）→ pt

const text = (v) => String(v ?? '').replace(/^\s+|\s+$/g, '');
/** 「12,640円」「15800」→ 数（読めなければ null） */
export function yenValue(s) {
  const t = String(s ?? '').normalize('NFKC').replace(/[,円¥\s]/g, '');
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}
/** 金額の欄（「12,640円」）は数に。そうでなければそのまま */
const money = (v) => (/円\s*$/.test(String(v)) && yenValue(v) !== null ? yenValue(v) : v);
/** 管理情報の欄は数字だけ（印刷も「15800」）。数字だけなら数に */
const plainNumber = (v) => (/^-?\d+(\.\d+)?$/.test(String(v)) ? Number(v) : v);

const fieldValue = (field) => (field.tagName === 'SELECT' ? text(field.selectedOptions?.[0]?.textContent ?? field.value) : text(field.value));

/** 画面の受注簿のシート（.orderEntrySheet）から、印刷に出る値を読む */
export function readOrderSheet(sheet) {
  const valueOf = (cell) => {
    const pv = cell.querySelector('.printValue');
    if (pv && text(pv.textContent)) return text(pv.textContent);
    const box = cell.querySelector('input[type=checkbox]');
    if (box) return (box.checked ? '■ ' : '□ ') + text(box.closest('label')?.textContent || '確認済');
    const field = cell.querySelector('textarea, select, input:not([type=radio]):not([type=checkbox]):not([aria-label="フリガナ"])');
    return field ? fieldValue(field) : '';
  };
  const cells = (grid) => [...(grid?.querySelectorAll(':scope > .sheetCell') ?? [])].map((c) => [text(c.querySelector('b')?.textContent), valueOf(c), text(c.querySelector('input[aria-label="フリガナ"]')?.value)]);
  const nameBlock = sheet.querySelector('.productNameBlock');
  const table = sheet.querySelector('table.entryProductTable') || sheet.querySelector('table');
  const row = [...(table?.querySelectorAll('tbody tr:first-child > td') ?? [])].map((td) => {
    const pv = td.querySelector('.printValue');
    if (pv && text(pv.textContent)) return text(pv.textContent);
    const field = td.querySelector('textarea, select, input:not([type=radio]):not([type=checkbox])');
    return field ? fieldValue(field) : text(td.textContent);
  });
  const dl = (el) =>
    [...(el?.querySelectorAll(':scope > div') ?? [])].map((d) => {
      const dd = d.querySelector('dd');
      const field = dd?.querySelector('input, select, textarea');
      return [text(d.querySelector('dt')?.textContent), field ? fieldValue(field) : text(dd?.textContent)];
    });
  const img = sheet.querySelector('.orderAttachedImage img');
  return {
    title: text(sheet.querySelector('h2')?.textContent) || '受 注 簿 【 販 売 】',
    benefit: sheet.classList.contains('benefitMode'),
    primary: cells(sheet.querySelector('.entryGridPrimary')),
    customer: cells(sheet.querySelector('.entryGridCustomer')),
    productName: text(nameBlock?.querySelector(':scope > .printValue')?.textContent) || text(nameBlock?.querySelector('textarea')?.value),
    note: text(nameBlock?.querySelector('.manualProductMetaInput')?.value),
    priceNote: text(nameBlock?.querySelector('.productPriceNote .printValue')?.textContent).replace(/\s+/g, ' '),
    head: [...(table?.querySelectorAll('thead th') ?? [])].map((th) => text(th.textContent)),
    row,
    secondary: cells(sheet.querySelector('.entryGridSecondary')),
    mgmt: dl(sheet.querySelector('.management dl:not(.benefitBreakdown)')),
    benefitRows: dl(sheet.querySelector('.benefitBreakdown')),
    image: img ? imageToJpeg(img) : null,
  };
}

/** 集計のシート（.multiSummarySheet）を読む */
export function readSummarySheet(sheet) {
  if (!sheet) return null;
  const table = sheet.querySelector('.multiSummaryTable');
  return {
    title: text(sheet.querySelector('h2')?.textContent) || '受注簿【販売】集計',
    head: [...sheet.querySelectorAll('.multiSummaryHead > div')].map((d) => [text(d.querySelector('b')?.textContent), text(d.querySelector('span')?.textContent)]),
    cols: [...(table?.querySelectorAll('thead th') ?? [])].map((th) => text(th.textContent)),
    rows: [...(table?.querySelectorAll('tbody tr') ?? [])].map((tr) => [...tr.querySelectorAll('td')].map((td) => text(td.textContent))),
    mgmt: [...sheet.querySelectorAll('.multiSummaryManagement tr')].map((tr) => [...tr.children].map((c) => text(c.textContent))),
    error: text(sheet.querySelector('.multiCostError')?.textContent),
  };
}

/**
 * 受注簿の Excel を作る。pages は readOrderSheet の値（1点1ページ）、summary は readSummarySheet の値（商品が2つ以上のとき）。
 * A4 横・余白 6mm（PDF と同じ）。手動の改ページを使うので「1ページに収める」ではなく拡大縮小（96%）にする
 */
export function buildOrderXlsx(pages, summary, title = '販売受注簿') {
  const book = createXlsxBook();
  const E = ORDER_EDGES;
  const grid = gridOf([...E.primary, ...(pages.some((p) => p.benefit) ? E.primaryBenefit : []), ...E.customer, ...E.name, ...E.product, ...E.secondary, ...E.mgmt, ...(pages.some((p) => p.benefitRows.length) ? E.benefit : []), ...E.image]);
  const last = grid.cuts.length - 2;
  const span = (a, b) => [grid.at(a), grid.at(b) - 1];
  const ws = book.addSheet('受注簿', {orientation: 'landscape', margins: {l: 6, r: 6, t: 6, b: 6, h: 3, f: 3}, scale: 96, fitWidth: 0, fitHeight: 0});
  ws.setCols(grid.widths);
  const font = (sz, color = INK) => ({name: XL_YUGOTHIC, sz: Math.round(sz * 10) / 10, color});
  const label = {font: font(px(10), LABEL_INK), fill: LABEL_BG, align: {h: 'center', v: 'center', shrink: true}, border: ALL};
  const value = (sz = px(12.27), extra = {}) => ({font: font(sz), align: {h: 'center', v: 'center', shrink: true}, border: ALL, ...extra});
  let r = 0;
  const breaks = [];
  const gap = (mm) => ws.height(r++, pt(mm));
  // 上の段（見出しの段と値の段）
  const gridRow = (list, edges, valueMm, valueSt = value()) => {
    ws.height(r, pt(5.3));
    ws.height(r + 1, pt(valueMm));
    list.forEach(([name, v], i) => {
      if (i + 1 >= edges.length) return;
      const [c1, c2] = span(edges[i], edges[i + 1]);
      ws.box(r, c1, r, c2, name, {...label, border: {...ALL, b: undefined}});
      ws.box(r + 1, c1, r + 1, c2, v, {...valueSt, border: {...ALL, t: undefined}});
    });
    r += 2;
  };

  pages.forEach((p, k) => {
    ws.height(r, pt(9.5));
    ws.box(r, 0, r, last, p.title, {font: font(px(18), '1D3448'), align: {h: 'center', v: 'center'}, border: {t: ACCENT}});
    r++;
    gap(2.1);
    gridRow(p.primary, p.benefit && p.primary.length >= E.primaryBenefit.length - 1 ? E.primaryBenefit : E.primary, 6.6);
    gap(2.2);
    // 顧客名は、フリガナがあれば上に小さく（印刷と同じ）
    const furigana = p.customer[0]?.[2] ?? '';
    gridRow(
      p.customer.map(([name, v, f], i) => [name, i === 0 && f ? {rich: [{t: f + '\n', font: font(px(9.5), '334155')}, {t: v, font: font(px(12.5))}]} : v]),
      E.customer,
      furigana ? 9.6 : 6.6,
      value(px(12.5), furigana ? {align: {h: 'center', v: 'center', wrap: true}} : {}),
    );
    gap(2.4);
    // 商品名・備考・商品代金
    const [n1, n2] = span(0, E.name[1]);
    const [v1, v2] = span(E.name[1], W);
    const nameLines = Math.max(1, Math.ceil((p.productName.length * px(16)) / XL_PT_MM / ((W - 26) * 0.93)));
    ws.height(r, Math.max(pt(12), nameLines * px(16) * 1.35 + 6));
    ws.box(r, n1, r, n2, '商品名', {...label, font: font(px(13.33), LABEL_INK)});
    ws.box(r, v1, r, v2, p.productName, {font: font(px(16)), align: {h: 'left', v: 'center', wrap: true, indent: 1}, border: ALL});
    r++;
    ws.height(r, pt(10.1));
    ws.box(r, n1, r, n2, '備考', {...label, font: font(px(13.33), LABEL_INK)});
    ws.box(r, v1, r, v2, p.note, {font: font(px(13)), fill: INPUT_BG, align: {h: 'left', v: 'center', wrap: true, indent: 1}, border: ALL});
    r++;
    ws.height(r, pt(13.9));
    ws.box(r, 0, r, last, p.priceNote, {font: font(px(16)), align: {h: 'left', v: 'center', indent: 1, shrink: true}, border: ALL});
    r++;
    // 商品の表（申込番号〜合計金額）
    ws.height(r, pt(5.8));
    ws.height(r + 1, pt(9.3));
    p.head.forEach((h, i) => {
      if (i + 1 >= E.product.length) return;
      const [c1, c2] = span(E.product[i], E.product[i + 1]);
      const v = money(p.row[i] ?? '');
      ws.box(r, c1, r, c2, h, {font: font(px(12), HEAD_INK), fill: HEAD_BG, align: {h: 'center', v: 'center', shrink: true}, border: SOFT_ALL});
      ws.box(r + 1, c1, r + 1, c2, v, {...value(), border: SOFT_ALL, ...(typeof v === 'number' ? {fmt: YEN} : {})});
    });
    r += 2;
    gap(2.1);
    gridRow(p.secondary, E.secondary, 8.8, value(px(12.5)));
    gap(2);
    // 管理情報（2組ずつ）。給付のときは下に給付内訳。右に貼り付け画像の枠
    const top = r;
    const [m1, m2] = span(0, E.mgmt[4]);
    ws.height(r, pt(4.8));
    ws.box(r, m1, r, m2, '管理情報', {font: font(px(11.33), HEAD_INK), fill: 'EEF9FD', align: {h: 'center', v: 'center'}, border: ALL});
    r++;
    const pairs = (list, edges, rowMm, labelSt, valueSt) => {
      for (let i = 0; i < list.length; i += 2) {
        ws.height(r, pt(rowMm));
        [list[i], list[i + 1]].forEach((item, j) => {
          if (!item) return;
          const [l1, l2] = span(edges[j * 2], edges[j * 2 + 1]);
          const [d1, d2] = span(edges[j * 2 + 1], edges[j * 2 + 2]);
          const v = valueSt.yen ? money(item[1]) : plainNumber(item[1]);
          ws.box(r, l1, r, l2, item[0], labelSt);
          ws.box(r, d1, r, d2, v, {...valueSt.st, ...(valueSt.yen && typeof v === 'number' ? {fmt: YEN} : {})});
        });
        r++;
      }
    };
    pairs(p.mgmt, E.mgmt, 8.6, {...label, font: font(px(12), LABEL_INK)}, {st: value(px(12), {fill: INPUT_BG})});
    if (p.benefitRows.length) pairs(p.benefitRows, E.benefit, 6.1, {...label, font: font(px(10.67), '0B568F'), fill: 'E5F4FF'}, {yen: true, st: value(px(10.67), {font: font(px(10.67), '07111F')})});
    const [i1, i2] = span(E.image[0], W);
    const box = {font: font(px(13)), fill: 'FAFAFA', align: {h: 'center', v: 'center'}, border: {l: 'thin:333333', r: 'thin:333333', t: 'thin:333333', b: 'thin:333333'}};
    if (p.image) {
      // 画像は枠の中に縦横の比を変えずに入れる（枠の内側 2mm あけて、まん中に）
      ws.box(top, i1, r - 1, i2, '', box);
      let boxH = 0;
      for (let q = top; q < r; q++) boxH += ws.rows.get(q)?.ht || 15;
      const boxW = W - E.image[0];
      const k2 = Math.min((boxW - 4) / p.image.width, (boxH / XL_PT_MM - 4) / p.image.height);
      const w = p.image.width * k2;
      const h = p.image.height * k2;
      ws.picture(top, i1, (grid.cuts[i1] < E.image[0] ? E.image[0] - grid.cuts[i1] : 0) + (boxW - w) / 2, pt((boxH / XL_PT_MM - h) / 2), w, h, p.image.bytes, 'jpeg', '貼り付けたカタログ画像');
    } else {
      ws.box(top, i1, r - 1, i2, '貼り付け画像', box);
    }
    if (k < pages.length - 1) {
      gap(3);
      breaks.push(r - 1);
    }
  });
  ws.page.rowBreaks = breaks;
  ws.page.printArea = [0, 0, r - 1, last];

  // 集計（商品が2つ以上のとき）。A4 横・1ページに収める。受注簿のページと同じ字（游ゴシック）・見出しの色・線
  // （ユーザーの指示「販売受注簿の2枚目だけ、書式が少し違います。1枚目と統一してください」2026-10-29。前は明朝体と水色の細い線）
  if (summary) {
    const ss = book.addSheet('集計', {orientation: 'landscape', margins: {l: 6, r: 6, t: 6, b: 6, h: 3, f: 3}, fitWidth: 1, fitHeight: 1});
    // 列は表の列（印刷で測った mm。幅 344.5mm）。上の段・下の管理の表の区切りも同じ列に入れる
    const colMm = [130.8, 22.4, 22.4, 22.4, 22.4, 13.8, 27.5, 27.5, 27.5, 27.5];
    const g = gridOf([0, ...colMm.map((_, i) => colMm.slice(0, i + 1).reduce((a, b) => a + b, 0)), 23.8, 160.5, 160.7, 184.5, 252.4, 276.2, 89.5, 172.1, 261.6]);
    ss.setCols(g.widths);
    const at = (mm) => g.at(mm);
    const n = g.cuts.length - 2;
    let q = 0;
    ss.height(q, pt(9));
    ss.box(q, 0, q, n, summary.title, {font: font(px(18), '1D3448'), align: {h: 'center', v: 'center'}, border: {t: ACCENT}});
    q++;
    ss.height(q++, pt(2.6));
    // 顧客名・商品数・日付
    ss.height(q, pt(10.6));
    const headAt = [
      [0, 23.8, 160.5],
      [160.7, 184.5, 252.4],
      [252.4, 276.2, 344.5],
    ];
    summary.head.forEach(([name, v], i) => {
      const e = headAt[i];
      if (!e) return;
      ss.box(q, at(e[0]), q, at(e[1]) - 1, name, {...label, font: font(px(12), LABEL_INK)});
      ss.box(q, at(e[1]), q, at(e[2]) - 1, v, value(px(12.5)));
    });
    q++;
    ss.height(q++, pt(2.7));
    if (summary.error) {
      ss.height(q, 16);
      ss.box(q, 0, q, n, summary.error, {font: font(px(12.5)), align: {h: 'left', v: 'center', shrink: true}});
      q++;
    }
    // 明細の表
    const tableTop = q;
    const colAt = (i) => [at(colMm.slice(0, i).reduce((a, b) => a + b, 0)), at(colMm.slice(0, i + 1).reduce((a, b) => a + b, 0)) - 1];
    ss.height(q, pt(7.4));
    summary.cols.forEach((h, i) => {
      if (i >= colMm.length) return;
      const [a, b] = colAt(i);
      ss.box(q, a, q, b, h, {font: font(px(12), HEAD_INK), fill: HEAD_BG, align: {h: 'center', v: 'center', wrap: true}, border: SOFT_ALL});
    });
    q++;
    const first = q;
    for (const row of summary.rows) {
      ss.height(q, pt(8.3));
      row.forEach((v, i) => {
        if (i >= colMm.length) return;
        const [a, b] = colAt(i);
        const m = money(v);
        ss.box(q, a, q, b, m, {font: font(px(12.3)), align: {h: i === 0 ? 'left' : 'center', v: 'center', shrink: true, indent: i === 0 ? 1 : 0}, border: SOFT_ALL, ...(typeof m === 'number' ? {fmt: YEN} : {})});
      });
      q++;
    }
    const lastRow = q - 1;
    ss.page.printTitles = [tableTop, tableTop];
    ss.height(q++, pt(3));
    // 合計（販売・送料・仕切り）は、明細の和と同じなら式（数を直すと計算し直す）
    const colOf = (name) => summary.cols.findIndex((c) => c.replace(/[()（）\s]/g, '') === name);
    const sumOf = (name, shown) => {
      const i = colOf(name);
      if (i < 0 || !summary.rows.length) return shown;
      const vals = summary.rows.map((row) => money(row[i] ?? ''));
      if (vals.some((v) => typeof v !== 'number')) return shown;
      const total = vals.reduce((a, b) => a + b, 0);
      const c = colAt(i)[0];
      return total === shown ? {f: `SUM(${xlRange(first, c, lastRow, c)})`, v: total} : shown;
    };
    const SUMS = {'販売合計税抜': '販売金額税抜', '送料合計税抜': '送料税抜', '仕切り合計税抜': '仕切り税抜'};
    const mgmtAt = [
      [0, 89.5],
      [89.5, 172.1],
      [172.1, 261.6],
      [261.6, 344.5],
    ];
    const cellsAt = {};
    for (const row of summary.mgmt) {
      ss.height(q, pt(7.7));
      row.forEach((v, i) => {
        const e = mgmtAt[i];
        if (!e) return;
        const shown = money(v);
        const key = String(row[i - 1] ?? '').replace(/[()（）\s]/g, '');
        let cell = i % 2 === 1 && typeof shown === 'number' && SUMS[key] ? sumOf(SUMS[key], shown) : shown;
        if (i % 2 === 1) cellsAt[key] = {r: q, c: at(e[0]), v: shown};
        // 利益額＝販売合計−仕切り合計（どちらも式で、引き算が同じときだけ）
        if (key === '利益額' && typeof shown === 'number' && cellsAt['販売合計税抜'] && cellsAt['仕切り合計税抜'] && cellsAt['販売合計税抜'].v - cellsAt['仕切り合計税抜'].v === shown) {
          cell = {f: `${xlRef(cellsAt['販売合計税抜'].r, cellsAt['販売合計税抜'].c)}-${xlRef(cellsAt['仕切り合計税抜'].r, cellsAt['仕切り合計税抜'].c)}`, v: shown};
        }
        const isNum = typeof shown === 'number';
        ss.box(q, at(e[0]), q, at(e[1]) - 1, cell, {
          ...(i % 2 === 0 ? {...label, font: font(px(12), LABEL_INK)} : value(px(12))),
          ...(isNum ? {fmt: YEN} : {}),
        });
      });
      q++;
    }
    ss.page.printArea = [0, 0, q - 1, n];
  }
  return book.toBytes(title);
}
