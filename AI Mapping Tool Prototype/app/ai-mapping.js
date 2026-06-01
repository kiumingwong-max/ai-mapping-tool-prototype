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
    // Strip language tags common in JOOR/Faire headers: "Product Name (English)"
    .replace(/\((english|french|spanish|german|italian|en|fr|es|de|it)\)/gi, "")
    // Strip price-tier index suffixes: "Wholesale Price_1" → "wholesale price"
    .replace(/_\d+\b/g, "")
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

function jaccardSets(A, B) {
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

// ─── 1b. DEEP COLUMN SAMPLING ──────────────────────────────────────────
// Real Shopify / Faire exports are multi-row per product: product-level
// columns (Title, Vendor, Body HTML) are only filled on each product's first
// row, variant columns (Option1 Value, Variant SKU, Variant Price) only on
// variant rows, and image rows are almost entirely blank. Sampling just the
// top few rows therefore makes most columns look empty.
//
// collectColumnSamples scans deep into the file and gathers a deduped set of a
// column's real, non-empty values — so a sparse variant column is recognized
// by its values rather than rejected for being blank up top.
//
// PERF: the mapping pipeline asks for a column's samples and fill rate many
// times across its passes (scoring, recommendation, transforms, FDM typing).
// Each scan is O(rows), so we memoize per (rows, column) in a WeakMap keyed by
// the rows array — one scan per column per file, reused everywhere. The cache
// is GC'd with the rows array and never leaks across files.
const SAMPLE_SCAN = 400;   // rows scanned for sample collection
const FILL_SCAN = 600;     // rows scanned for fill-rate
const SAMPLE_DEPTH = 24;   // deduped samples cached (≥ every call site's request)
const _scanCache = new WeakMap();

function _cacheFor(rows) {
  let c = _scanCache.get(rows);
  if (!c) { c = { samples: new Map(), fill: new Map() }; _scanCache.set(rows, c); }
  return c;
}

function _scanSamples(rows, header) {
  const out = [];
  const seen = new Set();
  const scan = Math.min(rows.length, SAMPLE_SCAN);
  for (let i = 0; i < scan && out.length < SAMPLE_DEPTH; i++) {
    const v = String((rows[i] || {})[header] ?? "").trim();
    if (!v) continue;
    const key = v.slice(0, 48).toLowerCase();
    if (seen.has(key)) continue; // keep variety, not repeats
    seen.add(key);
    out.push(v);
  }
  return out;
}

function collectColumnSamples(rows, header, maxSamples = 15, maxScan = SAMPLE_SCAN) {
  // Non-standard scan depth (none of the call sites use this today) → uncached.
  if (maxScan !== SAMPLE_SCAN) {
    const out = [];
    const seen = new Set();
    const scan = Math.min(rows.length, maxScan);
    for (let i = 0; i < scan && out.length < maxSamples; i++) {
      const v = String((rows[i] || {})[header] ?? "").trim();
      if (!v) continue;
      const key = v.slice(0, 48).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    }
    return out;
  }
  const cache = _cacheFor(rows);
  let deep = cache.samples.get(header);
  if (!deep) { deep = _scanSamples(rows, header); cache.samples.set(header, deep); }
  // Deduped collection order is stable, so the first N of a deep scan equals a
  // direct depth-N scan — slice rather than rescan.
  return maxSamples >= deep.length ? deep.slice() : deep.slice(0, maxSamples);
}

// How often a column is populated across the file (0..1). Low fill rate is a
// strong signal of a variant- or image-level column in a multi-row export —
// NOT a reason to drop it.
function columnFillRate(rows, header, maxScan = FILL_SCAN) {
  if (maxScan !== FILL_SCAN) {
    const scan = Math.min(rows.length, maxScan);
    if (scan === 0) return 0;
    let filled = 0;
    for (let i = 0; i < scan; i++) {
      if (String((rows[i] || {})[header] ?? "").trim()) filled++;
    }
    return filled / scan;
  }
  const cache = _cacheFor(rows);
  let f = cache.fill.get(header);
  if (f !== undefined) return f;
  const scan = Math.min(rows.length, FILL_SCAN);
  if (scan === 0) { cache.fill.set(header, 0); return 0; }
  let filled = 0;
  for (let i = 0; i < scan; i++) {
    if (String((rows[i] || {})[header] ?? "").trim()) filled++;
  }
  f = filled / scan;
  cache.fill.set(header, f);
  return f;
}

// Short human description of what a column's values look like — drives the
// "looks like" chip and feeds the low-confidence recommendation reasoning.
function describeData(samples) {
  const clean = samples.map(s => String(s || "").trim()).filter(Boolean);
  if (!clean.length) return "empty";
  const n = clean.length;
  const r = (re) => clean.filter(v => re.test(v)).length / n;
  if (r(URL_RE) > 0.6) return "image/URL links";
  if (r(HTML_RE) > 0.4) return "rich text / HTML";
  if (r(PRICE_PATTERN) > 0.6) return "prices";
  if (r(PURE_NUMERIC) > 0.7) return "numeric values";
  if (r(DATE_RE) > 0.6) return "dates";
  if (clean.every(v => v.length <= 4) && r(/^[A-Za-z]+$/) > 0.6) return "short codes";
  if (r(/\s/) > 0.6 && clean.some(v => v.length > 40)) return "free text";
  const avg = clean.reduce((s, v) => s + v.length, 0) / n;
  if (avg <= 20) return "short labels";
  return "free text";
}

function labelFor(fieldId) {
  const f = (window.TARGET_SCHEMA || []).find(x => x.id === fieldId);
  return f ? f.label : fieldId;
}

// ─── 2. ALIAS LIBRARY ─────────────────────────────────────────────────
// Each target -> ordered aliases. First alias is the canonical phrase.
// Aliases are matched on normalized strings — so "Title", "title", "  TITLE  "
// all hit "title".

const ALIAS_DICT = {
  // Core
  product_name:        ["product name", "title", "article title", "item name", "product title", "style name", "model name", "name"],
  brand_name:          ["brand name", "brand", "house", "manufacturer", "vendor", "company", "designer"],
  handle:              ["handle", "slug", "url handle", "permalink"],
  product_description: ["product description", "description", "body html", "long description", "details"],
  product_type:        ["product type", "category type"],
  status:              ["status", "product status", "option status"],
  // Identifiers
  sku:                 ["sku", "variant sku", "style code", "item ref", "article id", "item code", "product code", "ref", "reference", "identifier"],
  style_number:        ["style number", "style no", "style", "model number", "model no", "model", "joor style id"],
  barcode:             ["barcode", "upc", "ean", "isbn", "variant barcode"],
  mpn:                 ["mpn", "part number", "manufacturer part number"],
  gtin:                ["gtin"],
  // Pricing
  wholesale_price:     ["wholesale price", "wholesale", "trade price", "wholesale cost", "wsp", "variant price", "wholesale usd", "unit wholesale price", "cad unit wholesale price", "usd unit wholesale price"],
  retail_price:        ["retail price", "retail", "msrp", "suggested retail", "suggested retail price", "rrp", "list price", "unit retail price", "usd unit retail price"],
  compare_at_price:    ["compare at price", "variant compare at price", "compare price"],
  cost_price:          ["cost price", "cost per item", "cost", "unit cost", "landed cost", "cost usd"],
  currency:            ["currency", "currency code", "ccy", "wholesale currency", "retail currency", "price currency"],
  price_catalog:       ["price catalog", "price list", "price book", "price label", "price type label"],
  // Variants
  color:               ["color", "colour", "colorway", "shade", "fabric color", "color name", "colour name"],
  color_pattern:       ["color pattern"],
  size:                ["size", "sz", "size code", "variant size", "size family", "sizes"],
  size_system:         ["size system", "size scale"],
  material:            ["material", "primary material", "fabrication"],
  pattern:             ["pattern", "print"],
  fabric:              ["fabric", "fabric name", "fabric code", "fabrication"],
  fit:                 ["fit", "fit type"],
  // Categorization
  product_category:    ["product category", "category", "department", "dept"],
  subcategory:         ["subcategory", "sub category", "style category 2"],
  collection:          ["collection", "collection code", "linesheet name", "linesheet", "linesheet code"],
  season:              ["season", "year season", "season name", "season code", "season year"],
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
  weight:              ["weight", "variant grams", "grams", "item weight"],
  weight_unit:         ["weight unit", "variant weight unit", "item weight unit"],
  country_of_origin:   ["country of origin", "made in", "origin", "country"],
  composition:         ["composition", "fiber content", "fabric composition"],
  care_instructions:   ["care instructions", "care instruction", "care", "wash care", "wash"],
  lead_time:           ["lead time", "delivery time"],
  ship_start_date:     ["start ship date", "ship start", "delivery start"],
  ship_end_date:       ["end ship date", "complete ship date", "ship end"],
  // Inventory
  inventory_qty:       ["inventory qty", "variant inventory qty", "quantity", "stock", "qty"],
  inventory_policy:    ["inventory policy", "variant inventory policy"],
  minimum_order_qty:   ["minimum order qty", "moq", "minimum order quantity", "minimum delivery window"],
  case_pack:           ["case pack", "pack size", "units per case", "case size", "selling method"],
  // Media
  image_url:           ["image url", "image src", "image", "photo url", "product images"],
  image_alt:           ["image alt text", "alt text", "image alt"],
  image_position:      ["image position"],
  variant_image_url:   ["variant image", "variant image src"],
  // SEO
  seo_title:           ["seo title"],
  seo_description:     ["seo description"],
};

// Precomputed alias features. Aliases are static, so tokenizing/bigramming them
// once at module load (instead of per header×target×alias inside scorePair)
// removes the dominant cost of the deterministic scorer.
const ALIAS_INDEX = {};
for (const [tid, aliases] of Object.entries(ALIAS_DICT)) {
  ALIAS_INDEX[tid] = aliases.map(a => {
    const at = tokens(a);
    return {
      alias: a,
      flat: a.replace(/[^a-z0-9]/g, ""),
      tokens: at,
      tokenSet: new Set(at),
      bigrams: bigrams(a),
    };
  });
}

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
    // Word-contains matches (size/color/material/season) only count for short,
    // label-like values — a sentence that merely mentions "summer" or "cotton"
    // is free text, not a season/material column.
    const shortLabel = v.length <= 24;
    if (URL_RE.test(v))      urlCount++;
    if (HTML_RE.test(v))     htmlCount++;
    if (shortLabel && SIZE_WORDS.test(v))  sizeCount++;
    if (shortLabel && COLOR_WORDS.test(v)) colorCount++;
    if (shortLabel && MATERIAL_WORDS.test(v)) materialCount++;
    if (shortLabel && SEASON_WORDS.test(v))   seasonCount++;
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
// `hf` is the header's precomputed features { norm, flat, tokens, tokenSet,
// bigrams } — built once per header in scoreAll, not per target.

function scorePair(hf, targetId, sampleEvidence) {
  const norm = hf.norm;
  if (!norm) return { score: 0, reason: "empty header" };

  const aliases = ALIAS_INDEX[targetId] || [];

  // 4a. Exact alias hit — top tier (always wins assignment)
  for (const a of aliases) {
    if (a.alias === norm) return { score: 1.0, reason: `exact match (${a.alias})` };
  }

  // 4b. Sanitized exact hit — drop punctuation/whitespace
  for (const a of aliases) {
    if (a.flat === hf.flat) return { score: 0.97, reason: `exact match (normalized)` };
  }

  // 4c. Token Jaccard (best across all aliases)
  let bestJ = 0, bestJAlias = "";
  for (const a of aliases) {
    const j = jaccardSets(hf.tokenSet, a.tokenSet);
    if (j > bestJ) { bestJ = j; bestJAlias = a.alias; }
  }

  // 4d. Bigram Dice (catches typos and minor variations)
  let bestD = 0, bestDAlias = "";
  for (const a of aliases) {
    const d = dice(hf.bigrams, a.bigrams);
    if (d > bestD) { bestD = d; bestDAlias = a.alias; }
  }

  // 4e. Substring containment — must respect word boundaries so "Meaning" doesn't
  // match "ean", "Vendor" doesn't match "end", etc.
  let containScore = 0, containAlias = "";
  for (const a of aliases) {
    if (a.alias.length < 3) continue;
    if (a.alias === norm) continue; // exact handled above
    if (a.tokens.length === 0) continue;

    // Alias's tokens all appear in header tokens → strong containment
    const allInHeader = a.tokens.every(t => hf.tokenSet.has(t));
    if (allInHeader) {
      const s = 0.60 + 0.30 * (a.tokens.length / Math.max(hf.tokens.length, 1));
      if (s > containScore) { containScore = s; containAlias = a.alias; }
      continue;
    }
    // Header's tokens all appear in alias tokens (e.g. "color" inside "color pattern")
    const allInAlias = hf.tokens.every(t => a.tokenSet.has(t));
    if (allInAlias && hf.tokens.length > 0) {
      const s = 0.45 + 0.25 * (hf.tokens.length / a.tokens.length);
      if (s > containScore) { containScore = s; containAlias = a.alias; }
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
  const aliases = ALIAS_INDEX[targetId] || [];
  for (const a of aliases) {
    if (a.tokens.length === 1 && a.tokens[0] === last) {
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
    // Deep scan for the column's real values — fixes multi-row Shopify/Faire
    // exports where variant/product columns are blank in the top rows.
    const samples = collectColumnSamples(sampleRows, h);
    const sampleEv = probeSamples(samples);
    // Header features computed once per header (not per target).
    const norm = normalize(h);
    const hTokens = tokens(h);
    const hf = {
      norm,
      flat: norm.replace(/[^a-z0-9]/g, ""),
      tokens: hTokens,
      tokenSet: new Set(hTokens),
      bigrams: bigrams(h),
    };
    let scores = {};
    for (const t of allTargets) {
      const { score, reason } = scorePair(hf, t, sampleEv);
      if (score === 0) continue;
      // Penalize "<Concept> <Suffix>" matches where only the suffix matched the alias.
      // "Size Active" → status had alias "active" matching the suffix.
      let finalScore = score;
      if (suffixOnlyMatch(hTokens, t)) finalScore *= 0.45;
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

// ─── 8. CUSTOM-FIELD FALLBACK + LOW-CONFIDENCE RECOMMENDATION ───────────
// Headers without a confident schema match (≥0.7) get a second look: we read
// the column's actual values and either (a) recommend a NuO field the data
// points to, or (b) recommend a clean custom-field name. Nothing is dropped.

const CONFIDENT_THRESHOLD = 0.7;  // ≥ this: trust the header match as-is
const CUSTOM_THRESHOLD = 0.55;
const ABSTAIN_THRESHOLD = 0.40; // below this the header match alone abstains

function classify(score) {
  if (score >= 0.9)  return "auto_confirmed";
  if (score >= 0.7)  return "recommended";
  if (score >= ABSTAIN_THRESHOLD) return "low_confidence";
  return "unmapped";
}

// Deterministic data-driven recommendation for a low-confidence column.
// Reads the column's real values and returns either a field suggestion or a
// custom-field-name suggestion. `claimed` is the set of NuO fields already in
// use (the unique-mapping rule still applies to recommendations).
function recommendFromData(header, samples, claimed) {
  const profile = describeData(samples);
  const ev = probeSamples(samples);

  // Strongest field the data points to that isn't already claimed
  let bestField = null, bestScore = 0;
  for (const [f, s] of Object.entries(ev)) {
    if (claimed.has(f)) continue;
    if (s > bestScore) { bestScore = s; bestField = f; }
  }

  if (bestField && bestScore >= 0.35) {
    return {
      type: "field",
      target_field: bestField,
      confidence: Math.min(0.88, 0.55 + bestScore),
      profile,
      reason: `Column values look like ${labelFor(bestField).toLowerCase()} (${profile}) — recommending this field`,
    };
  }

  // No field evidence — recommend keeping it as a cleanly-named custom field,
  // naming it from the data when the header itself is uninformative.
  const named = smartCustomName(header, samples);
  const nameReason = named.source === "cell"
    ? `Values embed their own label, naming it “${named.name}”`
    : named.source === "data"
      ? `Header “${header}” is uninformative; values look like ${profile}, naming it “${named.name}”`
      : `No matching NuO field; values are ${profile}. Recommended as a custom field`;
  return {
    type: "custom",
    custom_field_name: named.name,
    name_source: named.source,
    confidence: 0.5,
    profile,
    reason: nameReason,
  };
}

// Apply a recommendation object onto a base mapping row, honoring uniqueness.
function applyRecommendation(m, rec, claimed) {
  if (rec.type === "field" && !claimed.has(rec.target_field)) {
    claimed.add(rec.target_field);
    return {
      ...m,
      target_field: rec.target_field,
      custom_field_name: null,
      confidence: rec.confidence,
      status: "recommended",
      recommended_from_data: true,
      data_profile: rec.profile,
      reason: rec.reason,
    };
  }
  // Custom recommendation (or the recommended field was taken)
  return {
    ...m,
    target_field: "__custom__",
    custom_field_name: rec.custom_field_name || cleanCustomName(m.user_header),
    name_source: rec.name_source || null,
    confidence: rec.confidence,
    status: "custom",
    recommended_from_data: true,
    data_profile: rec.profile,
    reason: rec.reason,
  };
}

// Base mapping row from the unique assignment, before any low-confidence pass.
function baseMapping(h, rows, assigned) {
  const fill = columnFillRate(rows, h);
  if (/^\(unnamed\b/i.test(h) || !h.trim()) {
    // Truly empty + unnamed → skip. But an unnamed column that HAS data is a
    // prime data-naming candidate — keep it as a custom field and let the
    // low-confidence pass name it from the values rather than dropping it.
    if (fill === 0) {
      return {
        user_header: h, target_field: null, custom_field_name: null,
        confidence: 0, reason: "Empty, unnamed column — skipped",
        status: "unmapped", manual: false, fill_rate: fill, data_profile: null,
        recommended_from_data: false,
      };
    }
    return {
      user_header: h, target_field: "__custom__", custom_field_name: null,
      confidence: 0, reason: "Unnamed column with data — naming it from the values",
      status: "custom", manual: false, fill_rate: fill, data_profile: null,
      recommended_from_data: false, _unnamed: true,
    };
  }
  const a = assigned[h];
  if (a && a.score >= CUSTOM_THRESHOLD) {
    return {
      user_header: h, target_field: a.t, custom_field_name: null,
      confidence: a.score, reason: a.reason,
      status: classify(a.score), manual: false, fill_rate: fill, data_profile: null,
      recommended_from_data: false,
    };
  }
  return {
    user_header: h, target_field: "__custom__", custom_field_name: cleanCustomName(h),
    confidence: a?.score || 0,
    reason: a ? `Best header guess "${a.t}" at ${(a.score * 100).toFixed(0)}% — below threshold` : "No header match",
    status: "custom", manual: false, fill_rate: fill, data_profile: null,
    recommended_from_data: false,
    _headerGuess: a ? { t: a.t, score: a.score } : null,
  };
}

// Shared low-confidence finalization used by BOTH the deterministic and LLM
// paths (keeps them from drifting): for every sub-threshold column, skip it if
// empty, else apply an LLM recommendation (recMap) or the deterministic one.
function finalizeLowConfidence(base, sampleRows, recMap = {}) {
  const claimed = new Set(
    base.filter(m => m.target_field && m.target_field !== "__custom__" && m.confidence >= CONFIDENT_THRESHOLD)
        .map(m => m.target_field)
  );
  return base.map(m => {
    if (m.confidence >= CONFIDENT_THRESHOLD) return m; // confident header match — leave it
    // Unnamed/blank columns that stayed skipped (no data) — leave them out.
    if (m.status === "unmapped" && (!m.user_header.trim() || /^\(unnamed\b/i.test(m.user_header))) return m;
    const samples = collectColumnSamples(sampleRows, m.user_header);
    if (samples.length === 0) {
      // No data anywhere — skip an empty column rather than creating an empty
      // custom field. A column with no values carries nothing to import.
      return {
        ...m,
        target_field: null,
        custom_field_name: null,
        status: "unmapped",
        data_profile: "empty in this file",
        reason: "Column is empty in every row — skipped",
      };
    }
    const rec = recMap[m.user_header] || recommendFromData(m.user_header, samples, claimed);
    return applyRecommendation(m, rec, claimed);
  });
}

function buildMappings(headers, sampleRows) {
  const matrix = scoreAll(headers, sampleRows);
  const assigned = assignUnique(matrix, headers);
  const base = headers.map(h => baseMapping(h, sampleRows, assigned));
  const out = finalizeLowConfidence(base, sampleRows);
  return postProcessTransforms(out, headers, sampleRows);
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

// ─── DATA-DRIVEN CUSTOM-FIELD NAMING ────────────────────────────────────
// When a header carries no naming signal (blank, "(unnamed)", "Column7",
// "Attr 3", a bare number), we name the field from the column's actual data
// instead of echoing a useless header.

function titleCaseName(s) {
  return String(s || "").replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase()).trim();
}

// Headers that carry no real semantic signal on their own.
function isWeakHeader(h) {
  const s = String(h || "").trim();
  if (!s) return true;
  if (/^\(unnamed\b/i.test(s)) return true;
  const flat = s.replace(/[\s_\-.#]+/g, "");
  if (/^(column|col|field|fld|attribute|attr|untitled|unnamed|unknown|value|val|var|variable|property|prop|data|misc|other|extra|blank|none)\d*$/i.test(flat)) return true;
  if (/^[a-z]?\d{1,3}$/i.test(flat)) return true; // "7", "c3", "f12"
  if (/^[_\-.#]+$/.test(s)) return true;
  if (flat.length <= 1) return true;
  return false;
}

// "look at the sample data in the row" — many cells embed their own label
// ("Material: Cotton", "color = red", "Heel Height - 2in"). If most cells do,
// lift that embedded label as the field name. This reads the row data itself.
function labelFromCellValues(samples) {
  const clean = samples.map(s => String(s || "").trim()).filter(Boolean);
  if (clean.length < 2) return null;
  const labels = {};
  let hits = 0;
  for (const v of clean) {
    const m = v.match(/^([A-Za-z][A-Za-z \/&]{1,28}?)\s*[:=]\s*\S/);
    if (m) { const k = m[1].trim().toLowerCase(); labels[k] = (labels[k] || 0) + 1; hits++; }
  }
  if (hits / clean.length < 0.6) return null;
  const top = Object.entries(labels).sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] / clean.length < 0.5) return null;
  return titleCaseName(top[0]);
}

// Derive a human field name purely from the shape/content of the values.
function nameFromDataShape(samples) {
  const clean = samples.map(s => String(s || "").trim()).filter(Boolean);
  if (!clean.length) return null;
  const n = clean.length;
  const frac = (pred) => clean.filter(pred).length / n;

  if (frac(v => URL_RE.test(v)) > 0.6) {
    if (frac(v => /\.(jpe?g|png|gif|webp|avif|tiff?)(\?|#|$)/i.test(v)) > 0.4) return "Image URL";
    return "URL";
  }
  if (frac(v => HTML_RE.test(v)) > 0.4) return "Description";
  const shortFrac = (re) => clean.filter(v => v.length <= 24 && re.test(v)).length / n;
  if (shortFrac(SEASON_WORDS) > 0.5) return "Season";
  if (frac(v => CURRENCY_CODE.test(v)) > 0.7) return "Currency";
  if (frac(v => COUNTRY_CODE.test(v)) > 0.7) return "Country";
  if (shortFrac(COLOR_WORDS) > 0.6) return "Color";
  if (shortFrac(SIZE_WORDS) > 0.6) return "Size";
  if (shortFrac(MATERIAL_WORDS) > 0.5) return "Material";
  if (frac(v => PRICE_PATTERN.test(v)) > 0.7) return "Price";
  if (frac(v => DATE_RE.test(v)) > 0.7) return "Date";
  if (frac(v => /^(true|false|yes|no|y|n)$/i.test(v)) > 0.8) return "Flag";
  if (frac(v => SKU_PATTERN.test(v)) > 0.6) return "Code";
  return null;
}

// Best custom-field name: an embedded cell label wins; else a meaningful header;
// else a name mined from the data shape; else a cleaned header fallback.
// Returns { name, source } where source ∈ "cell" | "header" | "data" | "fallback".
function smartCustomName(header, samples) {
  const cellLabel = labelFromCellValues(samples || []);
  if (cellLabel) return { name: cellLabel, source: "cell" };
  if (!isWeakHeader(header)) return { name: cleanCustomName(header), source: "header" };
  const shape = nameFromDataShape(samples || []);
  if (shape) return { name: shape, source: "data" };
  const c = cleanCustomName(header);
  return { name: (c && !isWeakHeader(c)) ? c : (c || "Custom field"), source: "fallback" };
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

IMPORTANT — real export files are multi-row per product. Shopify and Faire spread one product across many rows: product-level columns (Title, Vendor, Body HTML) are only filled on a product's first row, variant columns (Option1 Value, Variant SKU, Variant Price) only on its variant rows, and image rows leave nearly everything blank. So a column being mostly empty is NORMAL and is NEVER a reason to reject or skip it — judge each column by its non-empty sample VALUES, which are provided for you below.

For each input header, propose the BEST matching schema field (or null if no field is a sensible match). Use:
- exact name match,
- common synonyms across platforms:
  • Shopify: Title → product_name, Vendor → brand_name, Body (HTML) → product_description, Variant SKU → sku, Variant Price → wholesale_price, Compare at price → compare_at_price, Cost per item → cost_price, Made in → country_of_origin
  • JOOR linesheets: Style Name → product_name, Style Number → style_number, Identifier → sku, Color Name → color, Fabrication → fabric/material, Sizes → size, "Wholesale Price_1" (tier index) → wholesale_price, "Suggested Retail Price" → retail_price, Linesheet Name → collection, Season Name/Code → season
  • Faire: "Product Name (English)" → product_name, "Description (English)" → product_description, Product Token → (grouping key), "Case Size" → case_pack, "Minimum Order Quantity" → minimum_order_qty, "CAD/USD Unit Wholesale Price" → wholesale_price, "Made In Country" → country_of_origin
  • Le New Black: Name → product_name, Reference → sku, "Fabric name" → fabric, "Size family" → size, "Made in" → country_of_origin, Composition → composition, "Care instruction" → care_instructions
- the column's non-empty sample values to disambiguate (e.g. "Option1 Value" with values "S, M, L" → size; "Black, White, Navy" → color),
- the column's neighbours.

For ambiguous numeric columns, prefer the more specific price field when the header hints at it ("Cost" → cost_price, "MSRP/Retail" → retail_price, "Wholesale" → wholesale_price).

Return a confidence score in [0.0, 1.0]. Use 0.95+ only when you are sure. The assignment step that runs after you ensures each target field is used at most once, so rank candidates honestly.

Respond with raw JSON only — no markdown fences, no prose:
{
  "mappings": [
    { "user_header": "<original>", "target_field": "<schema id or null>", "confidence": <0..1>, "reason": "<short why>" }
  ]
}`;

// Build a per-column payload of non-empty sample values + fill rate. This is
// what the LLM reasons over (instead of raw rows where variant columns look blank).
function buildColumnDigest(headers, rows) {
  return headers.map(h => {
    const samples = collectColumnSamples(rows, h, 8);
    const fill = columnFillRate(rows, h);
    return {
      header: h,
      fill_pct: Math.round(fill * 100),
      sample_values: samples,
    };
  });
}

async function callMappingLLM(headers, sampleRows) {
  if (!window.claude || !window.claude.complete) {
    return buildMappings(headers, sampleRows);
  }
  const systemPrompt = SYSTEM_PROMPT_BASE + "\n\nTarget Schema:\n\n" + buildSchemaPrompt();
  const digest = buildColumnDigest(headers, sampleRows);
  const userMsg = `Map these columns to our schema. Each column lists its fill rate and a sample of its NON-EMPTY values (sparse columns are variant/image columns, not empty columns).

Columns:
${digest.map(d => `- "${d.header}" (filled ${d.fill_pct}% of rows) → values: ${JSON.stringify(d.sample_values)}`).join("\n")}

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
          matrix[h][t] = matrix[h][t]
            ? { score: Math.max(matrix[h][t].score, info.score), reason: matrix[h][t].reason || info.reason }
            : info;
        }
      }
    }
    const assigned = assignUnique(matrix, headers);
    const base = headers.map(h => baseMapping(h, sampleRows, assigned));

    // Low-confidence recommendation pass — ask the LLM to read the data of any
    // sub-0.7 column and recommend a field or a custom-field name.
    const lowCols = base.filter(m => m.confidence < CONFIDENT_THRESHOLD && m.user_header.trim());
    let recMap = {};
    if (lowCols.length) {
      recMap = await recommendLowConfidenceLLM(lowCols, sampleRows);
    }

    const out = finalizeLowConfidence(base, sampleRows, recMap);
    return postProcessTransforms(out, headers, sampleRows);
  } catch (e) {
    console.warn("LLM mapping failed, using deterministic algorithm:", e);
    return buildMappings(headers, sampleRows);
  }
}

// Batched LLM recommendation for low-confidence columns. Reads each column's
// real values and returns a recommendation map keyed by header.
async function recommendLowConfidenceLLM(lowCols, rows) {
  const digest = lowCols.map(m => ({
    header: m.user_header,
    fill_pct: Math.round((m.fill_rate || 0) * 100),
    sample_values: collectColumnSamples(rows, m.user_header, 10),
  }));

  const recSystem = `You help finalize column mapping for a wholesale product importer. These columns scored LOW confidence on header text alone. Read each column's actual sample VALUES and decide the best home for it. Two options:
1. Map it to an existing NuORDER schema field if the values clearly fit one.
2. Otherwise recommend a clean, human-readable CUSTOM FIELD name (Title Case, no IDs or metafield paths) so the data is preserved, not dropped.

Never reject a column for being sparse — sparse columns are variant/image rows in a multi-row export.

Schema fields available:
${buildSchemaPrompt()}

Respond with raw JSON only:
{
  "recommendations": [
    { "header": "<original>", "decision": "field" | "custom", "target_field": "<schema id or null>", "custom_field_name": "<name or null>", "confidence": <0..1>, "reason": "<short, mentions the data>" }
  ]
}`;

  const recUser = `Columns to resolve (header, fill %, sample values):
${digest.map(d => `- "${d.header}" (${d.fill_pct}% filled): ${JSON.stringify(d.sample_values)}`).join("\n")}

Return JSON.`;

  try {
    const text = await window.claude.complete({
      messages: [{ role: "user", content: recSystem + "\n\n" + recUser }],
    });
    const cleaned = String(text).trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const json = JSON.parse(cleaned);
    if (!json.recommendations || !Array.isArray(json.recommendations)) throw new Error("malformed");
    const out = {};
    for (const r of json.recommendations) {
      if (!r.header) continue;
      const profile = describeData(collectColumnSamples(rows, r.header, 10));
      if (r.decision === "field" && r.target_field && (r.target_field in ALIAS_DICT)) {
        out[r.header] = {
          type: "field",
          target_field: r.target_field,
          confidence: Math.min(0.88, Math.max(0.6, Number(r.confidence) || 0.7)),
          profile,
          reason: r.reason || `Values match ${labelFor(r.target_field)}`,
        };
      } else {
        const fallbackName = smartCustomName(r.header, collectColumnSamples(rows, r.header, 10));
        out[r.header] = {
          type: "custom",
          custom_field_name: (r.custom_field_name && r.custom_field_name.trim()) || fallbackName.name,
          name_source: (r.custom_field_name && r.custom_field_name.trim()) ? "ai" : fallbackName.source,
          confidence: Number(r.confidence) || 0.5,
          profile,
          reason: r.reason || `Recommended as a custom field (${profile})`,
        };
      }
    }
    return out;
  } catch (e) {
    console.warn("LLM recommendation pass failed, using deterministic recommendations:", e);
    return {}; // caller falls back to recommendFromData per column
  }
}

function statusFromConfidence(c) {
  return classify(c);
}

// ─── 10. TRANSFORM POST-PROCESSING (Gap #5) ─────────────────────────────
// After mappings are built, detect Shopify option pairs (conditional routing)
// and multi-value columns (split), annotating the affected rows.
function postProcessTransforms(mappings, headers, rows) {
  const T = window.Transforms;
  if (!T) return mappings;
  const byHeader = Object.fromEntries(mappings.map(m => [m.user_header, m]));

  // Conditional option routing — "Option1 Value" routes by "Option1 Name"
  const pairs = T.detectOptionPairs(headers);
  for (const p of pairs) {
    const names = T.distinctOptionNames(rows, p.nameCol);
    const realNames = names.filter(n => !/^(title|default\s*title|default)$/i.test(String(n).trim()));
    // No real variant options (empty Option2/3, or placeholder-only) — don't route;
    // leave both columns to normal mapping (they'll resolve to skip/custom).
    if (realNames.length === 0) continue;

    const nameM = byHeader[p.nameCol];
    const valM = byHeader[p.valCol];
    if (nameM) {
      nameM.target_field = null;
      nameM.custom_field_name = null;
      nameM.status = "system";
      nameM.system_role = `Routes Option ${p.index}`;
      nameM.reason = `Used to route “${p.valCol}” to the right field`;
      nameM.confidence = 1;
      nameM.recommended_from_data = false;
    }
    if (valM) {
      const routes = {};
      for (const nm of names) routes[nm] = T.suggestOptionTarget(nm);
      valM.target_field = "__option_route__";
      valM.custom_field_name = null;
      valM.status = "option_route";
      valM.option_index = p.index;
      valM.option_name_header = p.nameCol;
      valM.option_routes = routes;
      valM.confidence = 1;
      valM.recommended_from_data = true;
      valM.reason = `Conditional — routes by “${p.nameCol}”`;
    }
  }

  // Multi-value splitting — only for array-friendly schema fields (tags, images,
  // controlled multi-value fields). Prevents shredding prose custom fields.
  const ARRAY_FRIENDLY = new Set([
    "tags", "image_url", "variant_image_url", "target_gender", "age_group", "collection",
  ]);
  for (const m of mappings) {
    if (m.status === "system" || m.target_field === "__option_route__") continue;
    if (!m.target_field || m.target_field === "__custom__") continue;
    const isMulti = T.isMultiVocab(m.target_field);
    if (!ARRAY_FRIENDLY.has(m.target_field) && !isMulti) continue;
    const samples = collectColumnSamples(rows, m.user_header, 12);
    const mv = T.detectMultiValue(samples) || (isMulti ? { delimiter: ";", label: "semicolon", avgCount: 2 } : null);
    if (mv) {
      m.transform = { type: "split", delimiter: mv.delimiter, label: mv.label, avgCount: mv.avgCount };
    }
  }

  // HTML cleanup for description fields (Shopify Body (HTML))
  for (const m of mappings) {
    if (m.target_field !== "product_description" && m.target_field !== "seo_description") continue;
    const samples = collectColumnSamples(rows, m.user_header, 8);
    if (T.looksLikeHtml(samples)) {
      m.transform = { type: "strip_html", label: "strip HTML" };
    }
  }

  // Tiered pricing collapse (JOOR Wholesale Price_1/_2; customer price_type_*_1/2)
  const tierGroups = T.detectTierGroups(headers);
  for (const g of tierGroups) {
    if (g.tiers.length < 2) continue; // single column → leave as a normal mapping
    const t1 = g.tiers[0];
    const m1 = byHeader[t1.header];
    if (m1) {
      // Make sure any OTHER tier currently holding this field releases it
      mappings.forEach(mm => {
        if (mm !== m1 && mm.target_field === g.field) {
          mm.target_field = "__custom__";
        }
      });
      m1.target_field = g.field;
      m1.custom_field_name = null;
      m1.status = "auto_confirmed";
      m1.confidence = Math.max(m1.confidence || 0, 0.95);
      m1.tier_group = g.label;
      m1.tier_index = t1.index;
      m1.reason = `${g.label} tier 1 (primary) — used for ${g.label.toLowerCase()}`;
      m1.recommended_from_data = false;
    }
    for (const t of g.tiers.slice(1)) {
      const m = byHeader[t.header];
      if (!m) continue;
      m.target_field = "__custom__";
      m.custom_field_name = `${g.label} (tier ${t.index})`;
      m.status = "custom";
      m.confidence = 1;
      m.tier_group = g.label;
      m.tier_index = t.index;
      m.reason = `Price tier ${t.index} — kept as an additional price catalog`;
      m.recommended_from_data = false;
      m.transform = null;
    }
  }
  // Final sweep: a custom field with no data carries nothing to import — skip it.
  // This enforces "empty → skip, not a custom field" regardless of which pass
  // (tier collapse, recommendation, manual default) produced the custom field.
  for (const m of mappings) {
    if (m.target_field !== "__custom__") continue;
    if (m.manual) continue; // respect an explicit user choice
    if (columnFillRate(rows, m.user_header) === 0) {
      m.target_field = null;
      m.custom_field_name = null;
      m.status = "unmapped";
      m.tier_group = null;
      m.tier_index = null;
      m.transform = null;
      m.data_profile = "empty in this file";
      m.reason = "Column is empty in every row — skipped";
    }
  }

  // Infer a typed-variant (string/number/money/date/boolean/multi-value) for
  // every custom field, so FDM fields carry a sensible type.
  for (const m of mappings) {
    if (m.target_field !== "__custom__") continue;
    if (!m.fdm_type) {
      const samples = collectColumnSamples(rows, m.user_header, 12);
      m.fdm_type = T.inferFieldType(samples);
    }
  }
  return mappings;
}
window.callMappingLLM = callMappingLLM;
window.statusFromConfidence = statusFromConfidence;
window.postProcessTransforms = postProcessTransforms;
window.buildMappingsDeterministic = buildMappings; // exposed for tests
window.CUSTOM_THRESHOLD = CUSTOM_THRESHOLD;
