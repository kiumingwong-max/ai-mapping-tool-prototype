// AUTO-GENERATED from app/Primitives.jsx — do not edit directly. Re-run the precompile to regenerate.
// Helios primitives — small atoms reused across screens.
// Loaded as a Babel script; exports to window for cross-file scope.

const {
  useState
} = React;

// ── Button ──────────────────────────────────────────────────────────────
function Button({
  variant = "do",
  size = "default",
  icon,
  children,
  onClick,
  disabled,
  type,
  style
}) {
  // In Helios 2.0 the PRIMARY action uses go-blue (indigo #3F32F5).
  // "do" is aliased to the primary so older call-sites keep their semantics.
  const palette = {
    do: {
      bg: "var(--hl-go-blue)",
      hover: "var(--hl-go-blue-hover)"
    },
    go: {
      bg: "var(--hl-go-blue)",
      hover: "var(--hl-go-blue-hover)"
    },
    no: {
      bg: "var(--hl-no-red)",
      hover: "var(--hl-no-red-hover)"
    },
    supp: {
      bg: "var(--hl-supplementary)",
      hover: "var(--hl-supplementary-hover)"
    },
    success: {
      bg: "var(--hl-do-green)",
      hover: "var(--hl-do-green-hover)"
    }
  }[variant] || {
    bg: "var(--hl-go-blue)"
  };
  const sz = size === "jumbo" ? {
    height: 56,
    padding: "0 32px",
    fontSize: 18
  } : size === "small" ? {
    height: 32,
    padding: "0 14px",
    fontSize: 13
  } : {
    height: 42,
    padding: "0 20px",
    fontSize: 15
  };
  const [hover, setHover] = useState(false);
  if (variant === "text") {
    return /*#__PURE__*/React.createElement("button", {
      type: type || "button",
      onClick: onClick,
      disabled: disabled,
      onMouseEnter: () => setHover(true),
      onMouseLeave: () => setHover(false),
      style: {
        background: "transparent",
        color: "var(--hl-go-blue)",
        border: 0,
        fontFamily: "inherit",
        fontWeight: 700,
        fontSize: 15,
        cursor: disabled ? "not-allowed" : "pointer",
        padding: "0 8px",
        textDecoration: hover ? "underline" : "none",
        ...style
      }
    }, icon && /*#__PURE__*/React.createElement("i", {
      className: `fas fa-${icon}`,
      style: {
        marginRight: 6
      }
    }), children);
  }
  return /*#__PURE__*/React.createElement("button", {
    type: type || "button",
    onClick: onClick,
    disabled: disabled,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      ...sz,
      background: disabled ? "var(--hl-framing)" : hover ? palette.hover : palette.bg,
      color: disabled ? "var(--hl-fg-disabled)" : "#fff",
      border: 0,
      borderRadius: 3,
      fontFamily: "inherit",
      fontWeight: 700,
      cursor: disabled ? "not-allowed" : "pointer",
      transition: "background 150ms cubic-bezier(0.2,0,0,1)",
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      whiteSpace: "nowrap",
      ...style
    }
  }, icon && /*#__PURE__*/React.createElement("i", {
    className: `fas fa-${icon}`
  }), children);
}

// ── Field (text input with label + optional sub) ────────────────────────
function Field({
  label,
  optional,
  value,
  onChange,
  sub,
  error,
  placeholder,
  type = "text",
  style
}) {
  const [focus, setFocus] = useState(false);
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700,
      fontSize: 13,
      color: "var(--hl-fg-1)"
    }
  }, label, optional && /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 400,
      color: "var(--hl-fg-3)",
      marginLeft: 6,
      fontSize: 12
    }
  }, "(Optional)")), /*#__PURE__*/React.createElement("input", {
    type: type,
    value: value || "",
    onChange: onChange,
    placeholder: placeholder,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      height: 42,
      borderRadius: 3,
      border: `2px solid ${error ? "var(--hl-no-red)" : focus ? "var(--hl-go-blue)" : "var(--hl-border-input)"}`,
      padding: "0 14px",
      fontFamily: "inherit",
      fontSize: 15,
      color: "var(--hl-fg-1)",
      background: "#fff",
      outline: "none",
      transition: "border-color 150ms cubic-bezier(0.2,0,0,1)"
    }
  }), (sub || error) && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: error ? "var(--hl-no-red)" : "var(--hl-fg-3)",
      fontWeight: error ? 700 : 400
    }
  }, error || sub));
}

// ── Toggle ──────────────────────────────────────────────────────────────
function Toggle({
  on,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    onClick: () => onChange && onChange(!on),
    style: {
      width: 48,
      height: 24,
      borderRadius: 16,
      background: on ? "var(--hl-go-blue)" : "var(--hl-border-strong)",
      position: "relative",
      cursor: "pointer",
      transition: "background 200ms cubic-bezier(0.2,0,0,1)",
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: 2,
      left: on ? 26 : 2,
      width: 20,
      height: 20,
      borderRadius: "50%",
      background: "#fff",
      transition: "left 200ms cubic-bezier(0.2,0,0,1)"
    }
  }));
}

// ── Checkbox ────────────────────────────────────────────────────────────
function Checkbox({
  checked,
  indeterminate,
  onChange
}) {
  const on = checked || indeterminate;
  return /*#__PURE__*/React.createElement("div", {
    onClick: () => onChange && onChange(!checked),
    style: {
      width: 20,
      height: 20,
      borderRadius: 3,
      cursor: "pointer",
      border: `2px solid ${on ? "var(--hl-go-blue)" : "var(--hl-border-strong)"}`,
      background: on ? "var(--hl-go-blue)" : "#fff",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#fff",
      fontSize: 11,
      fontFamily: '"Font Awesome 5 Free"',
      fontWeight: 900,
      flexShrink: 0
    }
  }, indeterminate ? /*#__PURE__*/React.createElement("i", {
    className: "fas fa-minus",
    style: {
      fontSize: 10
    }
  }) : checked ? /*#__PURE__*/React.createElement("i", {
    className: "fas fa-check",
    style: {
      fontSize: 10
    }
  }) : null);
}

// ── Badge (avatar / product tile) ───────────────────────────────────────
function Avatar({
  initials,
  size = 36,
  color
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: size,
      height: size,
      borderRadius: "50%",
      background: color || "var(--hl-framing)",
      color: color ? "#fff" : "var(--hl-fg-1)",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: 700,
      fontSize: size * 0.4,
      flexShrink: 0
    }
  }, initials);
}

// ── Pill / lozenge ──────────────────────────────────────────────────────
function Pill({
  tone = "info",
  children
}) {
  const tones = {
    success: {
      bg: "rgba(65,175,75,.12)",
      fg: "#1F7A2A"
    },
    info: {
      bg: "rgba(5,141,233,.12)",
      fg: "#0469AE"
    },
    warn: {
      bg: "rgba(250,199,55,.18)",
      fg: "#7A5300"
    },
    err: {
      bg: "rgba(230,100,60,.14)",
      fg: "#A6411F"
    },
    neutral: {
      bg: "var(--hl-framing)",
      fg: "var(--hl-fg-2)"
    }
  };
  const t = tones[tone] || tones.neutral;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      height: 22,
      padding: "0 10px",
      borderRadius: 999,
      background: t.bg,
      color: t.fg,
      fontWeight: 700,
      fontSize: 12,
      letterSpacing: ".01em"
    }
  }, children);
}
Object.assign(window, {
  Button,
  Field,
  Toggle,
  Checkbox,
  Avatar,
  Pill
});