// AUTO-GENERATED from app/Stepper.jsx — do not edit directly. Re-run the precompile to regenerate.
// 4-step progress stepper across the top of every import screen.

const STEPS = [{
  id: 1,
  label: "Upload"
}, {
  id: 2,
  label: "Column mapping"
}, {
  id: 3,
  label: "Validation"
}, {
  id: 4,
  label: "Success"
}];
function Stepper({
  step
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 0,
      padding: "20px 32px",
      background: "#fff",
      borderBottom: "1px solid var(--hl-keyline)"
    }
  }, STEPS.map((s, i) => {
    const done = step > s.id;
    const active = step === s.id;
    const upcoming = step < s.id;
    const dotBg = done ? "var(--hl-do-green)" : active ? "var(--hl-go-blue)" : "var(--hl-framing)";
    const dotFg = upcoming ? "var(--hl-fg-3)" : "#fff";
    const lineBg = step > s.id ? "var(--hl-do-green)" : "var(--hl-framing)";
    return /*#__PURE__*/React.createElement(React.Fragment, {
      key: s.id
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: dotBg,
        color: dotFg,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 900,
        fontSize: 14,
        border: active ? "0" : upcoming ? "2px solid var(--hl-keyline)" : "0",
        transition: "background 200ms cubic-bezier(0.2,0,0,1)"
      }
    }, done ? /*#__PURE__*/React.createElement("i", {
      className: "fas fa-check",
      style: {
        fontSize: 12
      }
    }) : s.id), /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 700,
        fontSize: 14,
        color: active ? "var(--hl-icon)" : upcoming ? "var(--hl-fg-3)" : "var(--hl-fg-1)",
        whiteSpace: "nowrap"
      }
    }, s.label)), i < STEPS.length - 1 && /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        height: 2,
        background: lineBg,
        margin: "0 20px",
        minWidth: 32,
        transition: "background 200ms cubic-bezier(0.2,0,0,1)"
      }
    }));
  }));
}
window.Stepper = Stepper;