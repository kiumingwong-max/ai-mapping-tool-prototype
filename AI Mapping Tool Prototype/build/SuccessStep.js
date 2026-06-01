// AUTO-GENERATED from app/SuccessStep.jsx — do not edit directly. Re-run the precompile to regenerate.
// Step 4 — Success screen after a clean validation.

function SuccessStep({
  file,
  mappings,
  result,
  constants,
  onStartOver
}) {
  const schemaMapped = mappings.filter(m => m.target_field && m.target_field !== "__custom__" && m.target_field !== "__option_route__").length;
  const customMapped = mappings.filter(m => m.target_field === "__custom__").length;
  const skipped = mappings.filter(m => !m.target_field).length;
  const struct = file.structure && file.structure.detected ? file.structure : null;
  const heroCount = struct ? struct.productCount : result.totalRows;
  const heroLabel = struct ? struct.productCount === 1 ? "product" : "products" : result.totalRows === 1 ? "row" : "rows";

  // Headline stat tiles
  const stats = [];
  stats.push({
    icon: "boxes-stacked",
    value: heroCount.toLocaleString(),
    label: heroLabel + " imported"
  });
  if (struct && struct.variantCount) stats.push({
    icon: "layer-group",
    value: struct.variantCount.toLocaleString(),
    label: "variants"
  });
  stats.push({
    icon: "diagram-project",
    value: schemaMapped + customMapped,
    label: "columns mapped"
  });
  if (struct && struct.imagesAttached) stats.push({
    icon: "images",
    value: struct.imagesAttached.toLocaleString(),
    label: "images linked"
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 720,
      margin: "40px auto 0",
      padding: "0 32px",
      width: "100%",
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 88,
      height: 88,
      borderRadius: "50%",
      background: "rgba(65,175,75,0.12)",
      color: "var(--hl-do-green)",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 40,
      marginBottom: 20,
      animation: "hl-pop 350ms cubic-bezier(0.2,0,0,1)"
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-check"
  })), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontFamily: "Lato",
      fontWeight: 900,
      fontSize: 32,
      color: "var(--hl-icon)",
      letterSpacing: "-0.015em"
    }
  }, "Import complete", result.importRate != null ? ` · ${result.importRate}%` : ""), /*#__PURE__*/React.createElement("p", {
    style: {
      marginTop: 10,
      marginBottom: 28,
      color: "var(--hl-fg-2)",
      fontSize: 16,
      lineHeight: "24px",
      textWrap: "pretty"
    }
  }, "Everything from ", /*#__PURE__*/React.createElement("b", null, file.filename), " is in your catalog and searchable from the product directory now."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: `repeat(${stats.length}, 1fr)`,
      gap: 12,
      marginBottom: 20
    }
  }, stats.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      background: "#fff",
      border: "2px solid var(--hl-keyline)",
      borderRadius: 4,
      padding: "18px 12px"
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: `fas fa-${s.icon}`,
    style: {
      color: "var(--hl-do-green)",
      fontSize: 16,
      marginBottom: 8,
      display: "block"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 28,
      fontWeight: 900,
      color: "var(--hl-icon)",
      lineHeight: 1,
      fontFamily: "Lato"
    }
  }, s.value), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--hl-fg-2)",
      marginTop: 4
    }
  }, s.label)))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#fff",
      border: "2px solid var(--hl-keyline)",
      borderRadius: 4,
      padding: "8px 20px",
      textAlign: "left",
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement(Row, {
    icon: "file-csv",
    label: "Source file",
    value: file.filename
  }), customMapped > 0 && /*#__PURE__*/React.createElement(Row, {
    icon: "plus-circle",
    label: "Custom fields created",
    value: `${customMapped}`
  }), result.adjustmentCount > 0 && /*#__PURE__*/React.createElement(Row, {
    icon: "wand-magic-sparkles",
    label: "Values auto-formatted",
    value: `${result.adjustmentCount}`
  }), constants && Object.keys(constants).length > 0 && /*#__PURE__*/React.createElement(Row, {
    icon: "thumbtack",
    label: "Constant defaults set",
    value: `${Object.keys(constants).length}`
  }), file.join && /*#__PURE__*/React.createElement(Row, {
    icon: "link",
    label: "Joined columns",
    value: `${file.join.addedColumns} from ${file.join.from}`
  }), skipped > 0 && /*#__PURE__*/React.createElement(Row, {
    icon: "minus-circle",
    label: "Columns skipped",
    value: `${skipped}`
  }), /*#__PURE__*/React.createElement(Row, {
    icon: "bookmark",
    label: "Mapping",
    value: "Saved for next upload",
    last: true
  })), file.structure && file.structure.detected && file.structure.imagesAttached > 0 && /*#__PURE__*/React.createElement(ImageGallery, {
    file: file
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "center",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "supp",
    icon: "upload",
    onClick: onStartOver
  }, "Import another file"), /*#__PURE__*/React.createElement(Button, {
    variant: "do",
    icon: "external-link-alt"
  }, "View imported products")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 40,
      padding: "16px 20px",
      background: "var(--hl-upsell-green)",
      borderRadius: 3,
      textAlign: "left",
      display: "flex",
      gap: 14,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-bolt",
    style: {
      color: "var(--hl-do-green)",
      fontSize: 20
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      fontSize: 14,
      color: "var(--hl-icon)"
    }
  }, /*#__PURE__*/React.createElement("b", null, "Next time will be faster."), " Because we saved your mapping, this brand's next upload skips the review step \u2014 straight from file to validation."))));
}

// Per-product image gallery aggregated by the normalizer (#8)
function ImageGallery({
  file
}) {
  const products = (file.rows || []).filter(r => r.__row_role !== "variant" && r.__image_urls && r.__image_urls.length);
  if (!products.length) return null;
  const show = products.slice(0, 4);
  const titleCol = file.structure && file.structure.titleCol || "Title";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 24,
      background: "#fff",
      border: "2px solid var(--hl-keyline)",
      borderRadius: 3,
      padding: "16px 20px",
      textAlign: "left"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-images",
    style: {
      color: "var(--hl-go-blue)"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700,
      fontSize: 14,
      color: "var(--hl-icon)"
    }
  }, "Image galleries linked"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: "var(--hl-fg-3)"
    }
  }, "\xB7 ", file.structure.imagesAttached.toLocaleString(), " images across ", products.length.toLocaleString(), " products")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, show.map((p, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 140,
      fontSize: 12,
      fontWeight: 700,
      color: "var(--hl-icon)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, p[titleCol] || "Product"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flex: 1,
      overflow: "hidden"
    }
  }, p.__image_urls.slice(0, 6).map((u, j) => /*#__PURE__*/React.createElement("div", {
    key: j,
    style: {
      width: 40,
      height: 40,
      borderRadius: 3,
      overflow: "hidden",
      background: "var(--hl-framing)",
      flexShrink: 0,
      border: "1px solid var(--hl-keyline)"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: u,
    alt: "",
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover"
    },
    onError: e => {
      e.target.style.display = "none";
    }
  }))), p.__image_urls.length > 6 && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 40,
      height: 40,
      borderRadius: 3,
      background: "var(--hl-framing)",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 11,
      fontWeight: 700,
      color: "var(--hl-fg-2)",
      flexShrink: 0
    }
  }, "+", p.__image_urls.length - 6))))));
}
function Row({
  icon,
  label,
  value,
  last
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 16,
      padding: "12px 0",
      borderBottom: last ? 0 : "1px solid var(--hl-framing)"
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: `fas fa-${icon}`,
    style: {
      color: "var(--hl-go-blue)",
      width: 20,
      textAlign: "center"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      fontSize: 14,
      color: "var(--hl-fg-2)"
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 14,
      color: "var(--hl-icon)"
    }
  }, value));
}
window.SuccessStep = SuccessStep;