// AI Triage Agent.
// Given a list of parsed files, asks the AI to:
//   1. Classify each file's purpose (product_catalog / pricing / customer_data /
//      reference_data / instructions / unclear).
//   2. For each sheet in each file, decide if it's importable data, identify
//      the header row, and explain why.
//   3. Pick one "primary" file+sheet for the product import.
//
// Falls back to a deterministic heuristic if the model is unreachable or
// the response is malformed.

const TRIAGE_SYSTEM = `You are a Data Source Triage Agent for a B2B wholesale product-import tool.

A user uploads one or more files. Your job: figure out which file (and which sheet inside it) contains the actual product catalog they want to import, and at exactly which row the column headers live.

Each file may be a vendor template (e.g. JOOR, Le New Black, NuORDER), a Shopify export, a price list, customer data, or unrelated.

Spreadsheets often contain:
- "Instructions" sheets — prose telling the user how to use the template
- "Field Descriptions" / "Column Definitions" sheets — column reference (Name/Description/Type/Required columns)
- "Template" / "Products" sheets — the actual data the user will fill in (Faire uses "Products"; Le New Black uses "Template (basic)" / "Template (full)" — prefer the fuller one)
- Reference lookup sheets (Countries, Currency Codes, Style Categories, Faire "Data Options")
- Real data exports with the column headers on row 0

Header rows can hide BELOW annotation rows, and there can be MORE THAN ONE annotation row:
- A Shopify export may have rows 0–1 with AI/NuOrder mapping notes, real headers (Handle, Title, Vendor…) on row 2.
- Faire's "Products" sheet puts real headers on row 0, then a "Mandatory / Optional" requirement row, then (sometimes) a machine-key row, before data. The "Mandatory/Optional" row is NOT data — skip it.
- A brand may paste a human note on row 0 ("Hi! The orange columns are required…") and the headers on row 1.
- Le New Black templates put a "------- Examples -------" divider between the header and the first real row — skip it.
Pick the row whose cells are short, distinct field-name-like phrases AND where the rows beneath are recognizably data (URLs, prices, HTML, SKU/style codes). first_data_row should skip requirement rows, machine-key rows and "Examples" dividers.

Classify each sheet with one of these kinds:
- "data" — the importable product table
- "instructions" — prose / how-to
- "field_descriptions" — column reference
- "reference_lookup" — value lookup (Countries, Currency Codes, etc.)
- "empty" — no usable content

If kind is "data", set header_row to the 0-indexed row number where headers appear, and first_data_row to where the actual product rows begin (skip "Below are examples" divider rows).

For each file, classify purpose as one of: "product_catalog", "pricing", "customer_data", "reference_data", "instructions_only", "unclear".

Then pick ONE primary source — the single file+sheet best suited for the product import.

Respond with raw JSON only — no prose, no markdown fences:
{
  "files": [
    {
      "filename": "<exact>",
      "purpose": "<one of above>",
      "purpose_label": "<2-4 word human label>",
      "summary": "<one short sentence>",
      "recommendation": "primary" | "supplementary" | "skip",
      "sheets": [
        {
          "name": "<exact>",
          "kind": "<one of above>",
          "header_row": <int or null>,
          "first_data_row": <int or null>,
          "reason": "<one short sentence>"
        }
      ]
    }
  ],
  "primary_file": "<filename>",
  "primary_sheet": "<sheet name>",
  "primary_header_row": <int>,
  "rationale": "<one sentence on why this is the right source>"
}`;

function compactFiles(parsedFiles) {
  return parsedFiles.map(f => ({
    filename: f.filename,
    ext: f.ext,
    sheets: f.sheets.map(s => ({
      name: s.name,
      totalRows: s.totalRows,
      totalCols: s.totalCols,
      preview: s.preview, // first 8 × 15
    })),
  }));
}

async function aiTriage(parsedFiles) {
  // Try the model first
  if (window.claude && window.claude.complete) {
    try {
      const userMsg = `Files uploaded:\n${JSON.stringify(compactFiles(parsedFiles), null, 2)}\n\nReturn JSON.`;
      const text = await window.claude.complete({
        messages: [{ role: "user", content: TRIAGE_SYSTEM + "\n\n" + userMsg }],
      });
      const cleaned = String(text).trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
      const json = JSON.parse(cleaned);
      if (!json.files || !Array.isArray(json.files)) throw new Error("malformed");
      // Repair: ensure every uploaded file has an entry
      const byName = Object.fromEntries(json.files.map(f => [f.filename, f]));
      for (const f of parsedFiles) {
        if (!byName[f.filename]) {
          byName[f.filename] = heuristicFile(f);
        } else {
          // Ensure every sheet has an entry
          const sheetByName = Object.fromEntries((byName[f.filename].sheets || []).map(s => [s.name, s]));
          byName[f.filename].sheets = f.sheets.map(s =>
            sheetByName[s.name] || heuristicSheet(s)
          );
        }
      }
      return {
        files: parsedFiles.map(f => byName[f.filename]),
        primary_file: json.primary_file,
        primary_sheet: json.primary_sheet,
        primary_header_row: typeof json.primary_header_row === "number" ? json.primary_header_row : 0,
        rationale: json.rationale || "",
        _source: "ai",
      };
    } catch (e) {
      console.warn("AI triage failed, using heuristic:", e);
    }
  }
  return heuristicTriage(parsedFiles);
}

// ── Deterministic fallback ─────────────────────────────────────────────

const HEADER_HINTS = [
  // Common product fields the heuristic looks for
  "handle", "title", "vendor", "product category", "sku", "style", "model",
  "product name", "brand", "wholesale", "retail", "price", "color", "colour",
  "size", "season", "category", "linesheet", "reference", "name", "description",
  "fabric", "collection", "tags", "barcode", "upc", "ean",
];

// Score a row's "headerness" — short crisp cells, header-hint matches,
// clean of commas/sentences/asterisks.
function scoreHeaderness(row) {
  if (!row || !row.length) return -10;
  let score = 0, nonEmpty = 0, hintHits = 0;
  for (const c of row) {
    const v = String(c ?? "").trim();
    if (!v) continue;
    nonEmpty++;
    if (v.length > 50) score -= 2;                  // long prose = not a header
    if (v.length <= 32) score += 0.5;
    if (/,/.test(v)) score -= 1.5;                  // headers rarely contain commas
    if (/[.!?]\s/.test(v)) score -= 1.5;            // sentences aren't headers
    if (HEADER_HINTS.some(h => v.toLowerCase().includes(h))) { hintHits++; score += 2.5; }
    if (/^[*•]/.test(v) || /^--+/.test(v)) score -= 2; // dividers / required-markers
    if (/^[A-Z][a-z]/.test(v) || /^[A-Z]+ ?[A-Z]/.test(v)) score += 0.2;
  }
  if (nonEmpty < 3) return -10;
  return score + Math.min(hintHits, 6) * 1.2;
}

// Score a row's "dataness" — varied content, URLs/numbers/slugs/HTML, long values
function scoreDataness(row) {
  if (!row || !row.length) return -10;
  let score = 0, nonEmpty = 0;
  for (const c of row) {
    const v = String(c ?? "").trim();
    if (!v) continue;
    nonEmpty++;
    if (v.length > 60) score += 1.5;                // long values are data
    if (/<\/?\w+/.test(v)) score += 2;              // HTML
    if (/^https?:/i.test(v)) score += 2;            // URLs
    if (/^[A-Z]{2,}-?\d+/.test(v) || /^\w+-\w+/.test(v)) score += 1; // SKU / slug
    if (/^\d+(\.\d+)?$/.test(v)) score += 0.6;      // numeric
    if (/,/.test(v) && v.length > 20) score += 0.5; // prose-like
    if (HEADER_HINTS.some(h => v.toLowerCase() === h)) score -= 1.5; // exact header word = probably header
  }
  if (nonEmpty < 2) return -5;
  return score;
}

function detectHeaderRow(preview) {
  // Best header row is the one with high headerness AND whose next row looks like data
  let best = { row: 0, total: -Infinity };
  const maxCandidate = Math.min(preview.length, 6);
  for (let i = 0; i < maxCandidate; i++) {
    const headerness = scoreHeaderness(preview[i]);
    if (headerness < 0) continue;
    // Next non-empty row's dataness
    let next = null;
    for (let j = i + 1; j < preview.length; j++) {
      if ((preview[j] || []).some(c => String(c ?? "").trim())) { next = preview[j]; break; }
    }
    const dataness = next ? scoreDataness(next) : 0;
    const total = headerness + dataness * 0.8;
    if (total > best.total) best = { row: i, total };
  }
  return best.row;
}

function heuristicSheet(sheet) {
  const name = sheet.name.toLowerCase();
  if (sheet.totalRows === 0) {
    return { name: sheet.name, kind: "empty", header_row: null, first_data_row: null, reason: "Empty sheet." };
  }
  if (/instruction|read.?me|how.?to/.test(name)) {
    return { name: sheet.name, kind: "instructions", header_row: null, first_data_row: null, reason: "Sheet name suggests instructions." };
  }
  if (/field.?descript|field.?ref|column.?(ref|def)|definitions?/.test(name)) {
    return { name: sheet.name, kind: "field_descriptions", header_row: null, first_data_row: null, reason: "Sheet name suggests field reference." };
  }
  // Reference/lookup tabs: Countries, Currency Codes, Style Categories, Faire "Data Options"
  if ((/countries|currency|categor|reference|lookup|data options|value list|options? list/.test(name) && sheet.totalCols <= 6)
      || /data options/.test(name)) {
    return { name: sheet.name, kind: "reference_lookup", header_row: null, first_data_row: null, reason: "Looks like a value lookup table." };
  }
  // Inspect data
  const hRow = detectHeaderRow(sheet.preview);
  // Identify first data row by skipping divider rows below header
  let firstData = hRow + 1;
  for (let i = hRow + 1; i < sheet.preview.length; i++) {
    const r = sheet.preview[i];
    const txt = (r || []).join("");
    if (/below are examples?|--+/i.test(txt)) { firstData = i + 1; continue; }
    if (r && r.some(c => String(c ?? "").trim())) { firstData = i; break; }
  }
  return {
    name: sheet.name,
    kind: "data",
    header_row: hRow,
    first_data_row: firstData,
    reason: hRow === 0 ? "Headers detected on row 1." : `Annotation rows above the real headers; headers on row ${hRow + 1}.`,
  };
}

function heuristicFile(file) {
  const lower = file.filename.toLowerCase();
  const sheets = file.sheets.map(heuristicSheet);

  // Inspect the richest data sheet's header row for customer-vs-product signals
  const dataSheets = sheets.filter(s => s.kind === "data");
  const richest = dataSheets.slice().sort((a, b) => {
    const ca = (file.sheets.find(x => x.name === a.name) || {}).totalCols || 0;
    const cb = (file.sheets.find(x => x.name === b.name) || {}).totalCols || 0;
    return cb - ca;
  })[0];
  let headerText = "";
  if (richest) {
    const sh = file.sheets.find(x => x.name === richest.name);
    headerText = (((sh && sh.preview[richest.header_row || 0]) || []).join(" | ")).toLowerCase();
  }
  const CUSTOMER_SIGNALS = ["customer name", "customer code", "buyer", "email", "address", "payment method", "shipping method", "sales rep", "store name", "zip", "retailer", "billing"];
  const customerHits = CUSTOMER_SIGNALS.filter(s => headerText.includes(s)).length;
  const PRODUCT_SIGNALS = ["sku", "style", "wholesale", "variant", "color", "size", "product", "barcode"];
  const productHits = PRODUCT_SIGNALS.filter(s => headerText.includes(s)).length;

  let purpose = "unclear", label = "Unclassified", recommendation = "skip";
  if (/pricesheet|price.?list|pricing/.test(lower)) {
    purpose = "pricing"; label = "Pricing data"; recommendation = "supplementary";
  } else if (/company|customer|retailer|account/.test(lower) || (customerHits >= 3 && customerHits > productHits)) {
    purpose = "customer_data"; label = "Customer data"; recommendation = "supplementary";
  } else if (sheets.some(s => s.kind === "data")) {
    purpose = "product_catalog"; label = "Product catalog"; recommendation = "primary";
  } else if (sheets.every(s => s.kind === "instructions" || s.kind === "empty")) {
    purpose = "instructions_only"; label = "Instructions only"; recommendation = "skip";
  }
  return {
    filename: file.filename,
    purpose,
    purpose_label: label,
    summary: `${file.sheets.length} sheet${file.sheets.length === 1 ? "" : "s"} — auto-classified.`,
    recommendation,
    sheets,
  };
}

function heuristicTriage(parsedFiles) {
  const files = parsedFiles.map(heuristicFile);
  // Pick best primary: a product_catalog with the data sheet that has the most cols
  let best = null;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (f.recommendation !== "primary") continue;
    for (const s of f.sheets) {
      if (s.kind !== "data") continue;
      const cols = parsedFiles[i].sheets.find(x => x.name === s.name)?.totalCols || 0;
      const score = cols + (f.purpose === "product_catalog" ? 100 : 0);
      if (!best || score > best.score) {
        best = { score, file: f.filename, sheet: s.name, header: s.header_row || 0 };
      }
    }
  }
  // Fall back to first file's first data sheet
  if (!best) {
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const dataSheet = f.sheets.find(s => s.kind === "data");
      if (dataSheet) { best = { file: f.filename, sheet: dataSheet.name, header: dataSheet.header_row || 0 }; break; }
    }
  }
  return {
    files,
    primary_file: best?.file,
    primary_sheet: best?.sheet,
    primary_header_row: best?.header ?? 0,
    rationale: best ? `Picked "${best.sheet}" from "${best.file}" — it's the only sheet with clear product columns.` : "No data sheet found.",
    _source: "heuristic",
  };
}

window.aiTriage = aiTriage;
window.heuristicTriage = heuristicTriage;
