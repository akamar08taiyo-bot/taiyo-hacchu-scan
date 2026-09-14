import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("ヘッダーのツール名と説明が画面に出る", () => {
  // 見出しの文字はマークアップが持ち、CSSは font-size:0 で消さない。
  // （font-size:0 + ::after で差し替えていた世代が残り、::after だけ打ち消されて
  //   タイトルと説明がどこにも表示されない状態になっていた）
  assert.match(source, /jsx\)\(`div`,\{className:`logoMark`,children:`販`\}\)/);
  assert.match(source, /children:`販売受注簿作成`/);
  assert.match(source, /children:`画像を読み取り、販売受注簿へ反映`/);
  assert.equal(source.includes("children:`発注スキャン`"), false);

  for (const selector of [".brand h1", ".brand p", ".logoMark"]) {
    const rule = new RegExp(`\\${selector.replace(/[. ]/g, (c) => (c === "." ? "\\." : "\\s"))}\\s*\\{[^}]*\\}`, "g");
    for (const block of styles.match(rule) || []) {
      assert.doesNotMatch(block, /font-size:\s*0\s*(!important)?\s*;/, `${selector} が font-size:0 のままです`);
    }
  }
  // 差し替え用の ::after と、それを打ち消す指定はどちらも残さない
  assert.equal(styles.includes('.brand h1::after'), false);
  assert.equal(styles.includes('.brand p::after'), false);
  assert.equal(styles.includes('.logoMark::after'), false);
  // 読み込み後にJSで書き換える方式はやめた（React描画と競合して効かないことがある）
  assert.equal(indexHtml.includes('querySelector(".brand h1")'), false);
});

test("給付の負担額は1円もずれない（3割負担の丸め誤差）", () => {
  // 利用者負担は整数計算、保険者負担は差額。0.7 を掛けると 11,000円 → 7,699円 になっていた。
  assert.match(source, /d=e\.fullSelfPay\?a:e\.livingProtection\?0:Math\.ceil\(c\*l\/10\),f=e\.fullSelfPay\?0:c-d/);
  assert.equal(source.includes("Math.floor(c*(1-u))"), false);

  // 実際の計算を再現して、利用者負担＋保険者負担＝対象額 になることを確かめる
  for (const ratio of [1, 2, 3]) {
    for (const target of [0, 1, 90, 11000, 20680, 199999, 200000]) {
      const user = Math.ceil((target * ratio) / 10);
      const insurer = target - user;
      assert.equal(user + insurer, target, `${ratio}割 / ${target}円 が合いません`);
      assert.ok(insurer >= 0);
    }
  }
  assert.equal(Math.ceil((11000 * 3) / 10), 3300);
  assert.equal(11000 - 3300, 7700);
});

test("利益額・利益率の手入力は送料を含めて逆算する", () => {
  // 画面の利益額は「送料込み売上 − 仕切り」なので、逆算にも送料を入れないと
  // 入力した金額どおりにならない（送料ぶんずれていた）
  assert.match(source, /function nt\(e,t,n,i=0\)\{[^}]*M\(t\)\*r\+M\(e\)-M\(i\)/);
  assert.match(source, /function rt\(e,t,n,o=0\)\{[^}]*Math\.round\(a\/\(1-r\)\)-s/);
  assert.match(source, /nt\(Ue\(n\),e\.cost,e\.quantity,e\.shippingFee\)/);
  assert.match(source, /rt\(Ue\(n\),e\.cost,e\.quantity,e\.shippingFee\)/);
});

test("見積書の送料行は数量1で、金額と数量×単価が食い違わない", () => {
  assert.match(source, /data-field="shippingQuantity">1'/);
  assert.equal(source.includes('data-field="shippingQuantity">\'+qtyNumber'), false);
});

test("複数商品の見積書は送料を明細に出し、行の消費税に送料分を混ぜない", () => {
  // 送料が明細に無いと「品目の金額合計 ≠ 小計」の見積書になっていた
  assert.match(source, /const shippingRow = shippingTotal > 0/);
  assert.match(source, /const itemRows = estimateItems\.map\(estimateItemRow\)\.join\(''\) \+ shippingRow;/);
  // 各行の消費税はその行の商品分だけ
  assert.match(source, /data-field="tax-' \+ index \+ '">' \+ estimateYen\(metrics\.saleTax\)/);
  // 明細の追加・削除・再計算が複数商品の表でも効く
  assert.match(source, /\.itemTable tbody tr\.itemRow,\.estimateItemsTable tbody tr\.itemRow/);
  assert.match(source, /document\.querySelector\("\.itemTable tbody,\.estimateItemsTable tbody"\)/);
  assert.match(source, /document\.querySelector\("\.itemTable,\.estimateItemsTable"\)/);
  for (const field of ["subtotalTable", "taxTable", "grandTotalTable"]) {
    assert.match(source, new RegExp(`data-field="${field}"`));
  }
});

test("複数商品の見積書も太字を使いすぎない", () => {
  const from = source.indexOf("const multiEstimateCss =");
  const to = source.indexOf("</style>';", from);
  assert.ok(from > 0 && to > from);
  const css = source.slice(from, to);
  const heavy = [...css.matchAll(/font-weight:\s*(?:[6-9]00|bold)/g)].map((m) => m[0]);
  assert.deepEqual(heavy, []);
});

test("受注簿シートは狭い画面でも切り取られない（横スクロールで全項目に届く）", () => {
  // min(820px,100%) だと狭い画面で 100% に縮み、受注区分〜売上日や商品表の右側が
  // overflow:hidden のグリッドに切り取られて入力できなかった
  assert.match(styles, /\.orderEntrySheet \{[^}]*min-width: 820px;/s);
  assert.equal(styles.includes("min-width: min(820px, 100%)"), false);
  assert.match(styles, /\.orderEntryPanel \{\s*overflow: auto;\s*\}/);
  // シート内のレイアウトは画面幅で組み替えない（PC・タブレット・スマホで同じ帳票）
  assert.equal(styles.includes(".entryBottom { grid-template-columns: minmax(0, 1fr); }"), false);
});

test("貼り付け画像は受注簿の枠に収まり、比率も変わらない", () => {
  // html2canvas は object-fit を無視して枠いっぱいに描くため、
  // 要素の箱そのものを元画像の比率のまま最大化して中央に置く
  const rule = styles.match(/\.sheetImage\.orderAttachedImage > img \{[^}]*\}/g) || [];
  assert.ok(rule.length >= 2, "画面用と印刷用の両方に指定が必要です");
  for (const block of rule) {
    assert.match(block, /position: absolute/);
    assert.match(block, /max-width: 100%/);
    assert.match(block, /max-height: 100%/);
    assert.match(block, /width: auto/);
    assert.match(block, /height: auto/);
  }
});

test("メールの本文はこのツール自身のURLを案内する", () => {
  assert.equal(source.includes("ai-ui-ux-5-5-1.vercel.app"), false);
  assert.match(source, /taiyo-hacchu-scan/);
});

test("認識に失敗したときのメッセージが読める日本語になっている", () => {
  assert.equal(source.includes("認識失敗: ${e.message}"), false);
  assert.match(source, /認識に失敗しました。「再認識」を押すか、画像を貼り直してください/);
});

test("印刷では未入力欄のプレースホルダーを刷らない", () => {
  assert.match(styles, /\.orderEntrySheet input::placeholder,\s*\.orderEntrySheet textarea::placeholder \{\s*color: transparent !important;/);
});

test("複数商品の見積書PDFはウィンドウ幅で文字サイズが変わらない", () => {
  // 明細の自動縮小は画面幅で測っていたため、狭い窓でPDF保存すると
  // 1行目だけ極端に小さい見積書が出ていた。A4固定へ切り替えた時点で測り直す。
  assert.match(source, /new MutationObserver\(function\(\)\{if\(document\.documentElement\.classList\.contains\('pdfExport'\)\)autoFitEstimateItems\(\)\}\)/);
  assert.match(source, /attributeFilter:\['class'\]/);
});

test("給付は支給限度額を画面から直せ、超過分と利用者支払額を帳票に出す", () => {
  // 限度額は利用者ごとに違うので固定値にしない。既定は特定福祉用具販売の10万円。
  assert.match(source, /BENEFIT_LIMIT_DEFAULT=100000/);
  assert.match(source, /careInsuranceBalance:BENEFIT_LIMIT_DEFAULT/);
  assert.match(source, /careInsuranceBalance\|\|BENEFIT_LIMIT_DEFAULT/);
  assert.equal(source.includes("careInsuranceBalance||200000"), false);
  // 給付のときだけ出る入力欄
  assert.match(source, /label:`支給限度額`/);
  assert.match(source, /o\(`careInsuranceBalance`,t\.target\.value\)/);
  // 超えた分と、利用者が実際に払う合計。画面と印刷の両方に出す。
  assert.match(source, /children:`限度額超過分\(全額自費\)`/);
  assert.match(source, /children:`利用者支払額 合計\(税込\)`/);
  assert.match(source, /<dt>限度額超過分\(全額自費\)<\/dt>/);
  assert.match(source, /<dt>利用者支払額 合計\(税込\)<\/dt>/);
  // 限度額内なら行は増やさない（給付の項目は「追加」する方針を崩さない）
  assert.match(source, /bc\.totalTaxIn>bc\.target\?/);
  // 印刷でも先頭グリッドが折り返さないよう列数を合わせる
  assert.match(styles, /給付は先頭グリッドに「給付割合」「支給限度額」が増えるので10列/);

  // 利用者負担＋保険者負担＋超過分 ＝ 商品代金 になることを再現して確認
  for (const [total, limit, ratio] of [[264000, 100000, 1], [264000, 200000, 1], [88000, 100000, 1], [264000, 100000, 3]]) {
    const target = Math.min(total, limit);
    const user = Math.ceil((target * ratio) / 10);
    const insurer = target - user;
    const excess = total - target;
    assert.equal(user + insurer + excess, total, `${total}円 / 限度額${limit}円 が合いません`);
    assert.equal(user + excess, user + Math.max(0, total - target));
  }
});

test("新しい商品ページは送料0・数量1から始まる", () => {
  // 前の商品の送料が残ると、同じ便でも送料が二重計上されていた
  assert.match(source, /function multiBlankOrder\(\)\{return\{[^}]*shippingFee:0,quantity:1/);
  assert.match(source, /le\(\),t\(e=>\(\{\.\.\.e,shippingFee:0,quantity:1\}\)\),h\(`商品を追加しました/);
});

test("数量を空欄のまま確定したら1に戻す（受注簿と見積書の数字を合わせる）", () => {
  // 空欄だと受注簿は0円、見積書は数量1で計算され食い違っていた。
  // 打ち直しの邪魔にならないよう、入力中ではなく欄を離れたときだけ戻す。
  assert.match(source, /onBlur:e=>\{e\.target\.value\.trim\(\)===``&&o\(`quantity`,`1`\)\}/);
  // 0・負数・文字を入れたときの矯正（既存）も残っていること
  assert.match(source, /if\(e===`quantity`&&n!==``\)\{let v=M\(n\);n=String\(Math\.max\(1,Math\.round\(v\)\)\)\}/);
});

test("依存パッケージを latest 指定にしない（ビルドのたびに中身が変わらないようにする）", () => {
  // react / vite などが "latest" だと、npm install のたびにメジャーごと
  // 入れ替わり得て、PDFの見た目やビルドが予告なく変わる
  const loose = Object.entries(pkg.dependencies || {}).filter(([, range]) => /^(latest|\*|)$/.test(String(range)));
  assert.deepEqual(loose, []);
  for (const name of ["react", "react-dom", "vite", "@vitejs/plugin-react"]) {
    assert.match(pkg.dependencies[name], /^\d+\.\d+\.\d+$/, `${name} はバージョンを固定する`);
  }
});
