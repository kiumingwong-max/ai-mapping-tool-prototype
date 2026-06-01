// AUTO-GENERATED from app/TopChrome.jsx — do not edit directly. Re-run the precompile to regenerate.
// Top chrome — a slim NuORDER-style header so the importer feels like it lives in
// the real Brand Admin product. Side rails kept light to focus attention on the import flow.

function TopChrome({
  subtitle
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 56,
      background: "var(--hl-text)",
      color: "#fff",
      display: "flex",
      alignItems: "center",
      padding: "0 24px",
      flexShrink: 0,
      borderBottom: "1px solid rgba(0,0,0,0.2)",
      whiteSpace: "nowrap"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginRight: 24,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 28,
      height: 28,
      borderRadius: 3,
      flexShrink: 0,
      background: "linear-gradient(135deg, #FF5C28, #BB2A1A)",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-bolt",
    style: {
      color: "#fff",
      fontSize: 14
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 900,
      letterSpacing: ".02em",
      fontSize: 15
    }
  }, "NuORDER"), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 1,
      height: 18,
      background: "rgba(255,255,255,0.2)",
      margin: "0 4px"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 400,
      fontSize: 13,
      opacity: 0.75
    }
  }, "Brand Admin")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 4,
      flex: 1,
      minWidth: 0,
      fontSize: 13,
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement(NavLink, null, "Data"), /*#__PURE__*/React.createElement("i", {
    className: "fas fa-chevron-right",
    style: {
      fontSize: 10,
      opacity: 0.5
    }
  }), /*#__PURE__*/React.createElement(NavLink, null, "Products"), /*#__PURE__*/React.createElement("i", {
    className: "fas fa-chevron-right",
    style: {
      fontSize: 10,
      opacity: 0.5
    }
  }), /*#__PURE__*/React.createElement(NavLink, {
    active: true
  }, "Import")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 16,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "5px 12px 5px 5px",
      background: "rgba(255,255,255,0.1)",
      borderRadius: 999,
      fontSize: 13,
      fontWeight: 700
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 22,
      height: 22,
      borderRadius: "50%",
      background: "#41AF4B",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 11,
      fontWeight: 900,
      flexShrink: 0
    }
  }, "TB"), "Test Brand"), /*#__PURE__*/React.createElement("i", {
    className: "fas fa-bell",
    style: {
      opacity: 0.8
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 28,
      height: 28,
      borderRadius: "50%",
      background: "#628BA6",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: 900,
      fontSize: 12,
      flexShrink: 0
    }
  }, "KW")));
}
function NavLink({
  children,
  active
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      padding: "4px 10px",
      borderRadius: 3,
      cursor: "pointer",
      color: active ? "#fff" : "rgba(255,255,255,0.7)",
      fontWeight: active ? 700 : 400,
      background: active ? "rgba(255,255,255,0.08)" : "transparent"
    }
  }, children);
}
window.TopChrome = TopChrome;