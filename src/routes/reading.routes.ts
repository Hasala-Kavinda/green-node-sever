import { Router } from 'express';
import { ReadingController } from '../controllers/reading.controller.js';

const router = Router();

// Ingestion endpoints
router.post('/readings', ReadingController.createReading);
router.post('/readings/batch', ReadingController.createBatchReadings);

// Query endpoints
router.get('/readings', ReadingController.getReadings);
router.get('/readings/latest', ReadingController.getLatestReading);
router.get('/readings/stats', ReadingController.getStats);

// Device nodes registry
router.get('/devices', ReadingController.getDevices);

export default router;
