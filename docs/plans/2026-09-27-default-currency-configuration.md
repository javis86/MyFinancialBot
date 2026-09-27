# Configurable Default Currency (`ARS`) Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Make default currency configurable via environment variables / Google Apps Script `Script Properties`, defaulting to `"ARS"`.

**Architecture:** Add `DEFAULT_CURRENCY` getter in `Config.gs`, pass it dynamically into `getExtractionSystemPrompt()` in `Prompt.gs` and `validateExpense()` in `Code.gs`, and update all documentation and unit tests.

**Tech Stack:** Google Apps Script (JavaScript), Node.js (test runner & assertions), Python (smoke/validation scripts).

---

### Task 1: Add `DEFAULT_CURRENCY` to `Config.gs`

**Files:**
- Modify: `src/Config.gs`
- Modify: `tests/helpers/gas-mock.js`
- Test: `tests/config.test.js`

**Step 1: Write the failing test**

In `tests/config.test.js`:
```javascript
test('CONFIG.DEFAULT_CURRENCY returns ARS by default', () => {
  assert.equal(CONFIG.DEFAULT_CURRENCY, 'ARS');
});

test('CONFIG.DEFAULT_CURRENCY returns property value when set', () => {
  PropertiesService.getScriptProperties().setProperty('DEFAULT_CURRENCY', 'USD');
  assert.equal(CONFIG.DEFAULT_CURRENCY, 'USD');
  PropertiesService.getScriptProperties().deleteProperty('DEFAULT_CURRENCY');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with `CONFIG.DEFAULT_CURRENCY is undefined` or similar assertion error.

**Step 3: Write minimal implementation**

In `tests/helpers/gas-mock.js`, support setting/getting `DEFAULT_CURRENCY`.
In `src/Config.gs`:
```javascript
  get DEFAULT_CURRENCY() {
    return PropertiesService.getScriptProperties().getProperty('DEFAULT_CURRENCY') || 'ARS';
  },
```

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/Config.gs tests/helpers/gas-mock.js tests/config.test.js
git commit -m "feat: add CONFIG.DEFAULT_CURRENCY with fallback to ARS"
```

---

### Task 2: Inject dynamic default currency into `Prompt.gs`

**Files:**
- Modify: `src/Prompt.gs`
- Test: `tests/prompt.test.js` (or add to `tests/gemini.test.js`)

**Step 1: Write the failing test**

In prompt tests, verify `getExtractionSystemPrompt('2026-09-27', 'ARS')` includes:
- `"currency": "ARS"`
- `"pesos" or "ARS" → "ARS"`
- `"$" alone without country context → "ARS"`

And verify `getExtractionSystemPrompt('2026-09-27', 'USD')` includes `"$" alone without country context → "USD"`.

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with mismatch on dynamic currency instructions.

**Step 3: Write minimal implementation**

In `src/Prompt.gs`:
```javascript
function getExtractionSystemPrompt(todayDateStr, defaultCurrency) {
  const today = todayDateStr || new Date().toISOString().split('T')[0];
  const currency = defaultCurrency || (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_CURRENCY ? CONFIG.DEFAULT_CURRENCY : 'ARS');
  return `
...
Required JSON schema:
{
  "date": "YYYY-MM-DD",
  "amount": 45.00,
  "currency": "${currency}",
  "category": "Internet",
  "merchant": "Movistar",
  "notes": ""
}

Rules:
...
- currency: 3-letter ISO 4217 code.
  Inference rules: "pesos" or "${currency}" → "${currency}", "dólares" or "USD" → "USD",
  "$" alone without country context → "${currency}", "€" → "EUR".
...
`.trim();
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/Prompt.gs tests/
git commit -m "feat: inject dynamic default currency into system prompt"
```

---

### Task 3: Wire default currency into `Code.gs` extraction & validation

**Files:**
- Modify: `src/Code.gs`
- Test: `tests/code.test.js` / `tests/rules.test.js`

**Step 1: Write the failing test**

Verify `validateExpense({ amount: 100, category: 'Food' })` assigns `currency: 'ARS'` by fallback when currency is missing or invalid.

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL (returns `null` or hardcoded fallback).

**Step 3: Write minimal implementation**

In `src/Code.gs`:
- Pass `CONFIG.DEFAULT_CURRENCY` when calling `getExtractionSystemPrompt()`.
- Set default currency fallback in `validateExpense()` to `CONFIG.DEFAULT_CURRENCY`.

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/Code.gs tests/
git commit -m "feat: use CONFIG.DEFAULT_CURRENCY in Code.gs validation and prompt generation"
```

---

### Task 4: Update Documentation

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/Design-spec.md`

**Step 1: Modify documentation**

- `.env.example`: Add `DEFAULT_CURRENCY=ARS`.
- `README.md`: Add `DEFAULT_CURRENCY: ARS (optional, default: ARS)` to Script Properties table.
- `docs/Design-spec.md`: Document `DEFAULT_CURRENCY` in section 4.1.

**Step 2: Verify formatting**

Inspect markdown syntax and environment variable references.

**Step 3: Commit**

```bash
git add .env.example README.md docs/Design-spec.md
git commit -m "docs: document DEFAULT_CURRENCY configuration option"
```

---

### Task 5: Comprehensive Suite Verification & Final Commit

**Step 1: Run all tests**

Run: `npm test` and `python3 tests/test-all.py`

**Step 2: Commit task tracker**

```bash
git add docs/plans/task.md
git commit -m "docs: mark default currency configuration tasks completed"
```
