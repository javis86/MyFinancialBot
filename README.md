# MyFinancialBot

> Zero-cost, serverless expense tracker bot for Telegram.

## Architecture

```
Telegram App → Telegram Bot API → Google Apps Script (Webhook)
                                         ↓
                              Google Gemini API (NLP + OCR)
                                         ↓
                              Google Sheets (Database)
```

- **Frontend / UI:** Telegram App (Mobile + Desktop)
- **Backend / Logic:** Google Apps Script (serverless, no hosting fees)
- **AI Processing:** Google Gemini `gemini-1.5-flash` (bilingual EN/ES, text + receipt OCR)
- **Database:** Google Sheets (`Transactions` tab)

## Supported Input

- 💬 **Text messages** — e.g. `"Spent $45 on internet at Movistar"` or `"Pagué $1200 en Carrefour"`
- 📸 **Receipt photos** — Gemini Vision extracts date, amount, merchant automatically
- 🌐 **Bilingual** — English and Spanish supported natively

## Transaction Fields

| Column | Description |
|--------|-------------|
| Timestamp | When the entry was logged (ISO 8601) |
| Date | Expense date extracted by Gemini |
| Amount | Numeric amount |
| Currency | ISO code (USD, ARS, etc.) |
| Category | Food, Transport, Internet, Utilities, Shopping, Health, Entertainment, Other |
| Merchant | Store or vendor name |
| Notes | Any extra context |

## Quick Setup

See [docs/plans/2026-07-19-myfinancialbot-implementation.md](docs/plans/2026-07-19-myfinancialbot-implementation.md) for the full step-by-step implementation plan.

**High-level steps:**
1. Create Telegram bot via BotFather
2. Get Gemini API key from Google AI Studio
3. Create Google Sheet with `Transactions` tab
4. Paste `src/Config.gs` + `src/Code.gs` into Google Apps Script editor
5. Set Script Properties (tokens + sheet ID)
6. Deploy as Web App
7. Register webhook: `curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<WEB_APP_URL>"`
8. Send `/start` to your bot and test!

## Testing

```bash
source .env
bash tests/smoke-test.sh
```

## Local Development

The source files in `src/` are version-controlled copies of the Apps Script code.
After editing, manually paste updated code into the Apps Script editor and redeploy.

## Cost

**$0/month.** Everything runs on free Google infrastructure.
