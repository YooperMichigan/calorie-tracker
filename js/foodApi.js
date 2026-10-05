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

  let baseLabel, calories, protein, carbs, fat, fiber, sugar, satFat, sodium;

  const hasServingData = servingLabel && (kcalFrom(n, "_serving") !== null || (servingGrams && kcalFrom(n, "_100g") !== null));

  if (hasServingData) {
    baseLabel = `1 serving (${servingLabel})`;
    calories = kcalFrom(n, "_serving");
    protein = num(n["proteins_serving"]);
    carbs = num(n["carbohydrates_serving"]);
    fat = num(n["fat_serving"]);
    fiber = num(n["fiber_serving"]);
    sugar = num(n["sugars_serving"]);
    satFat = num(n["saturated-fat_serving"]);
    // OFF reports sodium in grams; the rest of the app works in mg.
    sodium = num(n["sodium_serving"]) !== null ? num(n["sodium_serving"]) * 1000 : null;

    // Some products list serving_size but only publish *_100g values — derive
    // the serving numbers ourselves using the parsed gram weight.
    if (calories === null && servingGrams) {
      const factor = servingGrams / 100;
      const scale = (v) => (v !== null ? round1(v * factor) : null);
      calories = scale(kcalFrom(n, "_100g"));
      protein = scale(num(n["proteins_100g"]));
      carbs = scale(num(n["carbohydrates_100g"]));
      fat = scale(num(n["fat_100g"]));
      fiber = scale(num(n["fiber_100g"]));
      sugar = scale(num(n["sugars_100g"]));
      satFat = scale(num(n["saturated-fat_100g"]));
      sodium = num(n["sodium_100g"]) !== null ? scale(num(n["sodium_100g"]) * 1000) : null;
    }
  } else {
    baseLabel = "100 g";
    calories = kcalFrom(n, "_100g");
    protein = num(n["proteins_100g"]);
    carbs = num(n["carbohydrates_100g"]);
    fat = num(n["fat_100g"]);
    fiber = num(n["fiber_100g"]);
    sugar = num(n["sugars_100g"]);
    satFat = num(n["saturated-fat_100g"]);
    sodium = num(n["sodium_100g"]) !== null ? num(n["sodium_100g"]) * 1000 : null;
  }

  calories = calories ?? 0;
  protein = protein ?? 0;
  carbs = carbs ?? 0;
  fat = fat ?? 0;
  fiber = fiber ?? 0;
  sugar = sugar ?? 0;
  satFat = satFat ?? 0;
  sodium = sodium ?? 0;

  const name = p.product_name && p.product_name.trim() ? p.product_name.trim() : "Unnamed product";

  return {
    found: true,
    barcode,
    name,
    brand: p.brands ? p.brands.split(",")[0].trim() : "",
    baseLabel,
    perUnit: {
      calories: round1(calories), protein: round1(protein), carbs: round1(carbs), fat: round1(fat),
      fiber: round1(fiber), sugar: round1(sugar), satFat: round1(satFat), sodium: round1(sodium),
    },
  };
}

// ============================================================================
// USDA FoodData Central — free-text search for generic/whole foods (produce,
// meats, grains, etc.) that don't carry a barcode. CORS-enabled, unlike
// Open Food Facts' text-search endpoint. Docs: https://fdc.nal.usda.gov/api-guide
// ============================================================================

// Personal free key from api.data.gov (not a secret worth protecting beyond
// this — public client-side app, free rate-limited API, no billing).
const USDA_API_KEY = "dbRFNe7tTAQq3gdRTohfdUxWG58GU559kauXl99i";
const USDA_SEARCH_BASE = "https://api.nal.usda.gov/fdc/v1/foods/search";

// USDA reports energy under different nutrient numbers depending on dataset:
// SR Legacy foods use the simple "208 Energy"; Foundation foods only publish
// Atwater-factor variants (957/958). Try each in order. Sodium (307) is
// already reported in mg, unlike OFF which uses grams.
const USDA_NUTRIENT_NUMBERS = {
  calories: ["208", "957", "958"], protein: ["203"], carbs: ["205"], fat: ["204"],
  fiber: ["291"], sugar: ["269"], satFat: ["606"], sodium: ["307"],
};

function findUsdaNutrient(foodNutrients, numbers) {
  for (const num of numbers) {
    const n = foodNutrients.find((x) => String(x.nutrientNumber) === num);
    if (n && typeof n.value === "number") return n.value;
  }
  return null;
}

function normalizeUsdaFood(food) {
  const fn = food.foodNutrients || [];
  const protein = findUsdaNutrient(fn, USDA_NUTRIENT_NUMBERS.protein) ?? 0;
  const carbs = findUsdaNutrient(fn, USDA_NUTRIENT_NUMBERS.carbs) ?? 0;
  const fat = findUsdaNutrient(fn, USDA_NUTRIENT_NUMBERS.fat) ?? 0;
  const fiber = findUsdaNutrient(fn, USDA_NUTRIENT_NUMBERS.fiber) ?? 0;
  const sugar = findUsdaNutrient(fn, USDA_NUTRIENT_NUMBERS.sugar) ?? 0;
  const satFat = findUsdaNutrient(fn, USDA_NUTRIENT_NUMBERS.satFat) ?? 0;
  const sodium = findUsdaNutrient(fn, USDA_NUTRIENT_NUMBERS.sodium) ?? 0;
  let calories = findUsdaNutrient(fn, USDA_NUTRIENT_NUMBERS.calories);
  // Some entries genuinely don't publish an energy value — derive one from
  // macros (Atwater general factors) rather than showing 0 kcal.
  if (calories === null) calories = protein * 4 + carbs * 4 + fat * 9;

  return {
    found: true,
    barcode: null,
    name: food.description || "Unnamed food",
    brand: food.brandOwner || food.brandName || "",
    baseLabel: "100 g",
    perUnit: {
      calories: round1(calories), protein: round1(protein), carbs: round1(carbs), fat: round1(fat),
      fiber: round1(fiber), sugar: round1(sugar), satFat: round1(satFat), sodium: round1(sodium),
    },
  };
}

// Free-text search by name. Returns a plain array (empty if nothing
// matched) — only network/HTTP failures throw. Limited to Foundation and SR
// Legacy datasets (generic/reference foods) rather than Branded, since the
// point of this search is covering things that don't have a barcode to
// scan; branded/packaged items are better served by the Scan tab.
async function searchFoodUSDA(query) {
  const url = `${USDA_SEARCH_BASE}?api_key=${encodeURIComponent(USDA_API_KEY)}&query=${encodeURIComponent(query)}&pageSize=15&dataType=Foundation,SR%20Legacy`;
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new Error("Network error — check your connection and try again.");
  }
  if (res.status === 403) throw new Error("USDA API key is missing or invalid.");
  if (res.status === 429) throw new Error("USDA rate limit hit — try again in a moment.");
  if (!res.ok) throw new Error(`Search failed (HTTP ${res.status}).`);
  const data = await res.json();
  const foods = Array.isArray(data.foods) ? data.foods : [];
  return foods.map(normalizeUsdaFood);
}
