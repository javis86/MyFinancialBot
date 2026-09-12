// tests/gemini.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGasEnvironment } = require('./helpers/gas-mock');

test('callGemini returns success:true and validated data on HTTP 200 JSON response', () => {
  const env = createGasEnvironment({
    GEMINI_API_KEY: 'test_key'
  });

  env.setFetchHandler((url) => ({
    getResponseCode: () => 200,
    getContentText: () => JSON.stringify({
      candidates: [{
        content: {
          parts: [{
            text: '```json\n{\n  "date": "2026-09-07",\n  "amount": 45,\n  "currency": "USD",\n  "category": "Internet",\n  "merchant": "Movistar",\n  "notes": ""\n}\n```'
          }]
        }
      }]
    })
  }));

  const res = env.context.callGemini({ contents: [] });
  assert.equal(res.success, true);
  assert.equal(res.data.amount, 45);
  assert.equal(res.data.currency, 'USD');
  assert.equal(res.data.category, 'Internet');
});

test('callGemini returns API_ERROR on HTTP 503 service outage', () => {
  const env = createGasEnvironment({
    GEMINI_API_KEY: 'test_key'
  });

  env.setFetchHandler(() => ({
    getResponseCode: () => 503,
    getContentText: () => 'Service Unavailable: high demand'
  }));

  const res = env.context.callGemini({ contents: [] });
  assert.equal(res.success, false);
  assert.equal(res.errorType, 'API_ERROR');
  assert.equal(res.statusCode, 503);
  assert.match(res.message, /Service Unavailable/);
});

test('callGemini returns API_ERROR on network fetch exception', () => {
  const env = createGasEnvironment({
    GEMINI_API_KEY: 'test_key'
  });

  env.setFetchHandler(() => {
    throw new Error('Address unreachable / DNS timeout');
  });

  const res = env.context.callGemini({ contents: [] });
  assert.equal(res.success, false);
  assert.equal(res.errorType, 'API_ERROR');
  assert.equal(res.statusCode, 0);
  assert.match(res.message, /Network error or request timeout/);
});

test('callGemini returns PARSE_ERROR when Gemini returns parse error or invalid schema', () => {
  const env = createGasEnvironment({
    GEMINI_API_KEY: 'test_key'
  });

  env.setFetchHandler(() => ({
    getResponseCode: () => 200,
    getContentText: () => JSON.stringify({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({ error: 'Could not parse' })
          }]
        }
      }]
    })
  }));

  const res = env.context.callGemini({ contents: [] });
  assert.equal(res.success, false);
  assert.equal(res.errorType, 'PARSE_ERROR');
  assert.equal(res.message, 'Could not parse');
});
