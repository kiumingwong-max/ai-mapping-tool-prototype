// Saved mappings (Recommendation #2).
//
// Brands upload many files of the same shape (Cami NYC ×4, Ena Pelly ×4, several
// joor_linesheets). Once a mapping is confirmed for a given file *format*, we
// remember it (keyed by a signature of the column set) and re-apply it to the
// next file of the same shape — so files 2..N skip the review work.
//
// Persisted in localStorage. Each entry: { label, savedAt, headerKeys, fields, constants }.

(function () {
  const LS_KEY = "nuo_saved_mappings_v2";

  function loadAll() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); }
    catch (e) { return {}; }
  }
  function saveAll(obj) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(obj)); } catch (e) {}
  }

  // Normalize a header for signature purposes (drop tier indices, language tags,
  // metafield path suffixes) so trivially-different exports still match.
  function normKey(h) {
    return String(h || "").toLowerCase()
      .replace(/\s*\(product\.metafields\.[^)]*\)\s*/g, "")
      .replace(/\((english|french|spanish|german|italian)\)/g, "")
      .replace(/_\d+\b/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  // A format signature: a sorted, de-duped set of normalized header keys.
  // Same column vocabulary → same key, regardless of column order or row count.
  function formatKey(file) {
    const keys = [...new Set((file.headers || []).map(normKey).filter(Boolean))].sort();
    return keys.join("|");
  }

  // Human label for a saved mapping (brand-ish from filename + platform hint).
  function labelFor(file) {
    const base = (file.filename || "").replace(/\.[^.]+$/, "");
    let platform = "";
    const k = formatKey(file);
    if (/handle\|/.test(k) || /\bvendor\b/.test(k)) platform = "Shopify";
    else if (/designer id|linesheet|joor style/.test(k)) platform = "JOOR linesheet";
    else if (/product token|product name english/.test(k)) platform = "Faire";
    else if (/fabric name|size family/.test(k)) platform = "Le New Black";
    const brand = base.replace(/[_\-]+/g, " ").replace(/\b(export|template|products?|data|sheet|linesheets?|\d{4,})\b/gi, "").trim();
    return platform ? `${platform}${brand ? " · " + brand : ""}` : (brand || base);
  }

  function load(key) {
    const all = loadAll();
    return all[key] || null;
  }

  // Persist a confirmed mapping for this format.
  function save(file, mappings, constants) {
    const all = loadAll();
    const key = formatKey(file);
    const fields = {};
    mappings.forEach(m => {
      // Never persist an empty column as a custom field — empties should skip,
      // not be resurrected as junk customs on the next file of this format.
      if (m.target_field === "__custom__" && m.fill_rate === 0) return;
      fields[m.user_header] = {
        target_field: m.target_field,
        custom_field_name: m.custom_field_name || null,
        transform: m.transform || null,
        option_routes: m.option_routes || null,
        fdm_type: m.fdm_type || null,
        status: m.status,
      };
    });
    all[key] = {
      label: labelFor(file),
      savedAt: new Date().toISOString(),
      headerCount: (file.headers || []).length,
      fields,
      constants: constants || {},
    };
    saveAll(all);
    return key;
  }

  // Apply a saved mapping onto freshly-built mappings (by header match).
  function apply(mappings, saved) {
    if (!saved || !saved.fields) return mappings;
    return mappings.map(m => {
      const s = saved.fields[m.user_header];
      if (!s) return m;
      // Don't resurrect an empty column as a custom field from a saved mapping —
      // if the column has no data in THIS file, leave it as the freshly-built
      // (skipped) mapping rather than forcing it back to a custom field.
      if (s.target_field === "__custom__" && m.fill_rate === 0) return m;
      return {
        ...m,
        target_field: s.target_field,
        custom_field_name: s.custom_field_name,
        transform: s.transform || m.transform,
        option_routes: s.option_routes || m.option_routes,
        fdm_type: s.fdm_type || m.fdm_type,
        status: s.status || m.status,
        manual: true,
        recommended_from_data: false,
        reason: "From saved mapping",
      };
    });
  }

  function forget(key) {
    const all = loadAll();
    delete all[key];
    saveAll(all);
  }

  window.SavedMappings = { formatKey, labelFor, load, save, apply, forget, loadAll };
})();
