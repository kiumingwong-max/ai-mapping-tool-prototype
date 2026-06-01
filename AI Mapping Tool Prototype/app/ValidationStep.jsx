// Step 3 — Validation. Runs deterministic row-by-row checks against the mapped data,
// renders a grouped error ledger, supports CSV download + re-upload reset.

const { useState: useStateV, useMemo: useMemoV } = React;

// validateImport lives in app/validate.js (pure, unit-tested, loaded before this file).

// ── Component ──────────────────────────────────────────────────────────
function ValidationStep({ file, mappings, result, constants, onReupload, onBack }) {
  const [expanded, setExpanded] = useStateV({ "Missing required": true, "Invalid format": true, "Duplicate values": true });

  const grouped = useMemoV(() => {
    const g = {};
    result.errors.forEach(e => { (g[e.category] = g[e.category] || []).push(e); });
    return g;
  }, [result]);

  const categoryMeta = {
    "Missing required": { icon: "asterisk", fg: "var(--hl-no-red)", bg: "rgba(230,100,60,0.12)", desc: "Required fields are blank for one or more rows." },
    "Invalid format":   { icon: "exclamation-triangle", fg: "#B47A00", bg: "rgba(180,122,0,0.12)", desc: "Values don't match the expected data type." },
    "Invalid value":    { icon: "list-ul", fg: "#B47A00", bg: "rgba(180,122,0,0.12)", desc: "Values aren't in the accepted list for a controlled field." },
    "Duplicate values": { icon: "clone", fg: "var(--hl-go-blue)", bg: "rgba(5,141,233,0.12)", desc: "Identifiers appear more than once in the file." },
  };
  const metaFor = (cat) => categoryMeta[cat] || { icon: "circle-info", fg: "var(--hl-fg-2)", bg: "var(--hl-framing)", desc: "" };

  const downloadCSV = () => {
    const rows = [["Status", "Row", "Style Number", "Product Key", "Field", "Error Type", "Category", "Message"]];
    result.errors.forEach(e => rows.push(["ERROR", e.row, e.styleNumber || "", e.productKey || "", e.field, e.error_type || "", e.category, e.message]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${file.filename.replace(/\.[^.]+$/, "")}-summary_log.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 32px 24px", width: "100%" }}>

        {/* Summary card — actionable, with a tangible import-rate bar */}
        {(() => {
          const wouldImport = Math.max(0, result.totalRows - result.affectedRows);
          const pct = result.importRate != null ? result.importRate
            : (result.totalRows ? Math.round((wouldImport / result.totalRows) * 100) : 0);
          return (
            <div style={{ background: "#fff", border: "2px solid var(--hl-keyline)", borderLeft: "4px solid var(--hl-no-red)", borderRadius: 4, padding: "20px 24px", marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                  background: "rgba(230,100,60,0.12)", color: "var(--hl-no-red)",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 20,
                }}>
                  <i className="fas fa-circle-exclamation"/>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--hl-icon)", marginBottom: 4 }}>
                    Almost there — fix {result.errorCount} {result.errorCount === 1 ? "issue" : "issues"} to import
                  </div>
                  <div style={{ fontSize: 14, color: "var(--hl-fg-2)", lineHeight: "20px", textWrap: "pretty" }}>
                    NuORDER uses a strict all-or-nothing commit, so nothing imports until every row passes. This is a dry run — fix the issues below in your source file and re-upload.
                  </div>
                </div>
                <Button variant="supp" onClick={downloadCSV} icon="download" style={{ flexShrink: 0 }}>
                  Download report
                </Button>
              </div>

              {/* Import-rate bar */}
              <div style={{ marginTop: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--hl-icon)" }}>
                    {wouldImport.toLocaleString()} of {result.totalRows.toLocaleString()} products would import
                  </span>
                  <span style={{ fontSize: 20, fontWeight: 900, color: pct >= 90 ? "var(--hl-do-green)" : pct >= 50 ? "#B47A00" : "var(--hl-no-red)" }}>
                    {pct}%
                  </span>
                </div>
                <div style={{ height: 10, borderRadius: 999, background: "rgba(230,100,60,0.18)", overflow: "hidden", display: "flex" }}>
                  <div style={{ width: pct + "%", background: "var(--hl-do-green)", transition: "width 400ms cubic-bezier(0.2,0,0,1)" }}/>
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, color: "var(--hl-fg-3)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--hl-do-green)" }}/>
                    {wouldImport.toLocaleString()} ready
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--hl-no-red)" }}/>
                    {result.affectedRows.toLocaleString()} need fixes
                  </span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Error breakdown by category — compact pills */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          {Object.keys(grouped).map(cat => {
            const meta = metaFor(cat);
            return (
              <div key={cat} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "#fff", border: "2px solid var(--hl-keyline)", borderRadius: 3 }}>
                <i className={`fas fa-${meta.icon}`} style={{ color: meta.fg, fontSize: 13 }}/>
                <span style={{ fontWeight: 700, fontSize: 14, color: "var(--hl-icon)" }}>{grouped[cat].length}</span>
                <span style={{ fontSize: 13, color: "var(--hl-fg-2)" }}>{cat.toLowerCase()}</span>
              </div>
            );
          })}
        </div>

        {/* Error groups */}
        {Object.keys(grouped).map(cat => {
          const meta = metaFor(cat);
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
                  background: meta.bg,
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
                        {e.productKey ? <div style={{ fontSize: 10, fontWeight: 400, color: "var(--hl-fg-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 72 }} title={e.productKey}>{e.productKey}</div> : null}
                      </div>
                      <div>
                        <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, background: meta.bg, color: meta.fg, fontWeight: 700, fontSize: 12 }}>{e.field}</span>
                      </div>
                      <div style={{ color: "var(--hl-fg-1)", lineHeight: "20px", textWrap: "pretty" }}>{e.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Non-blocking auto-format adjustments (Gap #3 — category flattening etc.) */}
        {result.adjustmentCount > 0 && (
          <div style={{ background: "rgba(5,141,233,0.05)", border: "1px solid rgba(5,141,233,0.25)", borderRadius: 3, padding: "14px 18px", marginTop: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 700, color: "var(--hl-icon)", marginBottom: 6 }}>
              <i className="fas fa-wand-magic-sparkles" style={{ color: "var(--hl-go-blue)" }}/>
              {result.adjustmentCount} value{result.adjustmentCount === 1 ? "" : "s"} we'll auto-format on import
            </div>
            <div style={{ fontSize: 13, color: "var(--hl-fg-2)", lineHeight: "18px" }}>
              These don't block the import — we'll fix them automatically. e.g. {result.adjustments[0].message}
            </div>
          </div>
        )}

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

window.ValidationStep = ValidationStep;
