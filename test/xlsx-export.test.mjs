import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildOrderXlsx, ORDER_EDGES, yenValue } from "../src/lib/orderXlsx.mjs";
import { buildEstimateXlsx, estimateNumber, estimateXlsxName } from "../src/lib/estimateXlsx.mjs";
import { gridOf, zipStore } from "../src/lib/xlsxBook.mjs";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

/** 無圧縮の zip（xlsxBook の zipStore）を読む → { 名前: 文字列 } */
function unzip(bytes) {
  const files = {};
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    assert.equal(view.getUint16(at + 8, true), 0, "無圧縮");
    const size = view.getUint32(at + 18, true);
    const nameLen = view.getUint16(at + 26, true);
    const extra = view.getUint16(at + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + nameLen));
    const start = at + 30 + nameLen + extra;
    files[name] = bytes.subarray(start, start + size);
    at = start + size;
  }
  return Object.fromEntries(Object.entries(files).map(([k, v]) => [k, k.startsWith("xl/media/") ? v : new TextDecoder().decode(v)]));
}
const unesc = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
/** シートの式と、開いた時点に見せる値 → [{ref, f, v}] */
const formulas = (xml) => [...xml.matchAll(/<c r="([A-Z]+\d+)"[^>]*><f>([^<]*)<\/f>(?:<v>([^<]*)<\/v>)?<\/c>/g)].map(([, ref, f, v]) => ({ ref, f: unesc(f), v: v === undefined ? null : Number(v) }));
/** 結合セルが重ならないこと（Excel で「修復」になる。XSD では見つからない） */
function assertNoOverlap(xml) {
  const col = (s) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  const cells = new Set();
  for (const [, a, b] of xml.matchAll(/<mergeCell ref="([A-Z]+\d+):([A-Z]+\d+)"\/>/g)) {
    const [, c1, r1] = a.match(/([A-Z]+)(\d+)/);
    const [, c2, r2] = b.match(/([A-Z]+)(\d+)/);
    for (let r = Number(r1); r <= Number(r2); r++)
      for (let c = col(c1); c <= col(c2); c++) {
        assert.ok(!cells.has(`${r}:${c}`), `結合セルが重なる ${a}:${b}`);
        cells.add(`${r}:${c}`);
      }
  }
}

const orderPage = (name, list, extra = {}) => ({
  title: "受 注 簿 【 販 売 】",
  benefit: false,
  primary: [["日付", "2026/10/25"], ["受注区分", "販売"], ["レンタル", "無"], ["支払い方法", "集金"], ["SMARTれん太の販売分類", "一般個人"], ["営業担当", "見本"], ["納品予定日", ""], ["売上日", ""]],
  customer: [["顧客名", "見本 花子", ""], ["依頼者名（任意）", ""], ["住所（任意）", "福岡県行橋市中央1-1"], ["電話番号（任意）", ""]],
  productName: name,
  note: "",
  priceNote: `商品代金 定価（税抜）：${list.toLocaleString("ja-JP")}円`,
  head: ["申込番号", "WEBコード", "型番", "色・サイズ", "送料（税抜）", "数量", "販売金額（税抜）", "合計金額（税込）"],
  row: ["", "", "A-100", "", "0円", "1台", "12,640円", "13,904円"],
  secondary: [["受注番号", ""], ["発注先", "見本商事"], ["発注番号", ""], ["発注者", "見本"], ["入荷日", ""], ["入荷確認", "□ 確認済"]],
  mgmt: [["定価(税抜)", String(list)], ["定価(税込)", "17380"], ["仕切り(税抜)", "9480"], ["仕切り(税込)", "10428"], ["税区分", "10%"], ["利益率", "25"]],
  benefitRows: [],
  image: null,
  ...extra,
});

test("受注簿の Excel：1点1ページ（間で改ページ）・A4横・印刷と同じ欄・集計のシート（合計は式）", () => {
  const pages = [
    orderPage("シャワーチェア 見本A", 15800),
    orderPage("浴槽台 見本B", 13800, {
      benefit: true,
      primary: [["日付", "2026/10/25"], ["受注区分", "給付"], ["給付割合", "1割"], ["レンタル", "無"], ["支払い方法", "集金"], ["SMARTれん太の販売分類", "一般個人"], ["営業担当", "見本"], ["納品予定日", ""], ["売上日", ""]],
      customer: [["顧客名", "見本 花子", "ミホン ハナコ"], ["依頼者名（任意）", ""], ["住所（任意）", ""], ["電話番号（任意）", ""]],
      benefitRows: [["給付割合", "1割負担"], ["商品代金(10割・税込)", "13,904円"], ["利用者負担額(1割・税込)", "1,391円"], ["保険者負担額(9割・税込)", "12,513円"]],
      image: { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), width: 400, height: 300 },
    }),
  ];
  const summary = {
    title: "受注簿【販売】集計",
    head: [["顧客名", "見本 花子"], ["商品数", "2件"], ["日付", "2026/10/25"]],
    cols: ["商品名", "申込番号", "WEBコード", "型番", "色・サイズ", "数量", "送料(税抜)", "販売金額(税抜)", "合計金額(税込)", "仕切り(税抜)"],
    rows: [["シャワーチェア 見本A", "", "", "A-100", "", "1台", "0円", "12,640円", "13,904円", "9,480円"], ["浴槽台 見本B", "", "", "B-200", "", "1台", "0円", "11,040円", "12,144円", "8,280円"]],
    mgmt: [["販売合計(税抜)", "23,680円", "販売合計(税込)", "26,048円"], ["送料合計(税抜)", "0円", "送料込み合計(税込)", "26,048円"], ["仕切り合計(税抜)", "17,760円", "仕切り合計(税込)", "19,536円"], ["利益額", "5,920円", "利益率", "25%"]],
    error: "",
  };
  const files = unzip(buildOrderXlsx(pages, summary));
  assert.match(files["xl/workbook.xml"], /<sheet name="受注簿"[^>]*\/><sheet name="集計"/);
  const sheet = files["xl/worksheets/sheet1.xml"];
  assertNoOverlap(sheet);
  assertNoOverlap(files["xl/worksheets/sheet2.xml"]);
  // 手動の改ページを使うので「1ページに収める」ではなく拡大縮小。A4 横・余白 6mm（PDF と同じ）
  assert.match(sheet, /<pageSetup paperSize="9" scale="96" orientation="landscape"\/>/);
  assert.doesNotMatch(sheet, /fitToPage/);
  assert.match(sheet, /<rowBreaks count="1" manualBreakCount="1">/);
  assert.match(sheet, /<pageMargins left="0\.236" right="0\.236" top="0\.236" bottom="0\.236"/);
  const strings = files["xl/sharedStrings.xml"];
  for (const s of ["シャワーチェア 見本A", "浴槽台 見本B", "給付割合", "利用者負担額(1割・税込)", "□ 確認済", "ミホン ハナコ\n", "見本商事"]) assert.ok(strings.includes(s), s);
  // 金額の欄は数（表示は「12,640円」）。管理情報は印刷と同じく数字だけ（15800）
  assert.match(files["xl/styles.xml"], /formatCode="#,##0&quot;円&quot;"/);
  assert.match(sheet, /<v>12640<\/v>/);
  assert.match(sheet, /<v>15800<\/v>/);
  // 貼り付けた画像は画像の枠の中に（縦横の比はそのまま）
  assert.ok(files["xl/media/image1.jpeg"], "画像のファイル");
  assert.match(files["xl/drawings/drawing1.xml"], /<xdr:oneCellAnchor>/);
  const [, cx, cy] = files["xl/drawings/drawing1.xml"].match(/<xdr:ext cx="(\d+)" cy="(\d+)"\/>/);
  assert.ok(Math.abs(Number(cx) / Number(cy) - 4 / 3) < 0.01);
  assert.match(files["[Content_Types].xml"], /<Default Extension="jpeg" ContentType="image\/jpeg"\/>/);
  // 集計：販売・送料・仕切りの合計は明細の和の式、利益額は 販売−仕切り
  const f = formulas(files["xl/worksheets/sheet2.xml"]);
  const byValue = (v) => f.find((x) => x.v === v);
  assert.match(byValue(23680).f, /^SUM\([A-Z]+\d+:[A-Z]+\d+\)$/);
  assert.match(byValue(17760).f, /^SUM\(/);
  assert.match(byValue(0).f, /^SUM\(/);
  assert.match(byValue(5920).f, /^[A-Z]+\d+-[A-Z]+\d+$/);
  assert.match(files["xl/worksheets/sheet2.xml"], /fitToWidth="1" fitToHeight="1"/);
});

test("受注簿の Excel：列は PDF の位置（mm）から。近い境目は1つにまとめる", () => {
  const grid = gridOf([...ORDER_EDGES.primary, ...ORDER_EDGES.product, ...ORDER_EDGES.image]);
  assert.equal(grid.cuts[0], 0);
  assert.equal(grid.cuts.at(-1), 282.4);
  assert.ok(grid.widths.every((w) => w >= 1.5), "細すぎる列がない");
  assert.equal(yenValue("12,640円"), 12640);
  assert.equal(yenValue("１２,６４０円"), 12640);
  assert.equal(yenValue("未入力あり"), null);
});

const office = [[{ t: "〒" }, { t: "824-0000" }], [{ t: "福岡県行橋市見本町1-1" }], [{ t: "登録番号", strong: true }, { t: " T0000000000000" }]];
const estimateBase = {
  title: "御　見　積　書",
  client: [{ name: "見本 花子", suffix: true }, { name: "", suffix: false }],
  clientSize: 19,
  honorific: "様",
  lead: ["下記の通り、お見積り申し上げます。", "ご検討のほど、よろしくお願い申し上げます。"],
  conditions: [["見積有効期限", "お見積日より30日間"], ["お支払条件", "月末締め翌月末払い"]],
  meta: [["見積番号", "—"], ["発行日", "2026年10月25日"]],
  company: ["見本商事㈱", "見本営業所"],
  office,
  stamps: ["所長印", "担当印"],
  totalLabel: "御見積金額　合計（税込）",
  remarksTitle: "備考",
  remarks: ["1行目", "", "3行目"],
};
const row = (name, qty, unit, amount, tax, rate = 0.1) => ({ name, sub: "", qty, unit, amount, tax, rate, shipping: false });

test("見積書の Excel（複数商品）：金額＝数量×単価、消費税＝金額×税率の切り捨て、小計・合計は和の式。値は見積書の表示と同じ", () => {
  const m = {
    ...estimateBase,
    multi: true,
    category: "",
    head: ["商品名", "数量", "単価（税抜）", "金額（税抜）", "消費税"],
    rows: [row("シャワーチェア 見本A / A-100", "２", "¥12,640", "¥25,280", "¥2,528"), row("浴槽台 見本B / B-200", "1", "¥11,040", "¥11,040", "¥883", 0.08)],
    summary: [
      { label: "小計（税抜）", value: "¥36,320", field: "subtotalTable" },
      { label: "消費税", value: "¥3,411", field: "taxTable" },
      { label: "合計（税込）", value: "¥39,731", field: "grandTotalTable", overall: true },
    ],
    totalValue: "¥39,731 —",
  };
  const files = unzip(buildEstimateXlsx(m));
  const sheet = files["xl/worksheets/sheet1.xml"];
  assertNoOverlap(sheet);
  const f = formulas(sheet);
  const at = (v) => f.filter((x) => x.v === v).map((x) => x.f);
  assert.match(at(25280)[0], /^ROUND\([A-Z]+\d+\*[A-Z]+\d+,0\)$/, "全角の数量（２）も数として読む");
  assert.match(at(2528)[0], /^INT\([A-Z]+\d+\*0\.1\)$/);
  assert.match(at(883)[0], /^INT\([A-Z]+\d+\*0\.08\)$/, "8%の商品はその税率");
  assert.match(at(36320)[0], /^SUM\(/);
  assert.match(at(3411)[0], /^SUM\(/);
  // 合計（税込）は小計＋消費税、上の御見積金額は合計の欄を指す
  assert.equal(at(39731).length, 2);
  assert.match(at(39731)[0], /^[A-Z]+\d+$/);
  assert.match(at(39731)[1], /^[A-Z]+\d+\+[A-Z]+\d+$/);
  assert.match(files["xl/styles.xml"], /formatCode="&quot;¥&quot;#,##0&quot; —&quot;"/);
  // A4 縦・横1ページ・縦は続く（明細の見出しを各ページの上にくり返す）・余白は印刷と同じ
  assert.match(sheet, /<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"\/>/);
  assert.match(sheet, /<pageMargins left="0\.866" right="0\.866" top="0\.669" bottom="0\.669"/);
  assert.match(files["xl/workbook.xml"], /_xlnm\.Print_Titles" localSheetId="0">'御見積書'!\$\d+:\$\d+</);
  // 書体は印刷と同じ（本文 BIZ UDP明朝、見出し・会社の枠は BIZ UDPゴシック）。太字は使わない
  assert.match(files["xl/styles.xml"], /BIZ UDP明朝 Medium/);
  assert.match(files["xl/styles.xml"], /BIZ UDPゴシック/);
  assert.doesNotMatch(files["xl/styles.xml"], /<b\/>/);
  assert.ok(files["xl/sharedStrings.xml"].includes("御　 見　 積　 書"), "題名の字間");
  assert.ok(files["xl/sharedStrings.xml"].includes("御見積金額　合計（税込）"), "全角の空白はそのまま");
});

test("見積書の Excel：見積書の上で手で直して式と合わない金額は、その値のまま（式にしない）", () => {
  const m = {
    ...estimateBase,
    multi: false,
    category: "商品",
    head: ["品目", "数量", "単価", "金額", "消費税"],
    rows: [{ ...row("シャワーチェア 見本A / A-100", "1", "¥12,640", "¥12,000", "¥1,200"), sub: "定価15,800円（税抜）" }],
    summary: [
      { label: "小計：", value: "¥12,000", field: "subtotalTable" },
      { label: "消費税：", value: "¥1,200", field: "taxTable" },
      { label: "合計（税込）：", value: "¥13,000", field: "grandTotalTable", overall: true },
    ],
    totalValue: "¥13,000 —",
  };
  const files = unzip(buildEstimateXlsx(m));
  const sheet = files["xl/worksheets/sheet1.xml"];
  assertNoOverlap(sheet);
  const f = formulas(sheet);
  assert.ok(!f.some((x) => x.v === 12000 && /ROUND/.test(x.f)), "1×12,640 ではない金額は値のまま");
  assert.match(sheet, /<v>12000<\/v>/);
  assert.ok(f.some((x) => x.v === 1200 && /^INT\(/.test(x.f)), "消費税は直した金額の10%なので式");
  assert.ok(!f.some((x) => x.v === 13000 && /\+/.test(x.f)), "合計が小計＋消費税と合わないので値のまま");
  assert.match(sheet, /<v>13000<\/v>/);
  assert.ok(files["xl/sharedStrings.xml"].includes("定価15,800円（税抜）"), "単品の商品名の下の行");
});

test("見積書の Excel：明細が多いと2ページ・3ページに続く（60点で3ページ。行の高さは 409pt 以内）", () => {
  const rows = Array.from({ length: 60 }, (_, i) => row(`見本の商品 ${i + 1}`, "1", "¥1,000", "¥1,000", "¥100"));
  const m = { ...estimateBase, multi: true, category: "", head: ["商品名", "数量", "単価（税抜）", "金額（税抜）", "消費税"], rows, summary: [{ label: "小計（税抜）", value: "¥60,000", field: "subtotalTable" }, { label: "消費税", value: "¥6,000", field: "taxTable" }, { label: "合計（税込）", value: "¥66,000", field: "grandTotalTable", overall: true }], totalValue: "¥66,000 —" };
  const sheet = unzip(buildEstimateXlsx(m))["xl/worksheets/sheet1.xml"];
  const heights = [...sheet.matchAll(/<row r="\d+" ht="([\d.]+)"/g)].map(([, h]) => Number(h));
  assert.ok(heights.every((h) => h <= 409));
  // 60点で、余白の内側（297−17−17mm＝263mm）の2ページ分より長く3ページ分より短い → Excel の自動の改ページで3ページ
  const totalMm = heights.reduce((a, b) => a + b, 0) / (72 / 25.4);
  assert.ok(totalMm > 263 * 2 && totalMm < 263 * 3, `${Math.round(totalMm)}mm`);
  assert.equal(formulas(sheet).filter((x) => /^ROUND/.test(x.f)).length, 60);
  assert.ok(formulas(sheet).some((x) => x.v === 60000 && /^SUM\(/.test(x.f)));
  assert.equal(estimateNumber("¥-5,000"), -5000);
  assert.equal(estimateNumber("ー５，０００"), -5000);
  assert.equal(estimateXlsxName({ title: '見本 花子/御見積' }), "見本 花子御見積.xlsx");
});

test("zip：名前は UTF-8・CRC つき（Excel が開ける形）", () => {
  const bytes = zipStore({ "a.txt": new TextEncoder().encode("abc") });
  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(14, true), 0x352441c2, "CRC-32 of abc");
  assert.equal(view.getUint16(6, true) & 0x0800, 0x0800);
});

test("ボタン：受注簿の「PDF保存」の右に「Excel保存」、見積書の窓の「PDF保存」の右に「Excel保存」", () => {
  assert.match(source, /\(0,j\.jsx\)\(`button`,\{onClick:pdfDownload,children:`PDF保存`\}\),\(0,j\.jsx\)\(`button`,\{onClick:xlsxDownload,children:`Excel保存`\}\)/);
  assert.match(source, /function xlsxDownload\(\)\{/);
  // Excel を作る所（buildOrderXlsxBytes）は Excel保存とメール（Excel付き）で同じ（2026-10-27）
  assert.match(source, /return buildOrderXlsx\(pages,summary,`販売受注簿`\);/);
  assert.match(source, /downloadXlsx\(buildOrderXlsxBytes\(\),k\(`xlsx`\)\)/);
  // Excel保存の右に、PDFでメール・Excelでメール（スマホの3列の幅に入る短い名前）
  assert.match(source, /children:`Excel保存`\}\),\(0,j\.jsx\)\(`button`,\{onClick:\(\)=>mailWith\(`pdf`\),children:`PDFでメール`\}\),\(0,j\.jsx\)\(`button`,\{onClick:\(\)=>mailWith\(`xlsx`\),children:`Excelでメール`\}\)/);
  assert.match(source, /<button type="button" id="pdfButton">PDF保存<\/button><button type="button" id="xlsxButton">Excel保存<\/button>/);
  assert.match(source, /document\.getElementById\("xlsxButton"\)\.addEventListener\("click"/);
  assert.match(source, /window\.__taiyoXlsx = \{ estimate\(doc\) \{ downloadXlsx\(buildEstimateXlsx\(readEstimateDoc\(doc\)/);
});
