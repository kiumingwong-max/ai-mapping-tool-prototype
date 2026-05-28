// File parser — reads CSV + XLSX, returns a normalized shape:
//   { filename, ext, sizeBytes, sheets: [{ name, totalRows, totalCols, preview }] }
// `preview` is the first 8 rows × first 15 columns as strings, used both
// to render the triage UI and as input to the AI triage prompt.

(function () {
  const PREVIEW_ROWS = 8;
  const PREVIEW_COLS = 15;

  async function parseFile(file) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (ext === "csv") return parseCSV(file);
    if (ext === "xlsx" || ext === "xls") return parseXLSX(file);
    throw new Error("Unsupported file type: ." + ext);
  }

  async function parseCSV(file) {
    const text = await file.text();
    const { headers, rows, rawGrid } = window.csvToGrid(text);
    const totalRows = (rawGrid?.length || 0);
    const totalCols = Math.max(headers.length, ...rows.map(r => Object.keys(r).length));
    const preview = (rawGrid || []).slice(0, PREVIEW_ROWS).map(r =>
      r.slice(0, PREVIEW_COLS).map(v => String(v ?? "").slice(0, 80))
    );
    return {
      filename: file.name,
      ext: "csv",
      sizeBytes: file.size || (text.length),
      sheets: [{
        name: file.name.replace(/\.csv$/i, ""),
        totalRows,
        totalCols,
        preview,
        _raw: rawGrid,
      }],
    };
  }

  async function parseXLSX(file) {
    if (!window.XLSX) throw new Error("XLSX library hasn't loaded yet.");
    const ab = await file.arrayBuffer();
    const wb = window.XLSX.read(ab, { type: "array" });
    const sheets = wb.SheetNames.map(name => {
      const ws = wb.Sheets[name];
      if (!ws || !ws["!ref"]) {
        return { name, totalRows: 0, totalCols: 0, preview: [], _raw: [] };
      }
      const range = window.XLSX.utils.decode_range(ws["!ref"]);
      const rawGrid = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
      const preview = rawGrid.slice(0, PREVIEW_ROWS).map(r =>
        (r || []).slice(0, PREVIEW_COLS).map(v => String(v ?? "").slice(0, 80))
      );
      return {
        name,
        totalRows: range.e.r + 1,
        totalCols: range.e.c + 1,
        preview,
        _raw: rawGrid,
      };
    });
    return {
      filename: file.name,
      ext: "xlsx",
      sizeBytes: file.size || 0,
      sheets,
    };
  }

  // Build {filename, headers, rows} from a chosen sheet + header row offset.
  // headers come from grid[headerRow], data starts at headerRow + 1
  // and continues until end-of-grid (skipping fully empty rows).
  function extractTable(parsedFile, sheetName, headerRow) {
    const sheet = parsedFile.sheets.find(s => s.name === sheetName);
    if (!sheet) throw new Error("Sheet not found: " + sheetName);
    const grid = sheet._raw || [];
    const hRow = (grid[headerRow] || []).map(v => String(v ?? "").trim());
    // De-dup empty headers — replace blanks with "(unnamed N)" so they survive UI
    const headers = hRow.map((h, i) => h || `(unnamed ${i + 1})`);
    const rows = [];
    for (let i = headerRow + 1; i < grid.length; i++) {
      const r = grid[i] || [];
      if (!r.some(v => String(v ?? "").trim())) continue;
      const obj = {};
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = String(r[j] ?? "").trim();
      }
      rows.push(obj);
    }
    return {
      filename: parsedFile.filename,
      sheetName,
      headerRow,
      headers,
      rows,
    };
  }

  // CSV → grid + dict-rows. Replaces the older parseCSV which only returned headers/rows.
  window.csvToGrid = function csvToGrid(text) {
    const grid = [];
    let row = [], cell = "", inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; } else { inQ = false; }
        } else { cell += c; }
      } else {
        if (c === '"') { inQ = true; }
        else if (c === ",") { row.push(cell); cell = ""; }
        else if (c === "\n" || c === "\r") {
          if (c === "\r" && text[i + 1] === "\n") i++;
          row.push(cell); grid.push(row); row = []; cell = "";
        } else { cell += c; }
      }
    }
    if (cell.length || row.length) { row.push(cell); grid.push(row); }
    const headers = (grid[0] || []).map(h => String(h).trim());
    const rows = grid.slice(1).filter(r => r.some(x => x && x.trim().length))
      .map(r => Object.fromEntries(headers.map((h, i) => [h, String(r[i] ?? "").trim()])));
    return { headers, rows, rawGrid: grid };
  };

  // Back-compat with the old parseCSV the prototype's samples expect
  window.parseCSV = function (text) {
    const { headers, rows } = window.csvToGrid(text);
    return { headers, rows };
  };

  window.parseFile = parseFile;
  window.extractTable = extractTable;
})();
