// AI-driven column mapping (v2).
// Pipeline:
//   1. Score every (header, target) pair using multiple signals
//      (exact match, token Jaccard, bigram Dice, alias library, sample-value evidence)
//   2. Apply greedy unique assignment — each NuO field can be claimed by at most one
//      uploaded header, and each header gets at most one NuO field. Highest scoring
//      claims win first; runner-up assignments slot into their second-best target.
//   3. Below a confidence floor, suggest a "custom field" with the original header
//      preserved as the field name.
//
// All deterministic. The LLM (when available) replaces only the per-cell scoring —
// we always re-run the assignment + custom-field pass on its output.

// ─── 1. NORMALIZATION ─────────────────────────────────────────────────

const STOP_TOKENS = new Set([
  "the", "a", "an", "of", "for", "in", "to", "with",
  "variant", "product", "products", "item", "items", "value", "values",
  "info", "information", "name", // "name" is too generic on its own
]);

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[*®™©]/g, "")
    .replace(/\(required\)/gi, "")
    .replace(/\(optional\)/gi, "")
    .trim();
}

function tokens(s) {
  return normalize(s)
    .split(/[\s_\-/(),.|]+/g)
    .filter(t => t && !STOP_TOKENS.has(t));
}

function bigrams(s) {
  const t = normalize(s).replace(/[^a-z0-9]/g, "");
  if (t.length < 2) return [t];
  const out = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.substr(i, 2));
  return out;
}

function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

function dice(a, b) {
  const A = a, B = b;
  if (!A.length || !B.length) return 0;
  const seen = new Map();
  for (const g of A) seen.set(g, (seen.get(g) || 0) + 1);
  let overlap = 0;
  for (const g of B) {
    const c = seen.get(g) || 0;
    if (c > 0) { overlap++; seen.set(g, c - 1); }
  }
  return (2 * overlap) / (A.length + B.length);
}

// ─── 2. ALIAS LIBRARY ─────────────────────────────────────────────────
// Each target -> ordered aliases. First alias is the canonical phrase.
// Aliases are matched on normalized strings — so "Title", "title", "  TITLE  "
// all hit "title".

const ALIAS_DICT = {
  // Core
  product_name:        ["product name", "title", "article title", "item name", "product title", "style name", "model name"],
  brand_name:          ["brand name", "brand", "house", "manufacturer", "vendor", "company"],
  handle:              ["handle", "slug", "url handle", "permalink"],
  product_description: ["product description", "description", "body html", "long description", "details"],
  product_type:        ["product type", "category type"],
  status:              ["status", "published", "state"],
  // Identifiers
  sku:                 ["sku", "variant sku", "style code", "item ref", "article id", "item code", "product code", "ref"],
  style_number:        ["style number", "style no", "style", "model number", "model no"],
  barcode:             ["barcode", "upc", "ean", "isbn", "variant barcode"],
  mpn:                 ["mpn", "part number", "manufacturer part number"],
  gtin:                ["gtin"],
  // Pricing
  wholesale_price:     ["wholesale price", "wholesale", "trade price", "wholesale cost", "wsp", "variant price"],
  retail_price:        ["retail price", "retail", "msrp", "suggested retail", "rrp", "list price"],
  compare_at_price:    ["compare at price", "variant compare at price", "compare price"],
  cost_price:          ["cost price", "cost per item", "cost", "unit cost", "landed cost", "cost usd"],
  currency:            ["currency", "currency code", "ccy"],
  price_catalog:       ["price catalog", "price list", "price book"],
  // Variants
  color:               ["color", "colour", "colorway", "shade", "fabric color"],
  color_pattern:       ["color pattern"],
  size:                ["size", "sz", "size code", "variant size", "size family"],
  size_system:         ["size system", "size scale"],
  material:            ["material", "primary material"],
  pattern:             ["pattern", "print"],
  fabric:              ["fabric", "fabric name", "fabric code"],
  fit:                 ["fit", "fit type"],
  // Categorization
  product_category:    ["product category", "category", "department", "dept"],
  subcategory:         ["subcategory", "sub category", "style category 2"],
  collection:          ["collection", "collection code", "linesheet name", "linesheet"],
  season:              ["season", "year season", "season name", "season code"],
  line:                ["line", "division", "division name"],
  tags:                ["tags", "labels", "keywords"],
  // Apparel
  target_gender:       ["target gender", "gender"],
  age_group:           ["age group", "age", "target age"],
  neckline:            ["neckline", "neck"],
  sleeve_length_type:  ["sleeve length", "sleeve"],
  top_length_type:     ["top length"],
  bottom_length_type:  ["bottom length", "skirt length", "dress length"],
  waist_rise:          ["waist rise", "rise"],
  inseam_length:       ["inseam length", "inseam"],
  closure_type:        ["closure type", "closure"],
  // Footwear
  shoe_size:           ["shoe size"],
  shoe_width:          ["shoe width"],
  heel_height:         ["heel height", "heel"],
  toe_shape:           ["toe shape", "toe"],
  ring_size:           ["ring size"],
  stone_type:          ["stone type", "stone", "gemstone"],
  // Operational
  weight:              ["weight", "variant grams", "grams"],
  weight_unit:         ["weight unit", "variant weight unit"],
  country_of_origin:   ["country of origin", "made in", "origin", "country"],
  composition:         ["composition", "fiber content", "fabric composition"],
  care_instructions:   ["care instructions", "care", "wash care", "wash"],
  lead_time:           ["lead time", "delivery time"],
  ship_start_date:     ["start ship date", "ship start", "delivery start"],
  ship_end_date:       ["end ship date", "complete ship date", "ship end"],
  // Inventory
  inventory_qty:       ["inventory qty", "variant inventory qty", "quantity", "stock", "qty"],
  inventory_policy:    ["inventory policy", "variant inventory policy"],
  minimum_order_qty:   ["minimum order qty", "moq", "minimum order quantity"],
  case_pack:           ["case pack", "pack size", "units per case"],
  // Media
  image_url:           ["image url", "image src", "image", "photo url"],
  image_alt:           ["image alt text", "alt text", "image alt"],
  image_position:      ["image position"],
  variant_image_url:   ["variant image", "variant image src"],
  // SEO
  seo_title:           ["seo title"],
  seo_description:     ["seo description"],
};

// ─── 3. SAMPLE-VALUE PROBES ────────────────────────────────────────────
// Given the first few sample values for a column, vote for which target
// the column probably is. Returns Map<target, evidence_score 0..1>.

const COLOR_WORDS = /\b(red|blue|black|white|green|navy|grey|gray|tan|beige|onyx|olive|sand|charcoal|natural|brown|orange|yellow|purple|pink|cream|ivory|maroon|crimson|teal|mint|sage|burgundy|khaki|camel)\b/i;
const SIZE_WORDS = /^(xxs|xs|s|sm|m|md|l|lg|xl|xxl|xxxl|os|one\s?size|small|medium|large|petite|tall)$/i;
const MATERIAL_WORDS = /\b(cotton|polyester|silk|wool|linen|nylon|leather|denim|cashmere|spandex|elastane|viscose|rayon|acrylic|hemp|bamboo|merino|alpaca|suede)\b/i;
const SEASON_WORDS = /\b(ss\d{2}|fw\d{2}|aw\d{2}|spring|summer|fall|winter|cruise|resort|pre[-\s]?fall)\b/i;
const COUNTRY_CODE = /^[A-Z]{2}$/;
const CURRENCY_CODE = /^(USD|EUR|GBP|CAD|AUD|JPY|CHF|CNY|SEK|NOK|DKK|MXN|BRL|INR|KRW|HKD|SGD|NZD|ZAR|AED)$/i;
const URL_RE = /^https?:\/\//i;
const HTML_RE = /<\/?[a-z][^>]*>/i;
const DATE_RE = /^\d{1,4}[-\/]\d{1,2}([-\/]\d{1,4})?/;
const PURE_NUMERIC = /^-?\d+(\.\d+)?$/;
const PRICE_PATTERN = /^\$?\s?\d+(\.\d{2})?$/;
const SKU_PATTERN = /^[A-Z]{1,5}[-_]?\d{2,6}([-_][A-Z0-9]+)*$/;

function probeSamples(samples) {
  const out = {};
  const add = (field, delta) => { out[field] = (out[field] || 0) + delta; };

  const clean = samples.map(s => String(s || "").trim()).filter(Boolean);
  if (clean.length === 0) return out;

  let urlCount = 0, htmlCount = 0, sizeCount = 0, colorCount = 0,
      materialCount = 0, seasonCount = 0, dateCount = 0, currencyCount = 0,
      countryCount = 0, priceCount = 0, numericCount = 0, skuCount = 0;

  for (const v of clean) {
    if (URL_RE.test(v))      urlCount++;
    if (HTML_RE.test(v))     htmlCount++;
    if (SIZE_WORDS.test(v))  sizeCount++;
    if (COLOR_WORDS.test(v)) colorCount++;
    if (MATERIAL_WORDS.test(v)) materialCount++;
    if (SEASON_WORDS.test(v))   seasonCount++;
    if (DATE_RE.test(v))        dateCount++;
    if (CURRENCY_CODE.test(v))  currencyCount++;
    if (COUNTRY_CODE.test(v))   countryCount++;
    if (PRICE_PATTERN.test(v))  priceCount++;
    if (PURE_NUMERIC.test(v))   numericCount++;
    if (SKU_PATTERN.test(v))    skuCount++;
  }

  const n = clean.length;
  const ratio = (count) => count / n;

  if (ratio(urlCount)      > 0.6) add("image_url",          0.45);
  if (ratio(htmlCount)     > 0.4) add("product_description", 0.40);
  if (ratio(sizeCount)     > 0.5) add("size",               0.40);
  if (ratio(colorCount)    > 0.5) add("color",              0.40);
  if (ratio(materialCount) > 0.5) { add("material", 0.30); add("fabric", 0.20); add("composition", 0.20); }
  if (ratio(seasonCount)   > 0.4) add("season",             0.45);
  if (ratio(currencyCount) > 0.6) add("currency",           0.55);
  if (ratio(countryCount)  > 0.6) add("country_of_origin",  0.20);
  if (ratio(skuCount)      > 0.5) add("sku",                0.25);
  if (ratio(dateCount)     > 0.6) { add("ship_start_date", 0.20); add("ship_end_date", 0.20); }

  // Numeric values — split between price-like and quantity-like
  if (ratio(numericCount) > 0.7) {
    if (ratio(priceCount) > 0.5) {
      // Money-shaped: split tiny weight on the three price slots, header text breaks the tie
      add("wholesale_price", 0.15);
      add("retail_price",    0.10);
      add("cost_price",      0.10);
    } else {
      add("inventory_qty", 0.15);
      add("weight",        0.10);
      add("case_pack",     0.05);
    }
  }
  return out;
}

// ─── 4. SCORE ONE (HEADER, TARGET) PAIR ─────────────────────────────────

function scorePair(header, targetId, sampleEvidence) {
  const norm = normalize(header);
  if (!norm) return { score: 0, reason: "empty header" };

  const aliases = ALIAS_DICT[targetId] || [];

  // 4a. Exact alias hit — top tier (always wins assignment)
  for (const a of aliases) {
    if (a === norm) {
      return { score: 1.0, reason: `exact match (${a})` };
    }
  }

  // 4b. Sanitized exact hit — drop punctuation/whitespace
  const flat = norm.replace(/[^a-z0-9]/g, "");
  for (const a of aliases) {
    if (a.replace(/[^a-z0-9]/g, "") === flat) {
      return { score: 0.97, reason: `exact match (normalized)` };
    }
  }

  // 4c. Token Jaccard (best across all aliases)
  const headerTokens = tokens(header);
  let bestJ = 0, bestJAlias = "";
  for (const a of aliases) {
    const j = jaccard(headerTokens, tokens(a));
    if (j > bestJ) { bestJ = j; bestJAlias = a; }
  }

  // 4d. Bigram Dice (catches typos and minor variations)
  const headerBigrams = bigrams(header);
  let bestD = 0, bestDAlias = "";
  for (const a of aliases) {
    const d = dice(headerBigrams, bigrams(a));
    if (d > bestD) { bestD = d; bestDAlias = a; }
  }

  // 4e. Substring containment — must respect word boundaries so "Meaning" doesn't
  // match "ean", "Vendor" doesn't match "end", etc.
  const headerTokenSet = new Set(headerTokens);
  let containScore = 0, containAlias = "";
  for (const a of aliases) {
    if (a.length < 3) continue;
    if (a === norm) continue; // exact handled above
    const aTokens = tokens(a);
    if (aTokens.length === 0) continue;

    // Alias's tokens all appear in header tokens → strong containment
    const allInHeader = aTokens.every(t => headerTokenSet.has(t));
    if (allInHeader) {
      const s = 0.60 + 0.30 * (aTokens.length / Math.max(headerTokens.length, 1));
      if (s > containScore) { containScore = s; containAlias = a; }
      continue;
    }
    // Header's tokens all appear in alias tokens (e.g. "color" inside "color pattern")
    const aTokenSet = new Set(aTokens);
    const allInAlias = headerTokens.every(t => aTokenSet.has(t));
    if (allInAlias && headerTokens.length > 0) {
      const s = 0.45 + 0.25 * (headerTokens.length / aTokens.length);
      if (s > containScore) { containScore = s; containAlias = a; }
    }
  }

  // 4f. Sample evidence
  const sampleBoost = sampleEvidence[targetId] || 0;

  // Combine. Take the strongest signal, plus a smaller blend of the next two,
  // plus the sample boost.
  const signals = [
    { kind: "tokens",  score: bestJ * 0.85,        alias: bestJAlias },
    { kind: "bigram",  score: bestD * 0.78,        alias: bestDAlias },
    { kind: "contain", score: containScore,        alias: containAlias },
  ].filter(s => s.score > 0);
  signals.sort((a, b) => b.score - a.score);

  let textScore = 0, reason = "";
  if (signals.length) {
    textScore = signals[0].score;
    if (signals[1]) textScore = Math.min(0.95, textScore + signals[1].score * 0.15);
    reason = signals[0].kind === "tokens"
      ? `token overlap with "${signals[0].alias}"`
      : signals[0].kind === "bigram"
        ? `fuzzy match to "${signals[0].alias}"`
        : `contains "${signals[0].alias}"`;
  }

  const final = Math.min(0.92, textScore + sampleBoost);
  let finalReason = reason || "no match";
  if (sampleBoost > 0.15 && textScore > 0) {
    finalReason += " · sample data agrees";
  } else if (sampleBoost > 0.3 && textScore === 0) {
    finalReason = "sample data looks like this field";
  }

  return { score: final, reason: finalReason };
}

// ─── 5. SPECIFICITY DISAMBIGUATION ─────────────────────────────────────
// After per-pair scoring, some headers tie between fields with overlapping
// vocabulary (e.g. "Wholesale Price" matches both wholesale_price and
// retail_price via "price"). Penalize the less specific match.

const SPECIFICITY_GROUPS = [
  // Pricing family — header keywords decide which one
  { keywords: ["wholesale", "wsp"],    field: "wholesale_price" },
  { keywords: ["retail", "msrp", "rrp", "list"], field: "retail_price" },
  { keywords: ["compare"],             field: "compare_at_price" },
  { keywords: ["cost", "landed"],      field: "cost_price" },
  // Description vs body
  { keywords: ["html"],                field: "product_description" },
  // Inventory vs case pack
  { keywords: ["case"],                field: "case_pack" },
  { keywords: ["moq", "minimum"],      field: "minimum_order_qty" },
];

// Headers whose words are "name" components, not field identifiers. Used to
// suppress over-eager matches like "Linesheet Code" → sku via "code".
const SUFFIX_WORDS = ["code", "label", "name", "type", "id", "value"];

// When a header is just "<Concept> <Suffix>" (like "Color Code", "Size Active",
// "Style Tag Code 1"), the suffix shouldn't drive a strong match. We require
// the *first* token to match the candidate's vocabulary instead.
function suffixOnlyMatch(headerTokens, targetId) {
  if (headerTokens.length < 2) return false;
  const last = headerTokens[headerTokens.length - 1];
  if (!SUFFIX_WORDS.includes(last)) return false;
  const aliases = ALIAS_DICT[targetId] || [];
  for (const a of aliases) {
    const aTokens = tokens(a);
    if (aTokens.length === 1 && aTokens[0] === last) {
      // The alias is exactly the suffix word. The header's leading tokens
      // should determine the match, not the suffix.
      return true;
    }
  }
  return false;
}

function applySpecificity(header, scores) {
  const norm = normalize(header);
  // For each (keyword, preferred field) hit, dampen other competing fields
  for (const rule of SPECIFICITY_GROUPS) {
    if (rule.keywords.some(k => norm.includes(k))) {
      const preferred = rule.field;
      if (!(preferred in scores)) continue;
      // Penalize competing fields in the same numeric/text family
      const family = competingFamily(preferred);
      for (const f of family) {
        if (f !== preferred && f in scores) {
          scores[f] = Math.max(0, scores[f] * 0.55);
        }
      }
    }
  }
  return scores;
}

function competingFamily(field) {
  const PRICE_FAMILY = ["wholesale_price", "retail_price", "compare_at_price", "cost_price"];
  const QTY_FAMILY = ["inventory_qty", "case_pack", "minimum_order_qty"];
  if (PRICE_FAMILY.includes(field)) return PRICE_FAMILY;
  if (QTY_FAMILY.includes(field)) return QTY_FAMILY;
  return [field];
}

// ─── 6. SCORE ALL ───────────────────────────────────────────────────────

function scoreAll(headers, sampleRows) {
  const allTargets = Object.keys(ALIAS_DICT);
  const matrix = {};
  for (const h of headers) {
    const samples = sampleRows.slice(0, 6).map(r => r[h]).filter(Boolean);
    const sampleEv = probeSamples(samples);
    const headerTokenList = tokens(h);
    let scores = {};
    for (const t of allTargets) {
      const { score, reason } = scorePair(h, t, sampleEv);
      if (score === 0) continue;
      // Penalize "<Concept> <Suffix>" matches where only the suffix matched the alias.
      // "Size Active" → status had alias "active" matching the suffix.
      let finalScore = score;
      if (suffixOnlyMatch(headerTokenList, t)) finalScore *= 0.45;
      scores[t] = { score: finalScore, reason };
    }
    // Specificity penalty
    const flatScores = {};
    for (const k in scores) flatScores[k] = scores[k].score;
    const adjusted = applySpecificity(h, flatScores);
    for (const k in scores) scores[k] = { score: adjusted[k] ?? scores[k].score, reason: scores[k].reason };
    matrix[h] = scores;
  }
  return matrix;
}

// ─── 7. UNIQUE ASSIGNMENT ──────────────────────────────────────────────
// Greedy with re-assignment: build (header, target, score) triples, sort
// by score desc, claim if both sides are free. After the first pass, any
// header without a target tries its remaining candidates in score order.

function assignUnique(matrix, headers) {
  const triples = [];
  // For each header, find its single best target (this is its "first choice").
  const headerFirstChoice = {};
  for (const h of headers) {
    const candidates = matrix[h] || {};
    let bestT = null, bestScore = 0;
    for (const [t, info] of Object.entries(candidates)) {
      if (info.score > bestScore) { bestScore = info.score; bestT = t; }
      if (info.score >= 0.4) triples.push({ h, t, score: info.score, reason: info.reason });
    }
    headerFirstChoice[h] = bestT;
  }
  triples.sort((a, b) => b.score - a.score);

  const headerToTarget = {};
  const targetClaimed = {};
  for (const tri of triples) {
    if (headerToTarget[tri.h]) continue;
    if (targetClaimed[tri.t]) continue;
    // If this isn't the header's first choice (because its first choice was taken),
    // the runner-up has to clear the recommended threshold to win — we don't want
    // weak fallbacks slipping through just because the best option was unavailable.
    const isRunnerUp = headerFirstChoice[tri.h] !== tri.t;
    if (isRunnerUp && tri.score < 0.70) continue;
    headerToTarget[tri.h] = tri;
    targetClaimed[tri.t] = tri.h;
  }
  return headerToTarget;
}

// ─── 8. CUSTOM-FIELD FALLBACK ──────────────────────────────────────────
// Headers without a confident schema match become custom-field suggestions.
// Threshold is intentionally generous — sub-0.55 means "we don't really know,
// preserve it as-is so nothing is lost".

const CUSTOM_THRESHOLD = 0.55;
const ABSTAIN_THRESHOLD = 0.40; // below this we don't even suggest

function classify(score) {
  if (score >= 0.9)  return "auto_confirmed";
  if (score >= 0.7)  return "recommended";
  if (score >= ABSTAIN_THRESHOLD) return "low_confidence";
  return "unmapped";
}

function buildMappings(headers, sampleRows) {
  const matrix = scoreAll(headers, sampleRows);
  const assigned = assignUnique(matrix, headers);

  return headers.map(h => {
    // Empty/unnamed columns are skipped by default rather than turned into custom fields
    if (/^\(unnamed\b/i.test(h) || !h.trim()) {
      return {
        user_header: h,
        target_field: null,
        custom_field_name: null,
        confidence: 0,
        reason: "Empty column header — skipped",
        status: "unmapped",
        manual: false,
      };
    }
    const a = assigned[h];
    if (a && a.score >= CUSTOM_THRESHOLD) {
      return {
        user_header: h,
        target_field: a.t,
        custom_field_name: null,
        confidence: a.score,
        reason: a.reason,
        status: classify(a.score),
        manual: false,
      };
    }
    // No confident match — propose as a custom field
    return {
      user_header: h,
      target_field: "__custom__",
      custom_field_name: cleanCustomName(h),
      confidence: a?.score || 0,
      reason: a
        ? `Best guess "${a.t}" at ${(a.score * 100).toFixed(0)}% — below threshold, keeping as custom field`
        : "No matching NuO field — keeping as custom field",
      status: "custom",
      manual: false,
    };
  });
}

// Sanitize messy column headers into a reasonable default custom-field name.
// "title (product.metafields.custom.title)" → "title"
// "Google Shopping / Age Group"             → "Google Shopping / Age Group"
function cleanCustomName(h) {
  let s = String(h || "").trim();
  // Drop trailing metafield parenthesized suffix
  s = s.replace(/\s*\(product\.metafields\.[^)]*\)\s*$/i, "");
  return s.trim() || h;
}

// ─── 9. LLM ORCHESTRATION ──────────────────────────────────────────────
// When Claude is available, use it to produce per-cell scores. We then run our
// assignment + custom-field pass on the output. If the call fails or the
// response is malformed, fall back to the deterministic algorithm.

function buildSchemaPrompt() {
  const groups = window.TARGET_SCHEMA_GROUPS || [];
  return groups.map(g => {
    const lines = g.fields.map(f => {
      const reqd = f.required ? " (Required)" : "";
      const hint = f.hint ? ` — ${f.hint}` : "";
      return `  - ${f.id}${reqd}: ${f.label}${hint}`;
    }).join("\n");
    return `${g.label}:\n${lines}`;
  }).join("\n\n");
}

const SYSTEM_PROMPT_BASE = `You are a backend utility that maps raw user file headers to our standardized NuORDER product schema, aligned with the Shopify Standard Product Taxonomy.

For each input header, propose the BEST matching schema field (or null if no field is a sensible match). Use:
- exact name match,
- common synonyms (Title → product_name, Vendor → brand_name, Body (HTML) → product_description, Variant SKU → sku, Variant Price → wholesale_price, Made in → country_of_origin, Compare at price → compare_at_price, Cost per item → cost_price),
- the sample data values to disambiguate (e.g. "Option1 Value" with sample values "S, M, L" → size; with "Black, White, Navy" → color),
- and the column's neighbours (a column near "Wholesale Price" called "Currency" is currency).

For ambiguous numeric columns, prefer the more specific price field when the header hints at it ("Cost" → cost_price, "MSRP/Retail" → retail_price, "Wholesale" → wholesale_price).

Return a confidence score in [0.0, 1.0]. Use 0.95+ only when you are sure. The assignment step that runs after you will ensure each target field is used at most once, so just rank candidates honestly.

Respond with raw JSON only — no markdown fences, no prose:
{
  "mappings": [
    { "user_header": "<original>", "target_field": "<schema id or null>", "confidence": <0..1>, "reason": "<short why>" }
  ]
}`;

async function callMappingLLM(headers, sampleRows) {
  if (!window.claude || !window.claude.complete) {
    return buildMappings(headers, sampleRows);
  }
  const systemPrompt = SYSTEM_PROMPT_BASE + "\n\nTarget Schema:\n\n" + buildSchemaPrompt();
  const userMsg = `Map these column headers to our schema.

Headers: ${JSON.stringify(headers)}

Sample rows (first 3):
${sampleRows.slice(0, 3).map((r, i) => `Row ${i + 1}: ${JSON.stringify(r)}`).join("\n")}

Return JSON.`;

  try {
    const text = await window.claude.complete({
      messages: [{ role: "user", content: systemPrompt + "\n\n" + userMsg }],
    });
    const cleaned = String(text).trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const json = JSON.parse(cleaned);
    if (!json.mappings || !Array.isArray(json.mappings)) throw new Error("malformed");
    // Build a sparse matrix from the LLM proposals
    const matrix = {};
    for (const h of headers) matrix[h] = {};
    for (const m of json.mappings) {
      if (!m.user_header || !m.target_field) continue;
      const t = m.target_field;
      if (!(t in ALIAS_DICT)) continue;
      matrix[m.user_header] = { ...(matrix[m.user_header] || {}), [t]: { score: Number(m.confidence) || 0, reason: m.reason || "ai" } };
    }
    // Merge with deterministic scores as a safety net, taking the higher score
    const deterministic = scoreAll(headers, sampleRows);
    for (const h of headers) {
      for (const [t, info] of Object.entries(deterministic[h] || {})) {
        if (!matrix[h][t] || matrix[h][t].score < info.score) {
          // Keep the AI's reason if any, otherwise deterministic
          matrix[h][t] = matrix[h][t]
            ? { score: Math.max(matrix[h][t].score, info.score), reason: matrix[h][t].reason || info.reason }
            : info;
        }
      }
    }
    const assigned = assignUnique(matrix, headers);
    return headers.map(h => {
      const a = assigned[h];
      if (a && a.score >= CUSTOM_THRESHOLD) {
        return {
          user_header: h, target_field: a.t, custom_field_name: null,
          confidence: a.score, reason: a.reason,
          status: classify(a.score), manual: false,
        };
      }
      return {
        user_header: h, target_field: "__custom__", custom_field_name: h,
        confidence: a?.score || 0,
        reason: a ? `${(a.score * 100).toFixed(0)}% on "${a.t}" — below threshold` : "no schema match",
        status: "custom", manual: false,
      };
    });
  } catch (e) {
    console.warn("LLM mapping failed, using deterministic algorithm:", e);
    return buildMappings(headers, sampleRows);
  }
}

function statusFromConfidence(c) {
  return classify(c);
}

window.callMappingLLM = callMappingLLM;
window.statusFromConfidence = statusFromConfidence;
window.buildMappingsDeterministic = buildMappings; // exposed for tests
window.CUSTOM_THRESHOLD = CUSTOM_THRESHOLD;
