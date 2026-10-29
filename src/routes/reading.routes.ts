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

// Device registration & metadata
router.post('/devices', ReadingController.registerDevice);
router.get('/devices', ReadingController.getDevices);
router.get('/devices/:deviceId', ReadingController.getDeviceById);
router.put('/devices/:deviceId', ReadingController.updateDevice);

// ESP Health & Liveness Checking
router.post('/devices/:deviceId/heartbeat', ReadingController.recordHeartbeat); // ESP reports it is alive
router.get('/devices/:deviceId/health', ReadingController.getDeviceHealth);     // Check whether ESP is ON or OFF
router.get('/devices/:deviceId/ping', ReadingController.pingDevice);           // Active HTTP probe to ESP
router.post('/devices/:deviceId/ping', ReadingController.pingDevice);          // Active HTTP probe to ESP

export default router;
