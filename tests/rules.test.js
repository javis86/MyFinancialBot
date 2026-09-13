// tests/rules.test.js
// Unit test suite for transfer categorization rules engine

const test = require('node:test');
const assert = require('node:assert/strict');
const { createGasEnvironment } = require('./helpers/gas-mock');

test('getCategoryRules creates Mappings sheet with default headers if missing', () => {
  const env = createGasEnvironment({
    SPREADSHEET_ID: 'test-spreadsheet-id',
  });

  const rules = JSON.parse(JSON.stringify(env.context.getCategoryRules()));
  assert.deepEqual(rules, []);

  // Check that insertSheet was called and headers appended
  const mappingsSheet = env.sheetsStore.get('Mappings');
  assert.ok(mappingsSheet, 'Mappings sheet should be created');
  assert.deepEqual(JSON.parse(JSON.stringify(mappingsSheet[0])), ['Keyword / Recipient', 'Target Category', 'Override Notes']);
});

test('getCategoryRules reads and caches rules from Mappings sheet', () => {
  const env = createGasEnvironment({
    SPREADSHEET_ID: 'test-spreadsheet-id',
  });

  env.setSheetData('Mappings', [
    ['Keyword / Recipient', 'Target Category', 'Override Notes'],
    ['xxxxx', 'Education', 'Payment for English class'],
    ['alquiler', 'Housing', 'Monthly rent'],
  ]);

  const rules = JSON.parse(JSON.stringify(env.context.getCategoryRules()));
  assert.equal(rules.length, 2);
  assert.deepEqual(rules[0], { keyword: 'xxxxx', category: 'Education', notes: 'Payment for English class' });
  assert.deepEqual(rules[1], { keyword: 'alquiler', category: 'Housing', notes: 'Monthly rent' });

  // Verify rules are stored in cache
  const cachedJson = env.cacheStore.get('category_rules_v2');
  assert.ok(cachedJson, 'Cache should contain category_rules_v2');
  assert.deepEqual(JSON.parse(cachedJson), rules);
});

test('applyCategoryRules overrides category and notes on keyword match', () => {
  const env = createGasEnvironment({
    SPREADSHEET_ID: 'test-spreadsheet-id',
  });

  env.setSheetData('Mappings', [
    ['Keyword / Recipient', 'Target Category', 'Override Notes'],
    ['xxxxx', 'Education', 'Payment for English class'],
  ]);

  const rawExpense = {
    date: '2026-09-13',
    amount: 100,
    currency: 'USD',
    category: 'Other',
    merchant: 'Transfer to xxxxx',
    notes: '',
  };

  const updated = env.context.applyCategoryRules(rawExpense, 'Transfer to xxxxx');
  assert.equal(updated.category, 'Education');
  assert.equal(updated.notes, 'Payment for English class');
});

test('applyCategoryRules matches partial case-insensitive keywords', () => {
  const env = createGasEnvironment({
    SPREADSHEET_ID: 'test-spreadsheet-id',
  });

  env.setSheetData('Mappings', [
    ['Keyword / Recipient', 'Target Category', 'Override Notes'],
    ['ALQUILER', 'Housing', 'Monthly rent'],
  ]);

  const rawExpense = {
    date: '2026-09-13',
    amount: 500,
    currency: 'USD',
    category: 'Other',
    merchant: 'Desconocido',
    notes: '',
  };

  const updated = env.context.applyCategoryRules(rawExpense, 'pago de alquiler depto');
  assert.equal(updated.category, 'Housing');
  assert.equal(updated.notes, 'Monthly rent');
});

test('applyCategoryRules returns original expense if no rule matches', () => {
  const env = createGasEnvironment({
    SPREADSHEET_ID: 'test-spreadsheet-id',
  });

  env.setSheetData('Mappings', [
    ['Keyword / Recipient', 'Target Category', 'Override Notes'],
    ['xxxxx', 'Education', 'Payment for English class'],
  ]);

  const rawExpense = {
    date: '2026-09-13',
    amount: 15,
    currency: 'USD',
    category: 'Food',
    merchant: 'Starbucks',
    notes: 'Coffee',
  };

  const updated = env.context.applyCategoryRules(rawExpense, 'Starbucks coffee');
  assert.equal(updated.category, 'Food');
  assert.equal(updated.notes, 'Coffee');
});

test('validateExpense accepts user-defined custom categories from rules', () => {
  const env = createGasEnvironment({
    SPREADSHEET_ID: 'test-spreadsheet-id',
  });

  env.setSheetData('Mappings', [
    ['Keyword / Recipient', 'Target Category', 'Override Notes'],
    ['xxxxx', 'Education', 'Payment for English class'],
  ]);

  // Force rules load to register Education
  env.context.getCategoryRules();

  const validated = env.context.validateExpense({
    date: '2026-09-13',
    amount: 50,
    currency: 'USD',
    category: 'Education',
  });

  assert.ok(validated);
  assert.equal(validated.category, 'Education');
});

test('applyCategoryRules matches recipient inside notes from MODO transfer receipt image', () => {
  const env = createGasEnvironment({
    SPREADSHEET_ID: 'test-spreadsheet-id',
  });

  env.setSheetData('Mappings', [
    ['Keyword / Recipient', 'Target Category', 'Override Notes'],
    ['Pablo Fabian Pastor', 'Health', 'Chikung class'],
  ]);

  const modoReceiptExpense = {
    date: '2026-09-12',
    amount: 12000,
    currency: 'ARS',
    category: 'Other',
    merchant: '',
    notes: 'Transfer from Javier Nicolas Colombera to Pablo Fabian Pastor. Motivo: VAR.',
  };

  const updated = env.context.applyCategoryRules(modoReceiptExpense, '');
  assert.equal(updated.category, 'Health');
  assert.equal(updated.notes, 'Chikung class');
  assert.equal(updated.merchant, 'Pablo Fabian Pastor');
});

test('getCategoryRules does not cache empty rules long term so new rules are loaded immediately', () => {
  const env = createGasEnvironment({
    SPREADSHEET_ID: 'test-spreadsheet-id',
  });

  // 1. Initial empty sheet with header only
  env.setSheetData('Mappings', [
    ['Keyword / Recipient', 'Target Category', 'Override Notes'],
  ]);

  const initialRules = JSON.parse(JSON.stringify(env.context.getCategoryRules()));
  assert.equal(initialRules.length, 0);

  // 2. User populates the sheet tab
  env.setSheetData('Mappings', [
    ['Keyword / Recipient', 'Target Category', 'Override Notes'],
    ['Pablo Fabian Pastor', 'Health', 'Chikung class'],
  ]);

  // 3. Next call should detect the new rule immediately without waiting 10 minutes
  const updatedRules = JSON.parse(JSON.stringify(env.context.getCategoryRules()));
  assert.equal(updatedRules.length, 1);
  assert.equal(updatedRules[0].keyword, 'Pablo Fabian Pastor');
});

