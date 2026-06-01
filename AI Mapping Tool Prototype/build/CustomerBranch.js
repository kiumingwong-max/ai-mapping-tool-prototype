// AUTO-GENERATED from app/CustomerBranch.jsx — do not edit directly. Re-run the precompile to regenerate.
// Customer-data branch (Recommendation #4).
// When the triage agent classifies the chosen source as customer/account data
// rather than products, we stop the product mapping flow and offer the right path.

function CustomerBranch({
  file,
  onReupload,
  onProceed
}) {
  const preview = (file.headers || []).slice(0, 8);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 720,
      margin: "48px auto 0",
      padding: "0 32px",
      width: "100%",
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 72,
      height: 72,
      borderRadius: "50%",
      background: "rgba(150,95,176,0.12)",
      color: "#7A4E92",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 30,
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-address-book"
  })), /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontSize: 24,
      fontWeight: 700,
      color: "var(--hl-icon)"
    }
  }, "This looks like customer data, not products"), /*#__PURE__*/React.createElement("p", {
    style: {
      marginTop: 10,
      marginBottom: 24,
      color: "var(--hl-fg-2)",
      fontSize: 15,
      lineHeight: "22px"
    }
  }, /*#__PURE__*/React.createElement("b", null, file.filename), " contains account and buyer fields rather than a product catalog, so the product importer would map almost nothing. Import it as customers instead, or continue as products anyway."), /*#__PURE__*/React.createElement("div", {
    style: {
      background: "#fff",
      border: "2px solid var(--hl-keyline)",
      borderRadius: 3,
      padding: "16px 20px",
      textAlign: "left",
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 700,
      color: "var(--hl-fg-3)",
      textTransform: "uppercase",
      letterSpacing: ".06em",
      marginBottom: 8
    }
  }, "Columns we detected"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 6
    }
  }, preview.map(h => /*#__PURE__*/React.createElement("span", {
    key: h,
    style: {
      padding: "3px 9px",
      borderRadius: 999,
      background: "var(--hl-framing)",
      color: "var(--hl-fg-1)",
      fontSize: 12,
      fontWeight: 700
    }
  }, h)), file.headers.length > preview.length && /*#__PURE__*/React.createElement("span", {
    style: {
      padding: "3px 9px",
      color: "var(--hl-fg-3)",
      fontSize: 12
    }
  }, "+", file.headers.length - preview.length, " more"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "center",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "supp",
    icon: "arrow-left",
    onClick: onReupload
  }, "Upload a product file"), /*#__PURE__*/React.createElement(Button, {
    variant: "do",
    icon: "address-book"
  }, "Import as customers")), /*#__PURE__*/React.createElement("button", {
    onClick: onProceed,
    style: {
      marginTop: 16,
      background: "none",
      border: 0,
      color: "var(--hl-go-blue)",
      fontWeight: 700,
      fontSize: 13,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "Map as products anyway"));
}
window.CustomerBranch = CustomerBranch;