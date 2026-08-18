// Open Food Facts lookup — free, no API key. Docs: https://openfoodfacts.github.io/openfoodfacts-server/api/

const OFF_BASE = "https://world.openfoodfacts.org/api/v2/product/";
const OFF_FIELDS = "product_name,brands,serving_size,nutriments";

function num(v) {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return typeof n === "number" && isFinite(n) ? n : null;
}

function kcalFrom(nutriments, suffix) {
  const kcal = num(nutriments[`energy-kcal${suffix}`]);
  if (kcal !== null) return kcal;
  const kj = num(nutriments[`energy${suffix}`]);
  if (kj !== null) return round1(kj / 4.184);
  return null;
}

// Parses a serving_size string like "30 g" or "240ml" into a gram-equivalent number.
function parseServingGrams(str) {
  if (!str) return null;
  const m = String(str).match(/([\d.]+)\s*(g|ml)\b/i);
  return m ? parseFloat(m[1]) : null;
}

async function lookupBarcode(barcode) {
  const url = `${OFF_BASE}${encodeURIComponent(barcode)}.json?fields=${OFF_FIELDS}`;
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new Error("Network error — check your connection and try again.");
  }
  if (!res.ok) throw new Error(`Lookup failed (HTTP ${res.status}).`);
  const data = await res.json();

  if (data.status !== 1 || !data.product) {
    return { found: false, barcode };
  }

  const p = data.product;
  const n = p.nutriments || {};
  const servingLabel = p.serving_size ? String(p.serving_size).trim() : null;
  const servingGrams = parseServingGrams(servingLabel);

  let baseLabel, calories, protein, carbs, fat;

  const hasServingData = servingLabel && (kcalFrom(n, "_serving") !== null || (servingGrams && kcalFrom(n, "_100g") !== null));

  if (hasServingData) {
    baseLabel = `1 serving (${servingLabel})`;
    calories = kcalFrom(n, "_serving");
    protein = num(n["proteins_serving"]);
    carbs = num(n["carbohydrates_serving"]);
    fat = num(n["fat_serving"]);

    // Some products list serving_size but only publish *_100g values — derive
    // the serving numbers ourselves using the parsed gram weight.
    if (calories === null && servingGrams) {
      const factor = servingGrams / 100;
      calories = kcalFrom(n, "_100g") !== null ? round1(kcalFrom(n, "_100g") * factor) : null;
      protein = num(n["proteins_100g"]) !== null ? round1(num(n["proteins_100g"]) * factor) : null;
      carbs = num(n["carbohydrates_100g"]) !== null ? round1(num(n["carbohydrates_100g"]) * factor) : null;
      fat = num(n["fat_100g"]) !== null ? round1(num(n["fat_100g"]) * factor) : null;
    }
  } else {
    baseLabel = "100 g";
    calories = kcalFrom(n, "_100g");
    protein = num(n["proteins_100g"]);
    carbs = num(n["carbohydrates_100g"]);
    fat = num(n["fat_100g"]);
  }

  if (calories === null) calories = 0;
  if (protein === null) protein = 0;
  if (carbs === null) carbs = 0;
  if (fat === null) fat = 0;

  const name = p.product_name && p.product_name.trim() ? p.product_name.trim() : "Unnamed product";

  return {
    found: true,
    barcode,
    name,
    brand: p.brands ? p.brands.split(",")[0].trim() : "",
    baseLabel,
    perUnit: { calories: round1(calories), protein: round1(protein), carbs: round1(carbs), fat: round1(fat) },
  };
}
