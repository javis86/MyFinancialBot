# Security Hardening Design — MyFinancialBot

**Date:** 2026-07-24
**Status:** Approved
**Source:** Security analysis report (15 findings across CRIT/HIGH/MED/LOW)

---

## Problem

The bot currently has no authentication, no input validation, and leaks credentials via `.gitignore` gaps and insecure API call patterns. Any person who finds the Apps Script URL can send fake Telegram payloads, write junk data to the owner's Google Sheet, and exhaust the Gemini API quota.

---

## Security Gate Architecture

Four concentric gates execute inside `doPost` / `handleUpdate` before any business logic runs:

```
Incoming POST
     │
     ▼
[Gate 1] Webhook Secret (query param ?secret=) ── FAIL → silent 200 drop
     │
     ▼
[Gate 2] Chat ID Allowlist (single owner) ──────── FAIL → silent 200 drop
     │
     ▼
[Gate 3] Rate Limiter (20 req/hr, CacheService) ── FAIL → reply "too many requests"
     │
     ▼
[Gate 4] Schema Validator (validateExpense) ─────── FAIL → reply "couldn't parse"
     │
     ▼
Business Logic (Gemini → Sheet)
```

Gates 1 and 2 return silent `200 OK` with no body — zero information disclosure to attackers.

---

## Design Decisions

| Finding | Decision |
|---------|----------|
| CRIT-1 (credentials on disk) | Fix `.gitignore` with `.env*` / `!.env.example` wildcard. Manual credential rotation by owner. |
| CRIT-2 (no webhook validation) | Embed `WEBHOOK_SECRET` as `?secret=` query param in webhook URL. Validate via `e.parameter.secret` in GAS (headers not accessible in doPost). |
| CRIT-3 (no user auth) | Option A — single owner. Store `ALLOWED_CHAT_ID` in Script Properties. Silent drop on mismatch. |
| HIGH-4 (prompt injection) | Move system prompt to Gemini `systemInstruction` field; user text goes only into `contents[].parts`. |
| HIGH-5 (full payload logged) | Option C — `DEBUG_LOGGING` Script Property (default `false`). Metadata-only by default; full payload when `true`. |
| HIGH-6 (API key in URL) | Move Gemini API key from `?key=` query param to `x-goog-api-key` request header. |
| HIGH-7 (token in download URL) | GAS/Telegram constraint — no code fix possible. Document as manual rotation step. |
| HIGH-8 (.env.javier not in gitignore) | Covered by `.env*` wildcard in .gitignore fix. |
| MED-9 (no rate limiting) | Option A — 20 requests/hour per chat ID using `CacheService.getScriptCache()` with 3600s TTL. |
| MED-10 (error leaks config) | `appendToSheet()` logs details to `Logger.log`; throws a generic message to callers. |
| MED-11 (MIME type hardcoded) | `downloadFileAsBase64()` returns `{ data, mimeType }` using `blob.getContentType()`. |
| MED-12 (Web App URL exposure) | Covered by `.gitignore` fix (env files excluded). |
| MED-13 (no schema validation) | New `validateExpense()` function with strict type/range/regex checks wired into `callGemini()`. |
| LOW-14 (drop_pending_updates masking) | README note only — no code change. |
| LOW-15 (smoke test hits production) | Update smoke test to pass `?secret=` param. Add comment warning it runs against real endpoint. |

---

## New Script Properties Required

| Property | Example Value | Purpose |
|----------|--------------|---------|
| `WEBHOOK_SECRET` | `xK9mP2qR7nL4vB8wA3cD6eF` (32+ chars) | Gate 1 — webhook origin validation |
| `ALLOWED_CHAT_ID` | `123456789` (your Telegram chat_id) | Gate 2 — owner-only authorization |
| `DEBUG_LOGGING` | `false` | Gate 5 — verbose payload logging toggle |

---

## Files Changed

| File | Type | Changes |
|------|------|---------|
| `.gitignore` | Modify | `.env*` wildcard + `!.env.example` exception |
| `src/Config.gs` | Modify | 3 new property getters |
| `src/Code.gs` | Modify | Gates 1–4, API key header, systemInstruction, MIME detection, error sanitization |
| `tests/smoke-test.sh` | Modify | Pass `?secret=` param in test URL |

---

## Out of Scope

- HIGH-7: Telegram token in file-download URL — Telegram API constraint, no code alternative
- LOW-14: `drop_pending_updates` masking — doc note only
- Credential rotation — manual steps, documented in implementation plan pre-flight
