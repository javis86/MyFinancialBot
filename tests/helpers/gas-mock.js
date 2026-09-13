// tests/helpers/gas-mock.js
// Mock harness for Google Apps Script global services

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createGasEnvironment(initialProperties = {}) {
  const propertiesStore = new Map(Object.entries(initialProperties));
  const logsStore = [];
  const appendRowCalls = [];
  const fetchCalls = [];
  const cacheStore = new Map();

  const mockPropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key) => propertiesStore.get(key) || null,
      setProperty: (key, val) => propertiesStore.set(key, String(val)),
    }),
  };

  const sheetsStore = new Map();

  const createSheetMock = (name) => {
    if (!sheetsStore.has(name)) {
      sheetsStore.set(name, []);
    }
    const rows = sheetsStore.get(name);
    return {
      appendRow: (row) => {
        rows.push(row);
        appendRowCalls.push({ sheetName: name, row });
      },
      getDataRange: () => ({
        getValues: () => sheetsStore.get(name) || [],
      }),
    };
  };

  const mockSpreadsheetApp = {
    openById: (id) => ({
      getSheetByName: (name) => {
        if (name === 'NonExistentSheet') return null;
        if (name === 'Mappings' && !sheetsStore.has('Mappings')) return null;
        return createSheetMock(name);
      },
      insertSheet: (name) => {
        return createSheetMock(name);
      },
    }),
  };

  const mockCacheService = {
    getScriptCache: () => ({
      get: (key) => cacheStore.get(key) || null,
      put: (key, val, ttl) => cacheStore.set(key, String(val)),
    }),
  };

  let customFetchHandler = null;

  const mockUrlFetchApp = {
    fetch: (url, options = {}) => {
      fetchCalls.push({ url, options });
      if (customFetchHandler) {
        return customFetchHandler(url, options);
      }
      // Default Telegram sendMessage mock response
      if (url.includes('api.telegram.org')) {
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ ok: true, result: {} }),
          getBlob: () => ({
            getContentType: () => 'image/jpeg',
            getBytes: () => Buffer.from('fake-image-bytes'),
          }),
        };
      }
      // Default Gemini API mock response
      if (url.includes('generativelanguage.googleapis.com')) {
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({
            candidates: [{
              content: {
                parts: [{
                  text: JSON.stringify({
                    date: '2026-09-07',
                    amount: 45,
                    currency: 'USD',
                    category: 'Internet',
                    merchant: 'Movistar',
                    notes: ''
                  })
                }]
              }
            }]
          }),
        };
      }
      return {
        getResponseCode: () => 200,
        getContentText: () => '{}',
      };
    },
  };

  const mockLogger = {
    log: (msg) => logsStore.push(String(msg)),
  };

  const mockHtmlService = {
    createHtmlOutput: (content) => ({ content, type: 'HtmlOutput' }),
  };

  const mockUtilities = {
    base64Encode: (bytes) => Buffer.from(bytes).toString('base64'),
  };

  const sandbox = {
    PropertiesService: mockPropertiesService,
    SpreadsheetApp: mockSpreadsheetApp,
    CacheService: mockCacheService,
    UrlFetchApp: mockUrlFetchApp,
    Logger: mockLogger,
    HtmlService: mockHtmlService,
    Utilities: mockUtilities,
    console: console,
    Date: Date,
    JSON: JSON,
    Math: Math,
    RegExp: RegExp,
    Set: Set,
    String: String,
    Number: Number,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
  };

  const context = vm.createContext(sandbox);

  const rootDir = path.resolve(__dirname, '../../');
  const configCode = fs.readFileSync(path.join(rootDir, 'src/Config.gs'), 'utf8').replace(/^const /gm, 'var ');
  const promptCode = fs.readFileSync(path.join(rootDir, 'src/Prompt.gs'), 'utf8').replace(/^const /gm, 'var ');
  const codeCode = fs.readFileSync(path.join(rootDir, 'src/Code.gs'), 'utf8').replace(/^const /gm, 'var ');

  vm.runInContext(configCode, context);
  vm.runInContext(promptCode, context);
  vm.runInContext(codeCode, context);

  return {
    context,
    propertiesStore,
    logsStore,
    appendRowCalls,
    fetchCalls,
    cacheStore,
    sheetsStore,
    setSheetData: (name, data) => sheetsStore.set(name, data),
    setFetchHandler: (fn) => { customFetchHandler = fn; },
  };
}

module.exports = { createGasEnvironment };
