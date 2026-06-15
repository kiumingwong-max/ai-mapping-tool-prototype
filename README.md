## Bundle contents

- `ai-mapping-tool/README.md` — this file
- `ai-mapping-tool/project/` — the `AI Mapping Tool` project files (HTML prototypes, assets, components)

# AI Mapping Tool

An AI-powered **product-import flow** for NuORDER, built on Lightspeed's **Helios design system**. It turns the chaos of brand-supplied catalog files — multi-tab XLSX vendor templates, Shopify exports with annotation rows above the real headers, separate price/customer/product workbooks — into a clean four-step pipeline:

> **Upload → Column mapping → Validation → Success**

This is a high-fidelity, fully interactive front-end prototype (no production backend). The AI steps call the Claude API when available and fall back to deterministic algorithms when offline, so the whole flow works either way.

---

## Why it exists

Wholesale brands send catalogs in wildly inconsistent formats. A buyer onboarding a brand might receive:

- A **JOOR linesheet template** with 7 tabs (instructions, field descriptions, the real data, reference lookups for countries and currency codes).
- A **Le New Black** export split across three separate files — product data, pricing, and company data.
- A **Shopify export** where rows 1–2 are mapping annotations and the real column headers (`Handle`, `Title`, `Vendor`, …) sit on row 3.
- A clean, single-sheet CSV — if you're lucky.

This tool reads all of that, figures out which file and which sheet to import, finds the header row, and maps each column to a standardized schema — with a human-in-the-loop review at every step.

---

## What it does

### 1. Upload + triage agent
Drop any combination of CSV / XLSX files. A **triage agent** reads every file and every sheet, then:

- Classifies each file: *product catalog · pricing · customer data · reference data · instructions only*.
- Classifies each sheet: *importable data · instructions · field reference · lookup table · empty*.
- Picks the single best source and **locates the header row** — even when annotation rows sit above it.
- Lets the user override the chosen sheet or header-row offset with a live preview.

### 2. Column mapping
A scoring engine matches each brand header against a **60-field NuORDER schema across 11 groups**, aligned with the [Shopify Standard Product Taxonomy](https://github.com/Shopify/product-taxonomy). Signals include:

- Exact + normalized alias matches
- Token Jaccard and bigram Dice similarity
- Token-aware containment (no false "ean" inside "m**ean**ing")
- **Sample-data probes** — URLs, HTML, sizes, colors, materials, dates, currency/country codes, price patterns, SKU shapes
- **Specificity disambiguation** — "Wholesale" / "Retail" / "Cost" / "Compare" pull the right price field

Key rules:

- **Unique mapping** — each NuORDER field can be claimed by at most one column; runner-up matches must clear a confidence threshold to win.
- **Custom-field fallback** — columns below the confidence threshold are preserved as named custom fields, never silently dropped.
- **Account-provided fields** — required fields like brand name are filled from the logged-in account, so they don't need a column.
- **Clickable status filters** — filter the mapping table by auto-confirmed / needs review / low confidence / custom / skipped.

### 3. Validation (strict commit)
Deterministic, row-by-row validation under an all-or-nothing commit model:

- Missing required fields
- Invalid data types (e.g. non-numeric prices)
- Duplicate SKUs within the upload

Errors are presented in a **grouped, collapsible ledger** with a downloadable CSV error report and a re-upload loop.

### 4. Success
A confirmation summary — rows imported, schema fields mapped, custom fields created, columns skipped — plus a saved-mapping nudge for the next upload.

---

## Tech

| Layer | Choice |
|---|---|
| UI | React 18 (in-browser Babel, no build step) |
| Styling | Helios design system CSS (Lato, Font Awesome 5, utility-named color tokens) |
| Spreadsheet parsing | [SheetJS](https://sheetjs.com/) for XLSX, custom CSV parser |
| AI | Claude API (optional) for triage + mapping, with deterministic fallbacks |

The entire app ships as a single HTML entry point that loads modular JSX components. A self-contained standalone build (everything inlined, works offline) lives in `export/`.

---

## Project structure

```
.
├── index.html                 # Entry point (same as Product Import.html)
├── Product Import.html         # Main app shell — loads React, Helios CSS, and all components
├── app/
│   ├── App.jsx                 # Flow orchestration + Tweaks panel
│   ├── UploadStep.jsx          # Step 1 — drag/drop, triage UI, sheet preview
│   ├── MappingStep.jsx         # Step 2 — mapping table, filters, custom fields
│   ├── ValidationStep.jsx      # Step 3 — error ledger + CSV export
│   ├── SuccessStep.jsx         # Step 4 — confirmation
│   ├── Stepper.jsx             # 4-step progress indicator
│   ├── TopChrome.jsx           # NuORDER-style top nav
│   ├── ai-triage.js            # File/sheet classification + header detection
│   ├── ai-mapping.js           # Column-mapping scoring engine + unique assignment
│   ├── file-parser.js          # CSV + XLSX parsing into a normalized shape
│   ├── samples.js              # Demo data + target schema definition
│   ├── helios.css              # Helios design tokens + type
│   ├── Primitives.jsx          # Shared UI atoms (Button, etc.)
│   └── tweaks-panel.jsx        # In-prototype tweak controls
├── uploads/                    # Sample brand files (JOOR, Le New Black, Shopify exports)
└── export/                     # Standalone single-file build
```

---

## Running it

No build step. Serve the folder with any static file server and open `index.html`:

```bash
npx serve .
# or
python3 -m http.server
```

> A static server is required (not `file://`) because the app fetches the modular JSX and sample files over HTTP. For a zero-dependency, fully offline copy, open `export/Product Import.html`.

---

## Adding schema fields

The target schema is defined once in `app/samples.js` as `TARGET_SCHEMA_GROUPS`. Add a field there and it automatically appears in the mapping dropdown, the AI prompt, and the validation logic. Account-provided required fields are listed in `window.ACCOUNT_PROVIDES`.

---

## Status

Prototype / design exploration. The "backend" (AI orchestration, validation) runs client-side for demonstration; a production implementation would move file extraction, LLM calls, and validation server-side per the original PRD.
