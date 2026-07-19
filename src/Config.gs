// Config.gs — Centralized configuration for MyFinancialBot
// All secret values are read from Script Properties at runtime.
// NEVER hardcode tokens or IDs here.
//
// To set Script Properties in the Apps Script editor:
//   ⚙️ Project Settings → Script Properties → Add property

/**
 * Central config object. Access secrets via CONFIG.TELEGRAM_BOT_TOKEN, etc.
 * Throws a clear error immediately if a required property is missing,
 * rather than failing silently later.
 */
const CONFIG = {
  /**
   * Retrieve a named Script Property.
   * Throws an Error if the property is not set, so misconfiguration is caught early.
   *
   * @param {string} key - The Script Property name
   * @returns {string} The property value
   */
  get(key) {
    const value = PropertiesService.getScriptProperties().getProperty(key);
    if (!value) {
      throw new Error(
        `Missing required Script Property: "${key}". ` +
        `Go to ⚙️ Project Settings → Script Properties and add it.`
      );
    }
    return value;
  },

  /** Telegram Bot HTTP API token (from BotFather) */
  get TELEGRAM_BOT_TOKEN() { return this.get('TELEGRAM_BOT_TOKEN'); },

  /** Google Gemini API key (from Google AI Studio) */
  get GEMINI_API_KEY()      { return this.get('GEMINI_API_KEY'); },

  /** Google Spreadsheet ID (from the sheet URL) */
  get SPREADSHEET_ID()      { return this.get('SPREADSHEET_ID'); },

  /** Name of the sheet tab used as the transaction database */
  SHEET_NAME: 'Transactions',

  /**
   * Gemini model to use.
   * gemini-1.5-flash: fast, supports both text and vision (image), generous free tier.
   */
  GEMINI_MODEL: 'gemini-1.5-flash',

  /**
   * Expected column order in the Transactions sheet.
   * Must match the order used in appendToSheet() in Code.gs.
   */
  COLUMNS: ['Timestamp', 'Date', 'Amount', 'Currency', 'Category', 'Merchant', 'Notes'],
};
