// Pure, view-free import validation (extracted from ValidationStep.jsx so it can
// be unit-tested and reused without React/Babel). Deterministic, all-or-nothing.
// Exposes window.validateImport(file, mappings, constants).

// ── Pure validation function ───────────────────────────────────────────
window.validateImport = function validateImport(file, mappings, constants) {
  const T = window.Transforms;
  const consts = constants || {};
  // Build a lookup: target_field -> user_header (skip custom/option/system/skipped)
  const fieldToHeader = {};
  const transformByField = {};
  mappings.forEach(m => {
    if (m.target_field && m.target_field !== "__custom__" && m.target_field !== "__option_route__") {
      fieldToHeader[m.target_field] = m.user_header;
      if (m.transform) transformByField[m.target_field] = m.transform;
    }
  });
  // Fields fed by conditional option routing (e.g. color, material) — collect which
  // (header, optionNameHeader, routes) drive them so we can resolve per-row values.
  const optionRouters = mappings.filter(m => m.target_field === "__option_route__" && m.option_routes);

  const targetLabel = id => (window.TARGET_SCHEMA.find(t => t.id === id) || {}).label || id;
  const errors = [];
  const adjustments = []; // non-blocking auto-fixes (e.g. category flattening)

  // Cross-row: build SKU index
  const skuHeader = fieldToHeader.sku;
  const skuMap = {};
  if (skuHeader) {
    file.rows.forEach((r, i) => {
      const v = String(r[skuHeader] || "").trim();
      if (!v) return;
      skuMap[v] = (skuMap[v] || []);
      skuMap[v].push(i + 2); // +2 for header row + 1-index
    });
  }
  const duplicateSkus = Object.entries(skuMap).filter(([, rows]) => rows.length > 1);

  // Per-row checks
  file.rows.forEach((r, i) => {
    const rowNum = i + 2; // human-readable row number (header is row 1)

    // Required fields
    ["product_name", "brand_name"].forEach(req => {
      const h = fieldToHeader[req];
      // Satisfied by a constant/default value (#5) or by the account context
      if (!h) {
        if (consts[req] || window.ACCOUNT_PROVIDES.includes(req)) return;
        return; // not mapped & no constant — handled by the mapping gate, not per-row
      }
      const v = String(r[h] || "").trim();
      if (!v && !consts[req]) {
        errors.push({
          row: rowNum,
          field: targetLabel(req),
          category: "Missing required",
          message: `${targetLabel(req)} is empty. Add a value before re-uploading.`,
        });
      }
    });

    // Wholesale price numeric
    const priceHeader = fieldToHeader.wholesale_price;
    if (priceHeader) {
      const raw = String(r[priceHeader] || "").trim();
      if (raw && !/^-?\d+(\.\d+)?$/.test(raw.replace(/[$,]/g, ""))) {
        errors.push({
          row: rowNum,
          field: "Wholesale price",
          category: "Invalid format",
          message: `"${raw}" is not a valid number. Enter a numeric value (e.g. 19.99).`,
        });
      } else if (raw && parseFloat(raw.replace(/[$,]/g, "")) < 0) {
        errors.push({
          row: rowNum,
          field: "Wholesale price",
          category: "Invalid format",
          message: `Wholesale price must be 0 or greater (got ${raw}).`,
        });
      }
    }

    // Controlled-vocabulary checks (Gap #3) — list accepted values in the error
    if (T) {
      for (const [fieldId, header] of Object.entries(fieldToHeader)) {
        if (!T.isControlled(fieldId)) continue;
        const raw = String(r[header] || "").trim();
        if (!raw) continue;
        const tf = transformByField[fieldId];
        const values = (T.isMultiVocab(fieldId) || tf)
          ? T.splitValue(raw, (tf && tf.delimiter) || ";")
          : [raw];
        for (const val of values) {
          const res = T.checkVocabValue(fieldId, val);
          if (!res.ok) {
            errors.push({
              row: rowNum,
              field: targetLabel(fieldId),
              category: "Invalid value",
              message: `“${val}” isn't an accepted ${targetLabel(fieldId).toLowerCase()}. Accepted values: ${res.accepted.join(", ")}.`,
            });
          }
        }
      }

      // Hierarchical category → flatten (non-blocking adjustment, Gap #3)
      const catHeader = fieldToHeader.product_category;
      if (catHeader) {
        const raw = String(r[catHeader] || "").trim();
        if (raw && T.isHierarchicalCategory(raw)) {
          adjustments.push({
            row: rowNum,
            field: "Product category",
            category: "Auto-formatted",
            message: `Flattened “${raw}” to “${T.flattenCategory(raw)}” to match NuO's flat category list.`,
          });
        }
      }
    }
  });

  // Duplicate SKUs
  duplicateSkus.forEach(([sku, rows]) => {
    rows.forEach(rowNum => {
      errors.push({
        row: rowNum,
        field: "SKU",
        category: "Duplicate values",
        message: `SKU "${sku}" appears on rows ${rows.join(", ")}. SKUs must be unique within an upload.`,
      });
    });
  });

  errors.sort((a, b) => a.row - b.row || a.field.localeCompare(b.field));
  // Enrich each error with the product key (style_number / season / color) for the
  // row, mirroring VETL's summary_log.csv (STYLE NUMBER, SEASON, COLOR, line number).
  const ERROR_TYPE = { "Missing required": "missing_required", "Invalid format": "invalid_format", "Invalid value": "invalid_value", "Duplicate values": "duplicate_key" };
  errors.forEach(e => {
    const r = file.rows[e.row - 2];
    if (r) {
      const sn = fieldToHeader.style_number && r[fieldToHeader.style_number];
      const se = (fieldToHeader.season && r[fieldToHeader.season]) || consts.season;
      const co = (fieldToHeader.color && r[fieldToHeader.color]) || consts.color;
      e.styleNumber = sn ? String(sn).trim() : "";
      e.productKey = [sn, se, co].filter(Boolean).map(x => String(x).trim()).join(" · ");
    }
    e.error_type = ERROR_TYPE[e.category] || "other";
  });
  const affected = new Set(errors.map(e => e.row)).size;
  return {
    success: errors.length === 0,
    totalRows: file.rows.length,
    errorCount: errors.length,
    affectedRows: affected,
    importRate: file.rows.length ? Math.round(((file.rows.length - affected) / file.rows.length) * 100) : 100,
    errors,
    adjustments,
    adjustmentCount: adjustments.length,
  };
};
