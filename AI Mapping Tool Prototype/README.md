# AI Mapping Tool

An AI-powered **product-import flow** for NuORDER, built on Lightspeed's **Helios design system**. It turns the chaos of brand-supplied catalog files — multi-tab XLSX vendor templates, Shopify exports with annotation rows above the real headers, multi-row-per-product variant structures, separate price/customer/product workbooks — into a clean four-step pipeline:

> **Upload → Column mapping → Validation → Success**

This is a high-fidelity, fully interactive front-end prototype (no production backend). The AI steps call the Claude API when available and fall back to deterministic algorithms when offline, so the whole flow works either way. The design is grounded in the project's PRD, the engineering spike (NU-82027) gap analysis, and the design RFC (NU-82132), validated against real brand export files from JOOR, Faire, Shopify, and Le New Black.

---

## Why it exists

Wholesale brands send catalogs in wildly inconsistent formats. A buyer onboarding a brand might receive:

- A **JOOR linesheet** — 100+ columns, multi-row per style, tiered pricing (`Wholesale Price_1`), 7-tab templates with instructions/field-descriptions/reference lookups.
- A **Faire export** — real headers on row 0, a "Mandatory / Optional" requirement row and a machine-key row beneath them, `Option 1 Name/Value` pairs, `Product Token` grouping.
- A **Le New Black** brand split across three files — product data, pricing, and company data — with an "------- Examples -------" divider under the header.
- A **Shopify export** where one product spans up to 52 rows (1 header + variants + image-only rows), categories are hierarchical (`Apparel > Jewelry > Bracelets`), and `Option1 Value` means Color on one product and Size on another.
- A **customer/account file** that isn't products at all.

This tool reads all of that, figures out which file and sheet to import, finds the header row, groups multi-row products, maps each column to a standardized schema, and validates — with a human-in-the-loop review at every step and nothing silently dropped.

---

## What it does

### 1. Upload + triage agent
Drop any combination of CSV / XLSX files. A **triage agent** reads every file and every sheet, then:

- Classifies each **file**: product catalog · pricing · customer data · reference data · instructions only (by filename *and* header content).
- Classifies each **sheet**: importable data · instructions · field reference · lookup table · empty (handles JOOR/Faire/LNB tab conventions).
- Picks the single best source and **locates the header row** even when annotation, requirement, machine-key, or note rows sit above it.
- Lets the user override the chosen sheet or header-row offset with a live preview.
- Offers to **join a supplementary pricing file** onto the product file by a shared key (SKU / Reference / Style Number) when it detects one.

### 2. Multi-row pre-processing
Before mapping, a normalizer handles real export structure:

- **Detects the product grouping key** (Handle, Product Token, Style Number…).
- **Forward-fills** product-level fields from the parent row down into blank variant rows.
- **Sets aside additional-image rows** and aggregates them into a per-product image gallery.
- Strips leading **annotation/divider/machine-key rows** (Faire "Mandatory/Optional", LNB "Examples", `product_name_english` keys).

### 3. Column mapping
A scoring engine matches each brand header against the NuORDER schema (aligned with the [Shopify Standard Product Taxonomy](https://github.com/Shopify/product-taxonomy)), keyed on the NuO product identity **`style_number + season + color`**. Signals: exact/normalized alias matches, token Jaccard, bigram Dice, token-aware containment, deep sample-data probes (URLs, HTML, sizes, colors, materials, dates, currency/country codes, prices, SKU shapes), and specificity disambiguation across the price family.

Key behaviors:

- **Unique mapping** — each NuORDER field is claimed by at most one column; runner-ups must clear a confidence threshold.
- **Low-confidence recommendation pass** — sub-70% columns get a second look that reads the actual data and recommends a field or a clean custom-field name.
- **Data-driven custom-field naming** — when a header carries no signal (`Column7`, `Attr 3`, a bare number, blank/unnamed), the field is named from the values themselves: an embedded label inside the cells (`Material: Cotton` → “Material”) wins, otherwise a name is mined from the data shape (image URLs → “Image URL”, `SS26` → “Season”, currency codes → “Currency”, prices → “Price”…). A small indicator shows when a name was inferred.
- **Custom-field fallback with typed FDM variants** — unmatched columns become named custom fields with an inferred type (string / number / money / date / boolean / multi-value), never silently dropped.
- **Empty columns skip, not clutter** — a column that's empty in every row is skipped rather than turned into a junk custom field (enforced at build, save, and saved-mapping-apply time).
- **Conditional option routing** — Shopify `Option1 Value` routes per-row by `Option1 Name` (Color → color, Material → material, Title → skip).
- **Multi-value splitting** — comma Tags, semicolon target-gender, etc.
- **Tiered pricing collapse** — `Wholesale Price_1` → wholesale_price + currency; tiers 2+ become "(tier N)" catalogs.
- **HTML cleanup** — Shopify `Body (HTML)` gets a strip-to-text toggle.
- **Default values for missing required fields** — season/color/size/category auto-seed sensible defaults (the RFC's lever for 95–100% import); `style_number` is satisfied by a mapped SKU/Handle.
- **Account-provided fields** — brand name comes from the logged-in account.
- **Saved mappings** — a confirmed mapping is remembered by format signature and pre-applied to the next file of the same shape.
- **Bulk actions + filters + group-by-status + data-preview drawer** to review large column sets fast.

### 4. Validation (strict commit / dry run)
Deterministic, row-by-row validation under an all-or-nothing commit model:

- Missing required fields (after defaults), invalid data types, controlled-vocabulary **enum checks that list accepted values**, duplicate SKUs.
- Hierarchical categories are **auto-flattened** as non-blocking adjustments.
- Errors render in a grouped, collapsible ledger carrying the **product key (style / season / color)**, source row, and error type — mirroring VETL's `summary_log.csv` — with a matching downloadable report.
- Reports a **product-based import rate** ("N of M products, 96%").

### 5. Customer branch
Files classified as customer/account data divert to a dedicated interstitial (Import as customers / Map as products anyway) instead of being force-mapped to the product schema.

---

## Tech

| Layer | Choice |
|---|---|
| UI | React 18 (in-browser Babel, no build step) |
| Styling | Helios design system CSS (Lato, Font Awesome 5, utility-named color tokens) |
| Spreadsheet parsing | [SheetJS](https://sheetjs.com/) for XLSX, custom quoted-CSV parser |
| AI | Claude API (optional) for triage + mapping + recommendations, with deterministic fallbacks |

The app ships as a single HTML entry point that loads modular JSX/JS. A self-contained standalone build (everything inlined, works offline) lives in `export/`.

---

## Project structure

```
.
├── index.html                  # Dev entry (source of truth) — JSX via in-browser Babel; directly editable
├── production.html             # Production entry — precompiled, no in-browser Babel
├── app/
│   ├── App.jsx                 # Flow orchestration, customer branch, Tweaks panel
│   ├── UploadStep.jsx          # Step 1 — drag/drop, triage UI, sheet preview, file join
│   ├── MappingStep.jsx         # Step 2 — mapping table, filters, bulk actions, custom/FDM
│   │                           #   fields, tiers, options, defaults, saved-mapping, preview
│   ├── ValidationStep.jsx      # Step 3 — error ledger, enum checks, CSV report (view only)
│   ├── SuccessStep.jsx         # Step 4 — confirmation, import rate, image gallery
│   ├── CustomerBranch.jsx      # Customer/account interstitial
│   ├── Stepper.jsx             # 4-step progress indicator
│   ├── TopChrome.jsx           # NuORDER-style top nav
│   ├── ai-triage.js            # File/sheet classification + header detection
│   ├── ai-mapping.js           # Mapping scoring engine, unique assignment, transforms
│   ├── validate.js             # Pure import validation (validateImport) — view-free, unit-tested
│   ├── row-normalizer.js       # Multi-row grouping, forward-fill, image aggregation, join
│   ├── transforms.js           # Vocab/enum, option routing, multi-value, HTML, tiers, FDM types
│   ├── file-parser.js          # CSV + XLSX parsing + annotation-row stripping
│   ├── saved-mappings.js       # localStorage mapping persistence by format signature
│   ├── samples.js              # Demo data + target schema + required/default config
│   ├── helios.css              # Helios design tokens + type
│   ├── Primitives.jsx          # Shared UI atoms (Button, etc.)
│   └── tweaks-panel.jsx        # In-prototype tweak controls
├── build/                      # Precompiled components (app/*.jsx → plain JS), loaded by production.html
├── tests/                      # Zero-dependency unit-test runner (open tests/index.html)
│   ├── index.html              #   test page — runs against the live engine modules
│   ├── test-runner.js          #   tiny assert framework + DOM reporter
│   └── mapping.tests.js        #   regression cases (mapping, transforms, validation, real file)
├── uploads/                    # Real sample brand files (JOOR, Faire, LNB, Shopify, customer)
└── export/                     # Standalone single-file build
```

---

## Running it

Serve the folder with any static file server:

```bash
npx serve .
# or
python3 -m http.server
```

- **`index.html`** — dev entry. JSX is transpiled in the browser (handy for live editing). Logs one benign Babel "precompile for production" notice.
- **`production.html`** — deploy this. Loads precompiled `build/*.js` and production React, with no in-browser transformer and no console noise.

> A static server is required (not `file://`) because the app fetches modules and sample files over HTTP. For a zero-dependency, fully offline copy, open `export/index.html`.

Try the **“Messy real upload”**, **“Shopify multi-row”**, **“JOOR linesheet”**, **“Faire export”**, **“Customer file”**, and **“With errors”** sample buttons on the upload screen to see each path without your own files.

---

## Tests & build

The mapping engine (scoring, uniqueness, custom-field naming, empty-skip, transforms, normalization, validation) is covered by a **zero-dependency unit suite** that runs against the live `app/` modules — no framework, no build step.

```bash
# open in a browser (served, not file://)
open tests/index.html         # 19 cases incl. a real-file regression
```

The pure logic lives in plain-JS modules (`ai-mapping.js`, `validate.js`, `transforms.js`, `row-normalizer.js`, `file-parser.js`) precisely so it's testable without React. The React views are thin wrappers over them.

**Precompiling for production** (regenerate `build/` after editing any `app/*.jsx`):

```js
// transpile app/*.jsx → build/*.js with @babel/standalone preset "react"
// (see the precompile step; production.html loads the build/ output)
```


---

## Configuration points

- **Target schema** — `app/samples.js` → `TARGET_SCHEMA_GROUPS`. Add a field and it flows into the dropdown, AI prompt, and validation. Mark `required: true` and optionally `suggestedDefault` to auto-seed a default.
- **Account-provided required fields** — `window.ACCOUNT_PROVIDES` (e.g. `brand_name`).
- **Field equivalences** — `window.FIELD_EQUIVALENTS` (e.g. `style_number` satisfied by `sku`/`handle`).
- **Controlled vocabularies / transforms** — `app/transforms.js`.

---

## Status

Prototype / design exploration aligned with the NU-82132 RFC. The "backend" (triage, mapping, validation) runs client-side for demonstration; a production implementation would move file analysis, LLM calls, and the validate/commit pipeline server-side (the RFC proposes reusing VETL with an AnalyzeFileTool profiling pass and a NullSink two-pass dry-run). Deferred per discussion: an explicit user-facing dry-run/commit split and the literal `size_{N}/price_{N}_{currency}` schema naming.
