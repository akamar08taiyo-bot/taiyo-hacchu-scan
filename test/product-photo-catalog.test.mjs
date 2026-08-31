import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import {
  PRODUCT_PHOTOS,
  applyProductPhotoToOrder,
  findProductPhoto,
  findProductPhotoById,
  productPhotoUrl,
  resolveProductPhotoUrl,
} from "../src/productPhotoCatalog.mjs";

test("the facility and hospital catalog contains all 144 local product photos", () => {
  assert.equal(PRODUCT_PHOTOS.length, 144);
  assert.deepEqual(
    Object.fromEntries(
      [...new Set(PRODUCT_PHOTOS.map((photo) => photo.manufacturer))]
        .sort()
        .map((maker) => [maker, PRODUCT_PHOTOS.filter((photo) => photo.manufacturer === maker).length]),
    ),
    { "カミ商事": 41, "サラヤ": 28, "ユニ・チャーム": 39, "第一衛材": 36 },
  );
  assert.equal(new Set(PRODUCT_PHOTOS.map((photo) => photo.id)).size, 144);
  assert.equal(new Set(PRODUCT_PHOTOS.map((photo) => photo.asset)).size, 144);

  for (const photo of PRODUCT_PHOTOS) {
    const file = new URL(`../public/${photo.asset}`, import.meta.url);
    assert.equal(existsSync(file), true, `${photo.id} is missing`);
    assert.ok(statSync(file).size > 1_000, `${photo.id} is unexpectedly small`);
    assert.equal(findProductPhotoById(photo.id), photo);
  }
});

test("every catalog item resolves from its manufacturer, name, size, model and JAN", () => {
  for (const photo of PRODUCT_PHOTOS) {
    const match = findProductPhoto({
      maker: photo.manufacturer,
      productName: photo.name,
      size: photo.spec,
      modelNumber: photo.model,
      catalogNumber: photo.jan,
    });
    assert.equal(match?.id, photo.id, `could not resolve ${photo.manufacturer} / ${photo.name}`);
  }
});

test("matching accepts manufacturer aliases but refuses ambiguous or unknown names", () => {
  assert.equal(
    findProductPhoto({ maker: "ユニチャーム", productName: "ライフリー 横モレ安心テープ止め", size: "Mサイズ" })?.name,
    "ライフリー 横モレ安心テープ止め Mサイズ",
  );
  assert.equal(
    findProductPhoto({ maker: "エルモア", productName: "エルモアいちばん Hi-premium1500" })?.manufacturer,
    "カミ商事",
  );
  assert.equal(
    findProductPhoto({ maker: "SARAYA", productName: "スキナルフットワイプ" })?.id,
    "saraya-facility-011",
  );
  assert.equal(
    findProductPhoto({ maker: "サラヤ", modelNumber: "UD-9600RS" })?.id,
    "saraya-facility-004",
  );
  assert.equal(
    findProductPhoto({ productName: "オラケア 口腔ケアスポンジブラシ", catalogNumber: "4987696424500" })?.id,
    "saraya-facility-014",
  );
  assert.equal(findProductPhoto({ maker: "ユニ・チャーム", productName: "ライフリー" }), null);
  assert.equal(findProductPhoto({ productName: "確認できない商品" }), null);
});

test("the Saraya section matches the 28 numbered facility proposals in the official catalog", () => {
  const saraya = PRODUCT_PHOTOS.filter((photo) => photo.catalogGroup === "saraya-facility");
  assert.equal(saraya.length, 28);
  assert.deepEqual(
    saraya.map((photo) => photo.id),
    Array.from({ length: 28 }, (_, index) => `saraya-facility-${String(index + 1).padStart(3, "0")}`),
  );
  assert.ok(saraya.every((photo) => photo.manufacturer === "サラヤ"));
  assert.ok(saraya.every((photo) => photo.sourcePage.startsWith("https://")));
});

test("manual images take precedence and selecting a catalog photo preserves other order data", () => {
  const photo = PRODUCT_PHOTOS[0];
  assert.equal(resolveProductPhotoUrl({ productName: photo.name }, "data:image/jpeg;base64,manual"), "data:image/jpeg;base64,manual");
  assert.equal(productPhotoUrl(photo), `/taiyo-hacchu-scan/${photo.asset}`);

  const current = { customerName: "利用者A", cost: "1200", orderType: "給付", note: "保持する" };
  const next = applyProductPhotoToOrder(current, photo);
  assert.equal(next.customerName, current.customerName);
  assert.equal(next.cost, current.cost);
  assert.equal(next.orderType, current.orderType);
  assert.equal(next.note, current.note);
  assert.equal(next.productName, photo.name);
  assert.equal(next.maker, photo.manufacturer);
});
