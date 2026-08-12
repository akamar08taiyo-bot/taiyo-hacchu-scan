/*
 * 介援隊カタログ（入浴補助用具中心）のスキャン検証ケース。
 *
 * 実際に営業所で読み取った商品ページの実データをもとにしている。
 * 新しい読み取り不具合が見つかったら、まずここにケースを足してから直すこと。
 */

// 介援隊の商品ページは次の並びで表示される:
//   商品名 / 申込番号 / メーカー / JANコード / WEBコード / TAISコード / 小売価格 / 卸売価格
// 価格改定予告がある商品は、卸売価格の下に予告ボックスが入る。
function kaientaiPage(o) {
  const lines = [
    o.title,
    '申込番号： ' + o.catalogNumber,
    'メーカー： ' + o.maker,
    'JANコード： ' + o.jan,
    'WEBコード： ' + o.webCode,
    'TAISコード： ' + o.tais,
    '小売価格： ' + o.retail + '(課10)',
    '卸売価格： ' + o.wholesale + '(課10)' + (o.tokka ? ' 特価' : ''),
  ];
  if (o.notice) {
    lines.push('価格改定のお知らせ', o.notice.from + 'より', '小売価格：' + o.notice.retail);
  }
  lines.push('在庫：');
  return lines;
}

const cases = [
  {
    name: '浴槽台 ユクリアAir レギュラー1220（価格改定予告あり）',
    lines: kaientaiPage({
      title: '浴槽台ユクリアAirレギュラー1220/PN-L11220A ブルー',
      catalogNumber: 'S1053', maker: 'パナソニック エイジフリー',
      jan: '4549980575314', webCode: '468246', tais: '00980-000394',
      retail: '22,800円', wholesale: '10,260円',
      notice: { from: '2026年10月1日', retail: '24,000円' },
    }),
    expect: { listPrice: 22800, cost: 10260, catalogNumber: 'S1053', webCode: '468246' },
  },
  {
    name: 'シャワーチェアAir ミドルSPワンタッチ（特価・価格改定予告あり）',
    lines: kaientaiPage({
      title: 'シャワーチェアAirミドルSPワンタッチ/PN-L41831A ブルー',
      catalogNumber: 'S1054', maker: 'パナソニック エイジフリー',
      jan: '4549980575376', webCode: '468237', tais: '00980-000391',
      retail: '34,300円', wholesale: '15,435円', tokka: true,
      notice: { from: '2026年10月1日', retail: '35,800円' },
    }),
    expect: { listPrice: 34300, cost: 15435, catalogNumber: 'S1054', webCode: '468237' },
  },
  {
    name: '安寿 折りたたみシャワーベンチ TS（座面角型がBEARと誤読される）',
    lines: kaientaiPage({
      title: '安寿 折りたたみシャワーベンチ TS （BEAR）/535-466 レッド',
      catalogNumber: 'S0001', maker: 'アロン化成',
      jan: '4970210399484', webCode: '209727', tais: '00221-000229',
      retail: '31,000円', wholesale: '13,950円', tokka: true,
      notice: { from: '2026年10月1日', retail: '34,000円' },
    }),
    expect: { listPrice: 31000, cost: 13950, catalogNumber: 'S0001', webCode: '209727',
              productNameNotIncludes: 'BEAR' },
  },
  {
    name: 'やわらかシャワーチェア 肘掛付ワイド（商品名頭にOCRノイズ）',
    lines: kaientaiPage({
      title: 'is TAN 1 - ke - NQTRCCCAQRRCA Q やわらかシャワーチェア 肘掛付ワイド/49351 ピンク',
      catalogNumber: 'S0192', maker: 'リッチェル',
      jan: '4973655493519', webCode: '204597', tais: '00426-000022',
      retail: '33,000円', wholesale: '15,840円', tokka: true,
      notice: { from: '2026年10月1日', retail: '40,000円' },
    }),
    expect: { listPrice: 33000, cost: 15840, catalogNumber: 'S0192', webCode: '204597',
              productNameNotIncludes: 'NQTRCCCAQRRCA' },
  },
  {
    name: '安寿 高さ調節付浴槽手すり UST-130（価格改定予告なし）',
    lines: kaientaiPage({
      title: '安寿 高さ調節付浴槽手すり UST-130/536-600 レッド',
      catalogNumber: 'S0002', maker: 'アロン化成',
      jan: '4970210301968', webCode: '209728', tais: '00221-000112',
      retail: '28,000円', wholesale: '12,600円',
    }),
    expect: { listPrice: 28000, cost: 12600, catalogNumber: 'S0002', webCode: '209728' },
  },
  {
    name: '安寿 高さ調節付浴槽台R かるぴったん（すべり止めシートタイプ）',
    lines: kaientaiPage({
      title: '安寿 高さ調節付浴槽台Rかるぴったん標準 すべり止めシートタイプ/536-480 レッド',
      catalogNumber: 'S0003', maker: 'アロン化成',
      jan: '4970210434031', webCode: '209730', tais: '00221-000230',
      retail: '17,600円', wholesale: '8,800円',
    }),
    expect: { listPrice: 17600, cost: 8800, catalogNumber: 'S0003', webCode: '209730' },
  },
  {
    name: '価格改定予告の「改定」がOCRで誤読されたケース（日付だけが手がかり）',
    lines: [
      'シャワーチェアAirミドルSPワンタッチ/PN-L41831A ブルー',
      '申込番号： S1054',
      'メーカー： パナソニック エイジフリー',
      'WEBコード： 468237',
      '小売価格： 34,300円(課10)',
      '卸売価格： 15,435円(課10) 特価',
      '髙格ﾉ疋のｵ知らセ',
      '2026年10月1日より',
      '小売価格：35,800円',
    ],
    expect: { listPrice: 34300, cost: 15435 },
  },
  // --- ウェルファン版カタログ（介援隊と誤って取り違えないことの確認） ---
  // 介援隊側の判定を直したときに、ウェルファン版が壊れていないかをここで担保する。
  {
    name: '[ウェルファン版] 浴槽台R かるぴったん',
    lines: [
      'ウェルファン',
      'アロン化成 安寿 高さ調節付浴槽台R かるぴったん// 標準// レッド',
      'メーカー品番 536-480',
      'ベストケア品番 12345',
      '上代 17,600円',
      '下代 8,800円',
      '税区分 課10',
    ],
    expect: { listPrice: 17600, cost: 8800 },
  },
  {
    name: '[ウェルファン版] パナソニックPN-L型番（介援隊側の判定変更の影響確認）',
    lines: [
      'ウェルファン',
      'パナソニック エイジフリー 浴槽台 ユクリア ソフトレギュラー// PN-L11220A// ブルー',
      'メーカー品番 PN-L11220A',
      '上代 22,800円',
      '下代 10,260円',
      '税区分 課10',
    ],
    expect: { listPrice: 22800, cost: 10260 },
  },
  {
    name: '軽減税率(課8)の商品',
    lines: kaientaiPage({
      title: '入浴用小物セット/900-100 ホワイト',
      catalogNumber: 'S0400', maker: '介援隊',
      jan: '4970210111111', webCode: '210001', tais: '00221-000999',
      retail: '3,300円', wholesale: '1,650円',
    }).map(l => l.replace('(課10)', '(課8)')),
    expect: { listPrice: 3300, cost: 1650, taxType: '8%' },
  },
];

module.exports = { cases, kaientaiPage };
