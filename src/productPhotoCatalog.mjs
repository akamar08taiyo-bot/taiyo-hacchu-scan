import adultDiaperCatalog from "./product-photo-catalog.json" with { type: "json" };
import sarayaFacilityCatalog from "./saraya-facility-product-photo-catalog.json" with { type: "json" };

const DEFAULT_BASE_PATH = "/taiyo-hacchu-scan/";

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[®™©㈱株式会社]/g, "")
    .replace(/[・･\s_＿\-‐‑–—―/／()（）\[\]【】「」『』]/g, "")
    .replace(/[^0-9a-zぁ-んァ-ヶ一-龠ー]/g, "");
}

function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeManufacturer(value) {
  const text = normalizeText(value);
  if (/ユニチャーム|lifree|ライフリー/.test(text)) return "ユニ・チャーム";
  if (/第一衛材|フリーネ|free?ne/.test(text)) return "第一衛材";
  if (/カミ商事|エルモア|いちばん/.test(text)) return "カミ商事";
  if (/サラヤ|saraya|スキナル|コロロ|ウィルステラ/.test(text)) return "サラヤ";
  return "";
}

function ensureBasePath(basePath = DEFAULT_BASE_PATH) {
  const value = String(basePath || "/");
  return `${value.startsWith("/") ? value : `/${value}`}${value.endsWith("/") ? "" : "/"}`;
}

export const PRODUCT_PHOTOS = Object.freeze(
  [
    ...adultDiaperCatalog.items.map((item, index) => ({
      ...item,
      id: `adult-diaper-${String(index + 1).padStart(3, "0")}`,
      asset: `product-images/${String(index + 1).padStart(3, "0")}.jpg`,
      catalogGroup: "adult-diaper",
    })),
    ...sarayaFacilityCatalog.items.map((item) => ({
      ...item,
      catalogGroup: "saraya-facility",
    })),
  ].map((item) => Object.freeze(item)),
);

const PHOTO_BY_ID = new Map(PRODUCT_PHOTOS.map((photo) => [photo.id, photo]));

function normalizedAliases(photo) {
  return (photo?.aliases || []).map(normalizeText).filter(Boolean);
}

function normalizedModels(photo) {
  return [photo?.model, ...(photo?.modelAliases || [])].map(normalizeText).filter(Boolean);
}

export function productPhotoUrl(photo, basePath = DEFAULT_BASE_PATH) {
  return photo?.asset ? `${ensureBasePath(basePath)}${photo.asset}` : "";
}

export function findProductPhotoById(id) {
  return PHOTO_BY_ID.get(id) ?? null;
}

export function findProductPhoto(order = {}) {
  const fields = [
    order.productName,
    order.maker,
    order.size,
    order.modelNumber,
    order.catalogNumber,
    order.webCode,
    order.jan,
  ].filter(Boolean);
  if (!fields.length) return null;

  const searchable = normalizeText(fields.join(" "));
  const name = normalizeText(order.productName);
  const maker = normalizeManufacturer(`${order.maker || ""} ${order.productName || ""}`);
  const numericFields = fields.map(digits).filter((value) => value.length >= 6);

  const janMatches = PRODUCT_PHOTOS.filter((photo) => {
    const jan = digits(photo.jan);
    return jan.length >= 8 && numericFields.some((value) => value.includes(jan) || jan.includes(value));
  });
  if (janMatches.length === 1) return janMatches[0];
  if (janMatches.length > 1) return null;

  const model = normalizeText(order.modelNumber);
  if (model.length >= 3) {
    const modelMatches = PRODUCT_PHOTOS.filter((photo) => {
      if (maker && photo.manufacturer !== maker) return false;
      return normalizedModels(photo).includes(model);
    });
    if (modelMatches.length === 1) return modelMatches[0];
    if (modelMatches.length > 1) return null;
  }

  if (name.length < 4) return null;
  const makerCandidates = PRODUCT_PHOTOS.filter((photo) => !maker || photo.manufacturer === maker);
  const exactNameMatches = makerCandidates.filter((photo) =>
    normalizeText(photo.name) === name || normalizedAliases(photo).includes(name),
  );
  if (exactNameMatches.length === 1) return exactNameMatches[0];
  if (exactNameMatches.length > 1) return null;
  const exactMatches = makerCandidates.filter((photo) =>
    normalizeText(`${photo.name} ${photo.spec || ""}`) === name,
  );
  if (exactMatches.length === 1) return exactMatches[0];
  if (exactMatches.length > 1) return null;

  let candidates = makerCandidates.filter((photo) => {
    const photoName = normalizeText(`${photo.name} ${photo.spec || ""}`);
    const aliases = normalizedAliases(photo);
    return searchable.includes(photoName)
      || photoName.includes(name)
      || aliases.some((alias) => searchable.includes(alias) || alias.includes(name));
  });

  const size = normalizeText(order.size);
  if (size && candidates.length > 1) {
    const sizeMatches = candidates.filter((photo) =>
      normalizeText(`${photo.name} ${photo.spec || ""}`).includes(size),
    );
    if (sizeMatches.length) candidates = sizeMatches;
  }

  if (candidates.length !== 1) return null;
  return candidates[0];
}

export function resolveProductPhotoUrl(order, manualImageUrl = "", basePath = DEFAULT_BASE_PATH) {
  if (manualImageUrl) return manualImageUrl;
  return productPhotoUrl(findProductPhoto(order), basePath);
}

export function applyProductPhotoToOrder(order = {}, photo) {
  if (!photo) return order;
  return {
    ...order,
    productName: photo.name || order.productName || "",
    maker: photo.manufacturer || order.maker || "",
    size: photo.spec || order.size || "",
    modelNumber: photo.model || order.modelNumber || "",
    catalogNumber: photo.jan || order.catalogNumber || "",
  };
}
