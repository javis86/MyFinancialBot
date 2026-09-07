// tests/config.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGasEnvironment } = require('./helpers/gas-mock');

test('CONFIG.get returns property when set in ScriptProperties', () => {
  const env = createGasEnvironment({ TELEGRAM_BOT_TOKEN: 'token123' });
  assert.equal(env.context.CONFIG.TELEGRAM_BOT_TOKEN, 'token123');
});

test('CONFIG.get throws descriptive error when property is missing', () => {
  const env = createGasEnvironment({});
  assert.throws(
    () => env.context.CONFIG.TELEGRAM_BOT_TOKEN,
    /Missing required Script Property: "TELEGRAM_BOT_TOKEN"/
  );
});

test('CONFIG contains correct static configuration defaults', () => {
  const env = createGasEnvironment({});
  assert.equal(env.context.CONFIG.SHEET_NAME, 'Transactions');
  assert.equal(env.context.CONFIG.GEMINI_MODEL, 'gemini-2.5-flash');
  assert.deepEqual(Array.from(env.context.CONFIG.COLUMNS), [
    'Timestamp', 'Date', 'Amount', 'Currency', 'Category', 'Merchant', 'Notes'
  ]);
});

test('CONFIG.DEBUG_LOGGING parses true/false string correctly', () => {
  const env1 = createGasEnvironment({ DEBUG_LOGGING: 'true' });
  assert.equal(env1.context.CONFIG.DEBUG_LOGGING, true);

  const env2 = createGasEnvironment({ DEBUG_LOGGING: 'false' });
  assert.equal(env2.context.CONFIG.DEBUG_LOGGING, false);
});
