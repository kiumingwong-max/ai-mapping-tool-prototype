// Column transforms + controlled vocabularies (PRD Gap Analysis #3 and #5).
//
//  Gap #5 — conditional option routing: Shopify's "Option1 Value" means
//           different things depending on "Option1 Name" (Color / Scent / Size /
//           Material …). We route each option-value to a NuO field based on the
//           row's option-name.
//  Gap #5 — multi-value splitting: comma-separated Tags, semicolon-separated
//           target gender, space-separated image URLs → split into many values.
//  Gap #3 — actionable enum errors: controlled-vocabulary fields validate against
//           an accepted list and the error message lists what's accepted.
//           Hierarchical categories ("A > B > C") are auto-flattened with a notice.

(function () {
  // ─── Controlled vocabularies ─────────────────────────────────────────
  // `accepted` = canonical values. `synonyms` map common inputs onto canon.
  // `multi` fields may carry several values (after splitting).
  const CONTROLLED_VOCAB = {
    status: {
      accepted: ["active", "draft", "archived"],
      synonyms: { published: "active", active: "active", visible: "active", draft: "draft", hidden: "draft", archived: "archived" },
    },
    target_gender: {
      accepted: ["female", "male", "unisex"],
      synonyms: { women: "female", womens: "female", woman: "female", men: "male", mens: "male", man: "male", unisex: "unisex" },
      multi: true,
    },
    age_group: {
      accepted: ["adult", "kids", "baby", "toddler", "newborn", "all ages"],
      synonyms: { adults: "adult", children: "kids", child: "kids", infant: "baby" },
    },
    weight_unit: {
      accepted: ["g", "kg", "oz", "lb"],
      synonyms: { grams: "g", gram: "g", kilograms: "kg", ounces: "oz", ounce: "oz", pounds: "lb", pound: "lb", lbs: "lb" },
    },
    size_system: {
      accepted: ["us", "eu", "uk", "intl", "alpha"],
      synonyms: { international: "intl", "one size": "alpha" },
    },
  };

  // Resolve a single value against a vocab. Returns { ok, canonical, accepted }.
  function checkVocabValue(fieldId, raw) {
    const vocab = CONTROLLED_VOCAB[fieldId];
    if (!vocab) return { ok: true };
    const v = String(raw || "").trim().toLowerCase();
    if (!v) return { ok: true }; // emptiness handled by required-field checks
    if (vocab.accepted.includes(v)) return { ok: true, canonical: v };
    if (vocab.synonyms && vocab.synonyms[v]) return { ok: true, canonical: vocab.synonyms[v], remapped: true };
    return { ok: false, accepted: vocab.accepted };
  }

  function isControlled(fieldId) { return !!CONTROLLED_VOCAB[fieldId]; }
  function acceptedValues(fieldId) { return (CONTROLLED_VOCAB[fieldId] || {}).accepted || []; }
  function isMultiVocab(fieldId) { return !!(CONTROLLED_VOCAB[fieldId] || {}).multi; }

  // ─── Option pair detection (conditional routing) ─────────────────────
  function detectOptionPairs(headers) {
    const pairs = [];
    for (const n of [1, 2, 3]) {
      const nameCol = headers.find(h => new RegExp(`^option\\s*${n}\\s*name$`, "i").test(String(h).trim()));
      const valCol = headers.find(h => new RegExp(`^option\\s*${n}\\s*value$`, "i").test(String(h).trim()));
      if (nameCol && valCol) pairs.push({ index: n, nameCol, valCol });
    }
    return pairs;
  }

  // Distinct option names actually used in the data for a given name column.
  function distinctOptionNames(rows, nameCol) {
    const set = new Map(); // lower -> original
    for (const r of rows) {
      const v = String(r[nameCol] ?? "").trim();
      if (!v) continue;
      const k = v.toLowerCase();
      if (!set.has(k)) set.set(k, v);
    }
    return [...set.values()];
  }

  function titleCase(s) {
    return String(s || "").trim().replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
  }

  // Suggest where an option name should route.
  //  → { target: fieldId }            map to a schema field
  //  → { target: "__custom__", custom } keep as a named custom field
  //  → { target: null }               skip (Shopify "Title"/"Default Title" placeholder)
  const OPTION_FIELD_MAP = {
    color: "color", colour: "color", colorway: "color", shade: "color",
    size: "size", "shoe size": "shoe_size",
    material: "material", "jewelry material": "material", fabric: "fabric",
    pattern: "pattern", fit: "fit", length: "bottom_length_type",
    neckline: "neckline", sleeve: "sleeve_length_type",
  };
  function suggestOptionTarget(optName) {
    const n = String(optName || "").trim().toLowerCase();
    if (!n || /^(title|default\s*title|default)$/.test(n)) {
      return { target: null, reason: "Shopify placeholder — single-variant product, no real option" };
    }
    if (OPTION_FIELD_MAP[n]) return { target: OPTION_FIELD_MAP[n], reason: `option "${optName}" → schema field` };
    return { target: "__custom__", custom: titleCase(optName), reason: `option "${optName}" → custom field` };
  }

  // ─── Multi-value detection ───────────────────────────────────────────
  // Returns { delimiter, label, avgCount } or null.
  function detectMultiValue(samples) {
    const clean = samples.map(s => String(s || "").trim()).filter(Boolean);
    if (clean.length < 2) return null;
    const delims = [
      { d: ";", re: /\s*;\s*/, label: "semicolon" },
      { d: ",", re: /\s*,\s*/, label: "comma" },
      { d: " ", re: /\s+/, label: "space" },
    ];
    for (const { d, re, label } of delims) {
      const multi = clean.filter(v => v.split(re).filter(Boolean).length > 1);
      if (multi.length / clean.length >= 0.4) {
        // Space delimiter only counts when values look like URLs (don't shred prose)
        if (d === " ") {
          const urlish = clean.filter(v => /https?:\/\//i.test(v)).length / clean.length;
          if (urlish < 0.5) continue;
        }
        // Comma delimiter: avoid values that are clearly sentences/HTML
        if (d === ",") {
          const proseish = clean.filter(v => v.length > 80 || /<\/?[a-z]/i.test(v)).length / clean.length;
          if (proseish > 0.3) continue;
        }
        const avgCount = Math.max(2, Math.round(
          multi.reduce((s, v) => s + v.split(re).filter(Boolean).length, 0) / multi.length
        ));
        return { delimiter: d, label, avgCount };
      }
    }
    return null;
  }

  function splitValue(raw, delimiter) {
    if (!raw) return [];
    const re = delimiter === " " ? /\s+/ : new RegExp(`\\s*${delimiter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`);
    return String(raw).split(re).map(s => s.trim()).filter(Boolean);
  }

  // ─── Category hierarchy ──────────────────────────────────────────────
  // Shopify/Google taxonomy strings: "Apparel & Accessories > Jewelry > Bracelets"
  // NuO expects a flat leaf value. Flatten to the last segment.
  function isHierarchicalCategory(raw) {
    return /\s>\s/.test(String(raw || ""));
  }
  function flattenCategory(raw) {
    const parts = String(raw || "").split(/\s>\s/).map(s => s.trim()).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : String(raw || "").trim();
  }

  // ─── HTML cleanup (Gap: Shopify Body (HTML)) ─────────────────────────
  function looksLikeHtml(samples) {
    const clean = samples.map(s => String(s || "").trim()).filter(Boolean);
    if (!clean.length) return false;
    return clean.filter(v => /<\/?[a-z][^>]*>/i.test(v)).length / clean.length >= 0.4;
  }
  function stripHtml(raw) {
    return String(raw || "")
      .replace(/<\s*(br|\/p|\/li|\/div|\/h[1-6])\s*>/gi, "\n") // block ends → newline
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, "")          // remaining tags
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
      .replace(/&#39;|&rsquo;|&lsquo;/gi, "'").replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  // ─── Tiered pricing (JOOR Wholesale Price_1/_2; customer price_type_*_1/2) ──
  // Detect families of columns that share a base name and differ only by a
  // trailing tier index. Returns [{ base, fieldHint, tiers:[{header, index}] }].
  const TIER_BASE_FIELD = [
    { re: /currency/i, field: "currency", label: "Currency" },
    { re: /price\s*type\s*label|price\s*label|\blabel\b/i, field: "price_catalog", label: "Price label" },
    { re: /wholesale/i, field: "wholesale_price", label: "Wholesale price" },
    { re: /retail|msrp|suggested\s*retail/i, field: "retail_price", label: "Retail price" },
  ];
  function detectTierGroups(headers) {
    const groups = {};
    for (const h of headers) {
      const m = String(h).match(/^(.*?)[\s_]*(\d+)\s*$/);
      if (!m) continue;
      const base = m[1].trim();
      const idx = parseInt(m[2], 10);
      if (!base || idx < 1 || idx > 20) continue;
      const def = TIER_BASE_FIELD.find(d => d.re.test(base));
      if (!def) continue; // only collapse known price/currency families
      const key = def.field + "::" + base.toLowerCase();
      (groups[key] = groups[key] || { base, field: def.field, label: def.label, tiers: [] }).tiers.push({ header: h, index: idx });
    }
    // Only keep families with a tier-1 column (so we know the primary)
    return Object.values(groups)
      .filter(g => g.tiers.length >= 1)
      .map(g => { g.tiers.sort((a, b) => a.index - b.index); return g; });
  }

  // ─── Machine-key annotation rows (Faire) ─────────────────────────────
  // A row whose cells are snake_case / lower identifiers (product_name_english,
  // info_status_v2, info_product_token) — a machine-key annotation, not data.
  function looksLikeMachineKeyRow(values) {
    const clean = values.map(v => String(v || "").trim()).filter(Boolean);
    if (clean.length < 3) return false;
    const machineish = clean.filter(v =>
      /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(v) ||   // snake_case with ≥1 underscore
      /^info_/.test(v) || /_v\d+$/.test(v)
    ).length;
    return machineish / clean.length >= 0.6;
  }

  // ─── FDM field type inference (typed custom fields) ──────────────────
  // Infer a typed-variant for a custom field from its values:
  // string | number | money | date | boolean | multi-value.
  const FDM_TYPES = ["string", "number", "money", "date", "boolean", "multi-value"];
  function inferFieldType(samples) {
    const clean = samples.map(s => String(s || "").trim()).filter(Boolean);
    if (clean.length < 1) return "string";
    const n = clean.length;
    const r = (re) => clean.filter(v => re.test(v)).length / n;
    if (detectMultiValue(clean)) return "multi-value";
    if (r(/^(true|false|yes|no|y|n|0|1)$/i) >= 0.8 && new Set(clean.map(v => v.toLowerCase())).size <= 3) return "boolean";
    if (r(/^\$?\s?\d[\d,]*\.\d{2}$/) >= 0.6) return "money";
    if (r(/^-?\d[\d,]*(\.\d+)?$/) >= 0.8) return "number";
    if (r(DATE_RE) >= 0.7) return "date";
    return "string";
  }

  window.Transforms = {
    CONTROLLED_VOCAB, checkVocabValue, isControlled, acceptedValues, isMultiVocab,
    detectOptionPairs, distinctOptionNames, suggestOptionTarget, titleCase,
    detectMultiValue, splitValue,
    isHierarchicalCategory, flattenCategory,
    looksLikeHtml, stripHtml,
    detectTierGroups,
    looksLikeMachineKeyRow,
    FDM_TYPES, inferFieldType,
  };
})();
