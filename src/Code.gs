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
    // Debug logging to see if doPost is called
    try {
      const dbSheet = SpreadsheetApp.getActiveSpreadsheet();
      let logSheet = dbSheet.getSheetByName('Logs');
      if (!logSheet) {
        logSheet = dbSheet.insertSheet('Logs');
      }
      logSheet.appendRow([new Date().toISOString(), 'doPost hit', JSON.stringify(e)]);
    } catch (logErr) {
      // Ignore logger errors
    }

    const body = JSON.parse(e.postData.contents);
    handleUpdate(body);
  } catch (err) {
    // Log but swallow all errors — never return a non-200 to Telegram
    Logger.log('doPost error: ' + err.message);
  }
  return ContentService.createTextOutput('OK');
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
    const imageBase64 = downloadFileAsBase64(fileId);

    const expense = extractExpenseFromImage(imageBase64);
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
 * System prompt for expense extraction.
 * Instructs Gemini to return ONLY valid JSON — no markdown, no fences, no extra text.
 * The schema is strict; any deviation from JSON format will cause a parse failure.
 */
const EXTRACTION_SYSTEM_PROMPT = `
You are a bilingual (English/Spanish) expense extraction assistant.
Given a user message or a receipt image, extract the expense and return ONLY a valid JSON object.
No markdown, no code fences, no explanation — raw JSON only.

Required JSON schema:
{
  "date": "YYYY-MM-DD",
  "amount": 45.00,
  "currency": "USD",
  "category": "Internet",
  "merchant": "Movistar",
  "notes": ""
}

Rules:
- date: Use today's date (UTC) if not explicitly mentioned.
- amount: Numeric value only, no currency symbols.
- currency: 3-letter ISO 4217 code.
  Inference rules: "pesos" or "ARS" → "ARS", "dólares" or "USD" → "USD",
  "$" alone without country context → "USD", "€" → "EUR".
- category: Must be exactly one of: Food, Transport, Entertainment, Health, Internet, Utilities, Shopping, Other.
- merchant: Name of store, vendor, or service provider. Empty string if unknown.
- notes: Any additional context the user provided. Empty string if none.

If you cannot extract a valid expense, return: { "error": "Could not parse" }
`.trim();

/**
 * Calls Gemini to extract an expense from a plain-text message.
 *
 * @param {string} text - Natural language expense description
 * @returns {Object|null} Parsed expense object, or null on failure
 */
function extractExpenseFromText(text) {
  return callGemini({
    contents: [{
      parts: [{ text: EXTRACTION_SYSTEM_PROMPT + '\n\nUser message: ' + text }]
    }],
    generationConfig: { temperature: 0.1 }
  });
}

/**
 * Calls Gemini Vision to extract an expense from a base64-encoded receipt image.
 *
 * @param {string} base64Image - Base64-encoded JPEG image data
 * @returns {Object|null} Parsed expense object, or null on failure
 */
function extractExpenseFromImage(base64Image) {
  return callGemini({
    contents: [{
      parts: [
        { text: EXTRACTION_SYSTEM_PROMPT + '\n\nExtract the expense from this receipt image:' },
        { inlineData: { mimeType: 'image/jpeg', data: base64Image } }
      ]
    }],
    generationConfig: { temperature: 0.1 }
  });
}

/**
 * Core Gemini API caller. Sends a generateContent request and parses the JSON response.
 * Returns null on any error (API failure, non-200 status, invalid JSON).
 *
 * @param {Object} payload - Gemini API request body
 * @returns {Object|null} Parsed expense JSON or null
 */
function callGemini(payload) {
  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    CONFIG.GEMINI_MODEL +
    ':generateContent?key=' +
    CONFIG.GEMINI_API_KEY;

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,   // Prevents GAS from throwing on 4xx/5xx
  });

  if (response.getResponseCode() !== 200) {
    Logger.log('Gemini API error (' + response.getResponseCode() + '): ' + response.getContentText());
    return null;
  }

  const rawText = JSON.parse(response.getContentText())
    ?.candidates?.[0]?.content?.parts?.[0]?.text
    ?.trim();

  if (!rawText) {
    Logger.log('Gemini returned empty content');
    return null;
  }

  try {
    const parsed = JSON.parse(rawText);
    if (parsed.error) {
      Logger.log('Gemini could not parse expense: ' + parsed.error);
      return null;
    }
    return parsed;
  } catch (_) {
    Logger.log('Failed to parse Gemini JSON output: ' + rawText);
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
    .getActiveSpreadsheet()
    .getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    throw new Error(
      'Sheet "' + CONFIG.SHEET_NAME + '" not found in spreadsheet.'
    );
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
 * Downloads a Telegram file by file_id and returns it as a base64 string.
 * Steps:
 *   1. Call getFile API to resolve file_id → file_path
 *   2. Fetch the actual file bytes from the Telegram CDN
 *   3. Base64-encode for Gemini inlineData
 *
 * @param {string} fileId - Telegram file_id from the message
 * @returns {string} Base64-encoded file content
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
  return Utilities.base64Encode(fileBlob.getBytes());
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
