// Step 1 — Upload. Three internal phases:
//   "idle"     — drop zone + sample files
//   "analyzing"— AI triage skeleton
//   "triage"   — file/sheet review + continue
//
// On Continue we resolve the chosen source down to {filename, headers, rows}
// and hand off to the mapping step.

const { useState: useStateU, useRef: useRefU, useCallback: useCallbackU, useEffect: useEffectU, useMemo: useMemoU } = React;

function UploadStep({ onParsed }) {
  const [phase, setPhase] = useStateU("idle"); // idle | analyzing | triage
  const [dragOver, setDragOver] = useStateU(false);
  const [files, setFiles] = useStateU([]);              // parsed files
  const [triage, setTriage] = useStateU(null);          // AI result
  const [selection, setSelection] = useStateU(null);    // {file, sheet, headerRow}
  const [joinSel, setJoinSel] = useStateU(null);        // #6 chosen pricing join {file,sheet,headerRow,key}
  const [error, setError] = useStateU(null);
  const fileRef = useRefU(null);

  const ingest = useCallbackU(async (fileList) => {
    if (!fileList || !fileList.length) return;
    setError(null);
    setPhase("analyzing");
    try {
      const parsedFiles = [];
      for (const f of fileList) {
        try {
          const p = await window.parseFile(f);
          parsedFiles.push(p);
        } catch (e) {
          parsedFiles.push({ filename: f.name, ext: "?", sheets: [], _error: e.message });
        }
      }
      // Light delay so the skeleton actually shows
      await new Promise(r => setTimeout(r, 250));
      const result = await window.aiTriage(parsedFiles.filter(f => !f._error));
      setFiles(parsedFiles);
      setTriage(result);
      // Default selection from AI's recommendation
      if (result.primary_file && result.primary_sheet) {
        setSelection({
          filename: result.primary_file,
          sheet: result.primary_sheet,
          headerRow: result.primary_header_row ?? 0,
        });
      } else {
        // No clear primary (e.g. a lone customer/supplementary file) — still
        // auto-select the first data sheet so the user can continue.
        for (const tf of result.files) {
          const ds = (tf.sheets || []).find(s => s.kind === "data");
          if (ds) { setSelection({ filename: tf.filename, sheet: ds.name, headerRow: ds.header_row ?? 0 }); break; }
        }
      }
      setPhase("triage");
    } catch (e) {
      console.error(e);
      setError("We couldn't analyze those files. Try again or use a sample.");
      setPhase("idle");
    }
  }, []);

  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    ingest([...(e.dataTransfer.files || [])]);
  };

  const handleSample = async (key) => {
    const s = window.SAMPLES[key];
    if (!s) return;
    const f = new File([s.csv], s.name, { type: "text/csv" });
    ingest([f]);
  };

  const loadRealMix = async () => {
    setPhase("analyzing");
    try {
      const names = [
        "Cami NYC - Joor Linesheets.xlsx",
        "Le New Black Pricesheet Template.xlsx",
        "Anaz faire-products.xlsx",
        "12_24 VELOCI Updated Shopify Export.xlsx",
        "Jewels By Sunaina (Shopify export).xlsx",
        "customerDetails.csv",
        "XO Maria Shopify products_export_1.csv",
      ];
      const fs = [];
      for (const name of names) {
        const r = await fetch("uploads/" + name);
        if (!r.ok) continue;
        const blob = await r.blob();
        fs.push(new File([blob], name));
      }
      if (fs.length === 0) {
        setPhase("idle");
        setError("Couldn't load the demo files. Try uploading manually.");
        return;
      }
      ingest(fs);
    } catch (e) {
      console.error(e);
      setPhase("idle");
      setError("Couldn't load the demo files.");
    }
  };

  const loadSingleUpload = async (path, name) => {
    setPhase("analyzing");
    try {
      const r = await fetch(encodeURI(path));
      if (!r.ok) { setPhase("idle"); setError("Couldn't load the demo file."); return; }
      const blob = await r.blob();
      ingest([new File([blob], name)]);
    } catch (e) {
      console.error(e);
      setPhase("idle");
      setError("Couldn't load the demo file.");
    }
  };

  const handleContinue = () => {
    if (!selection) return;
    const parsed = files.find(f => f.filename === selection.filename);
    if (!parsed) return;
    const extracted = window.extractTable(parsed, selection.sheet, selection.headerRow);
    // Pre-process multi-row product structure: group by product key, forward-fill
    // shared product fields into variant rows, set aside additional-image rows.
    let normalized = window.normalizeMultiRow(extracted);

    // #6 — join a supplementary pricing file onto the product file by shared key
    if (joinSel && joinSel.file && joinSel.key) {
      const priceParsed = files.find(f => f.filename === joinSel.file);
      if (priceParsed) {
        const priceTable = window.extractTable(priceParsed, joinSel.sheet, joinSel.headerRow);
        normalized = window.joinTables(normalized, priceTable, joinSel.key) || normalized;
      }
    }

    // Tag the file's classified purpose so the app can branch (#4 customer data)
    const tf = triage.files.find(t => t.filename === selection.filename);
    normalized.purpose = tf ? tf.purpose : "product_catalog";
    onParsed(normalized);
  };

  // Detect a join opportunity: a supplementary pricing file that shares a key
  // column (SKU / Reference / Style Number) with the selected product file (#6).
  const joinOpportunity = useMemoU(() => {
    if (!triage || !selection) return null;
    const primaryParsed = files.find(f => f.filename === selection.filename);
    if (!primaryParsed) return null;
    const primarySheet = primaryParsed.sheets.find(s => s.name === selection.sheet);
    const primaryHeaders = (primarySheet && (primarySheet.preview[selection.headerRow] || [])).map(h => String(h).trim());
    const KEY_CANDIDATES = ["sku", "variant sku", "reference", "style number", "style code", "product token", "item code"];
    const sharedKey = (aHeaders, bHeaders) => {
      for (const k of KEY_CANDIDATES) {
        const a = aHeaders.find(h => h.toLowerCase() === k);
        const b = bHeaders.find(h => h.toLowerCase() === k);
        if (a && b) return a;
      }
      return null;
    };
    // Look for a pricing/supplementary file with a shared key
    for (const tf of triage.files) {
      if (tf.filename === selection.filename) continue;
      if (tf.purpose !== "pricing" && tf.recommendation !== "supplementary") continue;
      const pParsed = files.find(f => f.filename === tf.filename);
      if (!pParsed) continue;
      const dataSheet = (tf.sheets || []).find(s => s.kind === "data") || tf.sheets[0];
      if (!dataSheet) continue;
      const ps = pParsed.sheets.find(s => s.name === dataSheet.name);
      const pHeaders = (ps && (ps.preview[dataSheet.header_row || 0] || [])).map(h => String(h).trim());
      const key = sharedKey(primaryHeaders, pHeaders);
      if (key) {
        return { file: tf.filename, sheet: dataSheet.name, headerRow: dataSheet.header_row || 0, key, label: tf.purpose_label };
      }
    }
    return null;
  }, [triage, selection, files]);

  if (phase === "analyzing") return <AnalyzingView files={files}/>;
  if (phase === "triage" && triage) {
    return (
      <TriageView
        files={files}
        triage={triage}
        selection={selection}
        setSelection={setSelection}
        joinOpportunity={joinOpportunity}
        joinSel={joinSel}
        setJoinSel={setJoinSel}
        onContinue={handleContinue}
        onStartOver={() => { setPhase("idle"); setFiles([]); setTriage(null); setSelection(null); setJoinSel(null); }}
      />
    );
  }

  // ── idle ─────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "32px 32px 64px", width: "100%" }}>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "var(--hl-icon)" }}>Upload your catalog files</h2>
        <p style={{ marginTop: 8, marginBottom: 0, color: "var(--hl-fg-2)", fontSize: 15, lineHeight: "22px", maxWidth: 720 }}>
          Drop any combination of CSVs, Excel workbooks, vendor templates, or platform exports. Our triage agent reads every file and every tab, picks the right source, and finds the column headers — even when they're buried under instructions or annotations.
        </p>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? "var(--hl-go-blue)" : "var(--hl-keyline)"}`,
          background: dragOver ? "rgba(63,50,245,0.04)" : "#fff",
          borderRadius: 8, padding: "56px 40px", textAlign: "center",
          cursor: "pointer", transition: "all 150ms cubic-bezier(0.2,0,0,1)",
        }}>
        <div style={{
          width: 64, height: 64, borderRadius: "50%",
          background: dragOver ? "var(--hl-go-blue)" : "var(--hl-framing)",
          color: dragOver ? "#fff" : "var(--hl-fg-2)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontSize: 24, marginBottom: 16, transition: "all 150ms"
        }}>
          <i className="fas fa-cloud-upload-alt"/>
        </div>
        <div style={{ fontWeight: 700, fontSize: 18, color: "var(--hl-icon)", marginBottom: 6 }}>
          {dragOver ? "Drop to analyze" : "Drag files here"}
        </div>
        <div style={{ color: "var(--hl-fg-2)", fontSize: 14, marginBottom: 20 }}>
          or <span style={{ color: "var(--hl-go-blue)", fontWeight: 700, textDecoration: "underline" }}>select up to 10 files</span>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 16, fontSize: 12, color: "var(--hl-fg-3)" }}>
          <span><i className="fas fa-file-csv" style={{ marginRight: 6, color: "var(--hl-fg-2)" }}/>CSV</span>
          <span style={{ width: 4, height: 4, background: "var(--hl-keyline)", borderRadius: "50%" }}/>
          <span><i className="fas fa-file-excel" style={{ marginRight: 6, color: "var(--hl-fg-2)" }}/>XLSX</span>
          <span style={{ width: 4, height: 4, background: "var(--hl-keyline)", borderRadius: "50%" }}/>
          <span>Multi-sheet supported</span>
          <span style={{ width: 4, height: 4, background: "var(--hl-keyline)", borderRadius: "50%" }}/>
          <span>Up to 50 MB / file</span>
        </div>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" multiple
          onChange={(e) => ingest([...e.target.files])} style={{ display: "none" }}/>
      </div>

      {error && (
        <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 3, background: "rgba(187,42,26,0.08)", color: "var(--hl-no-red)", display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 700 }}>
          <i className="fas fa-exclamation-triangle"/>
          {error}
        </div>
      )}

      {/* Capability strip */}
      <div style={{ marginTop: 32, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <HelpTile icon="layer-group" title="Multi-file uploads" body="Drop a vendor template alongside an export — we'll pick the one with the real product rows and explain why."/>
        <HelpTile icon="folder-open" title="Sheet-aware" body="Skips Instructions, Field Descriptions, and reference lookup tabs to find the real data table inside a workbook."/>
        <HelpTile icon="search" title="Smart header detection" body="Finds the header row even when annotations, dividers, or empty rows sit above it."/>
      </div>

      <div style={{ marginTop: 24, padding: "20px 24px", background: "var(--hl-info-blue)", borderRadius: 3 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          <i className="fas fa-flask" style={{ color: "var(--hl-go-blue)", fontSize: 18, marginTop: 2 }}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--hl-icon)", marginBottom: 4 }}>Try the AI triage agent</div>
            <div style={{ fontSize: 13, color: "var(--hl-fg-2)", marginBottom: 14, lineHeight: "18px" }}>
              Load a real brand export and watch the agent classify it, find the headers, group multi-row products, and map the columns.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <SampleChip label="Messy real upload" hint="7 files · picks the right one" onClick={loadRealMix}/>
              <SampleChip label="Shopify multi-row" hint="115 rows → 52 products + images" onClick={() => loadSingleUpload("uploads/xo_maria_multirow.csv", "XO Maria Shopify products_export.csv")}/>
              <SampleChip label="Large Shopify catalog" hint="82 cols · 2,199 rows" onClick={() => loadSingleUpload("uploads/Hortons EngLand Shopify product export.xlsx", "Hortons England Shopify product export.xlsx")}/>
              <SampleChip label="JOOR linesheet" hint="113 cols · tiered pricing" onClick={() => loadSingleUpload("uploads/BEC AND BRIDGE - Joor Linesheets.csv", "BEC AND BRIDGE - Joor Linesheets.csv")}/>
              <SampleChip label="JOOR — Cami NYC" hint="87 cols · real brand export" onClick={() => loadSingleUpload("uploads/Cami NYC - Joor Linesheets.xlsx", "Cami NYC - Joor Linesheets.xlsx")}/>
              <SampleChip label="Faire export" hint="annotation rows · option pairs" onClick={() => loadSingleUpload("uploads/Anaz faire-products.xlsx", "Anaz faire-products.xlsx")}/>
              <SampleChip label="Large Faire" hint="66 cols · 1,001 rows · buried header" onClick={() => loadSingleUpload("uploads/Lemonbella Faire edited.xlsx", "Lemonbella Faire edited.xlsx")}/>
              <SampleChip label="Customer file" hint="routes to account import" onClick={() => loadSingleUpload("uploads/JOOR_Full_Access_Customer_Data_Template.xlsx", "JOOR_Full_Access_Customer_Data_Template.xlsx")}/>
              <SampleChip label="With errors" hint="dupes + missing" onClick={() => handleSample("errors")}/>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Analyzing view — full-bleed skeleton while triage runs
// ─────────────────────────────────────────────────────────────────────────

function AnalyzingView({ files }) {
  // Walk through phases visually
  const phases = [
    { label: "Reading files", icon: "file-alt" },
    { label: "Scanning sheets", icon: "layer-group" },
    { label: "Identifying source", icon: "robot" },
    { label: "Locating headers", icon: "search-location" },
  ];
  const [active, setActive] = useStateU(0);
  useEffectU(() => {
    const t = setInterval(() => setActive(a => Math.min(phases.length - 1, a + 1)), 700);
    return () => clearInterval(t);
  }, []);
  const totalSheets = files.reduce((s, f) => s + (f.sheets?.length || 0), 0);
  return (
    <div style={{ maxWidth: 720, margin: "60px auto 0", padding: "0 32px", width: "100%", textAlign: "center" }}>
      <div style={{
        width: 64, height: 64, borderRadius: "50%",
        background: "var(--hl-info-blue)", color: "var(--hl-go-blue)",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        marginBottom: 20, fontSize: 24,
      }}>
        <i className="fas fa-robot fa-pulse"/>
      </div>
      <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "var(--hl-icon)" }}>Triage agent is reading your files</h2>
      <p style={{ marginTop: 8, marginBottom: 28, color: "var(--hl-fg-2)" }}>
        Analyzing <b>{files.length}</b> file{files.length === 1 ? "" : "s"} · <b>{totalSheets}</b> sheet{totalSheets === 1 ? "" : "s"} to find the right source for your import.
      </p>
      <div style={{ background: "#fff", border: "2px solid var(--hl-keyline)", borderRadius: 3, padding: "20px 28px", textAlign: "left" }}>
        {phases.map((p, i) => {
          const done = i < active;
          const isActive = i === active;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 0" }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%",
                background: done ? "var(--hl-do-green)" : isActive ? "var(--hl-go-blue)" : "var(--hl-framing)",
                color: done || isActive ? "#fff" : "var(--hl-fg-3)",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 900
              }}>
                {done ? <i className="fas fa-check"/> : isActive ? <i className="fas fa-spinner fa-spin"/> : i + 1}
              </div>
              <span style={{ fontSize: 14, fontWeight: isActive ? 700 : 400, color: isActive || done ? "var(--hl-icon)" : "var(--hl-fg-3)" }}>
                {p.label}
              </span>
            </div>
          );
        })}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--hl-keyline)", display: "flex", flexDirection: "column", gap: 8 }}>
          {files.slice(0, 6).map(f => (
            <div key={f.filename} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--hl-fg-2)" }}>
              <i className={`fas fa-${f.ext === "csv" ? "file-csv" : "file-excel"}`} style={{ color: "var(--hl-go-blue)", width: 14 }}/>
              <span style={{ flex: 1 }}>{f.filename}</span>
              <span style={{ fontSize: 11, color: "var(--hl-fg-3)" }}>{f.sheets?.length || 0} sheet{(f.sheets?.length || 0) === 1 ? "" : "s"}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Triage view — main payoff. File cards, sheet selection, header row override
// ─────────────────────────────────────────────────────────────────────────

function TriageView({ files, triage, selection, setSelection, joinOpportunity, joinSel, setJoinSel, onContinue, onStartOver }) {
  const filesByName = Object.fromEntries(files.map(f => [f.filename, f]));
  const trBy = Object.fromEntries(triage.files.map(t => [t.filename, t]));
  const totalSheets = files.reduce((s, f) => s + (f.sheets?.length || 0), 0);

  // Resolve the currently selected sheet preview so the bottom panel can render it
  const selFile = selection ? filesByName[selection.filename] : null;
  const selSheet = selFile?.sheets.find(s => s.name === selection?.sheet);
  const selTriageFile = selection ? trBy[selection.filename] : null;
  const selTriageSheet = selTriageFile?.sheets.find(s => s.name === selection?.sheet);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "32px 32px 24px", width: "100%" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "var(--hl-icon)" }}>Review what we found</h2>
            <p style={{ marginTop: 8, marginBottom: 0, color: "var(--hl-fg-2)", fontSize: 15, lineHeight: "22px", maxWidth: 760 }}>
              We classified <b>{files.length}</b> file{files.length === 1 ? "" : "s"} and <b>{totalSheets}</b> sheet{totalSheets === 1 ? "" : "s"}. Confirm the source we picked, or choose a different one.
            </p>
          </div>
          <Button variant="text" icon="redo" onClick={onStartOver}>Upload different files</Button>
        </div>

        {/* AI rationale banner */}
        {triage.rationale && (
          <div style={{
            background: "linear-gradient(135deg, rgba(63,50,245,0.08), rgba(5,141,233,0.06))",
            border: "2px solid rgba(63,50,245,0.18)",
            borderRadius: 3, padding: "16px 20px", marginBottom: 20,
            display: "flex", alignItems: "flex-start", gap: 14,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 3,
              background: "var(--hl-go-blue)", color: "#fff",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <i className="fas fa-robot"/>
            </div>
            <div style={{ flex: 1, fontSize: 14, lineHeight: "20px" }}>
              <div style={{ fontWeight: 700, color: "var(--hl-icon)", marginBottom: 2 }}>
                Triage agent recommends <b>"{triage.primary_sheet}"</b> from <b>{triage.primary_file}</b>
                {triage._source === "heuristic" && (
                  <span style={{ marginLeft: 8, padding: "2px 8px", background: "var(--hl-framing)", color: "var(--hl-fg-2)", fontSize: 11, fontWeight: 700, borderRadius: 999 }}>Offline heuristic</span>
                )}
              </div>
              <div style={{ color: "var(--hl-fg-2)" }}>{triage.rationale}</div>
            </div>
          </div>
        )}

        {/* File cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
          {triage.files.map(t => (
            <FileCard
              key={t.filename}
              triage={t}
              parsed={filesByName[t.filename]}
              selection={selection}
              setSelection={setSelection}
              isPrimary={t.filename === triage.primary_file}
            />
          ))}
        </div>

        {/* Sheet preview */}
        {selSheet && selTriageSheet && (
          <SheetPreview
            file={selFile} sheet={selSheet} triage={selTriageSheet}
            headerRow={selection.headerRow}
            setHeaderRow={(r) => setSelection({ ...selection, headerRow: r })}
          />
        )}

        {/* Multi-file join offer (#6) */}
        {joinOpportunity && (
          <div style={{
            marginTop: 16, padding: "14px 18px", borderRadius: 3,
            background: "rgba(5,141,233,0.06)", border: "1px solid rgba(5,141,233,0.28)",
            display: "flex", alignItems: "center", gap: 14,
          }}>
            <div style={{ width: 32, height: 32, borderRadius: 3, flexShrink: 0, background: "var(--hl-go-blue)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <i className="fas fa-link"/>
            </div>
            <div style={{ flex: 1, fontSize: 13, lineHeight: "18px", color: "var(--hl-fg-1)" }}>
              <div style={{ fontWeight: 700, color: "var(--hl-icon)" }}>Join {joinOpportunity.label.toLowerCase()} from “{joinOpportunity.file}”?</div>
              <div style={{ color: "var(--hl-fg-2)" }}>
                It shares a <code style={{ fontFamily: "var(--hl-font-mono)", background: "var(--hl-framing)", padding: "1px 5px", borderRadius: 2 }}>{joinOpportunity.key}</code> column — we can merge its columns onto each product row.
              </div>
            </div>
            <button
              onClick={() => setJoinSel(joinSel ? null : joinOpportunity)}
              style={{
                height: 34, padding: "0 14px", borderRadius: 3, cursor: "pointer", fontFamily: "inherit",
                fontSize: 13, fontWeight: 700,
                border: `2px solid ${joinSel ? "var(--hl-do-green)" : "var(--hl-go-blue)"}`,
                background: joinSel ? "var(--hl-do-green)" : "#fff",
                color: joinSel ? "#fff" : "var(--hl-go-blue)",
              }}>
              <i className={`fas fa-${joinSel ? "check" : "plus"}`} style={{ marginRight: 6 }}/>
              {joinSel ? "Will join" : "Join data"}
            </button>
          </div>
        )}
      </div>

      <div style={{ marginTop: "auto" }}/>
      <div style={{
        position: "sticky", bottom: 0, background: "#fff",
        borderTop: "1px solid var(--hl-keyline)",
        boxShadow: "var(--hl-shadow-action-bar)",
        padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, zIndex: 2,
      }}>
        <Button variant="text" icon="arrow-left" onClick={onStartOver}>Upload different files</Button>
        <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
          {selection ? (
            <span style={{ fontSize: 13, color: "var(--hl-fg-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 360 }} title={`${selection.sheet} — ${selection.filename}`}>
              Importing <b style={{ color: "var(--hl-icon)" }}>{selection.sheet}</b>
            </span>
          ) : (
            <span style={{ fontSize: 13, color: "var(--hl-fg-3)" }}>Pick a sheet to continue</span>
          )}
          <Button variant="do" disabled={!selection} onClick={onContinue}>
            Continue to mapping
            <i className="fas fa-arrow-right" style={{ marginLeft: 4 }}/>
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── File card ───────────────────────────────────────────────────────────

const PURPOSE_TONES = {
  product_catalog:  { fg: "var(--hl-do-green)", bg: "rgba(65,175,75,0.08)",  icon: "boxes",          dot: "var(--hl-do-green)" },
  pricing:          { fg: "var(--hl-go-blue)",  bg: "rgba(5,141,233,0.08)", icon: "tags",           dot: "var(--hl-go-blue)" },
  customer_data:    { fg: "#965FB0",            bg: "rgba(150,95,176,0.08)", icon: "address-book",   dot: "#965FB0" },
  reference_data:   { fg: "var(--hl-supplementary)", bg: "rgba(102,146,176,0.10)", icon: "book", dot: "var(--hl-supplementary)" },
  instructions_only:{ fg: "var(--hl-fg-3)",     bg: "var(--hl-framing)",     icon: "info-circle",    dot: "var(--hl-fg-3)" },
  unclear:          { fg: "#B47A00",            bg: "rgba(250,199,55,0.10)", icon: "question-circle",dot: "#B47A00" },
};

const SHEET_KIND_TONES = {
  data:                { fg: "var(--hl-do-green)", label: "Importable data" },
  instructions:        { fg: "var(--hl-fg-3)",     label: "Instructions" },
  field_descriptions:  { fg: "var(--hl-supplementary)", label: "Field reference" },
  reference_lookup:    { fg: "var(--hl-supplementary)", label: "Reference list" },
  empty:               { fg: "var(--hl-fg-3)",     label: "Empty" },
};

function FileCard({ triage, parsed, selection, setSelection, isPrimary }) {
  const tone = PURPOSE_TONES[triage.purpose] || PURPOSE_TONES.unclear;
  const dataSheets = triage.sheets.filter(s => s.kind === "data");
  const isSkipped = triage.recommendation === "skip";

  return (
    <div style={{
      background: isSkipped ? "var(--hl-framing)" : "#fff",
      border: `2px solid ${isPrimary ? "var(--hl-do-green)" : "var(--hl-keyline)"}`,
      borderRadius: 3, padding: 0, overflow: "hidden",
      opacity: isSkipped ? 0.78 : 1,
    }}>
      {/* Header strip */}
      <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, borderBottom: dataSheets.length ? "1px solid var(--hl-keyline)" : 0 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 3,
          background: tone.bg, color: tone.fg,
          display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <i className={`fas fa-${parsed?.ext === "csv" ? "file-csv" : "file-excel"}`} style={{ fontSize: 18 }}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--hl-icon)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {triage.filename}
            </div>
            {isPrimary && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 900, color: "var(--hl-do-green)", background: "rgba(65,175,75,0.12)", padding: "2px 8px", borderRadius: 999 }}>
                <i className="fas fa-star" style={{ fontSize: 9 }}/>Primary
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: tone.fg, fontWeight: 700 }}>
              <i className={`fas fa-${tone.icon}`} style={{ fontSize: 12 }}/>{triage.purpose_label}
            </span>
            <span style={{ color: "var(--hl-fg-3)" }}>·</span>
            <span style={{ color: "var(--hl-fg-2)" }}>{triage.summary}</span>
          </div>
        </div>
      </div>

      {/* Sheets */}
      {triage.sheets.length > 0 && !isSkipped && (
        <div style={{ padding: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
          {triage.sheets.map(s => (
            <SheetChip
              key={s.name}
              triage={s}
              parsed={parsed?.sheets.find(x => x.name === s.name)}
              isSelected={selection?.filename === triage.filename && selection?.sheet === s.name}
              isPicked={triage.recommendation !== "skip" && s.kind === "data"}
              onClick={() => {
                if (s.kind !== "data") return;
                setSelection({
                  filename: triage.filename,
                  sheet: s.name,
                  headerRow: s.header_row ?? 0,
                });
              }}
            />
          ))}
        </div>
      )}

      {isSkipped && (
        <div style={{ padding: "0 20px 16px 74px", fontSize: 13, color: "var(--hl-fg-3)" }}>
          <i className="fas fa-info-circle" style={{ marginRight: 6 }}/>
          We don't see product rows in this file. It won't be imported.
        </div>
      )}
    </div>
  );
}

function SheetChip({ triage, parsed, isSelected, isPicked, onClick }) {
  const tone = SHEET_KIND_TONES[triage.kind] || SHEET_KIND_TONES.empty;
  const isData = triage.kind === "data";
  return (
    <button onClick={onClick} disabled={!isData}
      style={{
        textAlign: "left", cursor: isData ? "pointer" : "not-allowed", fontFamily: "inherit",
        border: `2px solid ${isSelected ? "var(--hl-go-blue)" : isData ? "var(--hl-keyline)" : "transparent"}`,
        background: isSelected ? "rgba(5,141,233,0.05)" : isData ? "#fff" : "var(--hl-framing)",
        borderRadius: 3, padding: "10px 12px",
        transition: "all 120ms", opacity: isData ? 1 : 0.7,
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <i className={`fas fa-${isData ? (isSelected ? "check-circle" : "table") : "ban"}`} style={{ color: isSelected ? "var(--hl-go-blue)" : tone.fg, fontSize: 12 }}/>
        <span style={{ fontWeight: 700, fontSize: 13, color: "var(--hl-icon)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{triage.name}</span>
        {isData && parsed && (
          <span style={{ fontSize: 11, color: "var(--hl-fg-3)" }}>{parsed.totalRows}×{parsed.totalCols}</span>
        )}
      </div>
      <div style={{ fontSize: 11, color: tone.fg, fontWeight: 700, marginBottom: 2 }}>{tone.label}</div>
      <div style={{ fontSize: 11, color: "var(--hl-fg-3)", lineHeight: "14px" }}>{triage.reason}</div>
    </button>
  );
}

// ─── Sheet preview ─────────────────────────────────────────────────────

function SheetPreview({ file, sheet, triage, headerRow, setHeaderRow }) {
  const preview = sheet.preview || [];
  const cols = Math.min(8, Math.max(...preview.map(r => r.length)));

  return (
    <div style={{ background: "#fff", border: "2px solid var(--hl-keyline)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--hl-keyline)", display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--hl-icon)" }}>
            Preview · <span style={{ fontFamily: "var(--hl-font-mono)" }}>{sheet.name}</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--hl-fg-2)", marginTop: 2 }}>
            {triage.reason}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <span style={{ color: "var(--hl-fg-2)" }}>Header row:</span>
          <select value={headerRow} onChange={e => setHeaderRow(Number(e.target.value))}
            style={{
              height: 32, padding: "0 24px 0 10px", borderRadius: 3,
              border: "2px solid var(--hl-keyline)", background: "#fff",
              fontFamily: "inherit", fontWeight: 700, fontSize: 13, color: "var(--hl-icon)",
              appearance: "none", cursor: "pointer", position: "relative",
            }}>
            {preview.map((_, i) => (
              <option key={i} value={i}>Row {i + 1}</option>
            ))}
          </select>
          <i className="fas fa-chevron-down" style={{ color: "var(--hl-fg-3)", fontSize: 11, marginLeft: -22, pointerEvents: "none" }}/>
        </div>
      </div>

      <div style={{ overflow: "auto", maxHeight: 280 }}>
        <table style={{
          width: "max-content", minWidth: "100%",
          borderCollapse: "collapse",
          fontSize: 12, fontFamily: "var(--hl-font-mono)",
        }}>
          <tbody>
            {preview.map((r, ri) => {
              const isHeader = ri === headerRow;
              const isAbove = ri < headerRow;
              const isData = ri > headerRow;
              return (
                <tr key={ri} style={{
                  background: isHeader ? "rgba(65,175,75,0.12)" : isAbove ? "var(--hl-framing)" : "#fff",
                }}>
                  <td style={{
                    padding: "6px 10px", borderRight: "1px solid var(--hl-keyline)", borderBottom: "1px solid var(--hl-keyline)",
                    fontWeight: 700, color: isHeader ? "var(--hl-do-green)" : "var(--hl-fg-3)",
                    background: isHeader ? "rgba(65,175,75,0.18)" : "var(--hl-framing)",
                    position: "sticky", left: 0, fontSize: 11, minWidth: 50, textAlign: "right",
                  }}>
                    {isHeader ? "H" : ri + 1}
                  </td>
                  {Array.from({ length: cols }).map((_, ci) => {
                    const v = r[ci] ?? "";
                    return (
                      <td key={ci} style={{
                        padding: "6px 10px", borderRight: "1px solid var(--hl-framing)", borderBottom: "1px solid var(--hl-framing)",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        maxWidth: 220,
                        fontWeight: isHeader ? 700 : 400,
                        color: isHeader ? "var(--hl-icon)" : isAbove ? "var(--hl-fg-3)" : "var(--hl-fg-1)",
                      }}>{String(v).slice(0, 80)}</td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ padding: "10px 20px", borderTop: "1px solid var(--hl-keyline)", display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--hl-fg-2)" }}>
        <Legend swatch="rgba(65,175,75,0.18)" label="Detected headers"/>
        <Legend swatch="var(--hl-framing)" label="Skipped (above header)"/>
        <Legend swatch="#fff" border label="Data rows"/>
      </div>
    </div>
  );
}

function Legend({ swatch, label, border }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginRight: 12 }}>
      <span style={{
        width: 12, height: 12, background: swatch, borderRadius: 2,
        border: border ? "1px solid var(--hl-keyline)" : 0,
      }}/>
      <span>{label}</span>
    </span>
  );
}

// ─── Reused helpers (sample chip, help tile) ──────────────────────────

function SampleChip({ label, hint, onClick }) {
  const [hover, setHover] = useStateU(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? "var(--hl-go-blue)" : "#fff",
        color: hover ? "#fff" : "var(--hl-icon)",
        border: "2px solid " + (hover ? "var(--hl-go-blue)" : "var(--hl-keyline)"),
        borderRadius: 3, padding: "8px 14px", cursor: "pointer", fontFamily: "inherit",
        textAlign: "left", transition: "all 150ms",
      }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 11, color: hover ? "rgba(255,255,255,.8)" : "var(--hl-fg-3)", marginTop: 2 }}>{hint}</div>
    </button>
  );
}

function HelpTile({ icon, title, body }) {
  return (
    <div style={{ padding: 20, background: "#fff", border: "2px solid var(--hl-keyline)", borderRadius: 3 }}>
      <div style={{ width: 32, height: 32, borderRadius: 3, background: "var(--hl-info-blue)", color: "var(--hl-go-blue)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
        <i className={`fas fa-${icon}`}/>
      </div>
      <div style={{ fontWeight: 700, fontSize: 14, color: "var(--hl-icon)", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: "var(--hl-fg-2)", lineHeight: "18px" }}>{body}</div>
    </div>
  );
}

window.UploadStep = UploadStep;
