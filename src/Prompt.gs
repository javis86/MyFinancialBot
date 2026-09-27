// Prompt.gs — Gemini System Prompts for MyFinancialBot

/**
 * System prompt for expense extraction.
 * Dynamically injects today's UTC date so Gemini has an accurate temporal reference.
 * Instructs Gemini to return ONLY valid JSON — no markdown, no fences, no extra text.
 * The schema is strict; any deviation from JSON format will cause a parse failure.
 *
 * @param {string} [todayDateStr] - Optional YYYY-MM-DD date string. Defaults to today's UTC date.
 * @param {string} [defaultCurrency] - Optional default currency ISO code (e.g. 'ARS').
 * @returns {string} The formatted system prompt.
 */
function getExtractionSystemPrompt(todayDateStr, defaultCurrency) {
  const today = todayDateStr || new Date().toISOString().split('T')[0];
  const currency = defaultCurrency || (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_CURRENCY ? CONFIG.DEFAULT_CURRENCY : 'ARS');
  return `
You are a bilingual (English/Spanish) expense extraction assistant.
Given a user message or a receipt image, extract the expense and return ONLY a valid JSON object.
No markdown, no code fences, no explanation — raw JSON only.

Today's date (UTC): ${today}

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
- date: Use today's date (UTC: ${today}) if not explicitly mentioned in the user message or receipt image.
- amount: Numeric value only, no currency symbols.
- currency: 3-letter ISO 4217 code.
  Inference rules: "pesos" or "ARS" → "ARS", "dólares" or "USD" → "USD",
  "$" alone without country context → "${currency}", "€" → "EUR".
- category: Must be exactly one of: Food, Transport, Entertainment, Health, Internet, Utilities, Shopping, Other.
- merchant: Name of store, vendor, or service provider. Empty string if unknown.
- notes: Any additional context the user provided. Empty string if none.

If you cannot extract a valid expense, return: { "error": "Could not parse" }
`.trim();
}

/** Default system prompt instance for static reference */
const EXTRACTION_SYSTEM_PROMPT = getExtractionSystemPrompt();


