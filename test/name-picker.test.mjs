import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("営業担当などは手打ちで自由に入力でき、登録名は自前の候補リストで出す", () => {
  // <datalist> は表示位置がブラウザ任せで崩れるため要素として作らない
  // （説明コメント中の語には反応させないよう、生成箇所と list 属性だけを見る）
  assert.doesNotMatch(source, /jsx\)\(`datalist`/);
  assert.doesNotMatch(source, /\(`input`,\{value:e,list:/);
  // 入力は素の <input>。候補を選ばなくても打った値がそのまま反映される
  assert.match(source, /function Nt\(\{value,options=\[\],onChange\}\)/);
  assert.match(source, /onChange:ev=>\{onChange\(ev\.target\.value\)/);
  // フォーカスで全件、打ち始めたら絞り込み。現在値は候補に出さない
  assert.match(source, /onFocus:\(\)=>\{setQuery\(null\);place\(\);setOpen\(true\)\}/);
  assert.match(source, /candidates=Ke\(options\)\.filter\(item=>item!==text&&\(!query\|\|item\.includes\(query\)\)\)/);
  // 候補クリックで確定し、外側クリック・Escape・スクロールで閉じる
  assert.match(source, /onMouseDown:ev=>\{ev\.preventDefault\(\);onChange\(item\)/);
  assert.match(source, /if\(ev\.key===`Escape`\)setOpen\(false\)/);
  assert.match(source, /window\.addEventListener\(`scroll`,handleMove,true\)/);
});

test("候補リストは親グリッドに切り取られず、印刷には出さない", () => {
  // .entryGrid* は角丸のため overflow:hidden。絶対配置だと切られるので位置固定にする
  assert.match(styles, /\.namePickerList \{[^}]*position: fixed/);
  assert.match(source, /className:`namePickerList no-print`/);
  assert.match(source, /style:\{left:`\$\{spot\.left\}px`,top:`\$\{spot\.top\}px`,width:`\$\{spot\.width\}px`\}/);
});
