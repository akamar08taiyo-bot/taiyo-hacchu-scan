// Excel（.xlsx）を書き出す小さな部品。ブラウザの中で xlsx を組み立てる（サーバーへは送らない）。
// 特定福祉用具のアプリ（akamar08taiyo-bot/- の src/tokutei/print/xlsxBook.ts）を写したもの。見積・提案書作成・消耗品売上管理と同じ作り
// （taiyo-excel-export スキル）。このリポジトリは依存を増やさないよう、zip は無圧縮で自分で書く（チラシ作成の xlsx.js と同じ）。
// 足したもの：用紙の向き・拡大縮小（手動の改ページを使うとき。Excel は「1ページに収める」だと手動の改ページを使わない）・改ページ・印刷タイトル・画像（JPEG/PNG）。

export const XL_MINCHO = 'BIZ UDP明朝 Medium'; // 印刷の BIZ UDP明朝 と同じ書体（Windows 10 以降に標準）
export const XL_GOTHIC = 'BIZ UDPゴシック';
export const XL_YUGOTHIC = '游ゴシック'; // 受注簿（画面・印刷は Noto Sans JP → Yu Gothic UI → Yu Gothic）
export const XL_PT_MM = 72 / 25.4; // 1mm は何 pt か
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MDW = 10; // 標準の字体（BIZ UDP明朝 Medium 11pt）の数字1文字の幅(px)。列幅の mm → Excel の幅
const PX_MM = 96 / 25.4;
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CT = 'application/vnd.openxmlformats-officedocument.';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// XML に書けない制御文字を除いてエスケープ
const esc = (s) =>
  String(s ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const colName = (c) => {
  let s = '';
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
/** 0 始まりの行・列 → "A1"（abs で "$A$1"） */
export const xlRef = (r, c, abs = false) => (abs ? `$${colName(c)}$${r + 1}` : `${colName(c)}${r + 1}`);
export const xlRange = (r1, c1, r2, c2, abs = false) => `${xlRef(r1, c1, abs)}:${xlRef(r2, c2, abs)}`;
const argb = (hex) => 'FF' + String(hex).replace('#', '').toUpperCase();
const num = (n) => (Number.isFinite(n) ? String(Number(n.toPrecision(15))) : '0'); // Excel と同じ有効15桁
// mm → Excel の列幅（標準の字体の数字幅の単位）
const colWidth = (mm) => Math.max(0.5, Math.round(((mm * PX_MM) / MDW) * 256) / 256);

// 文字幅（em）の見積り。行の高さ（折り返し行数）を決めるのに使う。半角英数は BIZ UDP明朝 の字幅（1/100 em）
const ASCII_EM = [
  33, 38, 49, 86, 68, 100, 87, 30, 47, 47, 50, 84, 33, 50, 33, 50, 68, 52, 68, 68, 68, 68, 68, 68, 68, 68, 33, 33, 84, 84, 84, 70, 98, 84, 74, 81, 80, 72, 66, 84, 80, 38, 50,
  79, 63, 96, 84, 84, 70, 86, 75, 70, 70, 82, 76, 98, 80, 76, 72, 50, 50, 50, 50, 31, 50, 62, 64, 58, 63, 63, 46, 66, 67, 33, 40, 65, 33, 92, 66, 62, 65, 64, 46, 54, 42, 64,
  61, 86, 66, 64, 55, 51, 44, 51, 50,
];
export function xlTextEm(s) {
  let w = 0;
  for (const ch of String(s)) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x20 && cp < 0x7f) w += ASCII_EM[cp - 0x20] / 100;
    else if (cp === 0xa5) w += 0.68;
    else if (cp >= 0xff61 && cp <= 0xff9f) w += 0.5;
    else if ('（）「」【】・：'.includes(ch)) w += 0.5;
    else if ('、。'.includes(ch)) w += 0.6;
    else if (ch === '　') w += 0.667;
    else if (cp >= 0x3041 && cp <= 0x30ff) w += 0.95;
    else w += 1;
  }
  return w;
}
/** 幅 widthMm の枠に sizePt の文字を折り返したときの行数（字体が置き換わる PC でも切れないよう、使える幅は1割弱少なめ） */
export function xlLineCount(text, widthMm, sizePt) {
  const usable = Math.max(4, widthMm * 0.93);
  return String(text)
    .split('\n')
    .reduce((n, line) => n + Math.max(1, Math.ceil((xlTextEm(line) * sizePt) / XL_PT_MM / usable - 0.02)), 0);
}

/**
 * 列の境目（mm）を集めて、近い境目（tol mm より近い）を1つにした列。at(mm) はその境目の列の番号（0 始まり）
 * （taiyo-excel-export スキルの「グリッド」：印刷と同じ位置に枠を置いて結合セルにする）
 */
export function gridOf(edges, tol = 1.5) {
  const sorted = [...new Set(edges.map((x) => Math.round(x * 10) / 10))].sort((a, b) => a - b);
  const cuts = [];
  for (const x of sorted) if (!cuts.length || x - cuts[cuts.length - 1] >= tol) cuts.push(x);
  const at = (mm) => {
    let best = 0;
    for (let i = 1; i < cuts.length; i++) if (Math.abs(cuts[i] - mm) < Math.abs(cuts[best] - mm)) best = i;
    return best;
  };
  return {cuts, widths: cuts.slice(1).map((x, i) => x - cuts[i]), at};
}

/** 無圧縮の zip（stored）。CRC-32 は表を作って計算する */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function zipStore(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  const u16 = (v) => [v & 0xff, (v >>> 8) & 0xff];
  const u32 = (v) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  for (const [name, data] of Object.entries(files)) {
    const nameBytes = enc.encode(name);
    const crc = crc32(data);
    // 日時は 1980-01-01（中身に関係しない）。名前は UTF-8（汎用フラグ 0x0800）
    const local = [...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0)];
    parts.push(new Uint8Array(local), nameBytes, data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const centralSize = central.reduce((n, p) => n + p.length, 0);
  const count = Object.keys(files).length;
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(count), ...u16(count), ...u32(centralSize), ...u32(offset), ...u16(0)]);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/**
 * ブックを作る。addSheet(name, page) → sheet.setCols(mm[])・sheet.height(r, pt)・sheet.box(r1, c1, r2, c2, 値, 書式)。toBytes() で .xlsx のバイト列。
 * 値は 数・文字・{rich: [{t, font}]}・{f: 式, v: 開いた時点に見せる値}。書式は {font:{name,sz,b,color}, fill, border:{l,r,t,b}（'thin:色'）, align:{h,v,wrap,indent,shrink}, fmt}
 * page：margins（mm）・orientation（'portrait'・'landscape'）・fitWidth/fitHeight（1ページに収める）か scale（%）・rowBreaks（この行のあとで改ページ。0 始まり）・
 * printArea [r1,c1,r2,c2]・printTitles [r1,r2]（各ページの上にくり返す行）
 */
export function createXlsxBook() {
  const familyOf = (name) => (/明朝|Mincho/i.test(name) ? 1 : 3);
  const fonts = [];
  const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  const borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
  const numFmts = [];
  const xfs = [];
  const idx = {font: new Map(), fill: new Map(), border: new Map(), numFmt: new Map(), xf: new Map()};
  const intern = (map, list, key, make) => {
    const hit = map.get(key);
    if (hit !== undefined) return hit;
    list.push(make());
    map.set(key, list.length - 1);
    return list.length - 1;
  };
  const fontBody = (f, tag) => {
    const name = f.name || XL_MINCHO;
    return `${f.b ? '<b/>' : ''}<sz val="${num(f.sz || 11)}"/><color rgb="${argb(f.color || '000000')}"/><${tag} val="${esc(name)}"/><family val="${familyOf(name)}"/><charset val="128"/>`;
  };
  const fontId = (f = {}) => intern(idx.font, fonts, JSON.stringify([f.name || '', f.sz || 0, !!f.b, f.color || '']), () => `<font>${fontBody(f, 'name')}</font>`);
  fontId({});
  const fillId = (hex) => (hex ? intern(idx.fill, fills, hex, () => `<fill><patternFill patternType="solid"><fgColor rgb="${argb(hex)}"/><bgColor indexed="64"/></patternFill></fill>`) : 0);
  const edge = (tag, spec) => {
    if (!spec) return `<${tag}/>`;
    const [st, col] = spec.split(':');
    return `<${tag} style="${st}"><color rgb="${argb(col || '000000')}"/></${tag}>`;
  };
  const borderId = (b) =>
    !b || !(b.l || b.r || b.t || b.b) ? 0 : intern(idx.border, borders, [b.l, b.r, b.t, b.b].join('|'), () => `<border>${edge('left', b.l)}${edge('right', b.r)}${edge('top', b.t)}${edge('bottom', b.b)}<diagonal/></border>`);
  const BUILTIN_FMT = {General: 0, 0: 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4, '@': 49};
  const numFmtId = (code) => (!code ? 0 : (BUILTIN_FMT[code] ?? 164 + intern(idx.numFmt, numFmts, code, () => code)));
  const style = (st = {}) => {
    const key = JSON.stringify(st);
    const hit = idx.xf.get(key);
    if (hit !== undefined) return hit;
    const al = st.align || {};
    const alignXml =
      al.h || al.v || al.wrap || al.indent || al.shrink
        ? `<alignment${al.h ? ` horizontal="${al.h}"` : ''}${al.v ? ` vertical="${al.v}"` : ''}${al.wrap ? ' wrapText="1"' : ''}${al.indent ? ` indent="${al.indent}"` : ''}${al.shrink && !al.wrap ? ' shrinkToFit="1"' : ''}/>`
        : '';
    xfs.push(`<xf numFmtId="${numFmtId(st.fmt)}" fontId="${fontId(st.font)}" fillId="${fillId(st.fill)}" borderId="${borderId(st.border)}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${alignXml}</xf>`);
    idx.xf.set(key, xfs.length - 1);
    return xfs.length - 1;
  };
  style({});

  const sst = [];
  const sstIdx = new Map();
  let sstRefs = 0;
  const tXml = (t) => `<t${/^\s|\s$|[\n\t]/.test(t) ? ' xml:space="preserve"' : ''}>${esc(t)}</t>`;
  const stringId = (v) => {
    sstRefs++;
    const key = typeof v === 'string' ? 's:' + v : 'r:' + JSON.stringify(v);
    const hit = sstIdx.get(key);
    if (hit !== undefined) return hit;
    const xml =
      typeof v === 'string'
        ? `<si>${tXml(v)}</si>`
        : `<si>${v.rich
            .filter((r) => r.t !== '')
            .map((r) => `<r><rPr>${fontBody(r.font || {}, 'rFont')}</rPr>${tXml(r.t)}</r>`)
            .join('')}</si>`;
    sst.push(xml);
    sstIdx.set(key, sst.length - 1);
    return sst.length - 1;
  };

  const sheets = [];
  const addSheet = (name, page = {}) => {
    const rows = new Map();
    const rowOf = (r) => {
      let row = rows.get(r);
      if (!row) rows.set(r, (row = {ht: null, cells: new Map()}));
      return row;
    };
    const merges = [];
    const ws = {
      name: (String(name).replace(/[[\]:*?/\\]/g, ' ').trim() || 'Sheet1').slice(0, 31),
      page: {margins: {l: 15, r: 15, t: 12, b: 12, h: 6, f: 6}, orientation: 'portrait', fitWidth: 1, fitHeight: 0, scale: 0, rowBreaks: [], printArea: null, printTitles: null, ...page},
      cols: [],
      colsMm: [],
      rows,
      merges,
      pictures: [],
      setCols: (mm) => {
        ws.colsMm = [...mm];
        ws.cols = mm.map(colWidth);
      },
      height: (r, pt) => {
        const row = rowOf(r);
        row.ht = Math.min(409, Math.max(row.ht || 0, Math.round(pt * 4) / 4));
      },
      box: (r1, c1, r2, c2, v, st = {}) => {
        const b = st.border || {};
        for (let r = r1; r <= r2; r++) {
          for (let c = c1; c <= c2; c++) {
            const s = style({...st, border: {l: c === c1 ? b.l : undefined, r: c === c2 ? b.r : undefined, t: r === r1 ? b.t : undefined, b: r === r2 ? b.b : undefined}});
            const cur = rowOf(r).cells.get(c);
            rowOf(r).cells.set(c, {v: r === r1 && c === c1 ? v : (cur?.v ?? null), s});
          }
        }
        if (r1 !== r2 || c1 !== c2) merges.push(xlRange(r1, c1, r2, c2));
      },
      /** 画像。セル (r, c) の左上から右へ x mm・下へ y pt の所に、幅 w mm・高さ h mm で置く（bytes は JPEG か PNG） */
      picture: (r, c, x, y, w, h, bytes, ext = 'jpeg', descr = '') => {
        // 置く所をそのセルの中に収まる形（左上のセル＋ずれ）にする。列の幅は setCols の mm、行の高さは height の pt（ないときは 15pt）
        let col = c;
        let dx = x;
        while (col < ws.colsMm.length - 1 && dx >= ws.colsMm[col]) dx -= ws.colsMm[col++];
        let row = r;
        let dy = y;
        for (let ht = rows.get(row)?.ht || 15; dy >= ht; ht = rows.get(row)?.ht || 15) {
          dy -= ht;
          row++;
        }
        ws.pictures.push({row, col, dx, dy, w, h, bytes, ext: ext === 'png' ? 'png' : 'jpeg', descr});
      },
    };
    sheets.push(ws);
    return ws;
  };

  const cellXml = (r, c, {v, s}) => {
    const at = xlRef(r, c);
    const sa = s ? ` s="${s}"` : '';
    if (v === null || v === undefined || v === '') return `<c r="${at}"${sa}/>`;
    if (typeof v === 'number') return Number.isFinite(v) ? `<c r="${at}"${sa}><v>${num(v)}</v></c>` : `<c r="${at}"${sa}/>`;
    if (typeof v === 'object' && 'f' in v) {
      if (typeof v.v === 'string') return `<c r="${at}"${sa} t="str"><f>${esc(v.f)}</f><v>${esc(v.v)}</v></c>`;
      return `<c r="${at}"${sa}><f>${esc(v.f)}</f>${typeof v.v === 'number' && Number.isFinite(v.v) ? `<v>${num(v.v)}</v>` : ''}</c>`;
    }
    return `<c r="${at}"${sa} t="s"><v>${stringId(v)}</v></c>`;
  };
  const mm2in = (mm) => num(Math.round((mm / 25.4) * 1000) / 1000);
  const sheetXml = (ws, i) => {
    let maxR = 0;
    let maxC = 0;
    const sd = [...ws.rows.keys()]
      .sort((a, b) => a - b)
      .map((r) => {
        const row = ws.rows.get(r);
        maxR = Math.max(maxR, r);
        const cells = [...row.cells.keys()]
          .sort((a, b) => a - b)
          .map((c) => {
            maxC = Math.max(maxC, c);
            return cellXml(r, c, row.cells.get(c));
          })
          .join('');
        return `<row r="${r + 1}"${row.ht ? ` ht="${num(row.ht)}" customHeight="1"` : ''}>${cells}</row>`;
      })
      .join('');
    const p = ws.page;
    const m = p.margins;
    const fit = !p.scale && (p.fitWidth || p.fitHeight);
    const breaks = [...new Set(p.rowBreaks)].sort((a, b) => a - b);
    return (
      XML_HEAD +
      `<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_R}">` +
      (fit ? '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' : '') +
      `<dimension ref="A1:${xlRef(maxR, Math.max(maxC, ws.cols.length - 1))}"/>` +
      `<sheetViews><sheetView showGridLines="0"${i === 0 ? ' tabSelected="1"' : ''} zoomScale="100" zoomScaleNormal="100" workbookViewId="0"><selection activeCell="A1" sqref="A1"/></sheetView></sheetViews>` +
      '<sheetFormatPr defaultRowHeight="15"/>' +
      (ws.cols.length ? `<cols>${ws.cols.map((w, k) => `<col min="${k + 1}" max="${k + 1}" width="${num(w)}" customWidth="1"/>`).join('')}</cols>` : '') +
      `<sheetData>${sd}</sheetData>` +
      (ws.merges.length ? `<mergeCells count="${ws.merges.length}">${ws.merges.map((x) => `<mergeCell ref="${x}"/>`).join('')}</mergeCells>` : '') +
      '<printOptions horizontalCentered="1"/>' +
      `<pageMargins left="${mm2in(m.l)}" right="${mm2in(m.r)}" top="${mm2in(m.t)}" bottom="${mm2in(m.b)}" header="${mm2in(m.h)}" footer="${mm2in(m.f)}"/>` +
      `<pageSetup paperSize="9"${p.scale ? ` scale="${Math.round(p.scale)}"` : ''} orientation="${p.orientation}"${fit ? ` fitToWidth="${p.fitWidth}" fitToHeight="${p.fitHeight}"` : ''}/>` +
      (breaks.length ? `<rowBreaks count="${breaks.length}" manualBreakCount="${breaks.length}">${breaks.map((r) => `<brk id="${r + 1}" max="16383" man="1"/>`).join('')}</rowBreaks>` : '') +
      (ws.pictures.length ? '<drawing r:id="rId1"/>' : '') +
      '</worksheet>'
    );
  };

  const EMU_MM = 36000;
  const emu = (mm) => Math.max(0, Math.round(mm * EMU_MM));
  const NS_XDR = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
  const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const drawingXml = (ws) =>
    XML_HEAD +
    `<xdr:wsDr xmlns:xdr="${NS_XDR}" xmlns:a="${NS_A}">` +
    ws.pictures
      .map(
        (p, k) =>
          `<xdr:oneCellAnchor><xdr:from><xdr:col>${p.col}</xdr:col><xdr:colOff>${emu(p.dx)}</xdr:colOff><xdr:row>${p.row}</xdr:row><xdr:rowOff>${emu(p.dy / XL_PT_MM)}</xdr:rowOff></xdr:from>` +
          `<xdr:ext cx="${emu(p.w)}" cy="${emu(p.h)}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${k + 2}" name="図 ${k + 1}"${p.descr ? ` descr="${esc(p.descr)}"` : ''}/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>` +
          `<xdr:blipFill><a:blip xmlns:r="${NS_R}" r:embed="rId${k + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
          `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(p.w)}" cy="${emu(p.h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`,
      )
      .join('') +
    '</xdr:wsDr>';
  const RELS = 'http://schemas.openxmlformats.org/package/2006/relationships';

  const toBytes = (title = '') => {
    const enc = (s) => new TextEncoder().encode(s);
    const files = {};
    files['[Content_Types].xml'] = new Uint8Array();
    const ct = [];
    const wbRels = [];
    let media = 0;
    const exts = new Set();
    sheets.forEach((ws, i) => {
      files[`xl/worksheets/sheet${i + 1}.xml`] = enc(sheetXml(ws, i));
      ct.push(`<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${CT}spreadsheetml.worksheet+xml"/>`);
      wbRels.push(`<Relationship Id="rId${i + 1}" Type="${NS_R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`);
      if (!ws.pictures.length) return;
      // 画像：シート → 描画（drawing）→ 画像のファイル（xl/media）
      files[`xl/worksheets/_rels/sheet${i + 1}.xml.rels`] = enc(XML_HEAD + `<Relationships xmlns="${RELS}"><Relationship Id="rId1" Type="${NS_R}/drawing" Target="../drawings/drawing${i + 1}.xml"/></Relationships>`);
      files[`xl/drawings/drawing${i + 1}.xml`] = enc(drawingXml(ws));
      ct.push(`<Override PartName="/xl/drawings/drawing${i + 1}.xml" ContentType="${CT}drawing+xml"/>`);
      const rels = ws.pictures.map((p, k) => {
        const name = `image${++media}.${p.ext}`;
        files[`xl/media/${name}`] = p.bytes;
        exts.add(p.ext);
        return `<Relationship Id="rId${k + 1}" Type="${NS_R}/image" Target="../media/${name}"/>`;
      });
      files[`xl/drawings/_rels/drawing${i + 1}.xml.rels`] = enc(XML_HEAD + `<Relationships xmlns="${RELS}">${rels.join('')}</Relationships>`);
    });
    wbRels.push(`<Relationship Id="rId${sheets.length + 1}" Type="${NS_R}/styles" Target="styles.xml"/>`);
    wbRels.push(`<Relationship Id="rId${sheets.length + 2}" Type="${NS_R}/sharedStrings" Target="sharedStrings.xml"/>`);
    const quoted = (ws) => `'${ws.name.replace(/'/g, "''")}'`;
    const names = sheets
      .map((ws, i) => {
        const a = ws.page.printArea;
        const t = ws.page.printTitles;
        return (
          (a ? `<definedName name="_xlnm.Print_Area" localSheetId="${i}">${esc(`${quoted(ws)}!${xlRange(a[0], a[1], a[2], a[3], true)}`)}</definedName>` : '') +
          (t ? `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${esc(`${quoted(ws)}!$${t[0] + 1}:$${t[1] + 1}`)}</definedName>` : '')
        );
      })
      .join('');
    files['xl/styles.xml'] = enc(
      XML_HEAD +
        `<styleSheet xmlns="${NS_MAIN}">` +
        (numFmts.length ? `<numFmts count="${numFmts.length}">${numFmts.map((code, k) => `<numFmt numFmtId="${164 + k}" formatCode="${esc(code)}"/>`).join('')}</numFmts>` : '') +
        `<fonts count="${fonts.length}">${fonts.join('')}</fonts>` +
        `<fills count="${fills.length}">${fills.join('')}</fills>` +
        `<borders count="${borders.length}">${borders.join('')}</borders>` +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>` +
        '<cellStyles count="1"><cellStyle name="標準" xfId="0" builtinId="0"/></cellStyles>' +
        '</styleSheet>',
    );
    files['xl/sharedStrings.xml'] = enc(XML_HEAD + `<sst xmlns="${NS_MAIN}" count="${sstRefs}" uniqueCount="${sst.length}">${sst.join('')}</sst>`);
    files['xl/workbook.xml'] = enc(
      XML_HEAD +
        `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_R}"><workbookPr/><bookViews><workbookView activeTab="0"/></bookViews>` +
        `<sheets>${sheets.map((ws, i) => `<sheet name="${esc(ws.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>` +
        (names ? `<definedNames>${names}</definedNames>` : '') +
        '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>',
    );
    files['xl/_rels/workbook.xml.rels'] = enc(XML_HEAD + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${wbRels.join('')}</Relationships>`);
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    files['docProps/core.xml'] = enc(
      XML_HEAD +
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        `<dc:title>${esc(title)}</dc:title><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`,
    );
    files['docProps/app.xml'] = enc(XML_HEAD + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Excel</Application></Properties>');
    files['_rels/.rels'] = enc(
      XML_HEAD +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        `<Relationship Id="rId1" Type="${NS_R}/officeDocument" Target="xl/workbook.xml"/>` +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
        `<Relationship Id="rId3" Type="${NS_R}/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    );
    files['[Content_Types].xml'] = enc(
      XML_HEAD +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        [...exts].map((x) => `<Default Extension="${x}" ContentType="image/${x}"/>`).join('') +
        `<Override PartName="/xl/workbook.xml" ContentType="${CT}spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="${CT}spreadsheetml.styles+xml"/>` +
        `<Override PartName="/xl/sharedStrings.xml" ContentType="${CT}spreadsheetml.sharedStrings+xml"/>` +
        ct.join('') +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        `<Override PartName="/docProps/app.xml" ContentType="${CT}extended-properties+xml"/></Types>`,
    );
    return zipStore(files);
  };

  return {addSheet, toBytes};
}

/** ブラウザで .xlsx を保存する（doc は保存のリンクを作る画面。見積書の別ウィンドウからも使う） */
export function downloadXlsx(bytes, name, doc = document) {
  const view = doc.defaultView || window;
  const url = view.URL.createObjectURL(new view.Blob([bytes], {type: XLSX_MIME}));
  const a = doc.createElement('a');
  a.href = url;
  a.download = name;
  doc.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => view.URL.revokeObjectURL(url), 60000);
}

/** 画面の画像（img）を JPEG のバイト列に（Excel に入れる。長い辺は maxPx まで縮める）。読めないとき（別のサイトの画像など）は null */
export function imageToJpeg(img, maxPx = 1600) {
  try {
    const w0 = img.naturalWidth || img.width;
    const h0 = img.naturalHeight || img.height;
    if (!w0 || !h0) return null;
    const k = Math.min(1, maxPx / Math.max(w0, h0));
    const canvas = img.ownerDocument.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w0 * k));
    canvas.height = Math.max(1, Math.round(h0 * k));
    const g = canvas.getContext('2d');
    g.fillStyle = '#ffffff'; // 透明な所は白に（JPEG は透明を持てない）
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    const b64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1] || '';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.length ? {bytes, width: canvas.width, height: canvas.height} : null;
  } catch {
    return null;
  }
}
