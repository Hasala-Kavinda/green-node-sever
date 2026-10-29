/**
 * Green Node IoT Simulator
 * Simulates microcontrollers (ESP32, ESP8266, Raspberry Pi) sending continuous
 * telemetry data (Humidity, Temperature, Soil Moisture, Light Sensor).
 * 
 * Run with: npm run simulate
 */

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:4000/api/readings';
const INTERVAL_MS = parseInt(process.env.INTERVAL_MS || '3000', 10);

interface NodeState {
  deviceId: string;
  location: string;
  temperature: number;
  humidity: number;
  soilMoisture: number;
  light: number;
  battery: number;
}

const simulatedNodes: NodeState[] = [
  {
    deviceId: 'node-greenhouse-01',
    location: 'Zone 1 - Heirloom Tomatoes',
    temperature: 24.0,
    humidity: 62.0,
    soilMoisture: 48.0,
    light: 550,
    battery: 98
  },
  {
    deviceId: 'node-greenhouse-02',
    location: 'Zone 2 - Fresh Basil & Herbs',
    temperature: 22.5,
    humidity: 58.0,
    soilMoisture: 38.0,
    light: 720,
    battery: 91
  }
];

function randomWalk(current: number, min: number, max: number, maxStep: number): number {
  const step = (Math.random() * 2 - 1) * maxStep;
  const next = current + step;
  return Math.min(max, Math.max(min, next));
}

async function sendTelemetry(node: NodeState) {
  // Update state with organic fluctuations
  node.temperature = +(randomWalk(node.temperature, 18, 32, 0.4).toFixed(1));
  node.humidity = +(randomWalk(node.humidity, 40, 85, 0.8).toFixed(1));
  node.soilMoisture = +(randomWalk(node.soilMoisture, 20, 80, 0.5).toFixed(1));
  node.light = Math.round(randomWalk(node.light, 50, 1200, 35));
  node.battery = Math.max(10, node.battery - 0.01);

  const payload = {
    deviceId: node.deviceId,
    location: node.location,
    temperature: node.temperature,
    humidity: node.humidity,
    soilMoisture: node.soilMoisture,
    light: node.light,
    battery: Math.round(node.battery),
    timestamp: new Date().toISOString()
  };

  try {
    const res = await fetch(SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      console.log(`[${new Date().toLocaleTimeString()}] ✅ ${node.deviceId} | Temp: ${payload.temperature}°C | Hum: ${payload.humidity}% | Soil: ${payload.soilMoisture}% | Light: ${payload.light} Lux`);
    } else {
      const err = await res.text();
      console.error(`[${new Date().toLocaleTimeString()}] ❌ Failed to send from ${node.deviceId}: ${res.status} - ${err}`);
    }
  } catch (err: any) {
    console.error(`[${new Date().toLocaleTimeString()}] ⚠️ Connection error to ${SERVER_URL}: ${err.message}`);
  }
}

console.log(`=======================================================`);
console.log(`🌱 Green Node Sensor Simulator Started`);
console.log(`🎯 Target API: ${SERVER_URL}`);
console.log(`⏱️ Interval:   Every ${INTERVAL_MS / 1000} seconds`);
console.log(`📡 Simulating ${simulatedNodes.length} devices: ${simulatedNodes.map(n => n.deviceId).join(', ')}`);
console.log(`Press Ctrl+C to stop.`);
console.log(`=======================================================\n`);

// Send initial batch immediately
simulatedNodes.forEach(node => sendTelemetry(node));

// Periodic intervals
setInterval(() => {
  simulatedNodes.forEach(node => sendTelemetry(node));
}, INTERVAL_MS);
