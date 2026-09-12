// tests/prompt.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGasEnvironment } = require('./helpers/gas-mock');

test('getExtractionSystemPrompt injects specified date string', () => {
  const env = createGasEnvironment({});
  const prompt = env.context.getExtractionSystemPrompt('2026-09-07');
  assert.match(prompt, /Today's date \(UTC\): 2026-09-07/);
});

test('getExtractionSystemPrompt defaults to today date string when omitted', () => {
  const env = createGasEnvironment({});
  const prompt = env.context.getExtractionSystemPrompt();
  const todayStr = new Date().toISOString().split('T')[0];
  assert.match(prompt, new RegExp(`Today's date \\(UTC\\): ${todayStr}`));
});

test('EXTRACTION_SYSTEM_PROMPT is defined as non-empty static prompt', () => {
  const env = createGasEnvironment({});
  assert.equal(typeof env.context.EXTRACTION_SYSTEM_PROMPT, 'string');
  assert.ok(env.context.EXTRACTION_SYSTEM_PROMPT.length > 100);
  assert.match(env.context.EXTRACTION_SYSTEM_PROMPT, /bilingual \(English\/Spanish\) expense extraction assistant/);
});
