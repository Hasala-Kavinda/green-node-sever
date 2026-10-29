import { Router } from 'express';
import { ReadingController } from '../controllers/reading.controller.js';

const router = Router();

// Sensor readings ingestion
router.post('/readings', ReadingController.createReading);
router.post('/readings/batch', ReadingController.createBatchReadings);

// Sensor readings queries
router.get('/readings', ReadingController.getReadings);
router.get('/readings/latest', ReadingController.getLatestReading);
router.get('/readings/stats', ReadingController.getStats);

// Device registration & management (Location is tracked here!)
router.post('/devices', ReadingController.registerDevice);
router.get('/devices', ReadingController.getDevices);
router.get('/devices/:deviceId', ReadingController.getDeviceById);
router.put('/devices/:deviceId', ReadingController.updateDevice);

export default router;
