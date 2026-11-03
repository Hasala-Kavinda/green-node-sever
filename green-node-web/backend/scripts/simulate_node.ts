/**
 * Green Node IoT Telemetry Simulator
 * Simulates microcontrollers sending telemetry data identified by registered UUID.
 * Demonstrates:
 * 1. Greenhouse 01 (Colombo Facility) with 3 ESPs (Canopy Node, Bed A FC-28 Node, Bed B MD0869 Node)
 * 2. Greenhouse 02 (Nuwara Eliya Farm) with 2 ESPs (Nursery Node, Propagation Node)
 * 3. An unregistered ESP node whose packet is rejected with 403 Forbidden
 * 
 * Run with: npm run simulate
 */

const SERVER_BASE_URL = process.env.SERVER_BASE_URL || 'http://localhost:4000';
const INTERVAL_MS = parseInt(process.env.INTERVAL_MS || '4000', 10);

interface NodeSimulation {
  deviceId: string;
  name: string;
  companyLocation: string;
  greenhouseId: string;
  greenhouseName: string;
  sensorType: string;
  location: string;
  temperature: number;
  humidity: number;
  soilMoisture: number;
  light: number;
  isRegisteredExpected: boolean;
}

const simulatedGreenhouses = [
  {
    greenhouseId: 'greenhouse-01',
    name: 'Greenhouse 01 - Hydroponics',
    companyLocation: 'Colombo Agri Facility',
    description: 'Commercial hydroponics production bay with automated nutrient dosing'
  },
  {
    greenhouseId: 'greenhouse-02',
    name: 'Greenhouse 02 - Nursery & Seedlings',
    companyLocation: 'Colombo Agri Facility',
    description: 'Climate-controlled nursery for microgreens and seedling propagation'
  }
];

const simulatedNodes: NodeSimulation[] = [
  // 3 ESPs in Greenhouse 01
  {
    deviceId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    name: 'Node 1 - Canopy & Ambient',
    companyLocation: 'Colombo Agri Facility',
    greenhouseId: 'greenhouse-01',
    greenhouseName: 'Greenhouse 01 - Hydroponics',
    sensorType: 'combo',
    location: 'Zone 1 - Main Canopy',
    temperature: 24.5,
    humidity: 62.0,
    soilMoisture: 48.0,
    light: 650,
    isRegisteredExpected: true
  },
  {
    deviceId: 'b1ffcd88-8b1a-4de7-aa5c-5aa8ac271b22',
    name: 'Node 2 - Bed A (FC-28 Probe)',
    companyLocation: 'Colombo Agri Facility',
    greenhouseId: 'greenhouse-01',
    greenhouseName: 'Greenhouse 01 - Hydroponics',
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
    name: 'Node 3 - Bed B (MD0869 Probe)',
    companyLocation: 'Colombo Agri Facility',
    greenhouseId: 'greenhouse-01',
    greenhouseName: 'Greenhouse 01 - Hydroponics',
    sensorType: 'md0869',
    location: 'Zone 1 - Bed B Cucumbers',
    temperature: 24.8,
    humidity: 63.5,
    soilMoisture: 45.0,
    light: 610,
    isRegisteredExpected: true
  },

  // 2 ESPs in Greenhouse 02
  {
    deviceId: 'd3ddce66-6b3c-4bc5-883a-3aa6ce053d44',
    name: 'Node 4 - Microgreen Rack 1',
    companyLocation: 'Colombo Agri Facility',
    greenhouseId: 'greenhouse-02',
    greenhouseName: 'Greenhouse 02 - Nursery & Seedlings',
    sensorType: 'fc28',
    location: 'Tier 1 - Microgreens',
    temperature: 21.8,
    humidity: 70.0,
    soilMoisture: 60.0,
    light: 420,
    isRegisteredExpected: true
  },
  {
    deviceId: 'e4ccbd55-5c4d-4ab4-7729-2bb5df944e55',
    name: 'Node 5 - Seedling Incubator',
    companyLocation: 'Colombo Agri Facility',
    greenhouseId: 'greenhouse-02',
    greenhouseName: 'Greenhouse 02 - Nursery & Seedlings',
    sensorType: 'md0869',
    location: 'Tier 2 - Seedlings',
    temperature: 22.4,
    humidity: 68.0,
    soilMoisture: 58.0,
    light: 450,
    isRegisteredExpected: true
  },

  // Unregistered rogue ESP (to verify strict rejection)
  {
    deviceId: '99999999-9999-9999-9999-999999999999',
    name: 'Unregistered Rogue ESP',
    companyLocation: 'Unknown',
    greenhouseId: 'unassigned',
    greenhouseName: 'None',
    sensorType: 'generic',
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

// 1. Create Greenhouses and Pre-Register ESPs in database
async function setupHierarchy() {
  console.log('🌿 Setting up Company Locations & Greenhouses...');
  for (const gh of simulatedGreenhouses) {
    try {
      const res = await fetch(`${SERVER_BASE_URL}/api/greenhouses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gh)
      });
      if (res.ok || res.status === 409) {
        console.log(`🏡 Greenhouse Ready: "${gh.name}" at ${gh.companyLocation} (${gh.greenhouseId})`);
      }
    } catch (e: any) {
      console.warn(`Could not setup greenhouse ${gh.name}: ${e.message}`);
    }
  }

  console.log('📝 Pre-registering authorized ESP nodes in database...');
  for (const node of simulatedNodes) {
    if (!node.isRegisteredExpected) continue; // Skip registering the rogue node!

    try {
      const res = await fetch(`${SERVER_BASE_URL}/api/devices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: node.deviceId,
          name: node.name,
          companyLocation: node.companyLocation,
          greenhouseId: node.greenhouseId,
          greenhouseName: node.greenhouseName,
          sensorType: node.sensorType,
          location: node.location
        })
      });
      if (res.ok) {
        console.log(`📡 Registered ESP: [${node.name}] -> UUID: ${node.deviceId} (Assigned to: ${node.greenhouseName})`);
      }
    } catch (e: any) {
      console.warn(`Warning: Could not pre-register ${node.deviceId}: ${e.message}`);
    }
  }
}

// 2. Ingest sensor readings (demonstrates separation & gatekeeper)
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
    wifiSsid: 'Greenhouse_IoT_2.4G',
    timestamp: new Date().toISOString()
  };

  try {
    const res = await fetch(`${SERVER_BASE_URL}/api/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      console.log(`[${new Date().toLocaleTimeString()}] ✅ [${node.greenhouseName.slice(0, 13)}] ${node.name} (${node.deviceId.slice(0, 8)}...): Temp=${payload.temperature}°C, Hum=${payload.humidity}%, Soil=${payload.soilMoisture}%, Lux=${payload.light}`);
    } else if (res.status === 403) {
      console.log(`[${new Date().toLocaleTimeString()}] 🛡️ GATEKEEPER SUCCESS: Rejected unregistered node [${node.deviceId.slice(0, 8)}...] with 403 Forbidden (Mix-up prevented!)`);
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
  console.log('🌿 GREEN NODE: MULTI-GREENHOUSE ESP CLUSTER SIMULATOR');
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
