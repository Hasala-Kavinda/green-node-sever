import { Router } from 'express';
import { ReadingController } from '../controllers/reading.controller.js';

const router = Router();

// Sensor readings ingestion (Strict registration gatekeeper)
router.post('/readings', ReadingController.createReading);
router.post('/readings/batch', ReadingController.createBatchReadings);

// Sensor readings queries
router.get('/readings', ReadingController.getReadings);
router.get('/readings/latest', ReadingController.getLatestReading);
router.get('/readings/stats', ReadingController.getStats);

// Greenhouse hierarchy management
router.post('/greenhouses', ReadingController.createGreenhouse);
router.get('/greenhouses', ReadingController.getGreenhouses);
router.get('/greenhouses/:greenhouseId/overview', ReadingController.getGreenhouseOverview);
router.post('/greenhouses/:greenhouseId/assign', ReadingController.assignDeviceToGreenhouse);

// Device registration & metadata (Provisioning ESPs with UUID + Greenhouse)
router.post('/devices', ReadingController.registerDevice);
router.get('/devices', ReadingController.getDevices);
router.get('/devices/:deviceId', ReadingController.getDeviceById);
router.put('/devices/:deviceId', ReadingController.updateDevice);

// ESP Health & Liveness Checking
router.post('/devices/:deviceId/heartbeat', ReadingController.recordHeartbeat); // ESP reports it is alive
router.get('/devices/:deviceId/health', ReadingController.getDeviceHealth);     // Check whether ESP is ON or OFF
router.get('/devices/:deviceId/ping', ReadingController.pingDevice);           // Active HTTP probe to ESP
router.post('/devices/:deviceId/ping', ReadingController.pingDevice);          // Active HTTP probe to ESP

// Database Reset & Initialize First Node
router.post('/reset', ReadingController.resetDatabase);

// System & Sensor Logs (Auto-saved in MongoDB)
router.get('/logs', ReadingController.getLogs);
router.delete('/logs', ReadingController.clearLogs);

export default router;
