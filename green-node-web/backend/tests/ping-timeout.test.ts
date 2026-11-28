import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pingDeviceQuerySchema } from '../src/schemas/reading.schema.js';

test('ping timeout defaults to 2500 ms and accepts bounded integers', () => {
  assert.equal(pingDeviceQuerySchema.parse({}).timeout, 2500);
  assert.equal(pingDeviceQuerySchema.parse({ timeout: '5000' }).timeout, 5000);
});

test('ping timeout rejects invalid values before probing a device', () => {
  for (const timeout of ['not-a-number', '0', '-1', '30001', '1.5']) {
    assert.equal(pingDeviceQuerySchema.safeParse({ timeout }).success, false);
  }
});
