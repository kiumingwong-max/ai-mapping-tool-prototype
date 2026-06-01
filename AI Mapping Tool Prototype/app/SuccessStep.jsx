// Step 4 — Success screen after a clean validation.

function SuccessStep({ file, mappings, result, constants, onStartOver }) {
  const schemaMapped = mappings.filter(m => m.target_field && m.target_field !== "__custom__" && m.target_field !== "__option_route__").length;
  const customMapped = mappings.filter(m => m.target_field === "__custom__").length;
  const skipped = mappings.filter(m => !m.target_field).length;
  const struct = file.structure && file.structure.detected ? file.structure : null;
  const heroCount = struct ? struct.productCount : result.totalRows;
  const heroLabel = struct ? (struct.productCount === 1 ? "product" : "products") : (result.totalRows === 1 ? "row" : "rows");

  // Headline stat tiles
  const stats = [];
  stats.push({ icon: "boxes-stacked", value: heroCount.toLocaleString(), label: heroLabel + " imported" });
  if (struct && struct.variantCount) stats.push({ icon: "layer-group", value: struct.variantCount.toLocaleString(), label: "variants" });
  stats.push({ icon: "diagram-project", value: schemaMapped + customMapped, label: "columns mapped" });
  if (struct && struct.imagesAttached) stats.push({ icon: "images", value: struct.imagesAttached.toLocaleString(), label: "images linked" });

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ maxWidth: 720, margin: "40px auto 0", padding: "0 32px", width: "100%", textAlign: "center" }}>
        <div style={{
          width: 88, height: 88, borderRadius: "50%",
          background: "rgba(65,175,75,0.12)", color: "var(--hl-do-green)",
          display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 40,
          marginBottom: 20,
          animation: "hl-pop 350ms cubic-bezier(0.2,0,0,1)",
        }}>
          <i className="fas fa-check"/>
        </div>
        <h1 style={{ margin: 0, fontFamily: "Lato", fontWeight: 900, fontSize: 32, color: "var(--hl-icon)", letterSpacing: "-0.015em" }}>
          Import complete{result.importRate != null ? ` · ${result.importRate}%` : ""}
        </h1>
        <p style={{ marginTop: 10, marginBottom: 28, color: "var(--hl-fg-2)", fontSize: 16, lineHeight: "24px", textWrap: "pretty" }}>
          Everything from <b>{file.filename}</b> is in your catalog and searchable from the product directory now.
        </p>

        {/* Hero stat tiles */}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${stats.length}, 1fr)`, gap: 12, marginBottom: 20 }}>
          {stats.map((s, i) => (
            <div key={i} style={{ background: "#fff", border: "2px solid var(--hl-keyline)", borderRadius: 4, padding: "18px 12px" }}>
              <i className={`fas fa-${s.icon}`} style={{ color: "var(--hl-do-green)", fontSize: 16, marginBottom: 8, display: "block" }}/>
              <div style={{ fontSize: 28, fontWeight: 900, color: "var(--hl-icon)", lineHeight: 1, fontFamily: "Lato" }}>{s.value}</div>
              <div style={{ fontSize: 12, color: "var(--hl-fg-2)", marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Detail rows — secondary, collapsible-feel info */}
        <div style={{ background: "#fff", border: "2px solid var(--hl-keyline)", borderRadius: 4, padding: "8px 20px", textAlign: "left", marginBottom: 24 }}>
          <Row icon="file-csv" label="Source file" value={file.filename}/>
          {customMapped > 0 && (
            <Row icon="plus-circle" label="Custom fields created" value={`${customMapped}`}/>
          )}
          {result.adjustmentCount > 0 && (
            <Row icon="wand-magic-sparkles" label="Values auto-formatted" value={`${result.adjustmentCount}`}/>
          )}
          {constants && Object.keys(constants).length > 0 && (
            <Row icon="thumbtack" label="Constant defaults set" value={`${Object.keys(constants).length}`}/>
          )}
          {file.join && (
            <Row icon="link" label="Joined columns" value={`${file.join.addedColumns} from ${file.join.from}`}/>
          )}
          {skipped > 0 && (
            <Row icon="minus-circle" label="Columns skipped" value={`${skipped}`}/>
          )}
          <Row icon="bookmark" label="Mapping" value="Saved for next upload" last/>
        </div>

        {/* Image gallery (#8) — thumbnails aggregated per product */}
        {file.structure && file.structure.detected && file.structure.imagesAttached > 0 && (
          <ImageGallery file={file}/>
        )}

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

// Per-product image gallery aggregated by the normalizer (#8)
function ImageGallery({ file }) {
  const products = (file.rows || []).filter(r => r.__row_role !== "variant" && r.__image_urls && r.__image_urls.length);
  if (!products.length) return null;
  const show = products.slice(0, 4);
  const titleCol = (file.structure && file.structure.titleCol) || "Title";
  return (
    <div style={{ marginTop: 24, background: "#fff", border: "2px solid var(--hl-keyline)", borderRadius: 3, padding: "16px 20px", textAlign: "left" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <i className="fas fa-images" style={{ color: "var(--hl-go-blue)" }}/>
        <span style={{ fontWeight: 700, fontSize: 14, color: "var(--hl-icon)" }}>Image galleries linked</span>
        <span style={{ fontSize: 12, color: "var(--hl-fg-3)" }}>· {file.structure.imagesAttached.toLocaleString()} images across {products.length.toLocaleString()} products</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {show.map((p, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 140, fontSize: 12, fontWeight: 700, color: "var(--hl-icon)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p[titleCol] || "Product"}
            </div>
            <div style={{ display: "flex", gap: 6, flex: 1, overflow: "hidden" }}>
              {p.__image_urls.slice(0, 6).map((u, j) => (
                <div key={j} style={{ width: 40, height: 40, borderRadius: 3, overflow: "hidden", background: "var(--hl-framing)", flexShrink: 0, border: "1px solid var(--hl-keyline)" }}>
                  <img src={u} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.target.style.display = "none"; }}/>
                </div>
              ))}
              {p.__image_urls.length > 6 && (
                <div style={{ width: 40, height: 40, borderRadius: 3, background: "var(--hl-framing)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "var(--hl-fg-2)", flexShrink: 0 }}>
                  +{p.__image_urls.length - 6}
                </div>
              )}
            </div>
          </div>
        ))}
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
