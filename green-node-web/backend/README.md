# 🌿 Green Node - IoT Sensor Backend & Database

A robust, type-safe backend and MongoDB database built for IoT environment and soil monitoring (Greenhouses, Smart Agriculture, Hydroponics, and Indoor Plants).

Monitors and processes core environmental metrics:
1. 💧 **Humidity** (Relative Humidity %)
2. 🌡️ **Temperature** (Celsius °C / Fahrenheit)
3. 🌱 **Soil Moisture** (Volumetric Water Content %)
4. ☀️ **Light Sensor** (Ambient Lux / Intensity)
5. 🔥 **ESP32 Internal Silicon Die Temperature** (°C)
6. 📶 **Wi-Fi Network Name (SSID) & RSSI** (dBm)

---

## 📌 Architecture Highlights

* **Production URL on Render**: `https://blue-circle.onrender.com`
* **UUID Device Identification**: Sensor nodes are identified by a standard UUID (e.g. `a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11`).
* **Database-Tracked Locations & Auto-Registration**: Devices are automatically registered on their first valid telemetry post with `upsert: true`, and physical locations can be managed via `PUT /api/devices/:deviceId`.
* **ESP Hardware Liveness & Health Monitoring**:
  * **Status Query (`GET /api/devices/:deviceId/health`)**: Check if an ESP is currently **ON** (online) or **OFF** (offline) based on its last activity and timeout window.
  * **Heartbeat (`POST /api/devices/:deviceId/heartbeat`)**: ESP can send lightweight keep-alive pings.
  * **Direct HTTP Probe (`POST /api/devices/:deviceId/ping`)**: The backend contacts the ESP's onboard `/health` endpoint to verify network reachability.
* **Telemetry Payload**: Supports ISO 8601 timestamps, Unix epoch timestamps, and automatic fallback to server reception timestamp if NTP is still synchronizing on boot.
* **Real-time WebSockets (`/ws`)**: Instant push updates to dashboards when any sensor reading or heartbeat arrives.
* **Interactive Live Dashboard**: Built-in web dashboard at `http://localhost:4000/`.
* **OpenAPI / Swagger UI Docs**: Interactive API documentation at `https://blue-circle.onrender.com/docs`.

---

## 🛠️ Getting Started

### 1. Installation
```bash
npm install
```

### 2. Environment Configuration
```bash
cp .env.example .env
```
Default `.env`:
```env
PORT=4000
NODE_ENV=development
MONGODB_URI=mongodb+srv://...
FRONTEND_URL=http://localhost:3000
CORS_ORIGIN=*
```

### 3. Build & Run
* **Development mode (with auto-restart)**:
  ```bash
  npm run dev
  ```
* **Production build & run**:
  ```bash
  npm run build
  npm start
  ```

---

## 🔌 Checking ESP Health & Liveness (Is ESP ON or OFF?)

### 1. Check ESP Liveness Status
* **Endpoint**: `GET /api/devices/:deviceId/health`
* **Response when ESP is ON**:
```json
{
  "success": true,
  "data": {
    "deviceId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    "name": "Sensor Node a0eebc99",
    "location": "Unassigned Zone",
    "isOnline": true,
    "status": "online",
    "secondsSinceLastSeen": 8,
    "timeoutThresholdSeconds": 60,
    "ipAddress": "192.168.1.150"
  }
}
```

---

## 📡 Sensor Ingestion & Queries

### Ingest Sensor Reading
* **Endpoint**: `POST /api/readings`
* **Body**:
```json
{
  "deviceId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "temperature": 25.2,
  "humidity": 64.5,
  "soilMoisture": 48.0,
  "light": 620.0,
  "espTemperature": 41.5,
  "wifiSsid": "Greenhouse_2.4G",
  "timestamp": "2026-11-02T01:50:43Z",
  "metadata": {
    "chip": "esp32-c3-supermini",
    "rssi": -58,
    "soilRaw": 1280
  }
}
```

### Query Latest Reading
* **Endpoint**: `GET /api/readings/latest?deviceId=a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11`

### 24-Hour Statistics
* **Endpoint**: `GET /api/readings/stats?hours=24&deviceId=a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11`

---

## 🤖 Microcontroller Firmware

Production firmware sketches are located under [`firmware/production_code/`](file:///c:/Users/USER/Desktop/projects/green-node-sever/firmware/production_code/):
* **FC-28 Soil Moisture Edition**: [`fc28_production.ino`](file:///c:/Users/USER/Desktop/projects/green-node-sever/firmware/production_code/fc28_production/fc28_production.ino)
* **MD0869 Reference Soil Moisture Edition**: [`md0869_production.ino`](file:///c:/Users/USER/Desktop/projects/green-node-sever/firmware/production_code/md0869_production/md0869_production.ino)

Both editions integrate brownout protection (`WiFi.setTxPower(WIFI_POWER_11dBm)`), Sri Lanka NTP time synchronization (UTC+5:30), power-gated sensor sampling, and HTTPS POST transmission to `https://blue-circle.onrender.com/api/readings`.
