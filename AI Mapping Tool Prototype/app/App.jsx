// Orchestrates the 4-step flow + Tweaks panel.

const { useState: useStateApp, useEffect: useEffectApp } = React;

function App() {
  const [step, setStep] = useStateApp(1);                 // 1..4
  const [file, setFile] = useStateApp(null);              // {filename, headers, rows}
  const [mappings, setMappings] = useStateApp(null);
  const [result, setResult] = useStateApp(null);
  const [scenario, setScenario] = useStateApp("clean");

  const [tweaks, setTweak] = useTweaks(/*EDITMODE-BEGIN*/{
    "showStepper": true,
    "brand": "True Field",
    "accent": "indigo"
  }/*EDITMODE-END*/);

  // Accent swap (just one tweak example)
  useEffectApp(() => {
    const map = {
      indigo: "63, 50, 245",
      blue: "5, 141, 233",
      teal: "20, 158, 168",
    };
    const v = map[tweaks.accent] || map.indigo;
    document.documentElement.style.setProperty("--hl-go-blue", `rgb(${v})`);
  }, [tweaks.accent]);

  const handleParsed = (parsed) => {
    setFile(parsed);
    setStep(2);
  };

  const handleConfirmMapping = (m) => {
    setMappings(m);
    const r = window.validateImport(file, m);
    setResult(r);
    setStep(r.success ? 4 : 3);
  };

  const reset = () => {
    setFile(null); setMappings(null); setResult(null);
    setStep(1);
  };

  return (
    <>
      <TopChrome/>

      {/* Page header */}
      <div style={{ background: "#fff", padding: "24px 32px 0", borderBottom: "0" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--hl-fg-3)", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 6 }}>
              Brand Admin · Data
            </div>
            <h1 style={{ margin: 0, fontFamily: "Lato", fontWeight: 900, fontSize: 32, color: "var(--hl-icon)", letterSpacing: "-0.015em" }}>
              Import products
            </h1>
            <p style={{ marginTop: 6, marginBottom: 16, color: "var(--hl-fg-2)", fontSize: 14, maxWidth: 720 }}>
              Upload your brand's product catalog in any CSV or XLSX format. We'll auto-map your columns to NuORDER's schema, validate every row, and load the catalog in one go.
            </p>
          </div>
          {step > 1 && file && (
            <Button variant="text" icon="redo" onClick={reset}>Start over</Button>
          )}
        </div>
      </div>

      {tweaks.showStepper && <Stepper step={step}/>}

      <main style={{
        flex: 1, minHeight: 0, overflow: "auto", background: "var(--hl-bg)",
        display: "flex", flexDirection: "column",
      }}>
        {step === 1 && <UploadStep onParsed={handleParsed} scenario={scenario} setScenario={setScenario}/>}
        {step === 2 && file && <MappingStep file={file} onConfirm={handleConfirmMapping} onBack={reset}/>}
        {step === 3 && file && result && (
          <ValidationStep file={file} mappings={mappings} result={result}
            onReupload={reset}
            onBack={() => setStep(2)}/>
        )}
        {step === 4 && file && result && (
          <SuccessStep file={file} mappings={mappings} result={result} onStartOver={reset}/>
        )}
      </main>

      <TweaksPanel title="Tweaks">
        <TweakSection title="Demo controls">
          <div style={{ fontSize: 12, color: "var(--hl-fg-2, #52576E)", marginBottom: 10, lineHeight: "16px" }}>
            Jump to a step with a pre-loaded sample so you can see each screen without re-running the flow.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <SmallBtn onClick={() => { reset(); }}>1 · Upload</SmallBtn>
            <SmallBtn onClick={() => {
              const s = window.SAMPLES.ambiguous;
              const parsed = window.parseCSV(s.csv);
              setFile({ filename: s.name, ...parsed });
              setStep(2);
            }}>2 · Mapping</SmallBtn>
            <SmallBtn onClick={() => {
              const s = window.SAMPLES.errors;
              const parsed = window.parseCSV(s.csv);
              const f = { filename: s.name, ...parsed };
              const fakeMappings = parsed.headers.map(h => {
                const id = ({
                  SKU: "sku", "Product Name": "product_name", Brand: "brand_name",
                  "Wholesale Price": "wholesale_price", Color: "color", Size: "size"
                })[h] || null;
                return { user_header: h, target_field: id, confidence: id ? 0.95 : 0, status: id ? "auto_confirmed" : "unmapped", manual: false };
              });
              setFile(f); setMappings(fakeMappings);
              setResult(window.validateImport(f, fakeMappings));
              setStep(3);
            }}>3 · Validation</SmallBtn>
            <SmallBtn onClick={() => {
              const s = window.SAMPLES.clean;
              const parsed = window.parseCSV(s.csv);
              const f = { filename: s.name, ...parsed };
              const fakeMappings = parsed.headers.map(h => ({ user_header: h, target_field: "product_name", confidence: 0.95, status: "auto_confirmed", manual: false }));
              setFile(f); setMappings(fakeMappings);
              setResult({ success: true, totalRows: parsed.rows.length, errorCount: 0, affectedRows: 0, errors: [] });
              setStep(4);
            }}>4 · Success</SmallBtn>
          </div>
        </TweakSection>

        <TweakSection title="Display">
          <TweakToggle label="Show progress stepper" value={tweaks.showStepper}
            onChange={v => setTweak("showStepper", v)}/>
          <TweakColor label="Primary accent"
            value={tweaks.accent === "indigo" ? "#3F32F5" : tweaks.accent === "blue" ? "#058DE9" : "#149EA8"}
            options={["#3F32F5", "#058DE9", "#149EA8"]}
            onChange={(hex) => {
              const map = { "#3F32F5": "indigo", "#058DE9": "blue", "#149EA8": "teal" };
              setTweak("accent", map[hex] || "indigo");
            }}/>
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

function SmallBtn({ onClick, children }) {
  const [hover, setHover] = useStateApp(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        height: 32, padding: "0 10px", border: "1px solid var(--hl-keyline, #BECBCF)",
        borderRadius: 3, background: hover ? "var(--hl-go-blue)" : "#fff",
        color: hover ? "#fff" : "var(--hl-icon)", fontFamily: "inherit", fontWeight: 700,
        fontSize: 12, cursor: "pointer", textAlign: "left", transition: "all 120ms"
      }}>
      {children}
    </button>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
