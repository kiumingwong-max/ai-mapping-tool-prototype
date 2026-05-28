// Step 4 — Success screen after a clean validation.

function SuccessStep({ file, mappings, result, onStartOver }) {
  const schemaMapped = mappings.filter(m => m.target_field && m.target_field !== "__custom__").length;
  const customMapped = mappings.filter(m => m.target_field === "__custom__").length;
  const skipped = mappings.filter(m => !m.target_field).length;
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ maxWidth: 720, margin: "40px auto 0", padding: "0 32px", width: "100%", textAlign: "center" }}>
        <div style={{
          width: 96, height: 96, borderRadius: "50%",
          background: "rgba(65,175,75,0.12)", color: "var(--hl-do-green)",
          display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 44,
          marginBottom: 24,
          animation: "hl-pop 350ms cubic-bezier(0.2,0,0,1)",
        }}>
          <i className="fas fa-check"/>
        </div>
        <h1 style={{ margin: 0, fontFamily: "Lato", fontWeight: 900, fontSize: 36, color: "var(--hl-icon)", letterSpacing: "-0.015em" }}>
          {result.totalRows} products imported
        </h1>
        <p style={{ marginTop: 12, marginBottom: 32, color: "var(--hl-fg-2)", fontSize: 16, lineHeight: "24px" }}>
          We've added everything from <b>{file.filename}</b> to your catalog. They're searchable from the product directory now.
        </p>

        <div style={{ background: "#fff", border: "2px solid var(--hl-keyline)", borderRadius: 3, padding: "20px 28px", textAlign: "left", marginBottom: 24 }}>
          <Row icon="file-csv" label="File" value={file.filename}/>
          <Row icon="list-ol" label="Rows imported" value={result.totalRows.toLocaleString()}/>
          <Row icon="columns" label="Schema fields mapped" value={`${schemaMapped} of ${mappings.length}`}/>
          {customMapped > 0 && (
            <Row icon="plus-circle" label="Custom fields created" value={`${customMapped}`}/>
          )}
          {skipped > 0 && (
            <Row icon="minus-circle" label="Columns skipped" value={`${skipped}`}/>
          )}
          <Row icon="bookmark" label="Mapping" value="Saved for next upload" last/>
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
          <Button variant="supp" icon="upload" onClick={onStartOver}>Import another file</Button>
          <Button variant="do" icon="external-link-alt">View imported products</Button>
        </div>

        <div style={{ marginTop: 40, padding: "16px 20px", background: "var(--hl-upsell-green)", borderRadius: 3, textAlign: "left", display: "flex", gap: 14, alignItems: "center" }}>
          <i className="fas fa-bolt" style={{ color: "var(--hl-do-green)", fontSize: 20 }}/>
          <div style={{ flex: 1, fontSize: 14, color: "var(--hl-icon)" }}>
            <b>Next time will be faster.</b> Because we saved your mapping, this brand's next upload skips the review step — straight from file to validation.
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ icon, label, value, last }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 16,
      padding: "12px 0", borderBottom: last ? 0 : "1px solid var(--hl-framing)"
    }}>
      <i className={`fas fa-${icon}`} style={{ color: "var(--hl-go-blue)", width: 20, textAlign: "center" }}/>
      <div style={{ flex: 1, fontSize: 14, color: "var(--hl-fg-2)" }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 14, color: "var(--hl-icon)" }}>{value}</div>
    </div>
  );
}

window.SuccessStep = SuccessStep;
