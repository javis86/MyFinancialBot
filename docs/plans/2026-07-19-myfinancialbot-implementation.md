# MyFinancialBot Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Deploy a zero-cost serverless Telegram bot that parses expense messages and receipt images (via Gemini Vision) and stores structured data in Google Sheets.

**Architecture:** A Telegram bot receives messages (text or images) and POSTs them via webhook to a Google Apps Script Web App. The script calls Gemini to extract expense fields (date, amount, currency, category, merchant, notes) in either English or Spanish, then appends the row to a Google Sheet. No servers, no monthly fees.

**Tech Stack:** Telegram Bot API · Google Apps Script (GAS) · Google Gemini API (`gemini-1.5-flash`) · Google Sheets · MoneyNeBot (cloned, adapted) · `curl` (smoke tests)

---

## Task 0: Repository Scaffolding

**Files:**
- Create: `README.md`
- Create: `src/Code.gs`
- Create: `src/Config.gs`
- Create: `tests/smoke-test.sh`
- Create: `.env.example`
- Create: `.gitignore`

**Step 1: Initialize git repo**

```bash
cd /path/to/myfinancialbot
git init
```

Expected: `Initialized empty Git repository`

**Step 2: Create `.gitignore`**

```
.env
*.env.local
node_modules/
.DS_Store
```

**Step 3: Create `.env.example`**

```bash
# Copy this file to .env and fill in real values. NEVER commit .env.
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
GEMINI_API_KEY=your_gemini_api_key_here
SPREADSHEET_ID=your_google_sheet_id_here
WEB_APP_URL=your_web_app_url_here
```

**Step 4: Create directory structure**

```bash
mkdir -p src tests docs/plans
```

**Step 5: Initial commit**

```bash
git add .gitignore .env.example
git commit -m "chore: scaffold project structure"
```

---

## Task 1: Telegram Bot Creation (Manual — BotFather)

> This is a manual phase. No code is written. Outputs are recorded in your local `.env` file.

**Step 1: Open Telegram → search `@BotFather`** (verified blue checkmark)

**Step 2: Create the bot**

Send:
```
/newbot
```
- **Name:** `My Financial Bot`
- **Username:** `MyFinancialBot` (must end in `bot`)

**Step 3: Save the token**

BotFather returns a token like:
```
1234567890:ABCDefGhIjKlMnOpQrStUvWxYz
```

Add to your local `.env`:
```bash
TELEGRAM_BOT_TOKEN=1234567890:ABCDefGhIjKlMnOpQrStUvWxYz
```

**Step 4: Verify bot exists**

Open a browser and visit:
```
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getMe
```

Expected:
```json
{ "ok": true, "result": { "username": "MyFinancialBot", ... } }
```

---

## Task 2: Google Gemini API Key (Manual)

**Step 1: Navigate to** https://aistudio.google.com

**Step 2:** Sign in → click **"Get API key"** → **"Create API key in new project"**

**Step 3:** Copy the key and add to `.env`:
```bash
GEMINI_API_KEY=AIzaSy...your_key_here
```

**Step 4: Verify the key works**

```bash
source .env
curl -s \
  "https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}" \
  | grep -o '"name":"models/gemini[^"]*"' | head -5
```

Expected: lines containing model names like `gemini-1.5-flash`.

---

## Task 3: Google Sheets Database Setup (Manual)

**Step 1:** Go to https://sheets.google.com → New spreadsheet → rename to `MyFinancialBot`.

**Step 2:** Rename the first tab to `Transactions`.

**Step 3:** Set up the header row in Row 1 with exactly these values:

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| Timestamp | Date | Amount | Currency | Category | Merchant | Notes |

**Step 4:** Extract the Sheet ID from the URL:
```
https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit
```

Add to `.env`:
```bash
SPREADSHEET_ID=1ABCdef...your_sheet_id
```

---

## Task 4: Clone & Adapt MoneyNeBot Backend Code

**Files:**
- Create: `src/Config.gs`
- Create: `src/Code.gs`

**Step 1: Clone MoneyNeBot for reference**

```bash
git clone --depth=1 https://github.com/justpiple/expense-tracker-telegram-bot.git /tmp/moneynebot-ref
```

Read the structure in `/tmp/moneynebot-ref/` for architectural reference. Adapt — do NOT copy verbatim.

**Step 2: Create `src/Config.gs`**

```javascript
// Config.gs — Centralized configuration. All secrets come from Script Properties.
const CONFIG = {
  get(key) {
    const value = PropertiesService.getScriptProperties().getProperty(key);
    if (!value) throw new Error(`Missing Script Property: ${key}`);
    return value;
  },
  get TELEGRAM_BOT_TOKEN() { return this.get('TELEGRAM_BOT_TOKEN'); },
  get GEMINI_API_KEY()      { return this.get('GEMINI_API_KEY'); },
  get SPREADSHEET_ID()      { return this.get('SPREADSHEET_ID'); },
  SHEET_NAME: 'Transactions',
  GEMINI_MODEL: 'gemini-1.5-flash',
};
```

**Step 3: Create `src/Code.gs`**

```javascript
// Code.gs — Main webhook handler for MyFinancialBot
// Flow: Telegram POST → doPost → Gemini extract → Google Sheets append

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    handleUpdate(body);
  } catch (err) {
    Logger.log('doPost error: ' + err.message);
  }
  return ContentService.createTextOutput('OK');
}

function handleUpdate(update) {
  const message = update.message || update.edited_message;
  if (!message) return;
  const chatId = message.chat.id;

  if (message.photo) {
    handlePhotoMessage(chatId, message);
  } else if (message.text) {
    handleTextMessage(chatId, message.text);
  } else {
    sendMessage(chatId, "⚠️ Solo acepto texto o fotos de recibos.\nI only accept text or receipt photos.");
  }
}

function handleTextMessage(chatId, text) {
  if (text === '/start') {
    sendMessage(chatId,
      "👋 ¡Hola! / Hello!\n\n" +
      "Send me an expense as text or a receipt photo.\n" +
      "Ejemplo: _Pagué $1200 en Carrefour_\n" +
      "Example: _Spent $45 on internet at Movistar_"
    );
    return;
  }
  const expense = extractExpenseFromText(text);
  if (!expense) {
    sendMessage(chatId, "❌ No pude entender el gasto. Try: _Spent $50 on coffee at Starbucks_");
    return;
  }
  appendToSheet(expense);
  sendMessage(chatId, formatConfirmation(expense));
}

function handlePhotoMessage(chatId, message) {
  sendMessage(chatId, "📸 Procesando recibo... / Processing receipt...");
  try {
    const fileId = message.photo[message.photo.length - 1].file_id;
    const imageBase64 = downloadFileAsBase64(fileId);
    const expense = extractExpenseFromImage(imageBase64);
    if (!expense) {
      sendMessage(chatId, "❌ No pude leer el recibo. Please try a clearer photo.");
      return;
    }
    appendToSheet(expense);
    sendMessage(chatId, formatConfirmation(expense));
  } catch (err) {
    Logger.log('Photo error: ' + err.message);
    sendMessage(chatId, "❌ Error procesando la imagen.");
  }
}

// ─── Gemini ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `
You are a bilingual (English/Spanish) expense extraction assistant.
Extract expense details and return ONLY a valid JSON object with no markdown or extra text.

Schema:
{
  "date": "YYYY-MM-DD",
  "amount": 45.00,
  "currency": "USD",
  "category": "Internet",
  "merchant": "Movistar",
  "notes": ""
}

Categories: Food, Transport, Entertainment, Health, Internet, Utilities, Shopping, Other
If currency is ambiguous, infer from context ("pesos" → "ARS", "$" without context → "USD").
If you cannot parse an expense, return: { "error": "Could not parse" }
`.trim();

function extractExpenseFromText(text) {
  return callGemini({
    contents: [{ parts: [{ text: SYSTEM_PROMPT + "\n\nUser message: " + text }] }],
    generationConfig: { temperature: 0.1 }
  });
}

function extractExpenseFromImage(base64Image) {
  return callGemini({
    contents: [{
      parts: [
        { text: SYSTEM_PROMPT + "\n\nExtract the expense from this receipt image:" },
        { inlineData: { mimeType: 'image/jpeg', data: base64Image } }
      ]
    }],
    generationConfig: { temperature: 0.1 }
  });
}

function callGemini(payload) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  if (response.getResponseCode() !== 200) {
    Logger.log('Gemini error: ' + response.getContentText());
    return null;
  }
  const text = JSON.parse(response.getContentText())
    ?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed.error ? null : parsed;
  } catch (_) {
    Logger.log('Gemini JSON parse error: ' + text);
    return null;
  }
}

// ─── Google Sheets ────────────────────────────────────────────────────────────

function appendToSheet(expense) {
  const sheet = SpreadsheetApp
    .openById(CONFIG.SPREADSHEET_ID)
    .getSheetByName(CONFIG.SHEET_NAME);
  sheet.appendRow([
    new Date().toISOString(),
    expense.date,
    expense.amount,
    expense.currency,
    expense.category,
    expense.merchant,
    expense.notes,
  ]);
}

// ─── Telegram Helpers ─────────────────────────────────────────────────────────

function sendMessage(chatId, text) {
  UrlFetchApp.fetch(
    `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
      muteHttpExceptions: true,
    }
  );
}

function downloadFileAsBase64(fileId) {
  const fileData = JSON.parse(
    UrlFetchApp.fetch(
      `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`
    ).getContentText()
  );
  const filePath = fileData.result.file_path;
  const blob = UrlFetchApp.fetch(
    `https://api.telegram.org/file/bot${CONFIG.TELEGRAM_BOT_TOKEN}/${filePath}`
  ).getBlob();
  return Utilities.base64Encode(blob.getBytes());
}

function formatConfirmation(expense) {
  return (
    `✅ Expense logged! / ¡Gasto registrado!\n\n` +
    `📅 Date: ${expense.date}\n` +
    `💰 Amount: ${expense.amount} ${expense.currency}\n` +
    `🏷️ Category: ${expense.category}\n` +
    `🏪 Merchant: ${expense.merchant || '—'}\n` +
    `📝 Notes: ${expense.notes || '—'}`
  );
}
```

**Step 4: Commit**

```bash
git add src/
git commit -m "feat: add Apps Script backend (Config.gs + Code.gs)"
```

---

## Task 5: Google Apps Script Project Setup (Manual)

> The `.gs` files live in Google's cloud editor. The `src/` folder is for version control only.

**Step 1:** Open your Google Sheet → **Extensions → Apps Script**

**Step 2:** Rename the project to `MyFinancialBot`

**Step 3:** Delete the default `myFunction()` placeholder

**Step 4:** Create two script files in the editor:

- Click `+` → Script → name `Config` → paste `src/Config.gs`
- Click `+` → Script → name `Code` → paste `src/Code.gs`

**Step 5:** Go to ⚙️ **Project Settings → Script Properties → Add:**

| Property | Value |
|----------|-------|
| `TELEGRAM_BOT_TOKEN` | (from Task 1) |
| `GEMINI_API_KEY` | (from Task 2) |
| `SPREADSHEET_ID` | (from Task 3) |

**Step 6:** Save the project (Ctrl+S)

---

## Task 6: Deploy as Web App (Manual)

**Step 1:** Apps Script editor → **Deploy → New deployment**

**Step 2:** Click ⚙️ gear → select **"Web app"**

**Step 3:** Configure:

| Setting | Value |
|---------|-------|
| Description | `v1 - Initial Production` |
| Execute as | `Me (your_email@gmail.com)` |
| Who has access | `Anyone` ⚠️ Required for Telegram servers |

**Step 4:** Click **Deploy** → authorize permissions (Sheets + external network)

**Step 5:** Copy the Web App URL (looks like):
```
https://script.google.com/macros/s/AKfycby.../exec
```

Add to `.env`:
```bash
WEB_APP_URL=https://script.google.com/macros/s/AKfycby.../exec
```

---

## Task 7: Webhook Initialization

**Step 1: Register the webhook**

```bash
source .env
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${WEB_APP_URL}"
```

Expected:
```json
{ "ok": true, "result": true, "description": "Webhook was set" }
```

**Step 2: Verify webhook is active**

```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo" | python3 -m json.tool
```

Check that `"url"` matches your `WEB_APP_URL` and `"pending_update_count": 0`.

---

## Task 8: Smoke Test & End-to-End Verification

**Files:**
- Create: `tests/smoke-test.sh`

**Step 1: Create the smoke test script**

```bash
#!/usr/bin/env bash
# tests/smoke-test.sh — Sends a mock Telegram webhook payload to the deployed GAS endpoint
# Usage: source .env && bash tests/smoke-test.sh

set -euo pipefail

if [[ -z "${WEB_APP_URL:-}" ]]; then
  echo "ERROR: WEB_APP_URL not set. Run: source .env"
  exit 1
fi

PAYLOAD=$(cat <<'EOF'
{
  "update_id": 999999,
  "message": {
    "message_id": 1,
    "chat": { "id": 123456789, "type": "private" },
    "from": { "id": 123456789, "first_name": "User" },
    "date": 1700000000,
    "text": "Spent $45 on internet at Movistar"
  }
}
EOF
)

echo "🚀 Sending test payload to: $WEB_APP_URL"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$WEB_APP_URL" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

if [[ "$HTTP_STATUS" == "200" ]]; then
  echo "✅ Smoke test passed — HTTP 200 received"
  echo "👉 Check your Google Sheet for a new row"
  echo "👉 Check your Telegram bot for a confirmation message"
else
  echo "❌ Smoke test FAILED — HTTP $HTTP_STATUS"
  exit 1
fi
```

**Step 2: Make executable and commit**

```bash
chmod +x tests/smoke-test.sh
git add tests/smoke-test.sh
git commit -m "test: add curl smoke test"
```

**Step 3: Run the smoke test**

```bash
source .env
bash tests/smoke-test.sh
```

Expected: `✅ Smoke test passed — HTTP 200 received`

**Step 4: Verify Google Sheet**

Open your Sheet → `Transactions` tab → confirm new row:
- Timestamp ✓, Date ✓, Amount = `45`, Currency = `USD`, Category = `Internet`, Merchant = `Movistar`

**Step 5: Live Telegram test — text message**

Send to your bot:
```
Pagué $1200 de supermercado en Carrefour
```

Expected bot reply: `✅ Expense logged!` with fields populated. Check Sheet for new row with `Category: Food`, `Currency: ARS`.

**Step 6: Live Telegram test — receipt photo**

- Send any receipt photo to your bot
- Verify the bot extracts and confirms the expense
- Confirm row appears in Google Sheet

**Step 7: Final commit**

```bash
git add .
git commit -m "chore: v1 complete - MyFinancialBot deployed and verified"
```

---

## Summary

| Task | Type | Est. Time |
|------|------|-----------|
| 0 — Scaffolding | Code + git | 5 min |
| 1 — Telegram BotFather | Manual | 5 min |
| 2 — Gemini API Key | Manual | 3 min |
| 3 — Google Sheets DB | Manual | 5 min |
| 4 — Apps Script code | Code + git | 10 min |
| 5 — GAS project setup | Manual paste | 10 min |
| 6 — Deploy Web App | Manual | 5 min |
| 7 — Webhook init | curl | 2 min |
| 8 — Smoke test + verify | curl + Telegram | 10 min |

**Total estimated time: ~55 minutes**

---

*Plan written per `writing-plans` skill. Next: use `/execute-plan` workflow to run this plan task-by-task.*
