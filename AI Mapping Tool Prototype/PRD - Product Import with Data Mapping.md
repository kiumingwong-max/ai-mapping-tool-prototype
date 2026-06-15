# PRD — Product Import with Data Mapping

**Status:** Ready for build · **Owner:** Product · **Last updated:** Jun 15, 2026
**Audience:** Engineering (frontend, backend, ML/LLM), QA
**Reference prototype:** `index.html` (this repo) — a working, clickable model of the full flow

---

## 1. Summary

Brands onboard to NuORDER by importing their product catalog. Today that means conforming to a rigid template, which is the #1 source of onboarding friction and support load. This product lets a brand upload **any** CSV/XLSX export — Shopify, JOOR, Faire, Le New Black, or a hand-rolled spreadsheet — and uses an LLM-assisted mapping engine to align their columns to the NuORDER schema, validate the data, and commit it.

**Goal:** raise successful first-import rate and cut onboarding time, without sacrificing data integrity.

The prototype in this repo is the functional spec. When this PRD and the prototype disagree, the prototype's *behavior* is the source of truth for UX; this document is the source of truth for *backend contracts and production concerns*.

---

## 2. Goals & non-goals

### Goals
- Accept arbitrary CSV/XLSX (incl. multi-sheet workbooks, multi-row-per-product exports).
- Auto-classify files/sheets, locate the header row, and map columns to the NuORDER schema with confidence scoring.
- Let the user review and correct every mapping; never block on a single bad guess.
- Validate deterministically (all-or-nothing commit) with actionable, row-level errors.
- Preserve every column — map it, keep it as a typed custom field, or explicitly skip it.
- Remember a brand's mapping per file-format so repeat imports are near-zero-touch.

### Non-goals (v1)
- Real-time sync / scheduled imports (this is one-shot upload).
- Image hosting/transformation (we reference image URLs; we don't ingest binaries).
- Editing products post-import (existing PDP flows own that).
- Customer/account import — detected and routed out, but the customer pipeline is separate.

---

## 3. Success metrics

| Metric | Definition | Target |
|---|---|---|
| **Product import rate** | products committed ÷ products in file | ≥ 95% on first try |
| **Time to first successful import** | upload → commit success | ≤ 5 min median |
| **Mapping correction rate** | columns the user re-maps ÷ total columns | trend down over repeat imports (saved mappings) |
| **Auto-confirmed share** | columns mapped ≥ 0.9 confidence with no edit | ≥ 60% on known formats |
| **Support tickets / onboarding** | import-related tickets | −50% vs. template flow |

---

## 4. Users & primary flow

**Primary user:** brand admin / ops person uploading their catalog.

**The 4-step flow** (mirrored in the prototype):

1. **Upload** — drag/drop one or more files. The triage agent classifies each file and sheet, finds the header row, and recommends the source to import. User confirms or picks a different sheet/header row.
2. **Column mapping** — side-by-side table of source columns → NuORDER fields, color-coded by confidence (auto-confirmed / recommended / low-confidence / custom / skipped). User reviews, with bulk actions and filters. Required-field gating with constant-value defaults.
3. **Validation** — deterministic dry run. Blocking errors grouped by category with row + product-key context; non-blocking auto-formats surfaced separately. Downloadable error report. Strict all-or-nothing.
4. **Success** — confirmation with product-based import rate, custom-field/skip summary, and image-gallery linkage. Mapping saved for the brand's next upload of this format.

---

## 5. Functional requirements

### 5.1 File ingestion & triage
- **FR-1.1** Parse CSV and XLSX (multi-sheet). XLSX via a server-side parser (prototype uses SheetJS client-side; production should parse server-side).
- **FR-1.2** For each sheet, classify as `data | instructions | field_descriptions | reference_lookup | empty`. Skip non-data sheets by default.
- **FR-1.3** Detect the header row even when it sits below annotation/instruction/machine-key rows (e.g. Faire's `product_name_english` rows, JOOR's "Mandatory/Optional" rows, "--- Examples ---" dividers).
- **FR-1.4** Classify each file's purpose: `product_catalog | pricing | customer_data | reference_data | instructions_only`. Route `customer_data` to the customer branch (out of this pipeline).
- **FR-1.5** Recommend a single primary source across multiple uploaded files; allow the user to override sheet + header-row.
- **FR-1.6** Offer to **join** a supplementary file (e.g. a separate pricesheet) onto the product file by a shared key (SKU / Reference / Style Number).

### 5.2 Multi-row normalization
- **FR-2.1** Detect multi-row-per-product structure (Shopify-style: product row + variant rows + image-only rows).
- **FR-2.2** Group by product key; **forward-fill** product-level fields from the parent into variant rows.
- **FR-2.3** Fold image-only rows into the parent as an aggregated image gallery; keep variant-specific images on variants.
- **FR-2.4** This is the canonical fix for the "Shopify multi-row" data-loss issue: variant rows must not be dropped or treated as separate products.

### 5.3 Mapping engine
- **FR-3.1** Score every (column, NuORDER field) pair using: exact match, normalized exact, token overlap, fuzzy (bigram) similarity, word-boundary containment, and **sample-value evidence** (read the actual data, not just the header).
- **FR-3.2** **Unique assignment:** each NuORDER field is claimed by at most one column; runner-ups must clear a confidence threshold or fall through to custom/skip.
- **FR-3.3** Confidence tiers: `≥0.9 auto-confirmed`, `0.7–0.9 recommended`, `<0.7 low-confidence` → triggers a data-driven recommendation pass.
- **FR-3.4** **Low-confidence pass** reads the column's values and recommends a field, or a **named custom field**. Naming priority: embedded cell label (`Material: Cotton` → "Material") → meaningful header → data-shape inference (URLs→"Image URL", `SS26`→"Season", currency codes→"Currency", prices→"Price") → cleaned header fallback.
- **FR-3.5** **Typed custom fields (FDM):** every custom field carries an inferred type — `string | number | money | date | boolean | multi-value` — editable by the user.
- **FR-3.6** **Transforms:** conditional option routing (Shopify `Option1 Name`/`Value` pairs route by name), multi-value split (Tags, semicolon gender), HTML strip (Body HTML → clean text), tiered-pricing collapse (`Wholesale Price_1/_2` → primary field + custom tiers).
- **FR-3.7** **Empty-column policy** (see §7): a column with zero values in the file maps to nothing (skipped). It does **not** mint an FDM field.

### 5.4 Required fields & defaults
- **FR-4.1** NuORDER product key = `style_number + season + color`. Required: product_name, style_number, color, size, product_category, season. `brand_name` comes from the account context, not a column.
- **FR-4.2** `style_number` may be satisfied by an equivalent mapped field (SKU / Handle).
- **FR-4.3** A required field with no source column can be satisfied by a **constant/default value** applied to every row (seeded with sensible defaults, user-editable). This is the lever for high import rates on sparse files.

### 5.5 Validation (deterministic, all-or-nothing)
- **FR-5.1** Run row-by-row in code (not the LLM): required-not-empty, numeric price, duplicate SKUs within the file, controlled-vocabulary enum checks (status, gender, age group, etc.) that **list accepted values** in the error.
- **FR-5.2** Non-blocking auto-formats (e.g. hierarchical category `A > B > C` → leaf) surfaced separately from blocking errors.
- **FR-5.3** Errors carry: source row, NuORDER field, category, plain-language message, and the **product key** (style/season/color) for triage. Group by category.
- **FR-5.4** Strict commit: zero errors → commit; any error → block, report, allow re-upload. Report the **product-based import rate** (`would-import ÷ total`).
- **FR-5.5** Downloadable error report (`summary_log.csv`) with Status / Style Number / Product Key / Error Type / Category / Message.

### 5.6 Saved mappings & reuse
- **FR-6.1** On successful commit, persist the mapping keyed by a **format signature** (normalized column set), so the brand's next file of the same shape pre-fills.
- **FR-6.2** Persist **only positive decisions** (mapped fields, named custom fields, transforms, constants). **Never persist a "skip"** for an empty column (see §7).
- **FR-6.3** Re-evaluate fill-rate on every import. A column with no saved decision that arrives populated runs the live mapping pass.
- **FR-6.4** When a previously-empty column is now populated, **surface it for review** ("N columns that were empty last time now have data") rather than auto-skipping or auto-creating a field.

---

## 6. Architecture

**Frontend (this repo):** React SPA. Dev entry `index.html` (in-browser Babel for live editing); production entry `production.html` (precompiled `build/*.js`, production React, no transformer). Pure engine logic is in framework-free modules so it's testable and portable to the backend.

| Module | Responsibility |
|---|---|
| `app/file-parser.js` | CSV/XLSX → grid + preview; annotation-row stripping |
| `app/ai-triage.js` | File/sheet classification + header detection |
| `app/row-normalizer.js` | Multi-row grouping, forward-fill, image aggregation, join |
| `app/ai-mapping.js` | Scoring, unique assignment, custom naming, transforms, FDM typing |
| `app/transforms.js` | Vocab/enum, option routing, multi-value, HTML, tiers, type inference |
| `app/validate.js` | Pure `validateImport` (deterministic) |
| `app/saved-mappings.js` | Format-signature persistence |

**Production split — LLM vs. deterministic:**
- **LLM** does *classification and mapping suggestion* only (triage, low-confidence recommendations). Inputs: headers + a small sample of values, never the full file. Output: structured JSON scored client/server-side.
- **Deterministic code** does *all validation and commit*. The LLM never decides whether data is valid.
- Every LLM path has a deterministic fallback (the prototype's `buildMappingsDeterministic` is the reference) so the product works if the model is slow/unavailable.

**Suggested backend contract:**
- `POST /imports` — upload files → returns `import_id`, triage result.
- `POST /imports/{id}/mapping` — submit/preview a mapping → returns scored columns.
- `POST /imports/{id}/validate` — dry run → returns errors + import rate.
- `POST /imports/{id}/commit` — strict commit → success or blocked.
- `GET/PUT /brands/{id}/saved-mappings` — format-keyed mappings.

---

## 7. Key decision: empty columns & FDM schema

**Decision:** Skip empty columns; do **not** create FDM fields for them. But treat "skip" as a per-file, value-derived decision that is **never persisted**.

**Rationale:**
- Minting FDM fields for 0%-fill columns bloats the schema with fields that carry no data.
- The reuse risk is asymmetric: persisting a "skip" is dangerous because a later file (same brand/format) may populate that column → silent data loss.
- Guard: persist only positive decisions; re-evaluate fill-rate each import; prompt for review when a previously-empty column arrives populated.

**LLM training guidance:** skip columns with no values (don't invent fields); treat fill-rate as a signal, not a verdict — a sparse column in a multi-row export is still real data; only genuinely empty columns carry nothing to map.

---

## 8. Calibration corpus

Mapping/triage heuristics and prompts are calibrated against the real brand exports in `uploads/` — **46 sample files (~30+ distinct real-world exports after dedupe)** spanning JOOR linesheets, Faire, Shopify (incl. multi-row), Le New Black (product + pricing + company), and customer-data templates, across 10+ brands. New formats should be added here and the regression suite re-run.

---

## 9. Testing & quality

- **Unit suite:** `tests/index.html` — zero-dependency runner over the live engine modules. 19 regression cases covering mapping, uniqueness, custom-field naming, empty-skip, transforms, normalization, and validation, plus a real-file summary lock. Must stay green.
- **Determinism:** the deterministic path must produce stable output for a given file (no reliance on the LLM for repeatability).
- **Performance budget:** a 113-column × ~1,150-row file maps in ~20ms in the prototype (scan cache + precomputed alias index). Production server target: < 2s end-to-end for triage+mapping on a typical file.
- **Regression on commit logic:** validation is pure and fully unit-testable — keep coverage high here; it's the data-integrity boundary.

---

## 10. Rollout

1. **Phase 1 — internal:** onboarding team imports for brands behind a flag; measure import rate & correction rate against the corpus.
2. **Phase 2 — assisted self-serve:** brands upload, onboarding reviews mappings before commit.
3. **Phase 3 — self-serve:** saved mappings + high auto-confirm rate enable unattended repeat imports.

**Guardrails:** strict all-or-nothing commit stays on; no auto-commit without a passing dry run; every import is reversible at the batch level (out of scope to build here, but required before Phase 3).

---

## 11. Open questions

- Backend language/runtime for the engine port (Node mirrors the prototype directly; Python is fine but requires re-implementing the deterministic modules).
- Where do typed FDM custom fields live in the canonical schema, and who governs promotion of a popular custom field into a first-class field?
- Image ingestion: reference-only in v1 — when do we host/transform?
- Batch reversibility/rollback design (required for Phase 3).
- Localization of validation messages and accepted-value lists.
