import { Router, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { getConnectedClientCount } from '../services/websocket.service.js';

const router = Router();

// Detailed health check (includes DB status & client count)
router.get('/health', (_req: Request, res: Response) => {
  const dbStatusMap: Record<number, string> = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };

  const dbState = mongoose.connection.readyState;
  const isHealthy = dbState === 1;

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'degraded',
    service: 'green-node-iot-backend',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    database: {
      status: dbStatusMap[dbState] || 'unknown',
      name: mongoose.connection.name || 'green_node'
    },
    websocket: {
      connectedClients: getConnectedClientCount()
    }
  });
});

// Dedicated, ultra-lightweight keep-alive endpoint for cron pingers & render anti-sleep
router.get('/keep-alive', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'awake',
    message: 'Render keep-alive ping acknowledged',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

export default router;
