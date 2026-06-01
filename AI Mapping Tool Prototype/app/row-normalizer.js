// Multi-row product normalizer (PRD Gap Analysis #1).
//
// Real Shopify / Faire exports are multi-row per product:
//   • Row 1 of a product group  → full product info + first variant
//   • Subsequent variant rows   → only variant fields filled, product fields blank
//   • Additional image rows      → everything blank except the group key + Image Src/Position
//
// The flat row-per-entity assumption breaks on these files: variant and image
// rows look like products with "missing required fields". This pass:
//   1. Detects the product grouping key (Handle, Product Token, …)
//   2. Groups consecutive rows by that key
//   3. Forward-fills product-level fields from the parent row down into its
//      variant rows (so they're complete records, not half-blank rows)
//   4. Sets aside additional-image rows (folded into the parent's image set)
//
// Output: a normalized table where every retained row is a complete product or
// variant, plus a `structure` summary describing what was detected.

(function () {
  // Columns that, when present, are variant-defining (a row with any of these
  // populated is a real variant, not just an image row).
  const VARIANT_DEF_COLS = [
    "Option1 Value", "Option2 Value", "Option3 Value",
    "Variant SKU", "Variant Price", "Variant Barcode",
    "Variant Grams", "Cost per item", "Variant Compare At Price",
  ];
  // Image-level columns — never forward-filled (each row keeps its own image).
  const IMAGE_RE = /^(image (src|position|alt)|variant image)/i;

  function detectGroupKey(headers) {
    const lower = headers.map(h => String(h).toLowerCase().trim());
    const candidates = [
      "handle", "product handle",
      "product token", "product id", "product_id",
      "style number", "style", "group id", "parent sku",
    ];
    for (const c of candidates) {
      const i = lower.indexOf(c);
      if (i >= 0) return headers[i];
    }
    return null;
  }

  function detectTitleCol(headers) {
    return headers.find(h => /^(title|product name|name|article title|product title)$/i.test(String(h).trim())) || null;
  }

  const isBlank = v => !String(v ?? "").trim();

  function normalizeMultiRow(table) {
    const { headers, rows } = table;
    const groupKey = detectGroupKey(headers);
    const titleCol = detectTitleCol(headers);
    const imageCols = headers.filter(h => IMAGE_RE.test(String(h)));
    const imageColSet = new Set(imageCols);
    const variantCols = VARIANT_DEF_COLS.filter(c => headers.includes(c));

    // Without a grouping key we can't safely normalize — pass through untouched.
    if (!groupKey || rows.length === 0) {
      return { ...table, structure: { detected: false } };
    }

    // Is this actually a multi-row file? Heuristic: at least one group key value
    // repeats on consecutive rows, OR some non-first rows have a blank title.
    const keyCounts = {};
    rows.forEach(r => { const k = String(r[groupKey] ?? "").trim(); if (k) keyCounts[k] = (keyCounts[k] || 0) + 1; });
    const anyRepeat = Object.values(keyCounts).some(c => c > 1);
    if (!anyRepeat) {
      return { ...table, structure: { detected: false, groupKey } };
    }

    // Group consecutive rows by key
    const groups = [];
    let cur = null;
    for (const row of rows) {
      const k = String(row[groupKey] ?? "").trim();
      if (!cur || cur.key !== k) { cur = { key: k, rows: [] }; groups.push(cur); }
      cur.rows.push(row);
    }

    let productCount = 0, variantCount = 0, imageRowCount = 0, filledCells = 0, imagesAttached = 0;
    const outRows = [];

    for (const g of groups) {
      const parent = g.rows[0];
      const imagesForGroup = [];
      const kept = [];

      // Parent's own primary image (Image Src / first image col)
      const primaryImgCol = imageCols.find(c => /image src/i.test(c)) || imageCols[0];
      if (primaryImgCol) {
        const ps = String(parent[primaryImgCol] ?? "").trim();
        if (ps) imagesForGroup.push(ps);
      }

      for (let i = 0; i < g.rows.length; i++) {
        const row = g.rows[i];
        const isParent = i === 0;
        const hasTitle = titleCol ? !isBlank(row[titleCol]) : false;
        const hasVariant = variantCols.some(c => !isBlank(row[c]));
        const hasImage = imageCols.some(c => !isBlank(row[c]));

        // Additional image row: not the parent, no title, no variant data, just an image
        if (!isParent && !hasTitle && !hasVariant && hasImage) {
          imageRowCount++;
          const src = row["Image Src"];
          if (src && !isBlank(src)) imagesForGroup.push(String(src).trim());
          continue; // fold into parent, drop from importable rows
        }

        if (isParent) {
          kept.push({ ...row, __row_role: "product" });
        } else {
          // Variant row — forward-fill blank product-level cells from the parent
          const filled = { ...row };
          for (const h of headers) {
            if (imageColSet.has(h)) continue;          // images stay variant-specific
            if (isBlank(filled[h]) && !isBlank(parent[h])) {
              filled[h] = parent[h];
              filledCells++;
            }
          }
          filled.__row_role = "variant";
          kept.push(filled);
          variantCount++;
        }
      }

      // Attach the aggregated image gallery to the parent product
      if (kept.length && imagesForGroup.length) {
        kept[0].__extra_images = Math.max(0, imagesForGroup.length - 1);
        kept[0].__image_urls = imagesForGroup.slice(0, 12);
        imagesAttached += imagesForGroup.length;
      }
      if (kept.length) productCount++;
      outRows.push(...kept);
    }

    return {
      ...table,
      rows: outRows,
      structure: {
        detected: true,
        groupKey,
        titleCol,
        productCount,
        variantCount,
        imageRowCount,
        imagesAttached,
        filledCells,
        originalRowCount: rows.length,
        keptRowCount: outRows.length,
      },
    };
  }

  window.normalizeMultiRow = normalizeMultiRow;
  window.detectGroupKey = detectGroupKey;

  // Join a supplementary table (e.g. Le New Black pricesheet) onto the product
  // table by a shared key column (#6). New columns from the price table are added
  // to each matching product row; the key column itself isn't duplicated.
  window.joinTables = function joinTables(productTable, priceTable, key) {
    if (!productTable || !priceTable || !key) return productTable;
    if (!productTable.headers.includes(key) || !priceTable.headers.includes(key)) return productTable;
    // Build price lookup by key value
    const priceByKey = {};
    for (const r of priceTable.rows) {
      const k = String(r[key] ?? "").trim();
      if (k && !priceByKey[k]) priceByKey[k] = r;
    }
    // Columns to bring over (everything except the shared key + columns already present)
    const newCols = priceTable.headers.filter(h => h !== key && !productTable.headers.includes(h));
    let joined = 0;
    const rows = productTable.rows.map(row => {
      const k = String(row[key] ?? "").trim();
      const match = priceByKey[k];
      const out = { ...row };
      for (const c of newCols) out[c] = match ? (match[c] ?? "") : "";
      if (match) joined++;
      return out;
    });
    return {
      ...productTable,
      headers: [...productTable.headers, ...newCols],
      rows,
      join: { from: priceTable.filename, key, addedColumns: newCols.length, matchedRows: joined },
    };
  };
})();
