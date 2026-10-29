/**
 * Green Node IoT Telemetry Simulator
 * Simulates microcontrollers sending telemetry data identified by UUID.
 * Location is pre-registered in the database, not sent in readings!
 * 
 * Run with: npm run simulate
 */

const SERVER_BASE_URL = process.env.SERVER_BASE_URL || 'http://localhost:4000';
const INTERVAL_MS = parseInt(process.env.INTERVAL_MS || '3000', 10);

interface NodeSimulation {
  deviceId: string;       // Standard UUID
  name: string;
  location: string;       // Stored in Device DB collection
  temperature: number;
  humidity: number;
  soilMoisture: number;
  light: number;
}

const simulatedNodes: NodeSimulation[] = [
  {
    deviceId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    name: 'North Greenhouse Node',
    location: 'Zone 1 - Heirloom Tomatoes',
    temperature: 24.0,
    humidity: 62.0,
    soilMoisture: 48.0,
    light: 550
  },
  {
    deviceId: 'e4aa1234-5678-4a9b-bcde-0123456789ab',
    name: 'South Greenhouse Node',
    location: 'Zone 2 - Fresh Basil & Herbs',
    temperature: 22.5,
    humidity: 58.0,
    soilMoisture: 38.0,
    light: 720
  }
];

function randomWalk(current: number, min: number, max: number, maxStep: number): number {
  const step = (Math.random() * 2 - 1) * maxStep;
  const next = current + step;
  return Math.min(max, Math.max(min, next));
}

// 1. Pre-register devices in database (tracks location by UUID)
async function registerDevices() {
  console.log('📝 Registering device nodes & locations in database...');
  for (const node of simulatedNodes) {
    try {
      const res = await fetch(`${SERVER_BASE_URL}/api/devices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: node.deviceId,
          name: node.name,
          location: node.location
        })
      });
      if (res.ok) {
        console.log(`📍 Registered Device [${node.deviceId}] -> Location: "${node.location}"`);
      }
    } catch (e: any) {
      console.warn(`Warning: Could not pre-register ${node.deviceId}: ${e.message}`);
    }
  }
}

// 2. Send continuous sensor readings (UUID, Temp, Hum, Soil, Light - NO battery, NO location)
async function sendTelemetry(node: NodeSimulation) {
  node.temperature = +(randomWalk(node.temperature, 18, 32, 0.4).toFixed(1));
  node.humidity = +(randomWalk(node.humidity, 40, 85, 0.8).toFixed(1));
  node.soilMoisture = +(randomWalk(node.soilMoisture, 20, 80, 0.5).toFixed(1));
  node.light = Math.round(randomWalk(node.light, 50, 1200, 35));

  const payload = {
    deviceId: node.deviceId,
    temperature: node.temperature,
    humidity: node.humidity,
    soilMoisture: node.soilMoisture,
    light: node.light,
    timestamp: new Date().toISOString()
  };

  try {
    const res = await fetch(`${SERVER_BASE_URL}/api/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      console.log(`[${new Date().toLocaleTimeString()}] ✅ [${node.deviceId.substring(0, 8)}...] | Temp: ${payload.temperature}°C | Hum: ${payload.humidity}% | Soil: ${payload.soilMoisture}% | Light: ${payload.light} Lux`);
    } else {
      const err = await res.text();
      console.error(`[${new Date().toLocaleTimeString()}] ❌ Ingestion error for ${node.deviceId}: ${res.status} - ${err}`);
    }
  } catch (err: any) {
    console.error(`[${new Date().toLocaleTimeString()}] ⚠️ Connection error to ${SERVER_BASE_URL}: ${err.message}`);
  }
}

async function run() {
  console.log(`=======================================================`);
  console.log(`🌱 Green Node Sensor Simulator (UUID & DB Location Mode)`);
  console.log(`🎯 Target API: ${SERVER_BASE_URL}/api/readings`);
  console.log(`⏱️ Interval:   Every ${INTERVAL_MS / 1000} seconds`);
  console.log(`📡 Devices:    ${simulatedNodes.map(n => n.deviceId).join(', ')}`);
  console.log(`Press Ctrl+C to stop.`);
  console.log(`=======================================================\n`);

  await registerDevices();

  // Send initial readings
  simulatedNodes.forEach(node => sendTelemetry(node));

  // Periodic intervals
  setInterval(() => {
    simulatedNodes.forEach(node => sendTelemetry(node));
  }, INTERVAL_MS);
}

run();
