import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';

interface ExtWebSocket extends WebSocket {
  isAlive: boolean;
}

let wss: WebSocketServer | null = null;

export function initWebSocketServer(server: Server): WebSocketServer {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: ExtWebSocket) => {
    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (message: string) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: new Date() }));
        }
      } catch {
        // Non-JSON or standard ping
      }
    });

    // Send connection ack
    ws.send(
      JSON.stringify({
        type: 'connected',
        message: 'Connected to Green Node IoT Real-Time Stream',
        clientCount: wss?.clients.size || 0,
        timestamp: new Date().toISOString()
      })
    );
  });

  // Keep-alive heartbeat interval (every 30 seconds)
  const interval = setInterval(() => {
    if (!wss) return;
    wss.clients.forEach((client) => {
      const extWs = client as ExtWebSocket;
      if (extWs.isAlive === false) {
        return extWs.terminate();
      }
      extWs.isAlive = false;
      extWs.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  console.log('📡 Real-time WebSocket server initialized on path /ws');
  return wss;
}

export function broadcast(event: string, data: any): void {
  if (!wss || wss.clients.size === 0) return;

  const payload = JSON.stringify({
    event,
    data,
    timestamp: new Date().toISOString()
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

export function getConnectedClientCount(): number {
  return wss ? wss.clients.size : 0;
}
