import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Device } from '../src/models/Device.js';
import { ReadingService } from '../src/services/reading.service.js';

let mongoServer: MongoMemoryServer;

before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

test('recordHeartbeat returns the updated online device', async () => {
  const deviceId = 'c6a2f0c2-7a8a-4a14-9e90-d5fd3ec16600';
  const previousLastSeen = new Date(Date.now() - 120_000);
  await Device.create({
    deviceId,
    status: 'offline',
    lastSeen: previousLastSeen
  });

  const result = await ReadingService.recordHeartbeat(deviceId, { rssi: -48 });

  assert.equal(result.status, 'online');
  assert.ok(result.lastSeen.getTime() > previousLastSeen.getTime());
  assert.equal(result.rssi, -48);
});
