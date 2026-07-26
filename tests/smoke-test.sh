#!/usr/bin/env bash
# tests/smoke-test.sh — Validates the deployed Google Apps Script Web App endpoint
# by sending a mock Telegram webhook payload and verifying HTTP 200 is returned.
#
# Usage:
#   source .env && bash tests/smoke-test.sh
#
# Prerequisites:
#   - WEB_APP_URL must be set in your .env file (after completing Task 6 - Deploy)
#   - curl must be installed

set -euo pipefail

# ─── Validate prerequisites ───────────────────────────────────────────────────

if [[ -z "${WEB_APP_URL:-}" ]]; then
  echo "❌ ERROR: WEB_APP_URL is not set."
  echo "   Run: source .env"
  echo "   (Complete Task 6 - Deploy as Web App first if not done yet)"
  exit 1
fi

if [[ -z "${WEBHOOK_SECRET:-}" ]]; then
  echo "❌ ERROR: WEBHOOK_SECRET is not set."
  echo "   Add WEBHOOK_SECRET=<your_secret> to your .env file, then run: source .env"
  exit 1
fi

# ─── Build mock payload ───────────────────────────────────────────────────────

# Simulates a real Telegram webhook POST for a text message.
# The chat_id here is fake — the bot will try to reply to it but that's OK.
# We're testing that the endpoint accepts the payload and returns 200.
PAYLOAD=$(cat <<'EOF'
{
  "update_id": 999999,
  "message": {
    "message_id": 1,
    "chat": { "id": 123456789, "type": "private" },
    "from": { "id": 123456789, "first_name": "User", "is_bot": false },
    "date": 1700000000,
    "text": "Spent $45 on internet at Movistar"
  }
}
EOF
)

# ⚠️  IMPORTANT: This test sends a real POST to the PRODUCTION endpoint.
# It will trigger a real Gemini API call and attempt to log a row to your Sheet.
# Ensure WEB_APP_URL and WEBHOOK_SECRET are both set in your .env before running.

echo "🚀 Sending mock Telegram webhook to:"
echo "   ${WEB_APP_URL}?secret=<hidden>"
echo ""

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${WEB_APP_URL}?secret=${WEBHOOK_SECRET}" \
  -H "Content-Type: application/json" \
  -d "${PAYLOAD}")

# ─── Evaluate result ──────────────────────────────────────────────────────────

if [[ "${HTTP_STATUS}" == "200" ]]; then
  echo "✅ Smoke test PASSED — HTTP ${HTTP_STATUS} received"
  echo ""
  echo "Next steps to verify end-to-end:"
  echo "  1. Open your Google Sheet → Transactions tab"
  echo "     → Look for a new row with Amount=45, Currency=USD, Merchant=Movistar"
  echo "  2. Open Telegram → your bot"
  echo "     → Check for a confirmation reply (may be missing if chat_id is fake)"
else
  echo "❌ Smoke test FAILED — HTTP ${HTTP_STATUS}"
  echo ""
  echo "Troubleshooting:"
  echo "  - Check Apps Script execution logs: Extensions → Apps Script → Executions"
  echo "  - Verify Script Properties are set correctly"
  echo "  - Ensure the deployment is 'Anyone' access"
  exit 1
fi
