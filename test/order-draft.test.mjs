import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("入力途中の受注簿を自動保存する", () => {
  assert.match(source, /var DRAFT_KEY=`hatchu-ai-scan-draft-v1`/);
  // 打鍵が落ち着いてから保存する
  assert.match(source, /setTimeout\(\(\)=>writeOrderDraft\(\{[\s\S]{0,200}savedAt:Date\.now\(\)[\s\S]{0,20}\}\),600\)/);
  // 保存対象は受注簿・商品ページ・現在ページ・貼り付け画像
  assert.match(source, /order:e,multiSaved,multiPageIndex/);
  assert.match(source, /image:i&&i\.length<=DRAFT_IMAGE_LIMIT\?i:``/);
});

test("中身が無いときは残さず、容量超過でも文字データは守る", () => {
  // 空の受注簿で「前回の入力」を出さないよう、内容の有無を見る
  assert.match(source, /function draftHasContent\(order,savedPages\)/);
  assert.match(source, /if\(!draftHasContent\(draft\.order,draft\.multiSaved\)\)\{clearOrderDraft\(\);return\}/);
  // 画像つきで入らなければ画像を落として保存し直す（入力の保護を優先）
  assert.match(source, /\{\.\.\.draft,image:``\}/);
  assert.match(source, /_imgSnap,\.\.\.rest\}=page\|\|\{\};return rest/);
});

test("次に開いたとき「続きから」か「新しく」を選べる", () => {
  // 確認中に空の初期値で上書きしないこと
  assert.match(source, /useState\)\(\(\)=>readOrderDraft\(\)\)/);
  assert.match(source, /if\(draftOffer\)return;/);
  // 続きから：受注簿・商品ページ・現在ページ・画像を戻す
  assert.match(source, /function acceptOrderDraft\(\)/);
  assert.match(source, /setMultiSaved\(Array\.isArray\(saved\.multiSaved\)\?saved\.multiSaved:\[\]\)/);
  assert.match(source, /if\(saved\.image\)a\(saved\.image\)/);
  // 新しく：押し間違いで失わないよう一度確認してから消す
  assert.match(source, /function discardOrderDraft\(\)/);
  assert.match(source, /if\(!window\.confirm\(`前回の入力[\s\S]{0,60}を削除して新しく始めます。よろしいですか？`\)\)return/);
  assert.match(source, /setDraftOffer\(null\);\s*clearOrderDraft\(\);/);
  // 復元する側には確認を挟まない（安全な操作に手間を足さない）
  assert.doesNotMatch(source, /function acceptOrderDraft\(\)\{[\s\S]{0,400}window\.confirm/);
  // 選択のダイアログ
  assert.match(source, /children:`前回の入力が残っています`/);
  assert.match(source, /children:`続きから入力する`/);
  assert.match(source, /children:`新しく始める`/);
  assert.match(styles, /\.draftPanel \{/);
  assert.match(styles, /\.draftActions button\.primary \{/);
});
