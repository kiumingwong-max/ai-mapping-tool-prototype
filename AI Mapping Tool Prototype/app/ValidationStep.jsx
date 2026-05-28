// Step 3 — Validation. Runs deterministic row-by-row checks against the mapped data,
// renders a grouped error ledger, supports CSV download + re-upload reset.

const { useState: useStateV, useMemo: useMemoV } = React;

// ── Pure validation function ───────────────────────────────────────────
window.validateImport = function validateImport(file, mappings) {
  // Build a lookup: target_field -> user_header
  const fieldToHeader = {};
  mappings.forEach(m => {
    // Skip custom fields and skipped columns when building the schema lookup
    if (m.target_field && m.target_field !== "__custom__") {
      fieldToHeader[m.target_field] = m.user_header;
    }
  });

  const targetLabel = id => (window.TARGET_SCHEMA.find(t => t.id === id) || {}).label || id;
  const errors = [];

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
      if (!h) return;
      const v = String(r[h] || "").trim();
      if (!v) {
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
  return {
    success: errors.length === 0,
    totalRows: file.rows.length,
    errorCount: errors.length,
    affectedRows: new Set(errors.map(e => e.row)).size,
    errors,
  };
};

// ── Component ──────────────────────────────────────────────────────────
function ValidationStep({ file, mappings, result, onReupload, onBack }) {
  const [expanded, setExpanded] = useStateV({ "Missing required": true, "Invalid format": true, "Duplicate values": true });

  const grouped = useMemoV(() => {
    const g = {};
    result.errors.forEach(e => { (g[e.category] = g[e.category] || []).push(e); });
    return g;
  }, [result]);

  const categoryMeta = {
    "Missing required": { icon: "asterisk", fg: "var(--hl-no-red)", desc: "Required fields are blank for one or more rows." },
    "Invalid format":   { icon: "exclamation-triangle", fg: "#B47A00", desc: "Values don't match the expected data type." },
    "Duplicate values": { icon: "clone", fg: "var(--hl-go-blue)", desc: "Identifiers appear more than once in the file." },
  };

  const downloadCSV = () => {
    const rows = [["Row", "Field", "Category", "Message"]];
    result.errors.forEach(e => rows.push([e.row, e.field, e.category, e.message]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${file.filename.replace(/\.[^.]+$/, "")}-errors.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 32px 24px", width: "100%" }}>

        {/* Summary banner */}
        <div style={{
          background: "var(--hl-banner-error)",
          color: "#fff",
          borderRadius: 3,
          padding: "20px 24px",
          display: "flex", alignItems: "center", gap: 20, marginBottom: 24,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%",
            background: "rgba(255,255,255,0.18)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, flexShrink: 0,
          }}>
            <i className="fas fa-times"/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
              Import blocked — {result.errorCount} {result.errorCount === 1 ? "error" : "errors"} found
            </div>
            <div style={{ fontSize: 14, opacity: 0.92, lineHeight: "20px" }}>
              No rows were saved. Fix the issues below in your source file, then re-upload to continue.
            </div>
          </div>
          <Button variant="supp" onClick={downloadCSV} icon="download" style={{ background: "#fff", color: "var(--hl-no-red)" }}>
            Download error report
          </Button>
        </div>

        {/* Top stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
          <Stat label="Rows processed" value={result.totalRows} icon="list"/>
          <Stat label="Errors found" value={result.errorCount} icon="exclamation-triangle" tone="err"/>
          <Stat label="Rows affected" value={result.affectedRows} icon="layer-group" tone="warn"/>
        </div>

        {/* Error groups */}
        {Object.keys(grouped).map(cat => {
          const meta = categoryMeta[cat] || { icon: "info-circle", fg: "var(--hl-fg-2)", desc: "" };
          const errs = grouped[cat];
          const isOpen = expanded[cat] !== false;
          return (
            <div key={cat} style={{ marginBottom: 16, background: "#fff", border: "2px solid var(--hl-keyline)", borderRadius: 3, overflow: "hidden" }}>
              <button
                onClick={() => setExpanded(e => ({ ...e, [cat]: !isOpen }))}
                style={{
                  width: "100%", textAlign: "left", background: "transparent", border: 0, cursor: "pointer",
                  padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, fontFamily: "inherit",
                }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 3,
                  background: meta.fg + "15",
                  color: meta.fg,
                  display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0,
                }}>
                  <i className={`fas fa-${meta.icon}`}/>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "var(--hl-icon)" }}>
                    {cat} <span style={{ color: meta.fg }}>· {errs.length}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--hl-fg-2)", marginTop: 2 }}>{meta.desc}</div>
                </div>
                <i className={`fas fa-chevron-${isOpen ? "up" : "down"}`} style={{ color: "var(--hl-fg-3)" }}/>
              </button>
              {isOpen && (
                <div style={{ borderTop: "1px solid var(--hl-keyline)" }}>
                  <div style={{
                    display: "grid", gridTemplateColumns: "80px 160px 1fr",
                    background: "var(--hl-framing)", padding: "10px 20px",
                    fontSize: 11, fontWeight: 700, color: "var(--hl-fg-2)", letterSpacing: ".06em", textTransform: "uppercase",
                  }}>
                    <div>Row</div>
                    <div>Field</div>
                    <div>Issue</div>
                  </div>
                  {errs.map((e, i) => (
                    <div key={i} style={{
                      display: "grid", gridTemplateColumns: "80px 160px 1fr",
                      padding: "12px 20px", alignItems: "center", gap: 12,
                      borderTop: i === 0 ? 0 : "1px solid var(--hl-framing)",
                      fontSize: 14,
                    }}>
                      <div style={{ fontWeight: 700, fontFamily: "var(--hl-font-mono)", color: "var(--hl-icon)" }}>
                        Row {e.row}
                      </div>
                      <div style={{ fontWeight: 700, color: meta.fg }}>{e.field}</div>
                      <div style={{ color: "var(--hl-fg-1)", lineHeight: "20px" }}>{e.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

      </div>

      <div style={{ marginTop: "auto" }}/>
      <div style={{
        position: "sticky", bottom: 0, background: "#fff",
        borderTop: "1px solid var(--hl-keyline)",
        boxShadow: "var(--hl-shadow-action-bar)",
        padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      }}>
        <Button variant="text" icon="arrow-left" onClick={onBack}>Back to mapping</Button>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="supp" icon="download" onClick={downloadCSV}>Download report</Button>
          <Button variant="do" icon="upload" onClick={onReupload}>Re-upload corrected file</Button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, icon, tone }) {
  const toneFg = tone === "err" ? "var(--hl-no-red)" : tone === "warn" ? "#B47A00" : "var(--hl-go-blue)";
  return (
    <div style={{ background: "#fff", border: "2px solid var(--hl-keyline)", borderRadius: 3, padding: "20px 24px", display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ width: 44, height: 44, borderRadius: 3, background: toneFg + "15", color: toneFg, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
        <i className={`fas fa-${icon}`}/>
      </div>
      <div>
        <div style={{ fontSize: 32, fontWeight: 900, color: "var(--hl-icon)", lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 13, color: "var(--hl-fg-2)", marginTop: 4 }}>{label}</div>
      </div>
    </div>
  );
}

window.ValidationStep = ValidationStep;
