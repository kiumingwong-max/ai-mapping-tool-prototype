// AUTO-GENERATED from app/MappingStep.jsx — do not edit directly. Re-run the precompile to regenerate.
// Step 2 — Mapping review.
//
// Each mapping row carries:
//   { user_header, target_field, custom_field_name, confidence, reason, status, manual }
// where target_field is one of:
//   - a schema field id  (e.g. "product_name")
//   - "__custom__"       (user keeps the column as a custom field with its own name)
//   - null               (skipped — not imported)

const {
  useState: useStateM,
  useEffect: useEffectM,
  useMemo: useMemoM,
  useRef: useRefM
} = React;
const CUSTOM_VALUE = "__custom__";
function MappingStep({
  file,
  onConfirm,
  onBack
}) {
  const [mappings, setMappings] = useStateM(null);
  const [loading, setLoading] = useStateM(true);
  const [error, setError] = useStateM(null);
  const [filter, setFilter] = useStateM(null); // null | "auto_confirmed" | ...
  const [grouped, setGrouped] = useStateM(false); // group-by-status view (#3)
  const [constants, setConstants] = useStateM({}); // required-field defaults (#5)
  const [savedApplied, setSavedApplied] = useStateM(null); // {key, label} if a saved mapping was loaded (#2)
  const [showPreview, setShowPreview] = useStateM(false); // row-preview drawer

  // Per-column profile (distinct count + fill rate) over a capped row scan —
  // reinforces the "mapping UI is the product" principle (RFC AnalyzeFileTool).
  const columnProfile = useMemoM(() => {
    const rows = file.rows || [];
    const scan = Math.min(rows.length, 400);
    const prof = {};
    for (const h of file.headers) {
      const seen = new Set();
      let filled = 0;
      for (let i = 0; i < scan; i++) {
        const v = String((rows[i] || {})[h] ?? "").trim();
        if (v) {
          filled++;
          if (seen.size < 1000) seen.add(v);
        }
      }
      prof[h] = {
        distinct: seen.size,
        fillPct: scan ? Math.round(filled / scan * 100) : 0
      };
    }
    return prof;
  }, [file]);

  // A stable signature for the file's format (sorted headers + sheet) so we can
  // remember a confirmed mapping and re-apply it to the next file of the same shape.
  const formatKey = useMemoM(() => window.SavedMappings.formatKey(file), [file]);
  useEffectM(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const raw = await window.callMappingLLM(file.headers, file.rows);
        if (cancelled) return;
        const byHeader = Object.fromEntries(raw.map(m => [m.user_header, m]));
        let normalized = file.headers.map(h => {
          const m = byHeader[h] || {
            user_header: h
          };
          return {
            user_header: h,
            target_field: m.target_field ?? null,
            custom_field_name: m.custom_field_name ?? null,
            confidence: Number(m.confidence) || 0,
            reason: m.reason || "",
            status: m.status || window.statusFromConfidence(Number(m.confidence) || 0),
            manual: false,
            fill_rate: typeof m.fill_rate === "number" ? m.fill_rate : null,
            data_profile: m.data_profile || null,
            recommended_from_data: !!m.recommended_from_data,
            name_source: m.name_source || null,
            // Transforms
            transform: m.transform || null,
            system_role: m.system_role || null,
            option_index: m.option_index ?? null,
            option_name_header: m.option_name_header || null,
            option_routes: m.option_routes || null,
            tier_group: m.tier_group || null,
            tier_index: m.tier_index ?? null,
            fdm_type: m.fdm_type || null
          };
        });
        // Apply a saved mapping for this format, if one exists (#2)
        const saved = window.SavedMappings.load(formatKey);
        if (saved) {
          normalized = window.SavedMappings.apply(normalized, saved);
          if (!cancelled) {
            setSavedApplied({
              key: formatKey,
              label: saved.label,
              savedAt: saved.savedAt
            });
            if (saved.constants) setConstants(saved.constants);
          }
        }
        setMappings(normalized);
      } catch (e) {
        setError("We couldn't reach the mapping service. Try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  // Set a row's target. Special values:
  //  ""            → skip column
  //  "__custom__"  → keep as custom field (use header as default name)
  //  "<field_id>"  → map to schema field
  const setTarget = (header, value) => {
    setMappings(curr => curr.map(m => {
      if (m.user_header !== header) return m;
      // Manual override clears the AI-recommendation flag but keeps the column's
      // data profile / fill-rate metadata for context.
      const keep = {
        fill_rate: m.fill_rate,
        data_profile: m.data_profile,
        recommended_from_data: false
      };
      if (value === "") {
        return {
          ...m,
          ...keep,
          target_field: null,
          custom_field_name: null,
          status: "unmapped",
          manual: true,
          confidence: 0
        };
      }
      if (value === CUSTOM_VALUE) {
        const samples = (file.rows || []).slice(0, 20).map(r => r[header]).filter(Boolean);
        return {
          ...m,
          ...keep,
          target_field: CUSTOM_VALUE,
          custom_field_name: m.custom_field_name || m.user_header,
          fdm_type: m.fdm_type || (window.Transforms ? window.Transforms.inferFieldType(samples) : "string"),
          status: "custom",
          manual: true,
          confidence: 1
        };
      }
      return {
        ...m,
        ...keep,
        target_field: value,
        custom_field_name: null,
        status: "auto_confirmed",
        manual: true,
        confidence: 1
      };
    }));
  };
  const setCustomName = (header, name) => {
    setMappings(curr => curr.map(m => m.user_header === header ? {
      ...m,
      custom_field_name: name
    } : m));
  };

  // Set the FDM type on a custom field (typed-variant)
  const setFdmType = (header, type) => {
    setMappings(curr => curr.map(m => m.user_header === header ? {
      ...m,
      fdm_type: type
    } : m));
  };

  // Set the routing target for one option name within an option-route column.
  const setOptionRoute = (header, optName, target) => {
    setMappings(curr => curr.map(m => {
      if (m.user_header !== header || !m.option_routes) return m;
      const routes = {
        ...m.option_routes
      };
      const T = window.Transforms;
      if (target === "") routes[optName] = {
        target: null,
        reason: "skipped"
      };else if (target === CUSTOM_VALUE) routes[optName] = {
        target: "__custom__",
        custom: T.titleCase(optName),
        reason: "custom field"
      };else routes[optName] = {
        target,
        reason: "manual"
      };
      return {
        ...m,
        option_routes: routes,
        manual: true
      };
    }));
  };

  // Toggle the multi-value split transform on a column.
  const toggleSplit = header => {
    setMappings(curr => curr.map(m => {
      if (m.user_header !== header) return m;
      if (m.transform && m.transform.type === "split") return {
        ...m,
        transform: null,
        manual: true
      };
      // Re-detect a delimiter from the data
      const samples = (file.rows || []).slice(0, 40).map(r => r[header]).filter(Boolean);
      const mv = window.Transforms.detectMultiValue(samples) || {
        delimiter: ",",
        label: "comma",
        avgCount: 2
      };
      return {
        ...m,
        transform: {
          type: "split",
          ...mv
        },
        manual: true
      };
    }));
  };

  // Toggle HTML-strip transform (#7)
  const toggleStripHtml = header => {
    setMappings(curr => curr.map(m => {
      if (m.user_header !== header) return m;
      if (m.transform && m.transform.type === "strip_html") return {
        ...m,
        transform: null,
        manual: true
      };
      return {
        ...m,
        transform: {
          type: "strip_html",
          label: "strip HTML"
        },
        manual: true
      };
    }));
  };

  // ─── Bulk actions (#3) ─────────────────────────────────────────────
  const acceptAllRecommendations = () => {
    setMappings(curr => curr.map(m => {
      if ((m.status === "recommended" || m.status === "low_confidence") && m.target_field && m.target_field !== CUSTOM_VALUE) {
        return {
          ...m,
          status: "auto_confirmed",
          manual: true,
          recommended_from_data: false,
          reason: "Accepted recommendation"
        };
      }
      return m;
    }));
  };
  const skipAllUnmapped = () => {
    setMappings(curr => curr.map(m => m.status === "unmapped" ? {
      ...m,
      target_field: null,
      custom_field_name: null,
      manual: true
    } : m));
  };
  const keepAllCustom = () => {
    setMappings(curr => curr.map(m => m.status === "low_confidence" ? {
      ...m,
      target_field: CUSTOM_VALUE,
      custom_field_name: m.custom_field_name || m.user_header,
      status: "custom",
      manual: true
    } : m));
  };

  // Constants for required-but-unmapped fields (#5)
  const setConstant = (fieldId, value) => {
    setConstants(c => {
      const next = {
        ...c
      };
      if (value === "" || value == null) delete next[fieldId];else next[fieldId] = value;
      return next;
    });
  };
  const forgetSaved = () => {
    if (savedApplied) {
      window.SavedMappings.forget(savedApplied.key);
      setSavedApplied(null);
    }
  };

  // Row renderer shared by flat + grouped views
  const renderRow = m => /*#__PURE__*/React.createElement(MappingRow, {
    key: m.user_header,
    row: m,
    sample: file.rows.slice(0, 4).map(r => r[m.user_header]).filter(Boolean),
    usedTargets: usedTargets,
    isDupCustom: m.target_field === CUSTOM_VALUE && m.custom_field_name && dupCustoms.has((m.custom_field_name || "").trim().toLowerCase()),
    onTargetChange: v => setTarget(m.user_header, v),
    onCustomNameChange: n => setCustomName(m.user_header, n),
    onOptionRoute: (name, t) => setOptionRoute(m.user_header, name, t),
    onToggleSplit: () => toggleSplit(m.user_header),
    onToggleStripHtml: () => toggleStripHtml(m.user_header),
    onFdmType: t => setFdmType(m.user_header, t)
  });
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
    return mappings.filter(m => m.target_field === CUSTOM_VALUE && m.custom_field_name).map(m => m.custom_field_name.trim().toLowerCase());
  }, [mappings]);
  const requiredUnmapped = useMemoM(() => {
    if (!mappings) return [];
    const mapped = new Set(mappings.map(m => m.target_field).filter(Boolean));
    const equiv = window.FIELD_EQUIVALENTS || {};
    const satisfied = id => mapped.has(id) || (equiv[id] || []).some(e => mapped.has(e));
    return window.TARGET_SCHEMA.filter(f => f.required && !satisfied(f.id) && !window.ACCOUNT_PROVIDES.includes(f.id) // brand_name etc. come from the logged-in account
    && !(constants && constants[f.id]) // satisfied by a constant/default (#5)
    );
  }, [mappings, constants]);

  // Auto-seed suggested defaults for required fields with no source column (RFC:
  // "default values unlock v1 viability"). Seeds once when mappings settle.
  const seededRef = useRefM(false);
  useEffectM(() => {
    if (!mappings || seededRef.current) return;
    const mapped = new Set(mappings.map(m => m.target_field).filter(Boolean));
    const seed = {};
    window.TARGET_SCHEMA.forEach(f => {
      if (f.required && f.suggestedDefault && !mapped.has(f.id) && !window.ACCOUNT_PROVIDES.includes(f.id)) {
        seed[f.id] = f.suggestedDefault;
      }
    });
    if (Object.keys(seed).length) setConstants(c => ({
      ...seed,
      ...c
    }));
    seededRef.current = true;
  }, [mappings]);

  // Required fields that are satisfied by the account context (no column needed).
  const accountSatisfied = useMemoM(() => {
    if (!mappings) return [];
    const mapped = new Set(mappings.map(m => m.target_field).filter(Boolean));
    return window.TARGET_SCHEMA.filter(f => f.required && window.ACCOUNT_PROVIDES.includes(f.id) && !mapped.has(f.id));
  }, [mappings]);
  const counts = useMemoM(() => {
    if (!mappings) return {
      auto: 0,
      rec: 0,
      low: 0,
      un: 0,
      custom: 0,
      routed: 0,
      system: 0,
      split: 0
    };
    return {
      auto: mappings.filter(m => m.status === "auto_confirmed").length,
      rec: mappings.filter(m => m.status === "recommended").length,
      low: mappings.filter(m => m.status === "low_confidence").length,
      un: mappings.filter(m => m.status === "unmapped").length,
      custom: mappings.filter(m => m.status === "custom" || m.target_field === CUSTOM_VALUE).length,
      routed: mappings.filter(m => m.status === "option_route").length,
      system: mappings.filter(m => m.status === "system").length,
      split: mappings.filter(m => m.transform && m.transform.type === "split").length
    };
  }, [mappings]);
  if (loading) return /*#__PURE__*/React.createElement(MappingSkeleton, {
    file: file
  });
  if (error) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        padding: 80,
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement("i", {
      className: "fas fa-exclamation-triangle",
      style: {
        fontSize: 32,
        color: "var(--hl-no-red)",
        marginBottom: 16,
        display: "block"
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 700,
        marginBottom: 12
      }
    }, error), /*#__PURE__*/React.createElement(Button, {
      variant: "supp",
      onClick: onBack
    }, "Go back"));
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
  const customNamesValid = mappings.every(m => m.target_field !== CUSTOM_VALUE || m.custom_field_name && m.custom_field_name.trim() && !dupCustoms.has(m.custom_field_name.trim().toLowerCase()));
  const canProceed = requiredUnmapped.length === 0 && customNamesValid;

  // Filter the visible row set. Custom-field rows match either status === "custom" or target_field === CUSTOM_VALUE.
  const visibleMappings = !filter ? mappings : mappings.filter(m => {
    if (filter === "custom") return m.status === "custom" || m.target_field === CUSTOM_VALUE;
    if (filter === "__split__") return m.transform && m.transform.type === "split";
    return m.status === filter;
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
      maxWidth: 1100,
      margin: "0 auto",
      padding: "32px 32px 24px",
      width: "100%"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 32,
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontSize: 24,
      fontWeight: 700,
      color: "var(--hl-icon)"
    }
  }, "Review column mappings"), /*#__PURE__*/React.createElement("p", {
    style: {
      marginTop: 8,
      marginBottom: 0,
      color: "var(--hl-fg-2)",
      fontSize: 15,
      lineHeight: "22px"
    }
  }, "We matched your file's columns to NuO's product schema, aligned with the Shopify Standard Product Taxonomy (", window.TARGET_SCHEMA.length, " fields across ", window.TARGET_SCHEMA_GROUPS.length, " groups). Each NuO field can only be mapped once. Columns we can't match confidently are kept as custom fields so nothing is lost.")), /*#__PURE__*/React.createElement(FileMeta, {
    file: file
  })), file.structure && file.structure.detected && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: 14,
      padding: "14px 18px",
      marginBottom: 16,
      borderRadius: 3,
      background: "rgba(65,175,75,0.06)",
      border: "1px solid rgba(65,175,75,0.28)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 32,
      height: 32,
      borderRadius: 3,
      flexShrink: 0,
      background: "var(--hl-do-green)",
      color: "#fff",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-sitemap"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      fontSize: 13,
      lineHeight: "19px",
      color: "var(--hl-fg-1)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      color: "var(--hl-icon)",
      marginBottom: 2
    }
  }, "Multi-row file detected \u2014 grouped by ", /*#__PURE__*/React.createElement("code", {
    style: {
      fontFamily: "var(--hl-font-mono)",
      background: "var(--hl-framing)",
      padding: "1px 5px",
      borderRadius: 2
    }
  }, file.structure.groupKey)), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--hl-fg-2)"
    }
  }, "We grouped ", /*#__PURE__*/React.createElement("b", null, file.structure.originalRowCount.toLocaleString()), " rows into", " ", /*#__PURE__*/React.createElement("b", null, file.structure.productCount.toLocaleString()), " product", file.structure.productCount === 1 ? "" : "s", file.structure.variantCount > 0 && /*#__PURE__*/React.createElement(React.Fragment, null, " + ", /*#__PURE__*/React.createElement("b", null, file.structure.variantCount.toLocaleString()), " variant", file.structure.variantCount === 1 ? "" : "s"), file.structure.imageRowCount > 0 && /*#__PURE__*/React.createElement(React.Fragment, null, ", set aside ", /*#__PURE__*/React.createElement("b", null, file.structure.imageRowCount.toLocaleString()), " additional-image row", file.structure.imageRowCount === 1 ? "" : "s"), file.structure.filledCells > 0 && /*#__PURE__*/React.createElement(React.Fragment, null, ", and copied shared product details down into ", /*#__PURE__*/React.createElement("b", null, file.structure.filledCells.toLocaleString()), " blank variant cell", file.structure.filledCells === 1 ? "" : "s"), "."))), savedApplied && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 14,
      padding: "12px 18px",
      marginBottom: 16,
      borderRadius: 3,
      background: "rgba(5,141,233,0.07)",
      border: "1px solid rgba(5,141,233,0.3)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 32,
      height: 32,
      borderRadius: 3,
      flexShrink: 0,
      background: "var(--hl-go-blue)",
      color: "#fff",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-bookmark"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      fontSize: 13,
      lineHeight: "18px",
      color: "var(--hl-fg-1)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700,
      color: "var(--hl-icon)"
    }
  }, "Saved mapping applied \u2014 \u201C", savedApplied.label, "\u201D."), " ", "We remembered this format from a previous upload and pre-filled every column. Review and continue, or", /*#__PURE__*/React.createElement("button", {
    onClick: forgetSaved,
    style: {
      background: "none",
      border: 0,
      padding: "0 0 0 4px",
      color: "var(--hl-go-blue)",
      fontWeight: 700,
      cursor: "pointer",
      fontFamily: "inherit",
      fontSize: 13
    }
  }, "start fresh"), ".")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: 16,
      flexWrap: "wrap",
      alignItems: "center"
    }
  }, counts.auto > 0 && /*#__PURE__*/React.createElement(FilterChip, {
    tone: "success",
    icon: "check",
    label: `${counts.auto} auto-confirmed`,
    active: filter === "auto_confirmed",
    onClick: () => setFilter(filter === "auto_confirmed" ? null : "auto_confirmed")
  }), counts.rec > 0 && /*#__PURE__*/React.createElement(FilterChip, {
    tone: "warn",
    icon: "exclamation-circle",
    label: `${counts.rec} need review`,
    active: filter === "recommended",
    onClick: () => setFilter(filter === "recommended" ? null : "recommended")
  }), counts.low > 0 && /*#__PURE__*/React.createElement(FilterChip, {
    tone: "warn",
    icon: "search",
    label: `${counts.low} low confidence`,
    active: filter === "low_confidence",
    onClick: () => setFilter(filter === "low_confidence" ? null : "low_confidence")
  }), counts.custom > 0 && /*#__PURE__*/React.createElement(FilterChip, {
    tone: "info",
    icon: "plus-circle",
    label: `${counts.custom} custom field${counts.custom === 1 ? "" : "s"}`,
    active: filter === "custom",
    onClick: () => setFilter(filter === "custom" ? null : "custom")
  }), counts.routed > 0 && /*#__PURE__*/React.createElement(FilterChip, {
    tone: "violet",
    icon: "code-branch",
    label: `${counts.routed} conditional`,
    active: filter === "option_route",
    onClick: () => setFilter(filter === "option_route" ? null : "option_route")
  }), counts.split > 0 && /*#__PURE__*/React.createElement(FilterChip, {
    tone: "violet",
    icon: "scissors",
    label: `${counts.split} multi-value`,
    active: filter === "__split__",
    onClick: () => setFilter(filter === "__split__" ? null : "__split__")
  }), counts.un > 0 && /*#__PURE__*/React.createElement(FilterChip, {
    tone: "err",
    icon: "minus-circle",
    label: `${counts.un} skipped`,
    active: filter === "unmapped",
    onClick: () => setFilter(filter === "unmapped" ? null : "unmapped")
  }), filter && /*#__PURE__*/React.createElement("button", {
    onClick: () => setFilter(null),
    style: {
      marginLeft: 4,
      height: 28,
      padding: "0 10px",
      background: "transparent",
      border: 0,
      cursor: "pointer",
      color: "var(--hl-go-blue)",
      fontFamily: "inherit",
      fontWeight: 700,
      fontSize: 13,
      display: "inline-flex",
      alignItems: "center",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-times",
    style: {
      fontSize: 11
    }
  }), "Clear filter")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: 16,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: "var(--hl-fg-3)",
      textTransform: "uppercase",
      letterSpacing: ".04em",
      marginRight: 2
    }
  }, "Bulk"), counts.rec + counts.low > 0 && /*#__PURE__*/React.createElement(BulkBtn, {
    icon: "check-double",
    onClick: acceptAllRecommendations
  }, "Accept all recommendations"), counts.low > 0 && /*#__PURE__*/React.createElement(BulkBtn, {
    icon: "plus-circle",
    onClick: keepAllCustom
  }, "Keep low-confidence as custom"), counts.un > 0 && /*#__PURE__*/React.createElement(BulkBtn, {
    icon: "minus-circle",
    onClick: skipAllUnmapped
  }, "Skip all unmapped"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(BulkBtn, {
    icon: "table-list",
    onClick: () => setShowPreview(true)
  }, "Preview data"), /*#__PURE__*/React.createElement(BulkBtn, {
    icon: grouped ? "list" : "layer-group",
    onClick: () => setGrouped(g => !g),
    active: grouped
  }, grouped ? "Flat list" : "Group by status")), accountSatisfied.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "10px 16px",
      borderRadius: 3,
      background: "rgba(5,141,233,0.06)",
      border: "1px solid rgba(5,141,233,0.20)",
      color: "var(--hl-fg-1)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      fontSize: 13,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-user-shield",
    style: {
      color: "var(--hl-go-blue)"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700
    }
  }, accountSatisfied.map(f => f.label).join(", ")), " ", accountSatisfied.length === 1 ? "comes" : "come", " from your account ", /*#__PURE__*/React.createElement("b", null, "(Test Brand)"), " \u2014 no column mapping needed. Map a column above to override per row.")), requiredUnmapped.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "12px 16px",
      borderRadius: 3,
      background: "rgba(187,42,26,0.08)",
      color: "var(--hl-no-red)",
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      fontSize: 14,
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-exclamation-triangle"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700
    }
  }, "Required fields aren't mapped: "), requiredUnmapped.map(f => f.label).join(", "), ". Map a column below \u2014 or set a constant value to apply to every row.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 10,
      paddingLeft: 26
    }
  }, requiredUnmapped.map(f => /*#__PURE__*/React.createElement("div", {
    key: f.id,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: "var(--hl-fg-2)"
    }
  }, f.label, " ="), /*#__PURE__*/React.createElement("input", {
    type: "text",
    placeholder: "set a constant\u2026",
    value: constants[f.id] || "",
    onChange: e => setConstant(f.id, e.target.value),
    style: {
      height: 30,
      width: 160,
      borderRadius: 3,
      border: "2px solid var(--hl-keyline)",
      padding: "0 10px",
      fontFamily: "inherit",
      fontSize: 13,
      fontWeight: 700,
      color: "var(--hl-icon)"
    }
  }))))), Object.keys(constants).length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "10px 16px",
      borderRadius: 3,
      marginBottom: 16,
      background: "rgba(65,175,75,0.06)",
      border: "1px solid rgba(65,175,75,0.25)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      fontSize: 13,
      color: "var(--hl-fg-1)"
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-thumbtack",
    style: {
      color: "var(--hl-do-green)"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("b", null, "Constant values"), " applied to every row:", " ", Object.entries(constants).map(([k, v], i) => /*#__PURE__*/React.createElement("span", {
    key: k
  }, i > 0 ? ", " : "", /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--hl-icon)"
    }
  }, (window.TARGET_SCHEMA.find(f => f.id === k) || {}).label || k), " = \u201C", v, "\u201D")))), !customNamesValid && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "12px 16px",
      borderRadius: 3,
      background: "rgba(187,42,26,0.08)",
      color: "var(--hl-no-red)",
      display: "flex",
      alignItems: "center",
      gap: 12,
      fontSize: 14,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-exclamation-triangle"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700
    }
  }, "Custom field names must be unique and not empty."))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#fff",
      border: "2px solid var(--hl-keyline)",
      borderRadius: 3,
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 32px 1fr 140px",
      padding: "12px 20px",
      background: "var(--hl-framing)",
      fontWeight: 700,
      fontSize: 12,
      color: "var(--hl-fg-2)",
      letterSpacing: ".04em",
      textTransform: "uppercase",
      display: "grid",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("div", null, "Your file", filter ? /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 8,
      fontWeight: 400,
      textTransform: "none",
      letterSpacing: 0,
      color: "var(--hl-fg-3)"
    }
  }, "showing ", visibleMappings.length, " of ", mappings.length) : null), /*#__PURE__*/React.createElement("div", null), /*#__PURE__*/React.createElement("div", null, "NuORDER field"), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "right"
    }
  }, "Confidence")), visibleMappings.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "40px 20px",
      textAlign: "center",
      color: "var(--hl-fg-3)",
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-filter",
    style: {
      marginRight: 8
    }
  }), "No columns match this filter.") : grouped && !filter ?
  // Group-by-status view (#3)
  GROUP_ORDER.map(st => {
    const rowsIn = visibleMappings.filter(m => st === "custom" ? m.status === "custom" || m.target_field === CUSTOM_VALUE : m.status === st);
    if (!rowsIn.length) return null;
    const tone = STATUS_TONES[st] || STATUS_TONES.unmapped;
    return /*#__PURE__*/React.createElement(React.Fragment, {
      key: st
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "8px 20px",
        background: "var(--hl-bg-subtle, #F0F4F4)",
        borderTop: "1px solid var(--hl-keyline)",
        fontSize: 11,
        fontWeight: 900,
        letterSpacing: ".06em",
        textTransform: "uppercase",
        color: tone.fg,
        display: "flex",
        alignItems: "center",
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("i", {
      className: `fas fa-${tone.icon}`,
      style: {
        fontSize: 11
      }
    }), tone.label, " \xB7 ", rowsIn.length), rowsIn.map(renderRow));
  }) : visibleMappings.map(renderRow)), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16,
      display: "flex",
      alignItems: "center",
      gap: 10,
      color: "var(--hl-fg-2)",
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-bookmark",
    style: {
      color: "var(--hl-go-blue)"
    }
  }), "We'll save this mapping for ", extractBrandName(file), " so the next upload skips review.")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "auto"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "sticky",
      bottom: 0,
      background: "#fff",
      borderTop: "1px solid var(--hl-keyline)",
      boxShadow: "var(--hl-shadow-action-bar)",
      padding: "14px 32px",
      display: "flex",
      alignItems: "center",
      gap: 12,
      justifyContent: "space-between",
      zIndex: 2
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "text",
    icon: "arrow-left",
    onClick: onBack
  }, "Back to upload"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 16
    }
  }, !canProceed && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: "var(--hl-fg-3)"
    }
  }, requiredUnmapped.length > 0 ? "Map all required fields to continue" : "Fix custom field names to continue"), /*#__PURE__*/React.createElement(Button, {
    variant: "do",
    disabled: !canProceed,
    onClick: () => {
      window.SavedMappings.save(file, mappings, constants); // remember for next file of this format (#2)
      onConfirm(mappings, constants);
    }
  }, "Validate and continue", /*#__PURE__*/React.createElement("i", {
    className: "fas fa-arrow-right",
    style: {
      marginLeft: 4
    }
  })))), showPreview && /*#__PURE__*/React.createElement(RowPreview, {
    file: file,
    profile: columnProfile,
    onClose: () => setShowPreview(false)
  }));
}

// Row-preview drawer — browse the file's first rows with per-column profile
function RowPreview({
  file,
  profile,
  onClose
}) {
  const rows = (file.rows || []).slice(0, 20);
  const cols = file.headers.slice(0, 40);
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.5)",
      zIndex: 50,
      display: "flex",
      justifyContent: "flex-end"
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      width: "min(960px, 92vw)",
      height: "100%",
      background: "#fff",
      display: "flex",
      flexDirection: "column",
      boxShadow: "var(--hl-shadow-modal)",
      animation: "hl-pop 200ms cubic-bezier(0.2,0,0,1)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "16px 24px",
      borderBottom: "1px solid var(--hl-keyline)",
      display: "flex",
      alignItems: "center",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-table-list",
    style: {
      color: "var(--hl-go-blue)"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 15,
      color: "var(--hl-icon)"
    }
  }, "Data preview"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "var(--hl-fg-3)"
    }
  }, file.headers.length, " columns \xB7 ", (file.rows || []).length.toLocaleString(), " rows \xB7 showing first ", rows.length)), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      width: 32,
      height: 32,
      borderRadius: "50%",
      border: "0",
      background: "var(--hl-framing)",
      cursor: "pointer",
      color: "var(--hl-fg-2)"
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-times"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      overflow: "auto",
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      borderCollapse: "collapse",
      fontSize: 12,
      width: "max-content",
      minWidth: "100%"
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, cols.map(h => {
    const p = profile[h] || {};
    return /*#__PURE__*/React.createElement("th", {
      key: h,
      style: {
        position: "sticky",
        top: 0,
        background: "var(--hl-framing)",
        textAlign: "left",
        padding: "8px 12px",
        borderRight: "1px solid var(--hl-keyline)",
        borderBottom: "2px solid var(--hl-keyline)",
        whiteSpace: "nowrap",
        verticalAlign: "top"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 700,
        color: "var(--hl-icon)"
      }
    }, h), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        fontWeight: 400,
        color: "var(--hl-fg-3)",
        marginTop: 2
      }
    }, p.distinct != null ? `${p.distinct} distinct · ${p.fillPct}% filled` : ""));
  }))), /*#__PURE__*/React.createElement("tbody", null, rows.map((r, ri) => /*#__PURE__*/React.createElement("tr", {
    key: ri,
    style: {
      background: ri % 2 ? "var(--hl-bg-subtle, #F7FAFA)" : "#fff"
    }
  }, cols.map(h => /*#__PURE__*/React.createElement("td", {
    key: h,
    style: {
      padding: "6px 12px",
      borderRight: "1px solid var(--hl-framing)",
      borderBottom: "1px solid var(--hl-framing)",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      maxWidth: 240,
      color: "var(--hl-fg-1)",
      fontFamily: "var(--hl-font-mono)"
    },
    title: String(r[h] ?? "")
  }, String(r[h] ?? "").slice(0, 80))))))))));
}
function extractBrandName(file) {
  // The brand defaults to "Test Brand" — in production this would come from the
  // logged-in account, but for the prototype we keep it stable across files.
  return "Test Brand";
}

// ─── Status palette ────────────────────────────────────────────────────

const STATUS_TONES = {
  auto_confirmed: {
    fg: "var(--hl-do-green)",
    bg: "rgba(65,175,75,0.06)",
    icon: "check-circle",
    label: "Auto-confirmed"
  },
  recommended: {
    fg: "#B47A00",
    bg: "rgba(250,199,55,0.10)",
    icon: "exclamation-circle",
    label: "Recommended"
  },
  low_confidence: {
    fg: "#B47A00",
    bg: "rgba(250,199,55,0.08)",
    icon: "search",
    label: "Low confidence"
  },
  custom: {
    fg: "var(--hl-go-blue)",
    bg: "rgba(5,141,233,0.05)",
    icon: "plus-circle",
    label: "Custom field"
  },
  option_route: {
    fg: "#7A4E92",
    bg: "rgba(150,95,176,0.07)",
    icon: "code-branch",
    label: "Conditional"
  },
  system: {
    fg: "var(--hl-fg-3)",
    bg: "var(--hl-framing)",
    icon: "cog",
    label: "Routing input"
  },
  unmapped: {
    fg: "var(--hl-fg-3)",
    bg: "var(--hl-framing)",
    icon: "minus-circle",
    label: "Skipped"
  }
};

// Order used by the group-by-status view (#3)
const GROUP_ORDER = ["auto_confirmed", "recommended", "low_confidence", "option_route", "custom", "system", "unmapped"];

// Bulk-action pill button (#3)
function BulkBtn({
  icon,
  children,
  onClick,
  active
}) {
  const [hover, setHover] = useStateM(false);
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      height: 30,
      padding: "0 12px",
      borderRadius: 3,
      cursor: "pointer",
      fontFamily: "inherit",
      fontSize: 12,
      fontWeight: 700,
      border: `1px solid ${active ? "var(--hl-go-blue)" : "var(--hl-keyline)"}`,
      background: active ? "var(--hl-go-blue)" : hover ? "var(--hl-framing)" : "#fff",
      color: active ? "#fff" : "var(--hl-icon)",
      transition: "all 120ms"
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: `fas fa-${icon}`,
    style: {
      fontSize: 11
    }
  }), children);
}

// ─── Mapping row ───────────────────────────────────────────────────────

function MappingRow({
  row,
  sample,
  usedTargets,
  isDupCustom,
  onTargetChange,
  onCustomNameChange,
  onOptionRoute,
  onToggleSplit,
  onToggleStripHtml,
  onFdmType
}) {
  const t = STATUS_TONES[row.status] || STATUS_TONES.unmapped;
  const isCustom = row.target_field === CUSTOM_VALUE;
  const isOption = row.target_field === "__option_route__";
  const isSystem = row.status === "system";
  const target = isCustom || isOption ? null : window.TARGET_SCHEMA.find(t => t.id === row.target_field);
  const pct = Math.round((row.manual ? 1 : row.confidence) * 100);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: "1px solid var(--hl-keyline)",
      borderLeft: `4px solid ${t.fg}`,
      background: t.bg,
      padding: "16px 20px",
      display: "grid",
      gridTemplateColumns: "1fr 32px 1fr 140px",
      alignItems: "center",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: `fas fa-${t.icon}`,
    style: {
      color: t.fg,
      fontSize: 14
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 15,
      color: "var(--hl-icon)"
    }
  }, row.user_header), typeof row.fill_rate === "number" && row.fill_rate > 0 && row.fill_rate < 0.5 && /*#__PURE__*/React.createElement("span", {
    title: "Sparse column \u2014 variant- or image-level data in a multi-row export",
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "1px 7px",
      borderRadius: 999,
      fontSize: 10,
      fontWeight: 700,
      background: "rgba(150,95,176,0.12)",
      color: "#7A4E92"
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-layer-group",
    style: {
      fontSize: 8
    }
  }), "variant \xB7 ", Math.round(row.fill_rate * 100), "% filled"), row.tier_group && /*#__PURE__*/React.createElement("span", {
    title: "Part of a tiered-price family",
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "1px 7px",
      borderRadius: 999,
      fontSize: 10,
      fontWeight: 700,
      background: "rgba(5,141,233,0.12)",
      color: "var(--hl-go-blue)"
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-layer-group",
    style: {
      fontSize: 8
    }
  }), row.tier_group, " \xB7 tier ", row.tier_index)), sample.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4,
      marginLeft: 22,
      fontSize: 12,
      color: "var(--hl-fg-3)"
    }
  }, "e.g. ", sample.slice(0, 2).map(s => `"${String(s).slice(0, 60)}"`).join(", ")), row.data_profile && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4,
      marginLeft: 22,
      fontSize: 11,
      color: "var(--hl-fg-3)",
      display: "inline-flex",
      alignItems: "center",
      gap: 5
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-eye",
    style: {
      fontSize: 9
    }
  }), "looks like: ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: "var(--hl-fg-2)"
    }
  }, row.data_profile))), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--hl-fg-3)",
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-arrow-right"
  })), /*#__PURE__*/React.createElement("div", null, isSystem ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      height: 40,
      padding: "0 12px",
      borderRadius: 3,
      border: "2px dashed var(--hl-keyline)",
      background: "var(--hl-framing)",
      color: "var(--hl-fg-2)",
      fontSize: 13,
      fontWeight: 700
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-cog",
    style: {
      color: "var(--hl-fg-3)"
    }
  }), row.system_role || "Used for routing") : isOption ? /*#__PURE__*/React.createElement(OptionRouteEditor, {
    row: row,
    usedTargets: usedTargets,
    onOptionRoute: onOptionRoute
  }) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(TargetSelect, {
    value: row.target_field || "",
    usedTargets: usedTargets,
    onChange: onTargetChange,
    status: row.status
  }), isCustom && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement(CustomNameInput, {
    value: row.custom_field_name || "",
    hasError: isDupCustom || !(row.custom_field_name || "").trim(),
    onChange: onCustomNameChange
  }), isDupCustom && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--hl-no-red)",
      fontWeight: 700,
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-exclamation-triangle",
    style: {
      marginRight: 4
    }
  }), "Another custom field is using this name."), !(row.custom_field_name || "").trim() && !isDupCustom && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--hl-no-red)",
      fontWeight: 700,
      marginTop: 4
    }
  }, "Custom field name can't be empty."), (row.name_source === "data" || row.name_source === "cell") && !row.manual && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 11,
      color: "#7A4E92",
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      fontWeight: 700
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-wand-magic-sparkles",
    style: {
      fontSize: 9
    }
  }), row.name_source === "cell" ? "Named from a label inside the data" : "Named from the column data"), /*#__PURE__*/React.createElement(FdmTypeSelect, {
    value: row.fdm_type || "string",
    onChange: onFdmType
  })), target && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4,
      display: "flex",
      alignItems: "center",
      gap: 6,
      fontSize: 11,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "1px 6px",
      borderRadius: 999,
      background: "var(--hl-framing)",
      color: "var(--hl-fg-2)",
      fontWeight: 700
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: `fas fa-${(window.TARGET_SCHEMA_GROUPS.find(g => g.id === target.group) || {}).icon || "folder"}`,
    style: {
      fontSize: 9
    }
  }), target.groupLabel), target.hint && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--hl-fg-3)"
    }
  }, target.hint)), row.target_field && row.target_field !== CUSTOM_VALUE && row.target_field !== "product_description" && row.target_field !== "seo_description" && /*#__PURE__*/React.createElement(SplitControl, {
    transform: row.transform,
    onToggle: onToggleSplit
  }), (row.target_field === "product_description" || row.target_field === "seo_description") && /*#__PURE__*/React.createElement(StripHtmlControl, {
    transform: row.transform,
    onToggle: onToggleStripHtml
  }), row.reason && row.status !== "unmapped" && (row.recommended_from_data && !row.manual ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6,
      fontSize: 11,
      lineHeight: "15px",
      color: "#7A5300",
      background: "rgba(250,199,55,0.14)",
      border: "1px solid rgba(180,122,0,0.25)",
      borderRadius: 3,
      padding: "5px 8px",
      display: "flex",
      gap: 6,
      alignItems: "flex-start"
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-lightbulb",
    style: {
      marginTop: 1,
      color: "#B47A00"
    }
  }), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("b", null, "AI recommendation from data:"), " ", row.reason)) : /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 11,
      color: "var(--hl-fg-3)"
    }
  }, row.manual ? "Manually set" : row.reason)))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 8
    }
  }, row.status === "custom" ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      fontSize: 12,
      fontWeight: 700,
      color: t.fg
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-plus"
  }), "Custom") : isOption ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      fontSize: 12,
      fontWeight: 700,
      color: t.fg
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-code-branch"
  }), "Routed") : isSystem ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: "var(--hl-fg-3)"
    }
  }, "\u2014") : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 60,
      height: 6,
      background: "var(--hl-framing)",
      borderRadius: 999,
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: pct + "%",
      height: "100%",
      background: t.fg,
      transition: "width 300ms"
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700,
      fontSize: 13,
      color: t.fg,
      minWidth: 40,
      textAlign: "right"
    }
  }, row.manual ? "Manual" : pct + "%"))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 11,
      color: "var(--hl-fg-3)",
      textAlign: "right"
    }
  }, t.label)));
}

// ─── Conditional option routing editor ─────────────────────────────────
// Renders one sub-row per distinct option-name found in the data, each with a
// dropdown to route that option's value to a NuO field / custom / skip.
function OptionRouteEditor({
  row,
  usedTargets,
  onOptionRoute
}) {
  const routes = row.option_routes || {};
  const names = Object.keys(routes);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      border: "2px solid #C9B3D6",
      borderRadius: 3,
      overflow: "hidden",
      background: "rgba(150,95,176,0.04)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "7px 10px",
      background: "rgba(150,95,176,0.12)",
      display: "flex",
      alignItems: "center",
      gap: 8,
      fontSize: 11,
      fontWeight: 700,
      color: "#7A4E92"
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-code-branch"
  }), "Routes by \u201C", row.option_name_header, "\u201D \u2014 ", names.length, " value", names.length === 1 ? "" : "s", " found"), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "8px 10px",
      display: "flex",
      flexDirection: "column",
      gap: 6
    }
  }, names.map(nm => {
    const r = routes[nm] || {};
    const val = r.target === "__custom__" ? CUSTOM_VALUE : r.target || "";
    return /*#__PURE__*/React.createElement("div", {
      key: nm,
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        minWidth: 92,
        maxWidth: 92,
        fontSize: 12,
        fontWeight: 700,
        color: "var(--hl-icon)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      },
      title: nm
    }, nm), /*#__PURE__*/React.createElement("i", {
      className: "fas fa-arrow-right",
      style: {
        color: "var(--hl-fg-3)",
        fontSize: 10
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        position: "relative",
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("select", {
      value: val,
      onChange: e => onOptionRoute(nm, e.target.value),
      style: {
        width: "100%",
        height: 32,
        borderRadius: 3,
        border: "2px solid var(--hl-keyline)",
        padding: "0 28px 0 10px",
        background: "#fff",
        fontFamily: "inherit",
        fontWeight: 700,
        fontSize: 12,
        color: "var(--hl-icon)",
        appearance: "none",
        cursor: "pointer"
      }
    }, /*#__PURE__*/React.createElement("option", {
      value: ""
    }, "\u2014 Skip \u2014"), /*#__PURE__*/React.createElement("option", {
      value: CUSTOM_VALUE
    }, "+ Custom: ", window.Transforms.titleCase(nm)), window.TARGET_SCHEMA_GROUPS.map(g => /*#__PURE__*/React.createElement("optgroup", {
      key: g.id,
      label: g.label
    }, g.fields.map(f => {
      const used = usedTargets[f.id] && f.id !== val;
      return /*#__PURE__*/React.createElement("option", {
        key: f.id,
        value: f.id,
        disabled: used
      }, f.label, used ? " · used" : "");
    })))), /*#__PURE__*/React.createElement("i", {
      className: "fas fa-chevron-down",
      style: {
        position: "absolute",
        right: 10,
        top: "50%",
        transform: "translateY(-50%)",
        color: "var(--hl-fg-3)",
        pointerEvents: "none",
        fontSize: 10
      }
    })));
  })));
}

// ─── Multi-value split control ─────────────────────────────────────────
function SplitControl({
  transform,
  onToggle
}) {
  const on = transform && transform.type === "split";
  return /*#__PURE__*/React.createElement("button", {
    onClick: onToggle,
    style: {
      marginTop: 6,
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "3px 9px",
      borderRadius: 999,
      cursor: "pointer",
      fontFamily: "inherit",
      fontSize: 11,
      fontWeight: 700,
      border: `1px solid ${on ? "#7A4E92" : "var(--hl-keyline)"}`,
      background: on ? "rgba(150,95,176,0.12)" : "#fff",
      color: on ? "#7A4E92" : "var(--hl-fg-3)"
    },
    title: on ? "Splitting enabled — click to import as a single value" : "Click to split this column into multiple values"
  }, /*#__PURE__*/React.createElement("i", {
    className: `fas fa-${on ? "scissors" : "grip-lines"}`,
    style: {
      fontSize: 10
    }
  }), on ? `Split on ${transform.label} → ~${transform.avgCount} values` : "Import as single value");
}

// ─── HTML cleanup control (#7) ─────────────────────────────────────────
function StripHtmlControl({
  transform,
  onToggle
}) {
  const on = transform && transform.type === "strip_html";
  return /*#__PURE__*/React.createElement("button", {
    onClick: onToggle,
    style: {
      marginTop: 6,
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "3px 9px",
      borderRadius: 999,
      cursor: "pointer",
      fontFamily: "inherit",
      fontSize: 11,
      fontWeight: 700,
      border: `1px solid ${on ? "var(--hl-go-blue)" : "var(--hl-keyline)"}`,
      background: on ? "rgba(5,141,233,0.10)" : "#fff",
      color: on ? "var(--hl-go-blue)" : "var(--hl-fg-3)"
    },
    title: on ? "HTML will be stripped to clean text on import" : "Keep raw HTML"
  }, /*#__PURE__*/React.createElement("i", {
    className: `fas fa-${on ? "broom" : "code"}`,
    style: {
      fontSize: 10
    }
  }), on ? "Strip HTML → clean text" : "Keep raw HTML");
}

// ─── Target select ─────────────────────────────────────────────────────

function TargetSelect({
  value,
  usedTargets,
  onChange,
  status
}) {
  const borderColor = status === "auto_confirmed" ? "var(--hl-do-green)" : status === "recommended" || status === "low_confidence" ? "#B47A00" : status === "custom" ? "var(--hl-go-blue)" : status === "unmapped" ? "var(--hl-keyline)" : "var(--hl-keyline)";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement("select", {
    value: value,
    onChange: e => onChange(e.target.value),
    style: {
      width: "100%",
      height: 40,
      borderRadius: 3,
      border: `2px solid ${borderColor}`,
      padding: "0 36px 0 12px",
      background: "#fff",
      fontFamily: "inherit",
      fontWeight: 700,
      fontSize: 14,
      color: "var(--hl-icon)",
      appearance: "none",
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "\u2014 Skip this column \u2014"), /*#__PURE__*/React.createElement("option", {
    value: CUSTOM_VALUE
  }, "+ Create custom field\u2026"), window.TARGET_SCHEMA_GROUPS.map(g => /*#__PURE__*/React.createElement("optgroup", {
    key: g.id,
    label: g.label
  }, g.fields.map(t => {
    const used = usedTargets[t.id] && t.id !== value;
    return /*#__PURE__*/React.createElement("option", {
      key: t.id,
      value: t.id,
      disabled: used
    }, t.label, t.required ? " *" : "", used ? " · already mapped" : "");
  })))), /*#__PURE__*/React.createElement("i", {
    className: "fas fa-chevron-down",
    style: {
      position: "absolute",
      right: 14,
      top: "50%",
      transform: "translateY(-50%)",
      color: "var(--hl-fg-3)",
      pointerEvents: "none",
      fontSize: 12
    }
  }));
}

// FDM typed-variant selector for custom fields
function FdmTypeSelect({
  value,
  onChange
}) {
  const types = window.Transforms && window.Transforms.FDM_TYPES || ["string", "number", "money", "date", "boolean", "multi-value"];
  const ICONS = {
    string: "font",
    number: "hashtag",
    money: "dollar-sign",
    date: "calendar",
    boolean: "toggle-on",
    "multi-value": "list"
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6,
      display: "flex",
      alignItems: "center",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: "var(--hl-fg-3)",
      textTransform: "uppercase",
      letterSpacing: ".04em"
    }
  }, "FDM type"), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement("select", {
    value: value,
    onChange: e => onChange(e.target.value),
    style: {
      height: 26,
      padding: "0 24px 0 24px",
      borderRadius: 3,
      border: "1px solid var(--hl-go-blue)",
      background: "rgba(5,141,233,0.06)",
      fontFamily: "inherit",
      fontWeight: 700,
      fontSize: 11,
      color: "var(--hl-go-blue)",
      appearance: "none",
      cursor: "pointer"
    }
  }, types.map(t => /*#__PURE__*/React.createElement("option", {
    key: t,
    value: t
  }, t))), /*#__PURE__*/React.createElement("i", {
    className: `fas fa-${ICONS[value] || "font"}`,
    style: {
      position: "absolute",
      left: 8,
      top: "50%",
      transform: "translateY(-50%)",
      color: "var(--hl-go-blue)",
      pointerEvents: "none",
      fontSize: 9
    }
  }), /*#__PURE__*/React.createElement("i", {
    className: "fas fa-chevron-down",
    style: {
      position: "absolute",
      right: 8,
      top: "50%",
      transform: "translateY(-50%)",
      color: "var(--hl-go-blue)",
      pointerEvents: "none",
      fontSize: 8
    }
  })));
}
function CustomNameInput({
  value,
  hasError,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      display: "flex",
      alignItems: "stretch"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      padding: "0 10px",
      background: "var(--hl-go-blue)",
      color: "#fff",
      fontSize: 11,
      fontWeight: 900,
      letterSpacing: ".04em",
      textTransform: "uppercase",
      borderRadius: "3px 0 0 3px"
    }
  }, "Custom"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: value,
    placeholder: "Field name",
    onChange: e => onChange(e.target.value),
    style: {
      flex: 1,
      height: 32,
      border: `2px solid ${hasError ? "var(--hl-no-red)" : "var(--hl-go-blue)"}`,
      borderLeft: 0,
      borderRadius: "0 3px 3px 0",
      padding: "0 10px",
      background: "#fff",
      fontFamily: "inherit",
      fontSize: 13,
      fontWeight: 700,
      color: "var(--hl-icon)"
    }
  }));
}

// ─── Helpers ───────────────────────────────────────────────────────────

function FilterChip({
  tone,
  icon,
  label,
  active,
  onClick
}) {
  const tones = {
    success: {
      bg: "rgba(65,175,75,0.12)",
      fg: "#1F7A2A",
      activeBg: "#1F7A2A"
    },
    warn: {
      bg: "rgba(250,199,55,0.18)",
      fg: "#7A5300",
      activeBg: "#7A5300"
    },
    info: {
      bg: "rgba(5,141,233,0.12)",
      fg: "var(--hl-go-blue)",
      activeBg: "var(--hl-go-blue)"
    },
    violet: {
      bg: "rgba(150,95,176,0.14)",
      fg: "#7A4E92",
      activeBg: "#7A4E92"
    },
    err: {
      bg: "var(--hl-framing)",
      fg: "var(--hl-fg-2)",
      activeBg: "var(--hl-fg-2)"
    }
  };
  const t = tones[tone] || tones.info;
  const [hover, setHover] = useStateM(false);
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 12px",
      borderRadius: 3,
      background: active ? t.activeBg : t.bg,
      color: active ? "#fff" : t.fg,
      border: `2px solid ${active ? t.activeBg : "transparent"}`,
      fontWeight: 700,
      fontSize: 13,
      cursor: "pointer",
      fontFamily: "inherit",
      transition: "all 120ms cubic-bezier(0.2,0,0,1)",
      transform: hover && !active ? "translateY(-1px)" : "none",
      boxShadow: hover && !active ? "0 2px 6px rgba(0,0,0,0.06)" : "none"
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: `fas fa-${icon}`
  }), label, active && /*#__PURE__*/React.createElement("i", {
    className: "fas fa-times",
    style: {
      fontSize: 10,
      opacity: 0.8,
      marginLeft: 2
    }
  }));
}
function SummaryChip({
  tone,
  icon,
  label
}) {
  const tones = {
    success: {
      bg: "rgba(65,175,75,0.12)",
      fg: "#1F7A2A"
    },
    warn: {
      bg: "rgba(250,199,55,0.18)",
      fg: "#7A5300"
    },
    info: {
      bg: "rgba(5,141,233,0.12)",
      fg: "var(--hl-go-blue)"
    },
    err: {
      bg: "var(--hl-framing)",
      fg: "var(--hl-fg-2)"
    }
  };
  const t = tones[tone] || tones.info;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 12px",
      borderRadius: 3,
      background: t.bg,
      color: t.fg,
      fontWeight: 700,
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: `fas fa-${icon}`
  }), label);
}
function FileMeta({
  file
}) {
  const ext = (file.filename.split(".").pop() || "").toLowerCase();
  const isXl = ext === "xlsx" || ext === "xls";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "10px 14px",
      background: "var(--hl-framing)",
      borderRadius: 3,
      flexShrink: 0,
      maxWidth: 320
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: `fas fa-${isXl ? "file-excel" : "file-csv"}`,
    style: {
      color: "var(--hl-go-blue)",
      fontSize: 20
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 13,
      color: "var(--hl-icon)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, file.filename), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--hl-fg-3)"
    }
  }, file.sheetName ? /*#__PURE__*/React.createElement("span", null, "Sheet: ", /*#__PURE__*/React.createElement("b", null, file.sheetName), " \xB7 ") : null, file.headers.length, " columns \xB7 ", file.rows.length, " rows")));
}
function MappingSkeleton({
  file
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1100,
      margin: "0 auto",
      padding: "32px 32px 24px",
      width: "100%"
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontSize: 24,
      fontWeight: 700,
      color: "var(--hl-icon)"
    }
  }, "Matching your columns\u2026"), /*#__PURE__*/React.createElement("p", {
    style: {
      marginTop: 8,
      marginBottom: 24,
      color: "var(--hl-fg-2)"
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-spinner fa-spin",
    style: {
      color: "var(--hl-go-blue)",
      marginRight: 8
    }
  }), "Asking our mapping AI to identify ", file.headers.length, " columns from ", /*#__PURE__*/React.createElement("b", null, file.filename), "."), /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#fff",
      border: "2px solid var(--hl-keyline)",
      borderRadius: 3,
      overflow: "hidden"
    }
  }, file.headers.map((h, i) => /*#__PURE__*/React.createElement("div", {
    key: h,
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 32px 1fr 140px",
      gap: 12,
      padding: "20px",
      alignItems: "center",
      borderTop: i === 0 ? 0 : "1px solid var(--hl-keyline)"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      fontSize: 14,
      color: "var(--hl-icon)"
    }
  }, h), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 10,
      width: "60%",
      background: "var(--hl-framing)",
      borderRadius: 3,
      marginTop: 6,
      animation: "hl-pulse 1.2s ease-in-out infinite"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--hl-fg-3)",
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-arrow-right"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 36,
      background: "var(--hl-framing)",
      borderRadius: 3,
      animation: "hl-pulse 1.2s ease-in-out infinite"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 12,
      background: "var(--hl-framing)",
      borderRadius: 3,
      animation: "hl-pulse 1.2s ease-in-out infinite"
    }
  })))));
}
window.MappingStep = MappingStep;