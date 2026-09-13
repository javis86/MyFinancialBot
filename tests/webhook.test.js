// tests/webhook.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGasEnvironment } = require('./helpers/gas-mock');

test('doPost Gate 1: rejects payload when secret query parameter is missing or invalid', () => {
  const env = createGasEnvironment({
    WEBHOOK_SECRET: 'secret_123'
  });

  const output = env.context.doPost({ parameter: { secret: 'wrong_secret' }, postData: { contents: '{}' } });
  assert.equal(output.content, 'OK');
  assert.equal(env.appendRowCalls.length, 0);
  assert.ok(env.logsStore.some(log => log.includes('invalid or missing webhook secret')));
});

test('doPost Gate 1: accepts payload when secret query parameter matches WEBHOOK_SECRET', () => {
  const env = createGasEnvironment({
    WEBHOOK_SECRET: 'secret_123',
    ALLOWED_CHAT_ID: '1001',
    SPREADSHEET_ID: 'sheet_abc',
    TELEGRAM_BOT_TOKEN: 'bot_token',
    GEMINI_API_KEY: 'gemini_key',
    DEBUG_LOGGING: 'false'
  });

  const payload = {
    update_id: 1,
    message: {
      message_id: 10,
      chat: { id: 1001 },
      text: 'Spent $45 on internet at Movistar'
    }
  };

  const output = env.context.doPost({
    parameter: { secret: 'secret_123' },
    postData: { contents: JSON.stringify(payload) }
  });

  assert.equal(output.content, 'OK');
  // Logs sheet logging
  assert.equal(env.appendRowCalls.some(call => call.sheetName === 'Logs'), true);
  // Transactions sheet logging
  assert.equal(env.appendRowCalls.some(call => call.sheetName === 'Transactions'), true);
});

test('handleUpdate Gate 2: drops update silently when chat_id does not match ALLOWED_CHAT_ID', () => {
  const env = createGasEnvironment({
    ALLOWED_CHAT_ID: '1001',
    TELEGRAM_BOT_TOKEN: 'bot_token'
  });

  const update = {
    message: {
      chat: { id: 9999 },
      text: 'Spent $45 on internet'
    }
  };

  env.context.handleUpdate(update);
  assert.equal(env.appendRowCalls.length, 0);
  assert.ok(env.logsStore.some(log => log.includes('unauthorized chat_id 9999')));
});

test('handleUpdate Gate 3: enforces rate limit after 20 requests per hour', () => {
  const env = createGasEnvironment({
    ALLOWED_CHAT_ID: '1001',
    TELEGRAM_BOT_TOKEN: 'bot_token'
  });

  env.cacheStore.set('rate_1001', '20');

  const update = {
    message: {
      chat: { id: 1001 },
      text: 'Spent $45'
    }
  };

  env.context.handleUpdate(update);
  assert.equal(env.appendRowCalls.length, 0);
  const sentMsg = env.fetchCalls.find(call => call.url.includes('sendMessage'));
  assert.ok(sentMsg);
  assert.match(sentMsg.options.payload, /Demasiadas solicitudes/);
});

test('handleTextMessage sends AI Service Error message when Gemini returns API_ERROR', () => {
  const env = createGasEnvironment({
    ALLOWED_CHAT_ID: '1001',
    TELEGRAM_BOT_TOKEN: 'bot_token',
    GEMINI_API_KEY: 'gemini_key'
  });

  env.setFetchHandler((url) => {
    if (url.includes('generativelanguage.googleapis.com')) {
      return {
        getResponseCode: () => 503,
        getContentText: () => 'Service Unavailable'
      };
    }
    return {
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({ ok: true })
    };
  });

  env.context.handleTextMessage(1001, 'Spent $45 on internet');

  const sentMsgCall = env.fetchCalls.find(call => call.url.includes('sendMessage'));
  assert.ok(sentMsgCall);
  assert.match(sentMsgCall.options.payload, /AI Service Error/);
  assert.match(sentMsgCall.options.payload, /HTTP 503/);
});

test('sendMessage retries plain text when Telegram API rejects Markdown with HTTP 400', () => {
  const env = createGasEnvironment({
    TELEGRAM_BOT_TOKEN: 'bot_token'
  });

  let sendCount = 0;
  env.setFetchHandler((url, options) => {
    sendCount++;
    if (sendCount === 1) {
      // First attempt with Markdown fails
      return {
        getResponseCode: () => 400,
        getContentText: () => 'Bad Request: can\'t parse entities'
      };
    }
    // Second attempt without parse_mode succeeds
    return {
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({ ok: true })
    };
  });

  env.context.sendMessage(1001, 'Hello *unclosed markdown');
  assert.equal(sendCount, 2);
  const retryPayload = JSON.parse(env.fetchCalls[1].options.payload);
  assert.equal(retryPayload.parse_mode, undefined);
  assert.equal(retryPayload.text, 'Hello *unclosed markdown');
});

test('sendMessage does NOT retry plain text when Telegram API fails with non-400 status code', () => {
  const env = createGasEnvironment({
    TELEGRAM_BOT_TOKEN: 'bot_token'
  });

  let sendCount = 0;
  env.setFetchHandler(() => {
    sendCount++;
    return {
      getResponseCode: () => 500,
      getContentText: () => 'Internal Server Error'
    };
  });

  env.context.sendMessage(1001, 'Hello');
  assert.equal(sendCount, 1);
});

test('sendMessage does NOT retry plain text when Telegram API returns HTTP 400 for a non-Markdown error', () => {
  const env = createGasEnvironment({
    TELEGRAM_BOT_TOKEN: 'bot_token'
  });

  let sendCount = 0;
  env.setFetchHandler(() => {
    sendCount++;
    return {
      getResponseCode: () => 400,
      getContentText: () => 'Bad Request: chat not found'
    };
  });

  env.context.sendMessage(1001, 'Hello');
  assert.equal(sendCount, 1);
});

test('handleUpdate Gate 3.5: drops duplicate update_id payloads silently', () => {
  const env = createGasEnvironment({
    ALLOWED_CHAT_ID: '1001',
    TELEGRAM_BOT_TOKEN: 'bot_token',
    GEMINI_API_KEY: 'gemini_key',
    SPREADSHEET_ID: 'sheet_abc'
  });

  const update = {
    update_id: 98765,
    message: {
      message_id: 123,
      chat: { id: 1001 },
      text: 'Spent $45 on internet'
    }
  };

  // First invocation — processes normally
  env.context.handleUpdate(update);
  assert.equal(env.appendRowCalls.some(call => call.sheetName === 'Transactions'), true);
  const initialAppendCount = env.appendRowCalls.length;

  // Second invocation with same update_id — dropped by Gate 3.5
  env.context.handleUpdate(update);
  assert.equal(env.appendRowCalls.length, initialAppendCount);
  assert.ok(env.logsStore.some(log => log.includes('duplicate update_id 98765')));
});

test('handleUpdate Gate 3.5: drops duplicate message_id payloads silently', () => {
  const env = createGasEnvironment({
    ALLOWED_CHAT_ID: '1001',
    TELEGRAM_BOT_TOKEN: 'bot_token',
    GEMINI_API_KEY: 'gemini_key',
    SPREADSHEET_ID: 'sheet_abc'
  });

  const update1 = {
    update_id: 111,
    message: {
      message_id: 555,
      chat: { id: 1001 },
      text: 'Spent $45 on internet'
    }
  };

  // Process update1
  env.context.handleUpdate(update1);
  const initialAppendCount = env.appendRowCalls.length;

  // Different update_id but SAME message_id
  const update2 = {
    update_id: 222,
    message: {
      message_id: 555,
      chat: { id: 1001 },
      text: 'Spent $45 on internet'
    }
  };

  env.context.handleUpdate(update2);
  assert.equal(env.appendRowCalls.length, initialAppendCount);
  assert.ok(env.logsStore.some(log => log.includes('duplicate message_id 555')));
});

