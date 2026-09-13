# Transfer Categorization Rules Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Implement a customizable rule engine that maps money transfer recipients or expense keywords to specific categories and notes based on user-editable rules stored in a `Mappings` sheet tab.

**Architecture:** Add `getCategoryRules()` and `applyCategoryRules()` to `src/Code.gs`. Store rules in a `Mappings` sheet tab, cache them in `CacheService` for 10 minutes, and run `applyCategoryRules()` after Gemini extraction in both text and photo message handlers. Update schema validation to accept user-defined categories.

**Tech Stack:** Google Apps Script, Google Sheets API, Node.js (`node:test` harness).

---

### Task 1: Update Test Harness Mock (`tests/helpers/gas-mock.js`)

**Files:**
- Modify: `tests/helpers/gas-mock.js`

**Step 1: Write mock implementation for `getSheetByName('Mappings')` and `getDataRange().getValues()`**

Update `mockSpreadsheetApp` in `tests/helpers/gas-mock.js` to support `Mappings` sheet reading, creating missing sheets (`insertSheet('Mappings')`), `getDataRange().getValues()`, and `appendRow()`.

**Step 2: Verify existing test suite passes**

Run: `npm test`
Expected: PASS (all 28 tests pass)

**Step 3: Commit**

```bash
git add tests/helpers/gas-mock.js
git commit -m "test: mock Mappings sheet in gas-mock harness"
```

---

### Task 2: Create Category Rules Unit Test Suite (`tests/rules.test.js`)

**Files:**
- Create: `tests/rules.test.js`

**Step 1: Write the failing unit tests**

Create `tests/rules.test.js` covering:
- Creating missing `Mappings` sheet tab with default headers when called.
- Loading and caching rules via `CacheService`.
- Keyword matching against `merchant`, `notes`, and `rawText` (case-insensitive, partial match).
- Category and notes override behavior in `applyCategoryRules`.
- Schema validation allowing dynamic custom categories from active rules.

**Step 2: Run test to verify failure**

Run: `npm test`
Expected: FAIL (functions `getCategoryRules` / `applyCategoryRules` missing or not matching expected behavior)

**Step 3: Commit initial test structure**

```bash
git add tests/rules.test.js
git commit -m "test: add unit test suite for transfer categorization rules"
```

---

### Task 3: Implement Category Rules Engine (`src/Code.gs`)

**Files:**
- Modify: `src/Code.gs`

**Step 1: Add `getCategoryRules()` and `applyCategoryRules()`**

In `src/Code.gs`:
1. Add `CONFIG.MAPPINGS_SHEET_NAME = 'Mappings'` if not present (or define inline constant).
2. Implement `getCategoryRules()`:
   - Check `CacheService` key `category_rules_v1`.
   - If cache miss, open `Mappings` sheet from spreadsheet (`CONFIG.SPREADSHEET_ID`).
   - If `Mappings` sheet does not exist, insert sheet `Mappings`, append header `['Keyword / Recipient', 'Target Category', 'Override Notes']`, and return empty rules array.
   - Read `getDataRange().getValues()`, skip header row, parse non-empty rows into `{ keyword, category, notes }`.
   - Save JSON in `CacheService` with 600s TTL (10 min).
3. Implement `applyCategoryRules(expense, rawText)`:
   - Call `getCategoryRules()`.
   - Iterate through rules.
   - Check if `keyword.toLowerCase()` is contained in `(expense.merchant || '').toLowerCase()`, `(expense.notes || '').toLowerCase()`, or `(rawText || '').toLowerCase()`.
   - On first match, update `expense.category = rule.category`. If `rule.notes` is non-empty, update `expense.notes`.
   - Return updated `expense`.
4. Update `validateExpense()` to allow any non-empty string category if specified, or validate against combined default + custom rules.

**Step 2: Update message handlers in `src/Code.gs`**

In `handleTextMessage`:
```js
  const result = extractExpenseFromText(text);
  if (!result.success) { ... return; }
  const expense = applyCategoryRules(result.data, text);
  appendToSheet(expense);
  sendMessage(chatId, formatConfirmation(expense));
```

In `handlePhotoMessage`:
```js
  const expense = applyCategoryRules(result.data, '');
  appendToSheet(expense);
  sendMessage(chatId, formatConfirmation(expense));
```

**Step 3: Run test suite to verify implementation passes**

Run: `npm test`
Expected: PASS (all tests pass, including new rules tests)

**Step 4: Commit implementation**

```bash
git add src/Code.gs
git commit -m "feat: implement transfer categorization rules engine"
```

---

### Task 4: End-to-End Verification & Documentation Update

**Files:**
- Modify: `README.md`
- Modify: `docs/plans/task.md`

**Step 1: Update README documentation with Transfer Categorization Rules instructions**

Add a section to `README.md` explaining how users can add recipient keyword mappings to the `Mappings` sheet tab in their Google Spreadsheet.

**Step 2: Run full verification test suite**

Run: `npm test`
Expected: PASS (100% test coverage for rule engine, gates, and pipeline)

**Step 3: Update `docs/plans/task.md` tracker**

Mark transfer categorization tasks as complete.

**Step 4: Commit**

```bash
git add README.md docs/plans/task.md
git commit -m "docs: update README with transfer categorization rules instructions"
```
