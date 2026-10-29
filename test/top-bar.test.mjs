// 上の段（印刷・保存・メール・見積もり作成・設定）と、申請書・見積書作成と同じ緑の色合い（ユーザーの指示 2026-10-28
// 「上のタブは、印刷、保存、メール、見積もり作成、設定のみにする」「色合いも、見積もり・申請書アプリと全く同じ、緑ベース（書式なども）に統一する」）、
// メールは仕切りなどが入っていなくても作れる（「すべて入力しなくても、メールでとばせるようにする」）
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

/** 上の段（nav.actions）の子の並び：ボタンの字か、ActionMenu の名前 */
function topBarItems() {
  const from = source.indexOf("(0,j.jsxs)(`nav`,{className:`actions`");
  const to = source.indexOf("(0,j.jsxs)(`div`,{className:`topProfitAlerts", from);
  assert.ok(from > 0 && to > from);
  const nav = source.slice(from, to);
  return [...nav.matchAll(/\(0,j\.jsx\)\((?:`button`,\{[^}]*?children:`([^`]+)`|ActionMenu,\{label:`([^`]+)`)/g)].map((m) => m[1] || m[2]);
}

test("上の段は 印刷・保存・メール・見積もり作成・設定 の5つだけ", () => {
  assert.deepEqual(topBarItems(), ["🖨 印刷", "💾 保存", "✉ メール", "📝 見積もり作成", "⚙ 設定"]);
  // 保存・メールを押すと PDF・Excel を選ぶ
  assert.match(source, /ActionMenu,\{label:`💾 保存`,className:`btnBlue`,name:`保存`,items:\[\{label:`📄 PDFで保存`,onClick:pdfDownload\},\{label:`📗 Excelで保存`,className:`btnGreen`,onClick:xlsxDownload\}\]\}/);
  assert.match(source, /ActionMenu,\{label:`✉ メール`,name:`メール`,items:\[\{label:`📄 PDFでメール`,onClick:\(\)=>mailWith\(`pdf`\)\},\{label:`📗 Excelでメール`,className:`btnGreen`,onClick:\(\)=>mailWith\(`xlsx`\)\}\]\}/);
  // 題名は出す（前は h1 の字を CSS で消し、「発」しか見えていなかった）
  assert.match(source, /\(0,j\.jsx\)\(`h1`,\{children:`販売受注簿作成ツール`\}\)/);
  assert.doesNotMatch(css, /\.brand h1\s*\{[^}]*font-size:\s*0/);
});

test("一覧の項目は押したその場で始める（メールのソフトを開くのを止められないように）・外を押す／Esc で閉じる", () => {
  assert.match(source, /role:`menuitem`,className:item\.className,onClick:\(\)=>\{setOpen\(!1\);item\.onClick\(\)\}/);
  assert.match(source, /document\.addEventListener\(`pointerdown`,away\)/);
  assert.match(source, /ev\.key===`Escape`&&setOpen\(!1\)/);
});

test("メールは仕切りなどが入っていなくても作れる（印刷・保存は今までどおり確かめる）", () => {
  const from = source.indexOf("async function mailWith(kind){");
  const to = source.indexOf("\n}\n", from);
  const body = source.slice(from, to);
  assert.ok(from > 0);
  assert.doesNotMatch(body, /validateMultiCosts/);
  assert.match(body, /if\(ge\(\)\)\{h\(`商品名を確認してください`\);return\}/);
  // 印刷・PDF保存・Excel保存は今までどおり
  assert.match(source, /function ve\(\)\{if\(ge\(\)\)\{h\(`商品名を確認してください`\);return\}if\(!validateMultiCosts\(\)\)return;/);
  assert.match(source, /async function pdfDownload\(\)\{\n  if\(ge\(\)\)\{h\(`商品名を確認してください`\);return\}\n  if\(!validateMultiCosts\(\)\)return;/);
  // 長い本文はメールのソフトに渡せる長さまで商品の行を減らす
  assert.match(body, /while\(shown>0&&!mailtoFits\(\{to,subject,body:makeBody\(shown\)\}\)\)shown--;/);
});

test("色：見出しの段は申請書・見積書作成と同じ濃い緑、画面の地は #f2f6f4。見出しの段の指定は1つだけ（古い世代を残さない）", () => {
  assert.match(css, /--app-green: #14532d;/);
  assert.match(css, /--app-bg: #f2f6f4;/);
  assert.match(css, /\n\.topbar \{[^}]*background: var\(--app-green\);/);
  // 見出しの段・ボタン・介援隊／ウェルファン版のタブは、画面全体で1か所だけ（@media の中の幅の調整は除く）
  for (const sel of [".topbar", ".logoMark", ".actions button,", ".catalogVersionTabs button"]) {
    const top = css.split("\n").filter((line) => line === `${sel} {` || line === `${sel}{` || line === sel);
    assert.equal(top.length, 1, `${sel} の指定が ${top.length} か所`);
  }
  assert.doesNotMatch(css, /reference-style visual system/);
  assert.doesNotMatch(css, /integratedShell \.brand h1/);
  // 印刷＝薄い水色・保存＝薄い青・Excel＝薄い緑（申請書・見積書作成の Btn の softSky・softBlue・softGreen）
  assert.match(css, /\.actions button\.btnSky \{\n  border-color: #7dd3fc;\n  background: #f0f9ff;\n  color: #075985;/);
  assert.match(css, /\.actions button\.btnBlue \{\n  border-color: #bfdbfe;\n  background: #eff6ff;\n  color: #1e40af;/);
  assert.match(css, /\.actionMenuList button\.btnGreen \{\n  border-color: #6ee7b7;\n  background: #ecfdf5;\n  color: #065f46;/);
});

// 2026-10-29 から帳票（受注簿のシート・集計）も緑（ユーザーの指示「販売受注簿も緑ベースで、申請書などと同じような色合いにする」）。
// 前は「帳票の色は変えない」として水色のままにしていた（Learnings.md 第47・50項）
test("帳票（受注簿のシート・集計）も緑：上の線は印刷・PDF・Excel（orderXlsx.mjs の ACCENT）と同じ緑。前の水色を残さない", () => {
  assert.match(css, /--reference-accent: #15803d;/);
  assert.match(css, /\.orderEntrySheet \{\n  border: 1px solid var\(--reference-line\) !important;\n  border-top: 5px solid var\(--reference-accent\) !important;/);
  const xlsx = readFileSync(new URL("../src/lib/orderXlsx.mjs", import.meta.url), "utf8");
  assert.match(xlsx, /const ACCENT = 'thick:15803D';/);
  // 受注簿・集計に使っていた水色・青（見出しの地・字・線・上の線）。上の段の「保存」の薄い青（#eff6ff・#bfdbfe・#1e40af）は残す
  const old = ["#15a8df", "#eaf4ff", "#eaf8fc", "#edf7ff", "#eef7ff", "#eef9fd", "#e5f4ff", "#bcdbe7", "#c8dfe9", "#c8e0e9", "#cfe1eb", "#9db8d2",
    "#718291", "#6f8191", "#6b7f8f", "#8fbfe2", "#1b506a", "#08375d", "#0d3f73", "#0b568f", "#1d3448", "#122b45", "rgba(29, 87, 115"];
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, "").toLowerCase(); // 説明の中の前の色は除く
  for (const v of old) assert.ok(!rules.includes(v), `styles.css に ${v}`);
  for (const v of ["15A8DF", "EAF4FF", "EAF8FC", "1B506A", "08375D", "0B568F", "E5F4FF", "1D3448", "EEF9FD", "BCDBE7", "8FA3B3"]) assert.ok(!xlsx.includes(`'${v}'`) && !xlsx.includes(`:${v}'`), `orderXlsx.mjs に ${v}`);
  // 受注簿の丸・四角は緑
  assert.match(css, /\.orderEntrySheet input\[type="radio"\],\n\.orderEntrySheet input\[type="checkbox"\] \{\n  accent-color: #15803d;/);
});
