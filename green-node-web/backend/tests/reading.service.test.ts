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

test('saveBatchReadings updates the latest state for every device in a mixed batch', async () => {
  const firstDeviceId = 'c6a2f0c2-7a8a-4a14-9e90-d5fd3ec16601';
  const secondDeviceId = 'c6a2f0c2-7a8a-4a14-9e90-d5fd3ec16602';
  await Device.create([{ deviceId: firstDeviceId }, { deviceId: secondDeviceId }]);

  await ReadingService.saveBatchReadings([
    {
      deviceId: firstDeviceId,
      temperature: 22,
      humidity: 50,
      soilMoisture: 40,
      light: 300,
      timestamp: new Date('2026-01-01T10:00:00.000Z')
    },
    {
      deviceId: secondDeviceId,
      temperature: 23,
      humidity: 51,
      soilMoisture: 41,
      light: 301,
      timestamp: new Date('2026-01-01T10:01:00.000Z')
    }
  ]);

  const [first, second] = await Promise.all([
    Device.findOne({ deviceId: firstDeviceId }).lean(),
    Device.findOne({ deviceId: secondDeviceId }).lean()
  ]);

  assert.equal(first?.latestReading?.temperature, 22);
  assert.equal(second?.latestReading?.temperature, 23);
  assert.equal(first?.status, 'online');
  assert.equal(second?.status, 'online');
});
