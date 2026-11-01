import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import os from 'os';

import { config } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { initWebSocketServer } from './services/websocket.service.js';
import readingRoutes from './routes/reading.routes.js';
import healthRoutes from './routes/health.routes.js';
import { swaggerDocument } from './swagger/openapi.js';

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

// Locate public directory if legacy static dashboard is embedded
const publicDir = fs.existsSync(path.join(__dirname, 'public'))
  ? path.join(__dirname, 'public')
  : path.join(__dirname, '..', 'src', 'public');

const app = express();
const server = http.createServer(app);

// Initialize WebSockets
initWebSocketServer(server);

// --- Dynamic CORS Configuration for Next.js Frontend Communication ---
const allowedOrigins = [
  config.frontendUrl,
  ...(config.corsOrigin === '*' ? ['*'] : config.corsOrigin.split(',').map((s: string) => s.trim()))
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // 1. Allow non-browser requests (ESP32 microcontrollers, curl, postman)
    if (!origin) return callback(null, true);
    // 2. Allow if wildcard * is configured
    if (allowedOrigins.includes('*')) return callback(null, true);
    // 3. Allow explicit configured frontend URL or CORS origin list
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // 4. In development, allow any localhost port
    if (config.nodeEnv !== 'production' && origin.startsWith('http://localhost:')) {
      return callback(null, true);
    }
    // Permissive fallback
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve built-in static dashboard if present
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

// Swagger Documentation UI
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
  customSiteTitle: 'Green Node API Docs'
}));

// API Routes
app.use('/api', readingRoutes);
app.use('/api', healthRoutes);

// Root route: Serves embedded dashboard or outputs JSON status linking to Next.js frontend
app.get('/', (_req, res) => {
  const indexPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.json({
    status: 'online',
    service: 'Green Node IoT Backend',
    version: '1.0.0',
    documentation: '/docs',
    health: '/api/health',
    telemetryEndpoint: '/api/readings',
    frontendUrl: config.frontendUrl,
    timestamp: new Date().toISOString()
  });
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
      console.log(`🚀 Server Port:     ${config.port} (${config.nodeEnv})`);
      console.log(`🌐 Frontend App:    ${config.frontendUrl}`);
      console.log(`📡 WebSocket Path:  ws://localhost:${config.port}/ws`);
      console.log(`📖 API Docs:        http://localhost:${config.port}/docs`);
      console.log(`🏥 Health Check:    http://localhost:${config.port}/api/health`);
      if (lanIps.length > 0) {
        lanIps.forEach(ip => {
          console.log(`📶 ESP Ingestion:   http://${ip}:${config.port}/api/readings`);
        });
      }
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
