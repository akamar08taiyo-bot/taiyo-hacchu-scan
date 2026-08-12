/*
 * 介援隊カタログ スキャン解析ロジックの検証用ハーネス。
 *
 * src/main.jsx はビルド済みの単一ファイルのため、解析まわりの関数だけを
 * 切り出して Node 上で評価し、実際に出荷されているコードそのものを検証する。
 * （テスト用にロジックを写経すると本体と乖離するため、必ず本体から読み込む）
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'main.jsx');

function sliceBetween(src, startMarker, endMarker) {
  const s = src.indexOf(startMarker);
  if (s < 0) throw new Error('開始マーカーが見つかりません: ' + startMarker);
  const e = src.indexOf(endMarker, s);
  if (e < 0) throw new Error('終了マーカーが見つかりません: ' + endMarker);
  return src.slice(s, e);
}

function loadParser() {
  const src = fs.readFileSync(SRC, 'utf8');

  // 色名リスト・数値変換・税計算などの共通ユーティリティ
  const utils = sliceBetween(src, ',He=[`オレンジ`', 'function multiItemSnapshot(e)').replace(/^,/, 'var ');
  // 解析本体（価格ラベル抽出 〜 OCR結果の統合まで）
  const parser = sliceBetween(src, 'function et(e,t){let n=M(e);return n<=0', '\nfunction benefitYen(');

  const code = `
    ${utils}
    ${parser}
    return { wt, bt, at, it, pt, kaientaiLabeledDetailFix, kaientaiTitleFallback,
             scanTitleName, normalizeProductNameText, sanitizeScanName, sanitizeScanSize,
             taxMark, We, Ye, Xe, M };
  `;
  // eslint-disable-next-line no-new-func
  return new Function(code)();
}

module.exports = { loadParser };
