// tests/validator.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGasEnvironment } = require('./helpers/gas-mock');

test('validateExpense accepts valid expense object', () => {
  const env = createGasEnvironment({});
  const input = {
    date: '2026-09-07',
    amount: 45,
    currency: 'USD',
    category: 'Internet',
    merchant: 'Movistar',
    notes: 'Monthly bill'
  };
  const result = env.context.validateExpense(input);
  assert.deepEqual(result, input);
});

test('validateExpense coerces string amount to numeric float', () => {
  const env = createGasEnvironment({});
  const input = {
    date: '2026-09-07',
    amount: '$1,250.50',
    currency: 'ARS',
    category: 'Food'
  };
  const result = env.context.validateExpense(input);
  assert.equal(result.amount, 1250.50);
});

test('validateExpense rejects invalid amount (<= 0, > 1e8, NaN, non-numeric)', () => {
  const env = createGasEnvironment({});
  assert.equal(env.context.validateExpense({ amount: 0, currency: 'USD' }), null);
  assert.equal(env.context.validateExpense({ amount: -50, currency: 'USD' }), null);
  assert.equal(env.context.validateExpense({ amount: 200000000, currency: 'USD' }), null);
  assert.equal(env.context.validateExpense({ amount: 'invalid', currency: 'USD' }), null);
});

test('validateExpense rejects invalid currency code (not 3 uppercase letters)', () => {
  const env = createGasEnvironment({});
  assert.equal(env.context.validateExpense({ amount: 10, currency: 'US' }), null);
  assert.equal(env.context.validateExpense({ amount: 10, currency: 'usd' }), null);
  assert.equal(env.context.validateExpense({ amount: 10, currency: 'US1' }), null);
});

test('validateExpense normalizes category case and defaults unknown to Other', () => {
  const env = createGasEnvironment({});
  const res1 = env.context.validateExpense({ amount: 10, currency: 'USD', category: 'food' });
  assert.equal(res1.category, 'Food');

  const res2 = env.context.validateExpense({ amount: 10, currency: 'USD', category: 'Crypto' });
  assert.equal(res2.category, 'Other');
});

test('validateExpense defaults invalid date pattern to today YYYY-MM-DD', () => {
  const env = createGasEnvironment({});
  const res = env.context.validateExpense({ amount: 10, currency: 'USD', date: 'invalid-date' });
  const todayStr = new Date().toISOString().split('T')[0];
  assert.equal(res.date, todayStr);
});

test('validateExpense truncates merchant > 200 chars and notes > 500 chars', () => {
  const env = createGasEnvironment({});
  const longMerchant = 'A'.repeat(250);
  const longNotes = 'B'.repeat(600);
  const res = env.context.validateExpense({
    amount: 10,
    currency: 'USD',
    merchant: longMerchant,
    notes: longNotes
  });
  assert.equal(res.merchant.length, 200);
  assert.equal(res.notes.length, 500);
});
