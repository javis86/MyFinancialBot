# Transfer Categorization & Rule Engine Design

## Overview
This design adds custom categorization rules for financial expenditures, particularly money transfers to individuals (e.g. mapping transfers to "xxxxx" as "Education" with note "Payment for English class").

Rules are stored in a dedicated `Mappings` tab inside the user's Google Spreadsheet and cached using `CacheService` to maintain high performance and prevent unnecessary Google Sheets API reads.

## Key Requirements & User Decisions
- **Storage:** Dedicated `Mappings` sheet tab inside the active Google Spreadsheet.
- **Rule Management:** Editable directly by the user in Google Sheets without touching code. Automatic creation of the `Mappings` sheet tab with headers if missing.
- **Matching Algorithm:** Partial case-insensitive string matching against `merchant`, `notes`, or the raw message string.
- **Overrides:** Overrides category and optionally appends/replaces notes when a rule keyword matches.

## Data Schema

### Google Sheet Tab: `Mappings`
Columns:
1. `Keyword / Recipient` (string) — Substring to match against (e.g. `xxxxx`, `john doe`, `gym`).
2. `Target Category` (string) — Category to assign (e.g. `Education`, `Rent`, `Fitness`).
3. `Override Notes` (string, optional) — Description/note to set (e.g. `Payment for English class`).

Example rows:
| Keyword / Recipient | Target Category | Override Notes |
| :--- | :--- | :--- |
| `xxxxx` | `Education` | `Payment for english class` |
| `alquiler` | `Housing` | `Monthly rent payment` |

## Technical Architecture

### 1. Rule Fetching & Caching (`getCategoryRules`)
- Reads all non-header rows from the `Mappings` sheet tab.
- Caches the parsed array of rules in `CacheService` for 600 seconds (10 minutes).
- Automatically initializes the `Mappings` sheet with default header `['Keyword / Recipient', 'Target Category', 'Override Notes']` if it doesn't exist.

### 2. Category Rule Engine (`applyCategoryRules`)
- Input: `expense` object, `rawText` string.
- Operation:
  - Iterates over rules loaded from cache/sheet.
  - Checks if `expense.merchant`, `expense.notes`, or `rawText` contains the rule's keyword (case-insensitive).
  - If a match is found:
    - Sets `expense.category` to `Target Category`.
    - If `Override Notes` is non-empty, sets `expense.notes` to `Override Notes` (or appends if existing notes exist).
    - Stops at the first matching rule.
- Returns updated `expense` object.

### 3. Pipeline Integration in `src/Code.gs`
In `handleTextMessage` and `handlePhotoMessage`:
1. Call `extractExpenseFromText` / `extractExpenseFromImage`.
2. Perform schema validation via `validateExpense`.
3. Call `applyCategoryRules(result.data, rawText)`.
4. Call `appendToSheet(result.data)`.
5. Return confirmation message to user.

### 4. Schema Validation Update (`src/Code.gs`)
- Update `VALID_CATEGORIES` or `validateExpense` to accept dynamic custom categories coming from active rules in addition to standard default categories (`Food`, `Transport`, `Entertainment`, `Health`, `Internet`, `Utilities`, `Shopping`, `Other`).

## Verification Plan
- Unit tests added in `tests/` to verify:
  - Partial case-insensitive keyword matching.
  - Category and notes override behavior.
  - Handling of missing `Mappings` sheet.
  - Caching mechanism behavior.
