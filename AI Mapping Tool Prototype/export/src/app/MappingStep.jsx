// Step 2 — Mapping review.
//
// Each mapping row carries:
//   { user_header, target_field, custom_field_name, confidence, reason, status, manual }
// where target_field is one of:
//   - a schema field id  (e.g. "product_name")
//   - "__custom__"       (user keeps the column as a custom field with its own name)
//   - null               (skipped — not imported)

const { useState: useStateM, useEffect: useEffectM, useMemo: useMemoM, useRef: useRefM } = React;

const CUSTOM_VALUE = "__custom__";

function MappingStep({ file, onConfirm, onBack }) {
  const [mappings, setMappings] = useStateM(null);
  const [loading, setLoading] = useStateM(true);
  const [error, setError] = useStateM(null);

  useEffectM(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const raw = await window.callMappingLLM(file.headers, file.rows);
        if (cancelled) return;
        const byHeader = Object.fromEntries(raw.map(m => [m.user_header, m]));
        const normalized = file.headers.map(h => {
          const m = byHeader[h] || { user_header: h };
          return {
            user_header: h,
            target_field: m.target_field ?? null,
            custom_field_name: m.custom_field_name ?? null,
            confidence: Number(m.confidence) || 0,
            reason: m.reason || "",
            status: m.status || window.statusFromConfidence(Number(m.confidence) || 0),
            manual: false,
          };
        });
        setMappings(normalized);
      } catch (e) {
        setError("We couldn't reach the mapping service. Try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [file]);

  // Set a row's target. Special values:
  //  ""            → skip column
  //  "__custom__"  → keep as custom field (use header as default name)
  //  "<field_id>"  → map to schema field
  const setTarget = (header, value) => {
    setMappings(curr => curr.map(m => {
      if (m.user_header !== header) return m;
      if (value === "") {
        return { ...m, target_field: null, custom_field_name: null, status: "unmapped", manual: true, confidence: 0 };
      }
      if (value === CUSTOM_VALUE) {
        return {
          ...m, target_field: CUSTOM_VALUE,
          custom_field_name: m.custom_field_name || m.user_header,
          status: "custom", manual: true, confidence: 1,
        };
      }
      return { ...m, target_field: value, custom_field_name: null, status: "auto_confirmed", manual: true, confidence: 1 };
    }));
  };

  const setCustomName = (header, name) => {
    setMappings(curr => curr.map(m =>
      m.user_header === header ? { ...m, custom_field_name: name } : m
    ));
  };

  const usedTargets = useMemoM(() => {
    if (!mappings) return {};
    const m = {};
    mappings.forEach(x => {
      if (x.target_field && x.target_field !== CUSTOM_VALUE) {
        m[x.target_field] = (m[x.target_field] || 0) + 1;
      }
    });
    return m;
  }, [mappings]);

  const customFieldNamesLower = useMemoM(() => {
    if (!mappings) return [];
    return mappings
      .filter(m => m.target_field === CUSTOM_VALUE && m.custom_field_name)
      .map(m => m.custom_field_name.trim().toLowerCase());
  }, [mappings]);

  const requiredUnmapped = useMemoM(() => {
    if (!mappings) return [];
    const mapped = new Set(mappings.map(m => m.target_field).filter(Boolean));
    return window.TARGET_SCHEMA.filter(f => f.required && !mapped.has(f.id));
  }, [mappings]);

  const counts = useMemoM(() => {
    if (!mappings) return { auto: 0, rec: 0, low: 0, un: 0, custom: 0 };
    return {
      auto:   mappings.filter(m => m.status === "auto_confirmed").length,
      rec:    mappings.filter(m => m.status === "recommended").length,
      low:    mappings.filter(m => m.status === "low_confidence").length,
      un:     mappings.filter(m => m.status === "unmapped").length,
      custom: mappings.filter(m => m.status === "custom" || m.target_field === CUSTOM_VALUE).length,
    };
  }, [mappings]);

  if (loading) return <MappingSkeleton file={file}/>;

  if (error) {
    return (
      <div style={{ padding: 80, textAlign: "center" }}>
        <i className="fas fa-exclamation-triangle" style={{ fontSize: 32, color: "var(--hl-no-red)", marginBottom: 16, display: "block" }}/>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>{error}</div>
        <Button variant="supp" onClick={onBack}>Go back</Button>
      </div>
    );
  }

  // Find duplicate custom names (case-insensitive)
  const dupCustoms = new Set();
  const seen = {};
  mappings.forEach(m => {
    if (m.target_field === CUSTOM_VALUE && m.custom_field_name) {
      const k = m.custom_field_name.trim().toLowerCase();
      if (!k) return;
      if (seen[k]) dupCustoms.add(k);
      seen[k] = true;
    }
  });
  const customNamesValid = mappings.every(m =>
    m.target_field !== CUSTOM_VALUE
    || (m.custom_field_name && m.custom_field_name.trim() && !dupCustoms.has(m.custom_field_name.trim().toLowerCase()))
  );

  const canProceed = requiredUnmapped.length === 0 && customNamesValid;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 32px 24px", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 32, marginBottom: 24 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "var(--hl-icon)" }}>Review column mappings</h2>
            <p style={{ marginTop: 8, marginBottom: 0, color: "var(--hl-fg-2)", fontSize: 15, lineHeight: "22px" }}>
              We matched your file's columns to NuO's product schema, aligned with the Shopify Standard Product Taxonomy ({window.TARGET_SCHEMA.length} fields across {window.TARGET_SCHEMA_GROUPS.length} groups). Each NuO field can only be mapped once. Columns we can't match confidently are kept as custom fields so nothing is lost.
            </p>
          </div>
          <FileMeta file={file}/>
        </div>

        {/* Summary chips */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {counts.auto    > 0 && <SummaryChip tone="success" icon="check"                label={`${counts.auto} auto-confirmed`}/>}
          {counts.rec     > 0 && <SummaryChip tone="warn"    icon="exclamation-circle"   label={`${counts.rec} need review`}/>}
          {counts.low     > 0 && <SummaryChip tone="warn"    icon="search"               label={`${counts.low} low confidence`}/>}
          {counts.custom  > 0 && <SummaryChip tone="info"    icon="plus-circle"          label={`${counts.custom} custom field${counts.custom === 1 ? "" : "s"}`}/>}
          {counts.un      > 0 && <SummaryChip tone="err"     icon="times-circle"         label={`${counts.un} skipped`}/>}
        </div>

        {requiredUnmapped.length > 0 && (
          <div style={{
            padding: "12px 16px", borderRadius: 3,
            background: "rgba(187,42,26,0.08)", color: "var(--hl-no-red)",
            display: "flex", alignItems: "center", gap: 12, fontSize: 14, marginBottom: 16
          }}>
            <i className="fas fa-exclamation-triangle"/>
            <div>
              <span style={{ fontWeight: 700 }}>Required fields are not mapped: </span>
              {requiredUnmapped.map(f => f.label).join(", ")}. Map them in the table below to continue.
            </div>
          </div>
        )}

        {!customNamesValid && (
          <div style={{
            padding: "12px 16px", borderRadius: 3,
            background: "rgba(187,42,26,0.08)", color: "var(--hl-no-red)",
            display: "flex", alignItems: "center", gap: 12, fontSize: 14, marginBottom: 16
          }}>
            <i className="fas fa-exclamation-triangle"/>
            <div><span style={{ fontWeight: 700 }}>Custom field names must be unique and not empty.</span></div>
          </div>
        )}

        {/* Mapping table */}
        <div style={{ background: "#fff", border: "2px solid var(--hl-keyline)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 32px 1fr 140px",
            padding: "12px 20px", background: "var(--hl-framing)",
            fontWeight: 700, fontSize: 12, color: "var(--hl-fg-2)", letterSpacing: ".04em", textTransform: "uppercase"
          }}>
            <div>Your file</div>
            <div/>
            <div>NuORDER field</div>
            <div style={{ textAlign: "right" }}>Confidence</div>
          </div>
          {mappings.map(m => (
            <MappingRow
              key={m.user_header}
              row={m}
              sample={file.rows.slice(0, 2).map(r => r[m.user_header]).filter(Boolean)}
              usedTargets={usedTargets}
              isDupCustom={m.target_field === CUSTOM_VALUE && m.custom_field_name && dupCustoms.has(m.custom_field_name.trim().toLowerCase())}
              onTargetChange={(v) => setTarget(m.user_header, v)}
              onCustomNameChange={(n) => setCustomName(m.user_header, n)}
            />
          ))}
        </div>

        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10, color: "var(--hl-fg-2)", fontSize: 13 }}>
          <i className="fas fa-bookmark" style={{ color: "var(--hl-go-blue)" }}/>
          We'll save this mapping for {extractBrandName(file)} so the next upload skips review.
        </div>
      </div>

      {/* Sticky action bar */}
      <div style={{ marginTop: "auto" }}/>
      <div style={{
        position: "sticky", bottom: 0, background: "#fff",
        borderTop: "1px solid var(--hl-keyline)",
        boxShadow: "var(--hl-shadow-action-bar)",
        padding: "14px 32px", display: "flex", alignItems: "center", gap: 12,
        justifyContent: "space-between", zIndex: 2
      }}>
        <Button variant="text" icon="arrow-left" onClick={onBack}>Back to upload</Button>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {!canProceed && (
            <span style={{ fontSize: 13, color: "var(--hl-fg-3)" }}>
              {requiredUnmapped.length > 0 ? "Map all required fields to continue" : "Fix custom field names to continue"}
            </span>
          )}
          <Button variant="do" disabled={!canProceed} onClick={() => onConfirm(mappings)}>
            Validate and continue
            <i className="fas fa-arrow-right" style={{ marginLeft: 4 }}/>
          </Button>
        </div>
      </div>
    </div>
  );
}

function extractBrandName(file) {
  // Heuristic: pull the first "word block" from the filename
  const base = (file.filename || "").replace(/\.[^.]+$/, "");
  const cleaned = base.replace(/[_\-]/g, " ").replace(/\b(template|export|catalog|products?|data|sheet)\b/gi, "").trim();
  return cleaned.split(/\s+/).slice(0, 3).join(" ") || "this brand";
}

// ─── Status palette ────────────────────────────────────────────────────

const STATUS_TONES = {
  auto_confirmed: { fg: "var(--hl-do-green)",     bg: "rgba(65,175,75,0.06)",  icon: "check-circle",       label: "Auto-confirmed" },
  recommended:    { fg: "#B47A00",                bg: "rgba(250,199,55,0.10)", icon: "exclamation-circle", label: "Recommended"    },
  low_confidence: { fg: "#B47A00",                bg: "rgba(250,199,55,0.08)", icon: "search",             label: "Low confidence" },
  custom:         { fg: "var(--hl-go-blue)",      bg: "rgba(5,141,233,0.05)",  icon: "plus-circle",        label: "Custom field"   },
  unmapped:       { fg: "var(--hl-fg-3)",         bg: "var(--hl-framing)",     icon: "minus-circle",       label: "Skipped"        },
};

// ─── Mapping row ───────────────────────────────────────────────────────

function MappingRow({ row, sample, usedTargets, isDupCustom, onTargetChange, onCustomNameChange }) {
  const t = STATUS_TONES[row.status] || STATUS_TONES.unmapped;
  const isCustom = row.target_field === CUSTOM_VALUE;
  const target = isCustom ? null : window.TARGET_SCHEMA.find(t => t.id === row.target_field);
  const pct = Math.round((row.manual ? 1 : row.confidence) * 100);

  return (
    <div style={{
      borderTop: "1px solid var(--hl-keyline)",
      borderLeft: `4px solid ${t.fg}`,
      background: t.bg,
      padding: "16px 20px",
      display: "grid", gridTemplateColumns: "1fr 32px 1fr 140px",
      alignItems: "center", gap: 12,
    }}>
      {/* User header + sample */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <i className={`fas fa-${t.icon}`} style={{ color: t.fg, fontSize: 14 }}/>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--hl-icon)" }}>{row.user_header}</div>
        </div>
        {sample.length > 0 && (
          <div style={{ marginTop: 4, marginLeft: 22, fontSize: 12, color: "var(--hl-fg-3)" }}>
            e.g. {sample.slice(0, 2).map(s => `"${String(s).slice(0, 60)}"`).join(", ")}
          </div>
        )}
      </div>

      {/* Arrow */}
      <div style={{ color: "var(--hl-fg-3)", textAlign: "center" }}>
        <i className="fas fa-arrow-right"/>
      </div>

      {/* Target picker + custom name input + metadata */}
      <div>
        <TargetSelect
          value={row.target_field || ""}
          usedTargets={usedTargets}
          onChange={onTargetChange}
          status={row.status}
        />

        {isCustom && (
          <div style={{ marginTop: 8 }}>
            <CustomNameInput
              value={row.custom_field_name || ""}
              hasError={isDupCustom || !((row.custom_field_name || "").trim())}
              onChange={onCustomNameChange}
            />
            {isDupCustom && (
              <div style={{ fontSize: 11, color: "var(--hl-no-red)", fontWeight: 700, marginTop: 4 }}>
                <i className="fas fa-exclamation-triangle" style={{ marginRight: 4 }}/>
                Another custom field is using this name.
              </div>
            )}
            {!(row.custom_field_name || "").trim() && !isDupCustom && (
              <div style={{ fontSize: 11, color: "var(--hl-no-red)", fontWeight: 700, marginTop: 4 }}>
                Custom field name can't be empty.
              </div>
            )}
          </div>
        )}

        {target && (
          <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "1px 6px", borderRadius: 999,
              background: "var(--hl-framing)", color: "var(--hl-fg-2)", fontWeight: 700,
            }}>
              <i className={`fas fa-${(window.TARGET_SCHEMA_GROUPS.find(g => g.id === target.group) || {}).icon || "folder"}`} style={{ fontSize: 9 }}/>
              {target.groupLabel}
            </span>
            {target.hint && <span style={{ color: "var(--hl-fg-3)" }}>{target.hint}</span>}
          </div>
        )}

        {row.reason && row.status !== "unmapped" && (
          <div style={{ marginTop: 4, fontSize: 11, color: "var(--hl-fg-3)" }}>
            {row.manual ? "Manually set" : row.reason}
          </div>
        )}
      </div>

      {/* Confidence */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
          {row.status === "custom" ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: t.fg }}>
              <i className="fas fa-plus"/>Custom
            </span>
          ) : (
            <>
              <div style={{ width: 60, height: 6, background: "var(--hl-framing)", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ width: pct + "%", height: "100%", background: t.fg, transition: "width 300ms" }}/>
              </div>
              <span style={{ fontWeight: 700, fontSize: 13, color: t.fg, minWidth: 40, textAlign: "right" }}>
                {row.manual ? "Manual" : (pct + "%")}
              </span>
            </>
          )}
        </div>
        <div style={{ marginTop: 4, fontSize: 11, color: "var(--hl-fg-3)", textAlign: "right" }}>{t.label}</div>
      </div>
    </div>
  );
}

// ─── Target select ─────────────────────────────────────────────────────

function TargetSelect({ value, usedTargets, onChange, status }) {
  const borderColor = status === "auto_confirmed" ? "var(--hl-do-green)" :
                      (status === "recommended" || status === "low_confidence") ? "#B47A00" :
                      status === "custom" ? "var(--hl-go-blue)" :
                      status === "unmapped" ? "var(--hl-keyline)" :
                      "var(--hl-keyline)";
  return (
    <div style={{ position: "relative" }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: "100%", height: 40,
          borderRadius: 3, border: `2px solid ${borderColor}`,
          padding: "0 36px 0 12px", background: "#fff",
          fontFamily: "inherit", fontWeight: 700, fontSize: 14, color: "var(--hl-icon)",
          appearance: "none", cursor: "pointer",
        }}>
        <option value="">— Skip this column —</option>
        <option value={CUSTOM_VALUE}>+ Create custom field…</option>
        {window.TARGET_SCHEMA_GROUPS.map(g => (
          <optgroup key={g.id} label={g.label}>
            {g.fields.map(t => {
              const used = usedTargets[t.id] && t.id !== value;
              return (
                <option key={t.id} value={t.id} disabled={used}>
                  {t.label}{t.required ? " *" : ""}{used ? " · already mapped" : ""}
                </option>
              );
            })}
          </optgroup>
        ))}
      </select>
      <i className="fas fa-chevron-down" style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: "var(--hl-fg-3)", pointerEvents: "none", fontSize: 12 }}/>
    </div>
  );
}

function CustomNameInput({ value, hasError, onChange }) {
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "stretch" }}>
      <div style={{
        display: "inline-flex", alignItems: "center", padding: "0 10px",
        background: "var(--hl-go-blue)", color: "#fff",
        fontSize: 11, fontWeight: 900, letterSpacing: ".04em", textTransform: "uppercase",
        borderRadius: "3px 0 0 3px",
      }}>Custom</div>
      <input
        type="text"
        value={value}
        placeholder="Field name"
        onChange={e => onChange(e.target.value)}
        style={{
          flex: 1, height: 32,
          border: `2px solid ${hasError ? "var(--hl-no-red)" : "var(--hl-go-blue)"}`,
          borderLeft: 0, borderRadius: "0 3px 3px 0",
          padding: "0 10px", background: "#fff",
          fontFamily: "inherit", fontSize: 13, fontWeight: 700, color: "var(--hl-icon)",
        }}
      />
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────

function SummaryChip({ tone, icon, label }) {
  const tones = {
    success: { bg: "rgba(65,175,75,0.12)",  fg: "#1F7A2A" },
    warn:    { bg: "rgba(250,199,55,0.18)", fg: "#7A5300" },
    info:    { bg: "rgba(5,141,233,0.12)",  fg: "var(--hl-go-blue)" },
    err:     { bg: "var(--hl-framing)",     fg: "var(--hl-fg-2)" },
  };
  const t = tones[tone] || tones.info;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 3, background: t.bg, color: t.fg, fontWeight: 700, fontSize: 13 }}>
      <i className={`fas fa-${icon}`}/>{label}
    </span>
  );
}

function FileMeta({ file }) {
  const ext = (file.filename.split(".").pop() || "").toLowerCase();
  const isXl = ext === "xlsx" || ext === "xls";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--hl-framing)", borderRadius: 3, flexShrink: 0, maxWidth: 320 }}>
      <i className={`fas fa-${isXl ? "file-excel" : "file-csv"}`} style={{ color: "var(--hl-go-blue)", fontSize: 20 }}/>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--hl-icon)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.filename}</div>
        <div style={{ fontSize: 11, color: "var(--hl-fg-3)" }}>
          {file.sheetName ? <span>Sheet: <b>{file.sheetName}</b> · </span> : null}
          {file.headers.length} columns · {file.rows.length} rows
        </div>
      </div>
    </div>
  );
}

function MappingSkeleton({ file }) {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 32px 24px", width: "100%" }}>
      <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "var(--hl-icon)" }}>
        Matching your columns…
      </h2>
      <p style={{ marginTop: 8, marginBottom: 24, color: "var(--hl-fg-2)" }}>
        <i className="fas fa-spinner fa-spin" style={{ color: "var(--hl-go-blue)", marginRight: 8 }}/>
        Asking our mapping AI to identify {file.headers.length} columns from <b>{file.filename}</b>.
      </p>
      <div style={{ background: "#fff", border: "2px solid var(--hl-keyline)", borderRadius: 3, overflow: "hidden" }}>
        {file.headers.map((h, i) => (
          <div key={h} style={{
            display: "grid", gridTemplateColumns: "1fr 32px 1fr 140px", gap: 12,
            padding: "20px", alignItems: "center",
            borderTop: i === 0 ? 0 : "1px solid var(--hl-keyline)",
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--hl-icon)" }}>{h}</div>
              <div style={{ height: 10, width: "60%", background: "var(--hl-framing)", borderRadius: 3, marginTop: 6, animation: "hl-pulse 1.2s ease-in-out infinite" }}/>
            </div>
            <div style={{ color: "var(--hl-fg-3)", textAlign: "center" }}><i className="fas fa-arrow-right"/></div>
            <div style={{ height: 36, background: "var(--hl-framing)", borderRadius: 3, animation: "hl-pulse 1.2s ease-in-out infinite" }}/>
            <div style={{ height: 12, background: "var(--hl-framing)", borderRadius: 3, animation: "hl-pulse 1.2s ease-in-out infinite" }}/>
          </div>
        ))}
      </div>
    </div>
  );
}

window.MappingStep = MappingStep;
