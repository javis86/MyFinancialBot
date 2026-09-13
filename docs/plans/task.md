# MyFinancialBot — Task Tracker

| # | Task | Status |
|---|------|--------|
| 0 | Repository Scaffolding | ✅ done |
| 1 | Telegram Bot Creation (Manual) | ✅ done |
| 2 | Google Gemini API Key (Manual) | ✅ done |
| 3 | Google Sheets Database Setup (Manual) | ✅ done |
| 4 | Clone & Adapt MoneyNeBot Backend Code | ✅ done |
| 5 | Google Apps Script Project Setup (Manual) | ✅ done |
| 6 | Deploy as Web App (Manual) | ✅ done |
| 7 | Webhook Initialization | ✅ done |
| 8 | Smoke Test & End-to-End Verification | ✅ done |
| 9 | Rename bot/docs references to MyFinancialBot | ✅ done |
| 10 | Move EXTRACTION_SYSTEM_PROMPT to src/Prompt.gs | ✅ done |
| 11 | Inject dynamic today date anchor into EXTRACTION_SYSTEM_PROMPT | ✅ done |
| — | **SECURITY HARDENING** ([plan](2026-07-24-security-hardening.md)) | — |
| S0 | Pre-flight: find chat_id, generate WEBHOOK_SECRET, add Script Properties, rotate credentials | ⬜ todo |
| S1 | Fix `.gitignore` — `.env*` wildcard + `!.env.example` | ⬜ todo |
| S2 | Add WEBHOOK_SECRET / ALLOWED_CHAT_ID / DEBUG_LOGGING getters to `Config.gs` | ⬜ todo |
| S3 | Gate 1 — Webhook secret validation + sanitized debug logging in `doPost()` | ⬜ todo |
| S4 | Gate 2 + Gate 3 — Chat ID allowlist + rate limiter in `handleUpdate()` | ⬜ todo |
| S5 | Move Gemini API key to `x-goog-api-key` request header in `callGemini()` | ⬜ todo |
| S6 | Prompt injection hardening — use `systemInstruction` in Gemini calls | ⬜ todo |
| S7 | Gate 4 — Add `validateExpense()` schema validator wired into `callGemini()` | ⬜ todo |
| S8 | Fix MIME type detection in `downloadFileAsBase64()` | ⬜ todo |
| S9 | Sanitize error messages in `appendToSheet()` | ⬜ todo |
| S10 | Update smoke test to pass `?secret=` param | ⬜ todo |
| S11 | Re-register Telegram webhook with secret param | ⬜ todo |
| S12 | Deploy updated code + end-to-end verification | ⬜ todo |
| 12 | Fix Photo OCR handling (MIME type fallback & schema coercion in src/Code.gs) | ✅ done |
| 13 | Cloud Bot Diagnosis & Test Suite (Fix GEMINI_MODEL, env secrets, test runner) | ✅ done |
| 14 | Add Unit Testing Suite for Apps Script (Config, Prompt, Code, Gates & Gemini API) | ✅ done |
| 15 | Explore project context & analyze deployment tools | ✅ done |
| 16 | Ask clarifying questions for automated deployment setup | ✅ done |
| 17 | Propose 2-3 approaches with trade-offs | ✅ done |
| 18 | Present design and get user approval | ✅ done |
| 19 | Write design doc and commit | ✅ done |
| 20 | Execute plan (configure clasp / scripts / guide updates) | ✅ done |
| 21 | Deduplication Gate 3.5 (Fix duplicate updates & message retries) | ✅ done |
| 22 | Explore project context & analyze transfer categorization requirements | ✅ done |
| 23 | Ask clarifying questions for transfer categorization feature | ✅ done |
| 24 | Propose 2-3 approaches with trade-offs | ✅ done |
| 25 | Present design and get user approval | ✅ done |
| 26 | Write design doc and commit | ✅ done |
| — | **TRANSFER CATEGORIZATION IMPLEMENTATION** ([plan](2026-09-13-transfer-categorization-rules.md)) | — |
| 27 | Update Test Harness Mock (`tests/helpers/gas-mock.js`) | ✅ done |
| 28 | Create Category Rules Unit Test Suite (`tests/rules.test.js`) | ✅ done |
| 29 | Implement Category Rules Engine (`src/Code.gs`) | ✅ done |
| 30 | End-to-End Verification & Documentation Update | ✅ done |
