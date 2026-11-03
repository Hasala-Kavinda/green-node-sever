/**
 * Green Node IoT Telemetry Simulator
 * Simulates microcontrollers sending telemetry data identified by registered UUID.
 * Demonstrates:
 * 1. Company Registration (e.g. "Ceylon Agri Corp", "Lanka Bio Tech")
 * 2. Greenhouse Registration under Company with Plant (e.g. "Greenhouse 01" growing "Heirloom Tomatoes")
 * 3. Sensor Modules registered under Greenhouse (FC-28 / MD0869)
 * 4. An unregistered rogue ESP node rejected with 403 Forbidden
 * 
 * Run with: npm run simulate
 */

const SERVER_BASE_URL = process.env.SERVER_BASE_URL || 'http://localhost:4000';
const INTERVAL_MS = parseInt(process.env.INTERVAL_MS || '4000', 10);

interface NodeSimulation {
  deviceId: string;
  name: string;
  greenhouseId: string;
  sensorType: string;
  location: string;
  temperature: number;
  humidity: number;
  soilMoisture: number;
  light: number;
  isRegisteredExpected: boolean;
}

const simulatedCompanies = [
  {
    companyId: 'comp-ceylon-agro',
    name: 'Ceylon Agri Corp',
    location: 'Colombo Agri Facility',
    description: 'Corporate commercial indoor greenhouse operations'
  },
  {
    companyId: 'comp-lanka-farms',
    name: 'Lanka Bio Farms Ltd',
    location: 'Nuwara Eliya High Farm',
    description: 'High-altitude organic hydroponic production'
  }
];

const simulatedGreenhouses = [
  {
    greenhouseId: 'greenhouse-01',
    companyId: 'comp-ceylon-agro',
    name: 'Greenhouse 01 - Hydroponics',
    plant: 'Heirloom Tomatoes',
    description: 'Automated nutrient film technique (NFT) tomato bay'
  },
  {
    greenhouseId: 'greenhouse-02',
    companyId: 'comp-ceylon-agro',
    name: 'Greenhouse 02 - Nursery',
    plant: 'Microgreens & Herbs',
    description: 'Climate-controlled nursery propagation bay'
  },
  {
    greenhouseId: 'greenhouse-03',
    companyId: 'comp-lanka-farms',
    name: 'Highland Tunnel 1',
    plant: 'Alpine Strawberries',
    description: 'Substrate bed strawberry cultivation'
  }
];

const simulatedNodes: NodeSimulation[] = [
  // Greenhouse 01 (Ceylon Agri Corp - Heirloom Tomatoes)
  {
    deviceId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    name: 'Canopy & Soil Module 1',
    greenhouseId: 'greenhouse-01',
    sensorType: 'fc28',
    location: 'Zone 1 - Main Bed',
    temperature: 24.5,
    humidity: 62.0,
    soilMoisture: 48.0,
    light: 650,
    isRegisteredExpected: true
  },
  {
    deviceId: 'b1ffcd88-8b1a-4de7-aa5c-5aa8ac271b22',
    name: 'Bed A Soil Module (FC-28)',
    greenhouseId: 'greenhouse-01',
    sensorType: 'fc28',
    location: 'Zone 1 - Bed A Tomatoes',
    temperature: 25.1,
    humidity: 64.0,
    soilMoisture: 52.0,
    light: 580,
    isRegisteredExpected: true
  },
  {
    deviceId: 'c2eedf77-7a2b-4cd6-994b-4bb7bd162c33',
    name: 'Bed B Soil Module (MD0869)',
    greenhouseId: 'greenhouse-01',
    sensorType: 'md0869',
    location: 'Zone 1 - Bed B Tomatoes',
    temperature: 24.8,
    humidity: 63.5,
    soilMoisture: 45.0,
    light: 610,
    isRegisteredExpected: true
  },

  // Greenhouse 02 (Ceylon Agri Corp - Microgreens)
  {
    deviceId: 'd3ddce66-6b3c-4bc5-883a-3aa6ce053d44',
    name: 'Microgreen Rack Module',
    greenhouseId: 'greenhouse-02',
    sensorType: 'fc28',
    location: 'Tier 1 - Microgreens',
    temperature: 21.8,
    humidity: 70.0,
    soilMoisture: 60.0,
    light: 420,
    isRegisteredExpected: true
  },

  // Greenhouse 03 (Lanka Bio Farms - Strawberries)
  {
    deviceId: 'e4ccbd55-5c4d-4ab4-7729-2bb5df944e55',
    name: 'Strawberry Bed Module',
    greenhouseId: 'greenhouse-03',
    sensorType: 'md0869',
    location: 'Tunnel 1 - Alpine Bed',
    temperature: 19.5,
    humidity: 75.0,
    soilMoisture: 65.0,
    light: 520,
    isRegisteredExpected: true
  },

  // Unregistered rogue ESP
  {
    deviceId: '99999999-9999-9999-9999-999999999999',
    name: 'Unregistered Rogue Module',
    greenhouseId: 'unassigned',
    sensorType: 'fc28',
    location: 'Unknown',
    temperature: 30.0,
    humidity: 50.0,
    soilMoisture: 10.0,
    light: 100,
    isRegisteredExpected: false
  }
];

function randomWalk(current: number, min: number, max: number, maxStep: number): number {
  const step = (Math.random() * 2 - 1) * maxStep;
  const next = current + step;
  return Math.min(max, Math.max(min, next));
}

async function setupHierarchy() {
  console.log('🏢 1. Registering Companies (Name & Location)...');
  for (const comp of simulatedCompanies) {
    try {
      const res = await fetch(`${SERVER_BASE_URL}/api/companies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(comp)
      });
      if (res.ok || res.status === 409) {
        console.log(`🏢 Company Ready: "${comp.name}" at ${comp.location} (${comp.companyId})`);
      }
    } catch (e: any) {
      console.warn(`Could not setup company ${comp.name}: ${e.message}`);
    }
  }

  console.log('\n🏡 2. Registering Greenhouses under Companies (with Plant / Crop)...');
  for (const gh of simulatedGreenhouses) {
    try {
      const res = await fetch(`${SERVER_BASE_URL}/api/greenhouses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gh)
      });
      if (res.ok || res.status === 409) {
        console.log(`🏡 Greenhouse Ready: "${gh.name}" [Crop: ${gh.plant}] under ${gh.companyId}`);
      }
    } catch (e: any) {
      console.warn(`Could not setup greenhouse ${gh.name}: ${e.message}`);
    }
  }

  console.log('\n📡 3. Pre-registering Sensor Modules under Greenhouses...');
  for (const node of simulatedNodes) {
    if (!node.isRegisteredExpected) continue;

    try {
      const res = await fetch(`${SERVER_BASE_URL}/api/devices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: node.deviceId,
          name: node.name,
          greenhouseId: node.greenhouseId,
          sensorType: node.sensorType,
          location: node.location
        })
      });
      if (res.ok) {
        console.log(`📡 Registered Module: [${node.name}] -> UUID: ${node.deviceId} (Probe: ${node.sensorType})`);
      }
    } catch (e: any) {
      console.warn(`Warning: Could not pre-register ${node.deviceId}: ${e.message}`);
    }
  }
}

async function sendTelemetry(node: NodeSimulation) {
  node.temperature = +(randomWalk(node.temperature, 18, 32, 0.4).toFixed(1));
  node.humidity = +(randomWalk(node.humidity, 40, 85, 0.8).toFixed(1));
  node.soilMoisture = +(randomWalk(node.soilMoisture, 20, 80, 0.5).toFixed(1));
  node.light = Math.round(randomWalk(node.light, 50, 1200, 35));

  const payload = {
    temperature: node.temperature,
    humidity: node.humidity,
    soilMoisture: node.soilMoisture,
    light: node.light,
    wifiSsid: 'Greenhouse_IoT_2.4G',
    timestamp: new Date().toISOString()
  };

  try {
    // Send to dedicated device endpoint: /api/devices/:deviceId/readings
    const res = await fetch(`${SERVER_BASE_URL}/api/devices/${node.deviceId}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      console.log(`[${new Date().toLocaleTimeString()}] ✅ [${node.greenhouseId}] ${node.name} (${node.deviceId.slice(0, 8)}...): Temp=${payload.temperature}°C, Hum=${payload.humidity}%, Soil=${payload.soilMoisture}%, Lux=${payload.light}`);
    } else if (res.status === 403) {
      console.log(`[${new Date().toLocaleTimeString()}] 🛡️ GATEKEEPER: Rejected unregistered module [${node.deviceId.slice(0, 8)}...] with 403 Forbidden!`);
    } else {
      const err = await res.text();
      console.error(`[${new Date().toLocaleTimeString()}] ❌ Ingestion error for ${node.deviceId}: ${res.status} - ${err}`);
    }
  } catch (err: any) {
    console.error(`Network error: ${err.message}`);
  }
}

async function start() {
  console.log('================================================================');
  console.log('🌿 GREEN NODE: COMPANY -> GREENHOUSE -> SENSOR MODULE SIMULATOR');
  console.log(`🎯 Target API: ${SERVER_BASE_URL}`);
  console.log('================================================================\n');

  await setupHierarchy();

  console.log(`\n🚀 Starting live telemetry loop (every ${INTERVAL_MS / 1000}s)... Press Ctrl+C to stop.`);

  setInterval(() => {
    for (const node of simulatedNodes) {
      sendTelemetry(node);
    }
  }, INTERVAL_MS);
}

start();
