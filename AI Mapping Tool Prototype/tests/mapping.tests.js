// Unit tests for the NuORDER mapping engine. Runs against the real, unmodified
// app/ modules (samples.js, transforms.js, file-parser.js, row-normalizer.js,
// ai-mapping.js) — these are the regression cases that guard the scoring,
// uniqueness, custom-field naming, empty-skip, transforms, and multi-row passes.

// Helpers ────────────────────────────────────────────────────────────────
const col = (header, values) => ({ headers: [header], rows: values.map(v => ({ [header]: v })) });
const map1 = (header, values) => window.buildMappingsDeterministic([header], values.map(v => ({ [header]: v })))[0];
const target = (m) => m.target_field === "__custom__" ? `custom:${m.custom_field_name}` : (m.target_field || "skip");
const summarize = (mappings) => mappings.reduce((s, x) => {
  const k = x.target_field === "__custom__" ? "custom"
    : x.target_field === null ? "skipped"
    : x.target_field === "__option_route__" ? "option"
    : x.status;
  s[k] = (s[k] || 0) + 1; return s;
}, {});

// ── Header → field mapping ────────────────────────────────────────────────
describe("Header mapping (exact + synonym + fuzzy)", () => {
  test("exact Shopify headers map to their fields", () => {
    const m = window.buildMappingsDeterministic(
      ["Title", "Vendor", "Variant SKU", "Variant Price"],
      [{ Title: "Tee", Vendor: "Acme", "Variant SKU": "AC-1", "Variant Price": "20.00" }]
    );
    const by = Object.fromEntries(m.map(x => [x.user_header, x.target_field]));
    expect(by["Title"]).toBe("product_name");
    expect(by["Vendor"]).toBe("brand_name");
    expect(by["Variant SKU"]).toBe("sku");
    expect(by["Variant Price"]).toBe("wholesale_price");
  });

  test("'Variant Image' maps to variant_image_url, not generic image_url", () => {
    expect(map1("Variant Image", ["https://x/a.jpg", "https://x/b.jpg"]).target_field).toBe("variant_image_url");
  });

  test("pricing family disambiguates by keyword", () => {
    const m = window.buildMappingsDeterministic(
      ["Wholesale Price", "Retail Price", "Cost per item"],
      [{ "Wholesale Price": "20.00", "Retail Price": "50.00", "Cost per item": "8.00" }]
    );
    const by = Object.fromEntries(m.map(x => [x.user_header, x.target_field]));
    expect(by["Wholesale Price"]).toBe("wholesale_price");
    expect(by["Retail Price"]).toBe("retail_price");
    expect(by["Cost per item"]).toBe("cost_price");
  });

  test("word-boundary containment: 'Meaning' does NOT match barcode 'ean'", () => {
    const m = map1("Meaning", ["A short phrase", "Another phrase here"]);
    expect(m.target_field === "barcode").toBe(false);
  });
});

// ── Unique assignment ──────────────────────────────────────────────────────
describe("Unique mapping rule", () => {
  test("no NuORDER field is claimed by two columns", () => {
    const m = window.buildMappingsDeterministic(
      ["Title", "Product Name", "Name"],
      [{ Title: "A", "Product Name": "A", Name: "A" }]
    );
    const used = m.filter(x => x.target_field && x.target_field !== "__custom__" && x.target_field !== "__option_route__")
                  .map(x => x.target_field);
    expect(used.length).toBe(new Set(used).size);
  });
});

// ── Custom-field naming (data-driven) ──────────────────────────────────────
describe("Custom-field naming", () => {
  test("weak header named from data shape", () => {
    expect(target(map1("12", ["Cotton", "Linen", "Wool blend"]))).toBe("custom:Material");
    expect(target(map1("Column1", ["FR", "IT", "PT", "CN"]))).toBe("custom:Country");
    expect(target(map1("  ", ["12.00", "8.50", "120.00"]))).toBe("custom:Price");
  });
  test("embedded cell label wins", () => {
    const m = map1("misc", ["Material: Cotton", "Material: Linen", "Material: Silk"]);
    expect(target(m)).toBe("custom:Material");
    expect(m.name_source).toBe("cell");
  });
  test("meaningful header is kept (not coerced from data)", () => {
    const m = map1("Notes", ["Soft hand feel for the summer season", "Great summer layering season"]);
    expect(target(m)).toBe("custom:Notes");
    expect(m.target_field === "season").toBe(false);
  });
});

// ── Empty-column skip ───────────────────────────────────────────────────────
describe("Empty columns skip (no junk custom fields)", () => {
  test("empty unnamed column is skipped", () => {
    expect(map1("(unnamed 9)", ["", "", ""]).target_field).toBeNull();
  });
  test("empty named column is skipped, not kept as custom", () => {
    const m = map1("Extra Notes", ["", "", ""]);
    expect(m.target_field).toBeNull();
    expect(m.status).toBe("unmapped");
  });
});

// ── Transforms ──────────────────────────────────────────────────────────────
describe("Transforms", () => {
  test("tiered pricing collapses: tier 1 → field, tier 2 → custom", () => {
    const headers = ["Style Number", "Name", "Wholesale Price_1", "Wholesale Currency_1", "Wholesale Price_2"];
    const rows = [{ "Style Number": "A1", Name: "Tee", "Wholesale Price_1": "20", "Wholesale Currency_1": "USD", "Wholesale Price_2": "18" }];
    const m = window.buildMappingsDeterministic(headers, rows);
    const by = Object.fromEntries(m.map(x => [x.user_header, x]));
    expect(by["Wholesale Price_1"].target_field).toBe("wholesale_price");
    expect(by["Wholesale Currency_1"].target_field).toBe("currency");
    expect(by["Wholesale Price_2"].target_field).toBe("__custom__");
  });

  test("multi-value Tags column gets a split transform", () => {
    const m = map1("Tags", ["red, summer, sale", "blue, winter", "green, sale, new"]);
    expect(m.transform && m.transform.type).toBe("split");
  });

  test("FDM type inference covers the six variants", () => {
    const T = window.Transforms;
    expect(T.inferFieldType(["$12.00", "$8.50"])).toBe("money");
    expect(T.inferFieldType(["12", "8", "120"])).toBe("number");
    expect(T.inferFieldType(["true", "false"])).toBe("boolean");
    expect(T.inferFieldType(["2026-01-02", "2026-03-15"])).toBe("date");
    expect(T.inferFieldType(["red, blue", "green, black"])).toBe("multi-value");
    expect(T.inferFieldType(["Soft cotton tee", "Linen shirt"])).toBe("string");
  });

  test("controlled-vocab enum check lists accepted values", () => {
    const T = window.Transforms;
    const ok = T.checkVocabValue("status", "active");
    const bad = T.checkVocabValue("status", "unlisted");
    expect(ok.ok).toBe(true);
    expect(bad.ok).toBe(false);
    expect(bad.accepted.join(",")).toContain("active");
  });

  test("hierarchical category flattens to leaf", () => {
    const T = window.Transforms;
    expect(T.isHierarchicalCategory("Apparel & Accessories > Jewelry > Bracelets")).toBe(true);
    expect(T.flattenCategory("Apparel & Accessories > Jewelry > Bracelets")).toBe("Bracelets");
  });
});

// ── File parsing + normalizer ──────────────────────────────────────────────
describe("Parsing & multi-row normalization", () => {
  test("csvToGrid handles quoted fields with commas", () => {
    const { rows } = window.csvToGrid('a,b\n"x,y",z');
    expect(rows[0].a).toBe("x,y");
    expect(rows[0].b).toBe("z");
  });

  test("normalizeMultiRow forward-fills variants and folds image rows", () => {
    const headers = ["Handle", "Title", "Option1 Value", "Image Src"];
    const rows = [
      { Handle: "p1", Title: "Tee", "Option1 Value": "S", "Image Src": "a.jpg" },
      { Handle: "p1", Title: "",    "Option1 Value": "M", "Image Src": "" },
      { Handle: "p1", Title: "",    "Option1 Value": "",  "Image Src": "b.jpg" },
    ];
    const norm = window.normalizeMultiRow({ filename: "t.csv", headers, rows });
    expect(norm.structure.detected).toBe(true);
    // image-only row folded away: 1 product + 1 variant kept
    expect(norm.rows.length).toBe(2);
    // variant row inherits the parent Title
    expect(norm.rows[1].Title).toBe("Tee");
  });
});

// ── Validation ──────────────────────────────────────────────────────────────
describe("Validation (strict commit)", () => {
  test("duplicate SKUs and bad price are flagged; import rate reported", () => {
    const file = {
      filename: "v.csv",
      headers: ["SKU", "Product Name", "Brand", "Wholesale Price"],
      rows: [
        { SKU: "A", "Product Name": "Tee", Brand: "X", "Wholesale Price": "20" },
        { SKU: "A", "Product Name": "Tee", Brand: "X", "Wholesale Price": "20" },   // dup SKU
        { SKU: "B", "Product Name": "Cap", Brand: "X", "Wholesale Price": "ABC" },  // bad price
      ],
    };
    const mappings = [
      { user_header: "SKU", target_field: "sku" },
      { user_header: "Product Name", target_field: "product_name" },
      { user_header: "Brand", target_field: "brand_name" },
      { user_header: "Wholesale Price", target_field: "wholesale_price" },
    ];
    const res = window.validateImport(file, mappings, {});
    expect(res.success).toBe(false);
    expect(res.errorCount).toBeGreaterThan(0);
    expect(res.importRate).toBeLessThan(100);
    const cats = res.errors.map(e => e.category);
    expect(cats).toContain("Duplicate values");
    expect(cats).toContain("Invalid format");
  });
});

// ── Real-file regression ────────────────────────────────────────────────────
describe("Real-file regression (xo_maria_multirow.csv)", () => {
  test("summary is stable: 23 auto / 19 custom / 28 skipped / 1 option / 4 recommended", async () => {
    const resp = await fetch("../uploads/xo_maria_multirow.csv");
    const text = await resp.text();
    const { headers, rows } = window.csvToGrid(text);
    const norm = window.normalizeMultiRow({ filename: "xo.csv", headers, rows });
    const m = window.buildMappingsDeterministic(norm.headers, norm.rows);
    expect(summarize(m)).toEqual({ auto_confirmed: 23, custom: 19, skipped: 28, option: 1, recommended: 4 });
  });
});
