// Tiny zero-dependency test framework + DOM reporter.
// Usage:
//   describe("group", () => {
//     test("name", () => { expect(actual).toEqual(expected); });
//   });
//   runAll();  // executes, renders results, returns a summary
//
// Supports async tests (return a Promise). No build step, no external deps —
// runs directly in the browser against the app's plain-JS engine modules.

(function () {
  const suites = [];
  let current = null;

  function describe(name, fn) {
    current = { name, tests: [] };
    suites.push(current);
    fn();
    current = null;
  }

  function test(name, fn) {
    if (!current) throw new Error(`test("${name}") must be inside describe()`);
    current.tests.push({ name, fn });
  }

  // Minimal matcher set. Deep-equals via stable JSON for objects/arrays.
  function expect(actual) {
    return {
      toBe(expected) {
        if (actual !== expected) fail(`expected ${fmt(actual)} to be ${fmt(expected)}`);
      },
      toEqual(expected) {
        if (!deepEqual(actual, expected)) fail(`expected ${fmt(actual)} to equal ${fmt(expected)}`);
      },
      toBeNull() {
        if (actual !== null) fail(`expected ${fmt(actual)} to be null`);
      },
      toBeTruthy() {
        if (!actual) fail(`expected ${fmt(actual)} to be truthy`);
      },
      toContain(sub) {
        if (String(actual).indexOf(sub) === -1) fail(`expected ${fmt(actual)} to contain ${fmt(sub)}`);
      },
      toBeLessThan(n) {
        if (!(actual < n)) fail(`expected ${fmt(actual)} to be < ${n}`);
      },
      toBeGreaterThan(n) {
        if (!(actual > n)) fail(`expected ${fmt(actual)} to be > ${n}`);
      },
      toBeCloseTo(n, tol = 0) {
        if (Math.abs(actual - n) > tol) fail(`expected ${fmt(actual)} to be within ${tol} of ${n}`);
      },
    };
  }

  function fail(msg) { throw new Error(msg); }
  function fmt(v) { return typeof v === "string" ? `"${v}"` : JSON.stringify(v); }
  function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a && b && typeof a === "object") return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
    return false;
  }
  function sortKeys(o) {
    if (Array.isArray(o)) return o.map(sortKeys);
    if (o && typeof o === "object") {
      return Object.keys(o).sort().reduce((acc, k) => { acc[k] = sortKeys(o[k]); return acc; }, {});
    }
    return o;
  }

  async function runAll(mountEl) {
    const root = mountEl || document.getElementById("results") || document.body;
    let passed = 0, failed = 0;
    const t0 = performance.now();

    for (const suite of suites) {
      const suiteEl = el("div", "suite");
      suiteEl.appendChild(el("h2", "suite-title", suite.name));
      root.appendChild(suiteEl);

      for (const t of suite.tests) {
        let ok = true, err = null, ms = 0;
        const s0 = performance.now();
        try {
          await t.fn();
        } catch (e) {
          ok = false; err = e;
        }
        ms = performance.now() - s0;
        if (ok) passed++; else failed++;

        const row = el("div", "case " + (ok ? "pass" : "failcase"));
        row.appendChild(el("span", "badge", ok ? "PASS" : "FAIL"));
        row.appendChild(el("span", "case-name", t.name));
        row.appendChild(el("span", "case-ms", `${ms.toFixed(1)}ms`));
        if (!ok) row.appendChild(el("pre", "err", err && err.message ? err.message : String(err)));
        suiteEl.appendChild(row);
      }
    }

    const totalMs = performance.now() - t0;
    const summary = { passed, failed, total: passed + failed, ms: +totalMs.toFixed(1) };
    const bar = document.getElementById("summary");
    if (bar) {
      bar.className = "summary " + (failed === 0 ? "all-pass" : "has-fail");
      bar.textContent = failed === 0
        ? `✓ All ${summary.total} tests passed in ${summary.ms}ms`
        : `✗ ${failed} of ${summary.total} failed (${summary.ms}ms)`;
    }
    // Expose for headless / programmatic checks
    window.__testSummary = summary;
    return summary;
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  window.describe = describe;
  window.test = test;
  window.expect = expect;
  window.runAll = runAll;
})();
