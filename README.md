# 💸 MyFinancialBot

> A zero-cost, serverless Telegram bot for managing personal expenses using Google Apps Script, Google Gemini AI (NLP & Vision OCR), and Google Sheets as a database.

---

## 📌 Context & Overview

**MyFinancialBot** is a lightweight, zero-maintenance personal finance assistant. You can send free-form text messages (e.g., *"Spent $45 on internet at Movistar"*) or photo receipts directly via Telegram. The bot uses Google's Gemini AI to extract structured expense details and logs them instantly to a Google Sheet.

### Features
- 💬 **Natural Language Processing**: Log expenses by typing naturally in English or Spanish.
- 📸 **Receipt OCR**: Upload receipt photos; Gemini Vision automatically extracts vendor, total amount, currency, and date.
- 🌐 **Bilingual Support**: Seamlessly processes both English and Spanish queries.
- 📊 **Spreadsheet Backend**: Stores all transactions neatly inside a customizable Google Sheet.
- 🔒 **Security Hardened**: Multi-layered defense including webhook secret tokens, owner allowlists, rate limiting, and prompt injection isolation.
- 💰 **100% Free**: Operates entirely within free tiers (Google Apps Script, Google Sheets, Google Gemini API).

---

## 🏗️ Architecture & Data Flow

```
┌─────────────────┐   POST Webhook (?secret=...)   ┌────────────────────────┐
│  Telegram App   │ ─────────────────────────────> │   Google Apps Script   │
│ (User Interface)│ <───────────────────────────── │    Web App (doPost)    │
└─────────────────┘      Markdown Reply            └───────────┬────────────┘
                                                               │
                                           ┌───────────────────┴───────────────────┐
                                           │ 🔒 Security Gates                     │
                                           │  1. Webhook Secret Token Check        │
                                           │  2. Chat ID Allowlist (Single Owner)  │
                                           │  3. Rate Limiter (20 req/hr)          │
                                           │  4. Gemini SystemInstruction Isolation│
                                           │  5. Expense Schema Validator          │
                                           └───────────────────┬───────────────────┘
                                                               │
                                                 Appends Row   │   Calls API
                                                 to Sheet      │   (Header Auth)
                                                               ▼
                                                   ┌────────────────────────┐
                                                   │   Google Gemini API    │
                                                   │   (gemini-2.5-flash)   │
                                                   └────────────────────────┘
                                                               │
                                                               ▼
                                                   ┌────────────────────────┐
                                                   │     Google Sheets      │
                                                   │  (Transactions Tab)    │
                                                   └────────────────────────┘
```

---

## 🔒 Security & Hardening Features

MyFinancialBot implements robust enterprise-grade security controls directly inside Google Apps Script:

1. **Webhook Secret Token Verification (`WEBHOOK_SECRET`)**: The `doPost(e)` endpoint requires a custom query parameter `?secret=<WEBHOOK_SECRET>`. Unauthenticated requests are dropped silently with a `200 OK` response to prevent reconnaissance.
2. **Owner Chat ID Allowlist (`ALLOWED_CHAT_ID`)**: Strict owner-only access control. Requests from unauthorized Telegram user IDs are silently ignored.
3. **Rate Limiting**: Integrated request throttling using `CacheService` limits usage to 20 requests per hour per user to prevent API quota exhaustion.
4. **Prompt Injection Isolation**: Leverages Gemini's `systemInstruction` API payload key to separate system guidelines from untrusted user messages or OCR receipt images.
5. **Strict Schema Validation**: Implements `validateExpense()` to enforce positive numbers, valid ISO 4217 currencies, strict date patterns (`YYYY-MM-DD`), allowed category names, and string length limits before writing to Google Sheets.
6. **Header-Based Auth**: Sends the Gemini API key via the `x-goog-api-key` HTTP request header rather than query string parameters to prevent key leakages in access logs.

---

## 🧩 Key System Components

| Component | File Path | Role & Function |
|-----------|-----------|-----------------|
| **Configuration Module** | [`src/Config.gs`](src/Config.gs) | Centralized configuration accessor. Reads secrets (`TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY`, `SPREADSHEET_ID`, `WEBHOOK_SECRET`, `ALLOWED_CHAT_ID`, `DEBUG_LOGGING`) from Apps Script `ScriptProperties` at runtime. |
| **System Prompt Module** | [`src/Prompt.gs`](src/Prompt.gs) | System prompt definitions (`EXTRACTION_SYSTEM_PROMPT`) instructing Gemini AI on multilingual expense extraction and strict JSON output schema. |
| **Main Webhook & Controller** | [`src/Code.gs`](src/Code.gs) | Implements `doPost(e)` HTTP endpoint, security gates, update router, Telegram API message/photo downloader, Gemini AI client, response JSON sanitizer, and Sheets logger. |
| **Smoke Test Suite** | [`tests/smoke-test.sh`](tests/smoke-test.sh) | Automated Bash test script that sends synthetic Telegram payloads via `curl` to test endpoint availability and status codes. |
| **Security Implementation Plan** | [`docs/plans/2026-07-24-security-hardening.md`](docs/plans/2026-07-24-security-hardening.md) | Security hardening plan covering findings, security gate architecture, and task breakdowns. |
| **Task Tracker** | [`docs/plans/task.md`](docs/plans/task.md) | Live execution checklist used to track task progress and review state. |

---

## 🛠️ Step-by-Step Setup Guide ("Golden Steps")

Follow these verified steps to deploy your own instance.

### Phase 1: Telegram Bot Provisioning
1. Open Telegram and start a chat with **[@BotFather](https://t.me/BotFather)**.
2. Send `/newbot` and follow the prompts:
   - **Display Name**: `My Financial Bot`
   - **Username**: `MyFinancialBot` (must end in `bot`).
3. Save the HTTP API Token provided (referred to as `TELEGRAM_BOT_TOKEN`).
4. Obtain your Telegram User ID (e.g. via `@userinfobot` or Telegram API) (referred to as `ALLOWED_CHAT_ID`).

---

### Phase 2: Google Gemini API Key
1. Go to **[Google AI Studio](https://aistudio.google.com/)**.
2. Click **Get API Key** → **Create API Key in new project**.
3. Save the key (referred to as `GEMINI_API_KEY`).
   > 💡 **Model Note**: Use `gemini-2.5-flash`. Model `gemini-1.5-flash` is deprecated on `v1beta`, and `gemini-2.0-flash` may encounter rate limits (0 requests) on certain free-tier API keys.

---

### Phase 3: Google Sheets Setup
1. Create a new Google Spreadsheet at [sheets.google.com](https://sheets.google.com).
2. Rename the active sheet tab to **`Transactions`**.
3. Set up Row 1 with the following header columns (exact spelling/case):

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| `Timestamp` | `Date` | `Amount` | `Currency` | `Category` | `Merchant` | `Notes` |

4. Extract the **Spreadsheet ID** from your browser URL:
   `https://docs.google.com/spreadsheets/d/`**`<SPREADSHEET_ID>`**`/edit`

---

### Phase 4: Google Apps Script Configuration

1. In your Google Sheet, click **Extensions** > **Apps Script**.
2. Create three script files in the editor:
   - **`Config.gs`**: Paste the code from [`src/Config.gs`](src/Config.gs).
   - **`Prompt.gs`**: Paste the code from [`src/Prompt.gs`](src/Prompt.gs).
   - **`Code.gs`**: Paste the code from [`src/Code.gs`](src/Code.gs).
   > ⚠️ **Important**: Google Apps Script shares a single global namespace across files. Do **not** declare variables with the same name across multiple files.

3. Generate a random webhook secret token (e.g. `openssl rand -hex 16`).

4. Set up environment variables (Script Properties):
   - Go to ⚙️ **Project Settings** (left sidebar) > **Script Properties** > **Add script property**.
   - Add the following key-value pairs:
     - `TELEGRAM_BOT_TOKEN`: `<your_bot_token>`
     - `GEMINI_API_KEY`: `<your_gemini_api_key>`
     - `SPREADSHEET_ID`: `<your_spreadsheet_id>`
     - `WEBHOOK_SECRET`: `<your_generated_secret>`
     - `ALLOWED_CHAT_ID`: `<your_telegram_chat_id>`
     - `DEBUG_LOGGING`: `false`

5. Grant Initial Permissions:
   - Select the `doPost` function from the top toolbar dropdown and click ▶️ **Run**.
   - Review and grant permissions when prompted. *(Note: An error regarding `undefined (reading 'postData')` is expected when running manually, but authorization will be saved).*

---

### Phase 5: Web App Deployment

1. Click **Deploy** > **New Deployment** (top right).
2. Click the gear icon ⚙️ next to "Select type" and choose **Web app**.
3. Configure settings:
   - **Description**: `v1 Production`
   - **Execute as**: `Me (your_email@gmail.com)`
   - **Who has access**: **`Anyone`** *(Crucial: Allows Telegram servers to send POST webhooks without requiring Google login)*.
4. Click **Deploy** and copy the resulting **Web App URL** (`https://script.google.com/macros/s/.../exec`).

---

### Phase 6: Webhook Registration

To connect Telegram to your Google Apps Script Web App with secret verification, run the following command in your terminal:

```bash
curl -s "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=<WEB_APP_URL>?secret=<WEBHOOK_SECRET>"
```

---

## 🔄 Development Process & Methodology

This project was built following a disciplined, single-flow agentic development workflow:

```
┌─────────────────────────┐     ┌───────────────────────────┐     ┌──────────────────────────┐
│  1. Context & Design    │ ──> │  2. Bite-Sized Planning   │ ──> │  3. Single-Flow Execution│
│ (Brainstorm Architecture)     │   (Granular Task Spec)    │     │  (Sequential Code Build) │
└─────────────────────────┘     └───────────────────────────┘     └────────────┬─────────────┘
                                                                               │
┌─────────────────────────┐     ┌───────────────────────────┐                  │
│  5. Verification & Doc  │ <── │  4. Live Debugging Loop   │ <────────────────┘
│ (Smoke Test & README)   │     │ (Fix 302s, Fences, Quota) │
└─────────────────────────┘     └───────────────────────────┘
```

1. **Context & Requirement Discovery**: Evaluated zero-cost open-source alternatives (n8n, Telegram self-hosted bots, BudgetLens) and selected Google Apps Script + Gemini API + Google Sheets for a zero-hosting-fee serverless stack.
2. **Granular Implementation Planning**: Created an explicit 9-task breakdown with bite-sized steps (Task 0 through Task 8), defining exact file paths, complete code snippets, and expected verification outputs.
3. **Single-Flow Task Execution**: Executed implementation steps in an isolated feature branch (`feature/bot-implementation`) using strict single-task execution with two-stage review gates.
4. **Iterative Security Hardening**: Conducted security audits and resolved vulnerability findings (webhook authentication, prompt injection, user authorization, and data validation).
5. **Verification & Completion**: Verified the complete flow via `curl` smoke tests and end-to-end live Telegram interactions before documenting the system.

---

## 🧠 Agent Skills & Workflow Tools Used

The development process leveraged a specialized set of AI engineering skills:

- 🛠️ **`using-superpowers`**: Established strict process discipline, requiring skill loading and workflow verification prior to taking any action.
- 💡 **`brainstorming`**: Explored user requirements, deployment trade-offs, and architectural constraints before touching code.
- 📝 **`writing-plans`**: Formatted a comprehensive implementation plan with bite-sized tasks, explicit file references, and test commands.
- ⚡ **`executing-plans` & `single-flow-task-execution`**: Enforced single-thread task execution, explicit task boundaries, progress tracking in `task.md`, and checkpoint reviews.
- 🌿 **`using-git-worktrees`**: Managed Git repository isolation, branch creation, and clean baseline checks.
- 🐞 **`systematic-debugging`**: Provided a structured hypothesis-driven approach to trace root causes for API rate limits, HTTP status redirects, and JSON parsing failures.
- ✅ **`verification-before-completion`**: Guaranteed evidence-based completion claims by verifying live API calls and HTTP responses before closing tasks.

---

## 📋 Implementation Plans & Design Documents

For detailed technical specifications, architectural decisions, and step-by-step task breakdowns, refer to the following documents in [`docs/plans/`](docs/plans/):

- 🏗️ **Initial Implementation Plan**: [`docs/plans/2026-07-19-myfinancialbot-implementation.md`](docs/plans/2026-07-19-myfinancialbot-implementation.md) — 9-task specification covering zero-cost architecture, Google Apps Script backend setup, Gemini API client, and Sheets logging.
- 📦 **Prompt Module Refactoring**: Design ([`docs/plans/2026-07-20-move-prompt-to-new-file-design.md`](docs/plans/2026-07-20-move-prompt-to-new-file-design.md)) & Plan ([`docs/plans/2026-07-20-move-prompt-to-new-file.md`](docs/plans/2026-07-20-move-prompt-to-new-file.md)) — Modularized Gemini extraction prompt definitions into `src/Prompt.gs` with dynamic date anchors.
- 🛡️ **Security Hardening**: Design ([`docs/plans/2026-07-24-security-hardening-design.md`](docs/plans/2026-07-24-security-hardening-design.md)) & Plan ([`docs/plans/2026-07-24-security-hardening.md`](docs/plans/2026-07-24-security-hardening.md)) — Comprehensive security audit remediation, implementing 4 concentric security gates, prompt injection isolation, and payload validation.
- 📌 **Task Tracker**: [`docs/plans/task.md`](docs/plans/task.md) — Live project status checklist tracking milestone execution across all feature branches.

---

## ⚡ Important Lessons & Technical Gotchas

1. **`302 Found` Redirects & `HtmlService`**:
   - `ContentService.createTextOutput()` can trigger a 302 redirect to `script.googleusercontent.com`, which Telegram webhooks do not follow.
   - **Solution**: `doPost()` returns `HtmlService.createHtmlOutput('OK')` to respond with a direct `200 OK`.

2. **Gemini Code Block Sanitization**:
   - Gemini sometimes wraps JSON output in Markdown fences (```json ... ```). The script includes a sanitizer function to strip code fences prior to calling `JSON.parse()`.

3. **Updating Deployment**:
   - Whenever you update code in Apps Script, edit the existing deployment and select **New Version** under **Deploy > Manage Deployments** to preserve the URL and activate changes.

---

## 🧪 Testing the Bot

1. Open Telegram and search for `@MyFinancialBot`.
2. Send `/start` to view the welcome message.
3. Try sending a text message:
   ```text
   Spent $45 on internet at Movistar
   ```
4. Try sending a photo of a receipt.
5. Check your Google Sheet under the **`Transactions`** tab to verify that the rows are being appended automatically!
