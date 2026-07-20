# Move PROMPT to New File Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Move `EXTRACTION_SYSTEM_PROMPT` from `src/Code.gs` into a new `src/Prompt.gs` file.

**Architecture:** Create `src/Prompt.gs` holding `EXTRACTION_SYSTEM_PROMPT` constant; clean up `src/Code.gs` definition.

**Tech Stack:** Google Apps Script (JavaScript).

---

### Task 1: Create `src/Prompt.gs` and update `src/Code.gs`

**Files:**
- Create: `src/Prompt.gs`
- Modify: `src/Code.gs:157-184`

**Step 1: Create `src/Prompt.gs` containing `EXTRACTION_SYSTEM_PROMPT`**

```javascript
// Prompt.gs — Gemini System Prompts for MyFinancialBot

/**
 * System prompt for expense extraction.
 * Instructs Gemini to return ONLY valid JSON — no markdown, no fences, no extra text.
 * The schema is strict; any deviation from JSON format will cause a parse failure.
 */
const EXTRACTION_SYSTEM_PROMPT = `
You are a bilingual (English/Spanish) expense extraction assistant.
Given a user message or a receipt image, extract the expense and return ONLY a valid JSON object.
No markdown, no code fences, no explanation — raw JSON only.

Required JSON schema:
{
  "date": "YYYY-MM-DD",
  "amount": 45.00,
  "currency": "USD",
  "category": "Internet",
  "merchant": "Movistar",
  "notes": ""
}

Rules:
- date: Use today's date (UTC) if not explicitly mentioned.
- amount: Numeric value only, no currency symbols.
- currency: 3-letter ISO 4217 code.
  Inference rules: "pesos" or "ARS" → "ARS", "dólares" or "USD" → "USD",
  "$" alone without country context → "USD", "€" → "EUR".
- category: Must be exactly one of: Food, Transport, Entertainment, Health, Internet, Utilities, Shopping, Other.
- merchant: Name of store, vendor, or service provider. Empty string if unknown.
- notes: Any additional context the user provided. Empty string if none.

If you cannot extract a valid expense, return: { "error": "Could not parse" }
`.trim();
```

**Step 2: Remove `EXTRACTION_SYSTEM_PROMPT` from `src/Code.gs`**

Remove lines 157-183 in `src/Code.gs`.

**Step 3: Verify JS syntax in `src/Prompt.gs` and `src/Code.gs`**

Run node check or basic syntax validation on the modified files.

**Step 4: Commit changes**

```bash
git add src/Prompt.gs src/Code.gs docs/plans/
git commit -m "refactor: move EXTRACTION_SYSTEM_PROMPT to src/Prompt.gs"
```
