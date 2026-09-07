#!/usr/bin/env python3
import os
import sys
import json
import re
import datetime
import urllib.request
import urllib.error

# ─── Load environment ────────────────────────────────────────────────────────
env_files = [sys.argv[1]] if len(sys.argv) > 1 else ['.env.local', '.env']
env_vars = {}
for env_file in env_files:
    if os.path.exists(env_file):
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    if k not in env_vars:
                        env_vars[k] = v

print("=== Environment loaded ===")
for k in ['TELEGRAM_BOT_TOKEN', 'GEMINI_API_KEY', 'SPREADSHEET_ID', 'WEB_APP_URL', 'WEBHOOK_SECRET']:
    val = env_vars.get(k, '')
    print(f"  {k}: {'SET (len=' + str(len(val)) + ')' if val else 'NOT SET'}")

# ─── 1. Unit Tests for Schema Validation (validateExpense logic) ────────────

VALID_CATEGORIES = {
    'Food', 'Transport', 'Entertainment', 'Health',
    'Internet', 'Utilities', 'Shopping', 'Other'
}

def validate_expense(parsed):
    if not parsed or not isinstance(parsed, dict):
        return None

    amount = parsed.get('amount')
    if isinstance(amount, str):
        cleaned = re.sub(r'[^0-9.]', '', amount)
        try:
            amount = float(cleaned)
        except ValueError:
            return None
        parsed['amount'] = amount

    if not isinstance(amount, (int, float)) or amount <= 0 or amount > 1e8:
        return None

    currency = parsed.get('currency')
    if not isinstance(currency, str) or not re.match(r'^[A-Z]{3}$', currency):
        return None

    category = parsed.get('category')
    if isinstance(category, str):
        cat_lower = category.strip().lower()
        matched = None
        for valid_cat in VALID_CATEGORIES:
            if valid_cat.lower() == cat_lower:
                matched = valid_cat
                break
        parsed['category'] = matched or 'Other'
    else:
        parsed['category'] = 'Other'

    date_str = parsed.get('date')
    if not isinstance(date_str, str) or not re.match(r'^\d{4}-\d{2}-\d{2}$', date_str):
        parsed['date'] = datetime.datetime.utcnow().strftime('%Y-%m-%d')

    merchant = parsed.get('merchant')
    if merchant is not None:
        if not isinstance(merchant, str) or len(merchant) > 200:
            parsed['merchant'] = str(merchant)[:200]

    notes = parsed.get('notes')
    if notes is not None:
        if not isinstance(notes, str) or len(notes) > 500:
            parsed['notes'] = str(notes)[:500]

    return parsed

print("\n=== Running Unit Tests: validate_expense() ===")

tests = [
    ({"amount": 45, "currency": "USD", "category": "Internet", "merchant": "Movistar", "date": "2026-09-07"}, True),
    ({"amount": "$45.00", "currency": "USD", "category": "internet", "merchant": "Movistar"}, True),
    ({"amount": 0, "currency": "USD", "category": "Food"}, False),
    ({"amount": -10, "currency": "USD", "category": "Food"}, False),
    ({"amount": 100, "currency": "INVALID", "category": "Food"}, False),
    ({"amount": 100, "currency": "ARS", "category": "UnknownCategory"}, True), # fallback to Other
]

passed_count = 0
for idx, (inp, expected_valid) in enumerate(tests, 1):
    res = validate_expense(inp.copy())
    is_valid = res is not None
    if is_valid == expected_valid:
        print(f"  ✓ Test {idx} passed")
        passed_count += 1
    else:
        print(f"  ✗ Test {idx} FAILED: expected valid={expected_valid}, got={res}")

print(f"Unit Tests Result: {passed_count}/{len(tests)} passed")

# ─── 2. Gemini API Direct Call Test ──────────────────────────────────────────

gemini_key = env_vars.get('GEMINI_API_KEY')
if not gemini_key:
    print("\n⚠️ Skipping Gemini API test: GEMINI_API_KEY not set")
else:
    print("\n=== Testing Gemini API Calls ===")

    def get_system_prompt():
        today = datetime.datetime.utcnow().strftime('%Y-%m-%d')
        return f"""
You are a bilingual (English/Spanish) expense extraction assistant.
Given a user message or a receipt image, extract the expense and return ONLY a valid JSON object.
No markdown, no code fences, no explanation — raw JSON only.

Today's date (UTC): {today}

Required JSON schema:
{{
  "date": "YYYY-MM-DD",
  "amount": 45.00,
  "currency": "USD",
  "category": "Internet",
  "merchant": "Movistar",
  "notes": ""
}}

Rules:
- date: Use today's date (UTC: {today}) if not explicitly mentioned in the user message or receipt image.
- amount: Numeric value only, no currency symbols.
- currency: 3-letter ISO 4217 code.
  Inference rules: "pesos" or "ARS" → "ARS", "dólares" or "USD" → "USD",
  "$" alone without country context → "USD", "€" → "EUR".
- category: Must be exactly one of: Food, Transport, Entertainment, Health, Internet, Utilities, Shopping, Other.
- merchant: Name of store, vendor, or service provider. Empty string if unknown.
- notes: Any additional context the user provided. Empty string if none.

If you cannot extract a valid expense, return: {{ "error": "Could not parse" }}
""".strip()

    models_to_test = ['gemini-3.6-flash', 'gemini-2.5-flash']
    for model in models_to_test:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        payload = json.dumps({
            "systemInstruction": {"parts": [{"text": get_system_prompt()}]},
            "contents": [{"role": "user", "parts": [{"text": "Spent $45 on internet at Movistar"}]}],
            "generationConfig": {"temperature": 0.1}
        }).encode('utf-8')

        req = urllib.request.Request(
            url,
            data=payload,
            headers={
                "x-goog-api-key": gemini_key,
                "Content-Type": "application/json"
            },
            method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                raw_text = data['candidates'][0]['content']['parts'][0]['text'].strip()
                if raw_text.startswith('```'):
                    lines = raw_text.split('\n')
                    raw_text = '\n'.join(lines[1:-1]).strip()
                parsed = json.loads(raw_text)
                validated = validate_expense(parsed)
                print(f"  ✓ Model {model} succeeded!")
                print(f"    Raw output: {raw_text}")
                print(f"    Validated: {validated}")
        except urllib.error.HTTPError as e:
            err_body = e.read().decode('utf-8')
            print(f"  ✗ Model {model} HTTP {e.code} Error: {err_body[:200]}")
        except Exception as e:
            print(f"  ✗ Model {model} Exception: {e}")

# ─── 3. Telegram Webhook Verification ────────────────────────────────────────

bot_token = env_vars.get('TELEGRAM_BOT_TOKEN')
if not bot_token:
    print("\n⚠️ Skipping Telegram Webhook check: TELEGRAM_BOT_TOKEN not set")
else:
    print("\n=== Telegram Webhook Status ===")
    url = f"https://api.telegram.org/bot{bot_token}/getWebhookInfo"
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            info = json.loads(resp.read().decode('utf-8'))
            print("  Webhook Info Result:")
            print(json.dumps(info, indent=2))
    except Exception as e:
        print(f"  ✗ Failed to get webhook info: {e}")

# ─── 4. Live Web App Endpoint Test ──────────────────────────────────────────

web_app_url = env_vars.get('WEB_APP_URL')
webhook_secret = env_vars.get('WEBHOOK_SECRET')
if not web_app_url or not webhook_secret:
    print("\n⚠️ Skipping Web App Endpoint test: WEB_APP_URL or WEBHOOK_SECRET not set")
else:
    print("\n=== Testing Live Web App Endpoint ===")
    target_url = f"{web_app_url}?secret={webhook_secret}"
    mock_payload = json.dumps({
        "update_id": 999999,
        "message": {
            "message_id": 1,
            "chat": {"id": 123456789, "type": "private"},
            "from": {"id": 123456789, "first_name": "TestUser", "is_bot": False},
            "date": 1700000000,
            "text": "Spent $45 on internet at Movistar"
        }
    }).encode('utf-8')

    req = urllib.request.Request(
        target_url,
        data=mock_payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            print(f"  ✓ Endpoint returned HTTP {resp.status}")
    except urllib.error.HTTPError as e:
        print(f"  ✗ Endpoint returned HTTP {e.code}")
    except Exception as e:
        print(f"  ✗ Endpoint call failed: {e}")
