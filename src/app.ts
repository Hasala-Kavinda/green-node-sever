import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import swaggerUi from 'swagger-ui-express';

import { config } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { initWebSocketServer } from './services/websocket.service.js';
import readingRoutes from './routes/reading.routes.js';
import healthRoutes from './routes/health.routes.js';
import { swaggerDocument } from './swagger/openapi.js';

import fs from 'fs';
import os from 'os';

function getLocalIpAddresses(): string[] {
  const nets = os.networkInterfaces();
  const results: string[] = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        results.push(net.address);
      }
    }
  }
  return results;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Locate public directory whether running from /src (tsx/ts-node) or /dist (compiled JS)
const publicDir = fs.existsSync(path.join(__dirname, 'public'))
  ? path.join(__dirname, 'public')
  : path.join(__dirname, '..', 'src', 'public');

const app = express();
const server = http.createServer(app);

// Initialize WebSockets
initWebSocketServer(server);

// Middleware
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve built-in static dashboard
app.use(express.static(publicDir));

// Swagger Documentation UI
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
  customSiteTitle: 'Green Node API Docs'
}));

// API Routes
app.use('/api', readingRoutes);
app.use('/api', healthRoutes);

// Fallback to dashboard for root if needed
app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// 404 Handler for undefined API routes
app.use('/api', (_req, res) => {
  res.status(404).json({ success: false, error: 'API route not found' });
});

// Global Error Handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled Application Error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

// Start Server
async function startServer() {
  try {
    await connectDatabase();

    const lanIps = getLocalIpAddresses();
    server.listen(config.port, '0.0.0.0', () => {
      console.log(`\n======================================================`);
      console.log(`🌿 Green Node IoT Backend is running!`);
      console.log(`🚀 Local URL:       http://localhost:${config.port}`);
      if (lanIps.length > 0) {
        lanIps.forEach(ip => {
          console.log(`📶 ESP Server URL:  http://${ip}:${config.port}/api/readings`);
        });
      }
      console.log(`📊 Live Dashboard:  http://localhost:${config.port}`);
      console.log(`📖 API Docs:        http://localhost:${config.port}/docs`);
      console.log(`📡 WebSocket:       ws://localhost:${config.port}/ws`);
      console.log(`🏥 Health Check:    http://localhost:${config.port}/api/health`);
      console.log(`======================================================\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful Shutdown
const handleShutdown = async (signal: string) => {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    await disconnectDatabase();
    console.log('Server and database connections closed. Bye!');
    process.exit(0);
  });
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

startServer();

export { app, server };
