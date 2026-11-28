import assert from 'node:assert/strict';
import { test } from 'node:test';

test('connectDatabase starts and stops the configured in-memory database', async () => {
  const previousSetting = process.env.USE_IN_MEMORY_DB;
  process.env.USE_IN_MEMORY_DB = 'true';

  try {
    const { connectDatabase, disconnectDatabase } = await import('../src/config/database.js');
    const uri = await connectDatabase();
    assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:/);
    await disconnectDatabase();
  } finally {
    if (previousSetting === undefined) {
      delete process.env.USE_IN_MEMORY_DB;
    } else {
      process.env.USE_IN_MEMORY_DB = previousSetting;
    }
  }
});
