import { Router, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { getConnectedClientCount } from '../services/websocket.service.js';

const router = Router();

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

export default router;
