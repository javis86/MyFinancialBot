# Configurable Default Currency (`ARS`) Design Document

## Goal
Make the bot's default currency configurable via environment variables / Google Apps Script `Script Properties`, defaulting to `"ARS"` (Argentine Peso) when no currency property is explicitly provided.

## User Review & Approval
- Approved Approach 1: Add optional `DEFAULT_CURRENCY` script property in `Config.gs`, inject it dynamically into Gemini's extraction prompt rules, use it as fallback in expense validation, and document in `.env.example`, `README.md`, and `Design-spec.md`.

## Proposed Changes

### 1. Central Configuration (`src/Config.gs`)
- Add `DEFAULT_CURRENCY` getter:
  ```javascript
  get DEFAULT_CURRENCY() {
    return PropertiesService.getScriptProperties().getProperty('DEFAULT_CURRENCY') || 'ARS';
  }
  ```

### 2. Prompt Generation (`src/Prompt.gs`)
- Update `getExtractionSystemPrompt(todayDateStr, defaultCurrency)`:
  - Default `defaultCurrency` to `CONFIG.DEFAULT_CURRENCY` (or `'ARS'` if `CONFIG` is unavailable).
  - Dynamically inject `defaultCurrency` into system prompt:
    - Example schema: `"currency": "${defaultCurrency}"`
    - Inference rule: `"$" alone without country context → "${defaultCurrency}"`

### 3. Execution & Validation (`src/Code.gs`)
- Pass `CONFIG.DEFAULT_CURRENCY` when calling `getExtractionSystemPrompt()`.
- Use `CONFIG.DEFAULT_CURRENCY` as fallback in expense validation when currency is missing/empty.

### 4. Documentation
- `.env.example`: Add `DEFAULT_CURRENCY=ARS`.
- `README.md`: Add `DEFAULT_CURRENCY` to Script Properties setup table (optional, defaults to `ARS`).
- `docs/Design-spec.md`: Document `DEFAULT_CURRENCY` in section 4.1.

### 5. Automated Tests
- `tests/helpers/gas-mock.js`: Mock `DEFAULT_CURRENCY` default value `'ARS'`.
- `tests/config.test.js`: Test default behavior and custom overrides.
- `tests/gemini.test.js` & `tests/rules.test.js`: Update tests to reflect dynamic currency prompt rules.

## Verification Strategy
- Run `npm test` to verify all node unit tests pass.
- Run `python3 tests/test-all.py` to verify full test suite passes.
