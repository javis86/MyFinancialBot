// Code.gs — Main webhook handler for MyFinancialBot
//
// Data flow:
//   Telegram message → doPost() → handleUpdate() → Gemini extract → appendToSheet() → sendMessage()
//
// Supported inputs:
//   - Text messages (natural language, English or Spanish)
//   - Photo messages (receipt OCR via Gemini Vision)
//
// Requires Config.gs to be present in the same Apps Script project.

// ─── Entry Point ──────────────────────────────────────────────────────────────

/**
 * HTTP POST entry point for the Google Apps Script Web App.
 * Telegram sends all updates here via webhook.
 * Must always return HTTP 200 — returning errors causes Telegram to retry.
 *
 * @param {GoogleAppsScript.Events.DoPost} e - The POST event from Apps Script
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  try {
    // ── Gate 1: Webhook secret token validation ──────────────────────────────
    // Telegram includes ?secret= in the webhook URL we registered.
    // GAS doPost does not expose request headers, so we use a query parameter.
    const incomingSecret = e.parameter && e.parameter['secret'];
    if (incomingSecret !== CONFIG.WEBHOOK_SECRET) {
      Logger.log('doPost: rejected — invalid or missing webhook secret');
      return HtmlService.createHtmlOutput('OK'); // Silent drop — no info to attacker
    }

    // ── Sanitized debug logging ──────────────────────────────────────────────
    // By default (DEBUG_LOGGING=false): log timestamp, chat_id, msg type only.
    // Set DEBUG_LOGGING=true in Script Properties to enable full payload logging.
    try {
      const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
      if (spreadsheetId) {
        const dbSheet = SpreadsheetApp.openById(spreadsheetId);
        let logSheet = dbSheet.getSheetByName('Logs');
        if (!logSheet) logSheet = dbSheet.insertSheet('Logs');

        const body = JSON.parse(e.postData.contents);
        const msgType = body?.message?.photo ? 'photo'
          : body?.message?.text ? 'text'
          : 'other';
        const chatId = body?.message?.chat?.id ?? 'unknown';

        if (CONFIG.DEBUG_LOGGING) {
          logSheet.appendRow([new Date().toISOString(), 'doPost', chatId, msgType, JSON.stringify(e)]);
        } else {
          logSheet.appendRow([new Date().toISOString(), 'doPost', chatId, msgType]);
        }
      }
    } catch (logErr) {
      // Ignore logger errors — never block main flow
    }

    const body = JSON.parse(e.postData.contents);
    handleUpdate(body);
  } catch (err) {
    // Log but swallow all errors — never return a non-200 to Telegram
    Logger.log('doPost error: ' + err.message);
  }
  return HtmlService.createHtmlOutput('OK');
}

// ─── Update Router ────────────────────────────────────────────────────────────

/**
 * Routes an incoming Telegram update to the appropriate handler.
 * Supports text messages and photo (receipt image) messages.
 * Silently ignores stickers, voice, documents, etc.
 *
 * @param {Object} update - Parsed Telegram Update object
 */
function handleUpdate(update) {
  const message = update.message || update.edited_message;
  if (!message) return;

  const chatId = message.chat.id;

  // ── Gate 2: Owner-only authorization ────────────────────────────────────────
  // Any chat_id not matching ALLOWED_CHAT_ID is silently dropped.
  // No reply is sent — this reveals nothing to unauthorized senders.
  if (String(chatId) !== CONFIG.ALLOWED_CHAT_ID) {
    Logger.log('handleUpdate: unauthorized chat_id ' + chatId + ' — silent drop');
    return;
  }

  // ── Gate 3: Rate limiting — 20 requests per hour ────────────────────────────
  // Uses CacheService with a 1-hour TTL. Resets automatically each hour.
  const cache = CacheService.getScriptCache();
  const rateKey = 'rate_' + chatId;
  const count = parseInt(cache.get(rateKey) || '0', 10);
  if (count >= 20) {
    sendMessage(
      chatId,
      '⏳ Too many requests. Try again in an hour.\n' +
      'Demasiadas solicitudes. Intenta en una hora.'
    );
    return;
  }
  cache.put(rateKey, String(count + 1), 3600); // increment counter, 1-hour TTL

  if (message.photo) {
    handlePhotoMessage(chatId, message);
  } else if (message.text) {
    handleTextMessage(chatId, message.text);
  } else {
    sendMessage(
      chatId,
      '⚠️ Solo acepto texto o fotos de recibos.\n' +
      'I only accept text messages or receipt photos.'
    );
  }
}

// ─── Message Handlers ─────────────────────────────────────────────────────────

/**
 * Handles a plain-text expense message.
 * Supports /start command and free-form natural language (EN or ES).
 *
 * @param {number} chatId - Telegram chat ID to reply to
 * @param {string} text   - Raw text from the user
 */
function handleTextMessage(chatId, text) {
  if (text === '/start') {
    sendMessage(
      chatId,
      '👋 ¡Hola! / Hello!\n\n' +
      'Send me an expense as text or a receipt photo.\n' +
      'Enviame un gasto en texto o una foto de un recibo.\n\n' +
      'Examples / Ejemplos:\n' +
      '  • _Spent $45 on internet at Movistar_\n' +
      '  • _Pagué $1200 de supermercado en Carrefour_\n' +
      '  • 📸 Send any receipt photo'
    );
    return;
  }

  const expense = extractExpenseFromText(text);
  if (!expense) {
    sendMessage(
      chatId,
      '❌ No pude entender el gasto. / I couldn\'t parse that expense.\n\n' +
      'Try: _Spent $50 on coffee at Starbucks_\n' +
      'O: _Pagué $800 de nafta en YPF_'
    );
    return;
  }

  appendToSheet(expense);
  sendMessage(chatId, formatConfirmation(expense));
}

/**
 * Handles a photo message (receipt OCR via Gemini Vision).
 * Downloads the highest-resolution version Telegram provides,
 * sends it to Gemini, and logs the extracted expense.
 *
 * @param {number} chatId   - Telegram chat ID to reply to
 * @param {Object} message  - Telegram Message object containing photo array
 */
function handlePhotoMessage(chatId, message) {
  sendMessage(chatId, '📸 Procesando recibo... / Processing receipt...');

  try {
    // Telegram always sends photos as an array sorted by resolution (ascending).
    // The last element is the highest quality version available.
    const fileId = message.photo[message.photo.length - 1].file_id;
    const { data: imageBase64, mimeType } = downloadFileAsBase64(fileId);

    const expense = extractExpenseFromImage(imageBase64, mimeType);
    if (!expense) {
      sendMessage(
        chatId,
        '❌ No pude leer el recibo. / Couldn\'t read the receipt.\n\n' +
        'Please try a clearer, well-lit photo.'
      );
      return;
    }

    appendToSheet(expense);
    sendMessage(chatId, formatConfirmation(expense));
  } catch (err) {
    Logger.log('handlePhotoMessage error: ' + err.message);
    sendMessage(chatId, '❌ Error procesando la imagen. / Error processing the image.');
  }
}

// ─── Gemini Integration ────────────────────────────────────────────────────────


/**
 * Calls Gemini to extract an expense from a plain-text message.
 * Uses systemInstruction to isolate the system prompt from user input,
 * preventing prompt injection attacks.
 *
 * @param {string} text - Natural language expense description
 * @returns {Object|null} Parsed expense object, or null on failure
 */
function extractExpenseFromText(text) {
  const prompt = typeof getExtractionSystemPrompt === 'function'
    ? getExtractionSystemPrompt()
    : EXTRACTION_SYSTEM_PROMPT;

  // systemInstruction separates the system prompt from user content at the API level.
  // This prevents user text from overriding or injecting into the system prompt.
  return callGemini({
    systemInstruction: { parts: [{ text: prompt }] },
    contents: [{ role: 'user', parts: [{ text: text }] }],
    generationConfig: { temperature: 0.1 }
  });
}

/**
 * Calls Gemini Vision to extract an expense from a base64-encoded receipt image.
 * Uses systemInstruction to prevent prompt injection from image content.
 *
 * @param {string} base64Image - Base64-encoded image data
 * @param {string} mimeType    - Actual MIME type detected from the blob (e.g. image/jpeg, image/png)
 * @returns {Object|null} Parsed expense object, or null on failure
 */
function extractExpenseFromImage(base64Image, mimeType) {
  const prompt = typeof getExtractionSystemPrompt === 'function'
    ? getExtractionSystemPrompt()
    : EXTRACTION_SYSTEM_PROMPT;

  return callGemini({
    systemInstruction: { parts: [{ text: prompt }] },
    contents: [{
      role: 'user',
      parts: [
        { text: 'Extract the expense from this receipt image:' },
        { inlineData: { mimeType: mimeType || 'image/jpeg', data: base64Image } }
      ]
    }],
    generationConfig: { temperature: 0.1 }
  });
}


// ─── Expense Schema Validator ──────────────────────────────────────────────────

/** Valid expense categories — must match Prompt.gs system prompt exactly */
const VALID_CATEGORIES = new Set([
  'Food', 'Transport', 'Entertainment', 'Health',
  'Internet', 'Utilities', 'Shopping', 'Other'
]);

/**
 * Validates a parsed Gemini expense object against strict schema rules.
 * Rejects malformed, out-of-range, or unexpected values before they reach the Sheet.
 *
 * @param {Object} parsed - Raw parsed JSON from Gemini
 * @returns {Object|null} The validated expense, or null if validation fails
 */
function validateExpense(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;

  // amount: must be a positive number, capped at 100 million
  if (typeof parsed.amount !== 'number' || parsed.amount <= 0 || parsed.amount > 1e8) return null;

  // currency: must be exactly 3 uppercase letters (ISO 4217)
  if (typeof parsed.currency !== 'string' || !/^[A-Z]{3}$/.test(parsed.currency)) return null;

  // category: must be one of the defined categories
  if (typeof parsed.category !== 'string' || !VALID_CATEGORIES.has(parsed.category)) return null;

  // date: must be YYYY-MM-DD format
  if (typeof parsed.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) return null;

  // merchant: optional string, max 200 chars
  if (parsed.merchant !== undefined && parsed.merchant !== null) {
    if (typeof parsed.merchant !== 'string' || parsed.merchant.length > 200) return null;
  }

  // notes: optional string, max 500 chars
  if (parsed.notes !== undefined && parsed.notes !== null) {
    if (typeof parsed.notes !== 'string' || parsed.notes.length > 500) return null;
  }

  return parsed;
}

/**
 * Core Gemini API caller. Sends a generateContent request and parses the JSON response.
 * Returns null on any error (API failure, non-200 status, invalid JSON, schema violation).
 *
 * @param {Object} payload - Gemini API request body
 * @returns {Object|null} Parsed and validated expense JSON, or null
 */
function callGemini(payload) {
  // API key goes in the request header — NOT the URL query string.
  // This prevents the key from appearing in server-side access logs.
  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    CONFIG.GEMINI_MODEL +
    ':generateContent';

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': CONFIG.GEMINI_API_KEY },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,   // Prevents GAS from throwing on 4xx/5xx
  });

  if (response.getResponseCode() !== 200) {
    Logger.log('Gemini API error (' + response.getResponseCode() + '): ' + response.getContentText());
    return null;
  }

  const rawText = JSON.parse(response.getContentText())
    ?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText) {
    Logger.log('Gemini returned empty content');
    return null;
  }

  let cleanText = rawText.trim();
  // Strip markdown code block fences if present (e.g. ```json ... ```)
  if (cleanText.startsWith('```')) {
    const lines = cleanText.split('\n');
    if (lines.length > 2) {
      cleanText = lines.slice(1, -1).join('\n').trim();
    } else {
      cleanText = cleanText.replace(/```[a-z]*/gi, '').trim();
    }
  }

  try {
    const parsed = JSON.parse(cleanText);
    if (parsed.error) {
      Logger.log('Gemini could not parse expense: ' + parsed.error);
      return null;
    }
    // Ensure date fallback before validation
    if (!parsed.date || typeof parsed.date !== 'string') {
      parsed.date = new Date().toISOString().split('T')[0];
    }
    // Gate 4: Strict schema validation — rejects malformed Gemini output
    const validated = validateExpense(parsed);
    if (!validated) {
      Logger.log('validateExpense: schema check failed. Raw output: ' + rawText);
      return null;
    }
    return validated;
  } catch (_) {
    Logger.log('Failed to parse Gemini JSON output. Raw: ' + rawText + ' | Cleaned: ' + cleanText);
    return null;
  }
}

// ─── Google Sheets Integration ────────────────────────────────────────────────

/**
 * Appends one expense row to the Transactions sheet.
 * Column order: Timestamp, Date, Amount, Currency, Category, Merchant, Notes
 * (must match CONFIG.COLUMNS and the sheet header row).
 *
 * @param {Object} expense - Expense object extracted by Gemini
 */
function appendToSheet(expense) {
  const sheet = SpreadsheetApp
    .openById(CONFIG.SPREADSHEET_ID)
    .getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    // Log details internally; do NOT expose SPREADSHEET_ID or sheet name to callers/users
    Logger.log(
      'appendToSheet: sheet "' + CONFIG.SHEET_NAME +
      '" not found in spreadsheet ' + CONFIG.SPREADSHEET_ID
    );
    throw new Error('Database sheet not found. Check Script Properties configuration.');
  }

  sheet.appendRow([
    new Date().toISOString(),   // Timestamp — when the bot logged it
    expense.date,               // Date — when the expense occurred
    expense.amount,             // Amount (numeric)
    expense.currency,           // Currency (ISO code)
    expense.category,           // Category
    expense.merchant || '',     // Merchant (empty string if unknown)
    expense.notes   || '',      // Notes (empty string if none)
  ]);
}

// ─── Telegram Helpers ─────────────────────────────────────────────────────────

/**
 * Sends a Markdown-formatted message to a Telegram chat.
 *
 * @param {number} chatId - Telegram chat ID
 * @param {string} text   - Message text (Markdown supported)
 */
function sendMessage(chatId, text) {
  UrlFetchApp.fetch(
    'https://api.telegram.org/bot' + CONFIG.TELEGRAM_BOT_TOKEN + '/sendMessage',
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
      }),
      muteHttpExceptions: true,
    }
  );
}

/**
 * Downloads a Telegram file by file_id and returns its base64 content and MIME type.
 * Steps:
 *   1. Call getFile API to resolve file_id → file_path
 *   2. Fetch the actual file bytes from the Telegram CDN
 *   3. Detect real MIME type from blob (Telegram may send PNG, WebP, or HEIC, not just JPEG)
 *   4. Base64-encode for Gemini inlineData
 *
 * @param {string} fileId - Telegram file_id from the message
 * @returns {{ data: string, mimeType: string }} Base64 content and detected MIME type
 */
function downloadFileAsBase64(fileId) {
  const fileInfo = JSON.parse(
    UrlFetchApp.fetch(
      'https://api.telegram.org/bot' + CONFIG.TELEGRAM_BOT_TOKEN + '/getFile?file_id=' + fileId
    ).getContentText()
  );
  const filePath = fileInfo.result.file_path;
  const fileBlob = UrlFetchApp.fetch(
    'https://api.telegram.org/file/bot' + CONFIG.TELEGRAM_BOT_TOKEN + '/' + filePath
  ).getBlob();

  // Detect actual MIME type from blob — Telegram may send PNG, WebP, or HEIC, not just JPEG
  return {
    data: Utilities.base64Encode(fileBlob.getBytes()),
    mimeType: fileBlob.getContentType() || 'image/jpeg'
  };
}

/**
 * Formats the confirmation message shown to the user after an expense is logged.
 *
 * @param {Object} expense - The expense object returned by Gemini
 * @returns {string} Human-readable confirmation message
 */
function formatConfirmation(expense) {
  return (
    '✅ Expense logged! / ¡Gasto registrado!\n\n' +
    '📅 Date: '     + expense.date              + '\n' +
    '💰 Amount: '   + expense.amount + ' ' + expense.currency + '\n' +
    '🏷️ Category: ' + expense.category          + '\n' +
    '🏪 Merchant: ' + (expense.merchant || '—') + '\n' +
    '📝 Notes: '    + (expense.notes    || '—')
  );
}
