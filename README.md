# 🌿 Green Node - IoT Sensor Backend & Database

A robust, type-safe backend and MongoDB database built for IoT environment and soil monitoring (Greenhouses, Smart Agriculture, Hydroponics, and Indoor Plants).

Monitors and processes 4 core environmental metrics:
1. 💧 **Humidity** (Relative Humidity %)
2. 🌡️ **Temperature** (Celsius °C / Fahrenheit)
3. 🌱 **Soil Moisture** (Volumetric Water Content %)
4. ☀️ **Light Sensor** (Ambient Lux / Intensity)

---

## 🚀 Key Features

* **Real-time WebSockets (`/ws`)**: Instant push updates to dashboards and clients when any sensor reading arrives.
* **REST API**:
  * `POST /api/readings` - Real-time telemetry ingestion from microcontrollers (ESP32, ESP8266, Arduino, Raspberry Pi).
  * `POST /api/readings/batch` - Batch upload for offline nodes syncing cached readings.
  * `GET /api/readings` - Historical sensor queries with device filtering, date ranges, and pagination.
  * `GET /api/readings/latest` - Fetch the most recent reading across all or specific nodes.
  * `GET /api/readings/stats` - 24-hour min, max, and average statistical calculations.
  * `GET /api/devices` - Registered sensor node registry and online/offline status tracking.
  * `GET /api/health` - System health, MongoDB connectivity, and active WebSocket client count.
* **Interactive Live Dashboard**: Built-in web dashboard at `http://localhost:4000/` featuring live metric cards, comfort indicators, and a streaming telemetry feed.
* **OpenAPI / Swagger UI Docs**: Interactive API documentation and test bench at `http://localhost:4000/docs`.
* **Zero-Setup Database Fallback**: If a local or remote MongoDB instance is not detected, it automatically starts an in-memory MongoDB instance for instant development and testing.

---

## 📁 Project Architecture

```
green-node/
├── src/
│   ├── app.ts                  # Server entrypoint (HTTP + WebSocket server)
│   ├── config/
│   │   ├── env.ts              # Strongly-typed environment variables
│   │   └── database.ts         # Mongoose connection with in-memory fallback
│   ├── controllers/
│   │   └── reading.controller.ts # Express route handlers & validation
│   ├── models/
│   │   ├── Reading.ts          # Mongoose schema for time-series sensor data
│   │   └── Device.ts           # Registry of active IoT nodes
│   ├── public/
│   │   └── index.html          # Built-in live browser dashboard
│   ├── routes/
│   │   ├── health.routes.ts    # Health & status endpoints
│   │   └── reading.routes.ts   # Sensor REST endpoints
│   ├── schemas/
│   │   └── reading.schema.ts   # Zod request validation schemas
│   ├── services/
│   │   ├── reading.service.ts  # Database operations & statistical queries
│   │   └── websocket.service.ts# WebSocket streaming & broadcast manager
│   └── swagger/
│       └── openapi.ts          # OpenAPI 3.0 specification
├── scripts/
│   └── simulate_node.ts        # IoT device telemetry simulator
├── docker-compose.yml          # Optional local MongoDB + Mongo Express container
├── .env.example
├── tsconfig.json
└── package.json
```

---

## 🛠️ Getting Started

### 1. Prerequisites
- **Node.js** v18+ (tested on Node v24)
- **MongoDB** (optional: runs automatically in-memory if MongoDB is not running locally)

### 2. Installation
```bash
npm install
```

### 3. Environment Configuration
Copy the sample environment file:
```bash
cp .env.example .env
```
Default `.env`:
```env
PORT=4000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/green_node
CORS_ORIGIN=*
```
*(If you want to use MongoDB Atlas, replace `MONGODB_URI` with your connection string: `mongodb+srv://<user>:<password>@cluster.mongodb.net/green_node`)*

### 4. Running the Database (Optional)
If you have Docker installed and want persistent local storage with a web UI:
```bash
docker compose up -d
```
* MongoDB: `mongodb://localhost:27017`
* Mongo Express UI: `http://localhost:8081`

### 5. Start the Server
* **Development mode (with auto-restart)**:
  ```bash
  npm run dev
  ```
* **Production build & run**:
  ```bash
  npm run build
  npm start
  ```

Once started, access:
* **Live Dashboard**: [http://localhost:4000](http://localhost:4000)
* **Swagger API Docs**: [http://localhost:4000/docs](http://localhost:4000/docs)
* **Health Check**: [http://localhost:4000/api/health](http://localhost:4000/api/health)

---

## 🤖 Running the IoT Node Simulator

To test the backend without hardware, launch the built-in simulator:
```bash
npm run simulate
```
This simulates two nodes (`node-greenhouse-01` and `node-greenhouse-02`) broadcasting realistic fluctuating temperature, humidity, soil moisture, and light data every 3 seconds. Open [http://localhost:4000](http://localhost:4000) to watch the live data stream.

---

## 📡 REST API Reference

### 1. Ingest a Sensor Reading
* **Endpoint**: `POST /api/readings`
* **Body**:
```json
{
  "deviceId": "node-greenhouse-01",
  "temperature": 24.5,
  "humidity": 62.0,
  "soilMoisture": 45.8,
  "light": 540,
  "battery": 95,
  "location": "Zone 1 - Heirloom Tomatoes"
}
```
* **Response (`201 Created`)**:
```json
{
  "success": true,
  "message": "Sensor reading recorded successfully",
  "data": {
    "deviceId": "node-greenhouse-01",
    "temperature": 24.5,
    "humidity": 62.0,
    "soilMoisture": 45.8,
    "light": 540,
    "battery": 95,
    "location": "Zone 1 - Heirloom Tomatoes",
    "timestamp": "2026-10-29T11:00:00.000Z",
    "_id": "6720bb1c080b08e2f89c92a1"
  }
}
```

### 2. Batch Ingest Readings
* **Endpoint**: `POST /api/readings/batch`
* **Body**:
```json
{
  "readings": [
    {
      "deviceId": "node-greenhouse-01",
      "temperature": 24.1,
      "humidity": 61.5,
      "soilMoisture": 45.0,
      "light": 510
    },
    {
      "deviceId": "node-greenhouse-01",
      "temperature": 24.4,
      "humidity": 62.0,
      "soilMoisture": 45.2,
      "light": 530
    }
  ]
}
```

### 3. Query Historical Readings
* **Endpoint**: `GET /api/readings`
* **Query Parameters**:
  * `deviceId` *(optional)*: Filter by node ID (e.g. `node-greenhouse-01`)
  * `startDate` *(optional)*: ISO-8601 start timestamp
  * `endDate` *(optional)*: ISO-8601 end timestamp
  * `limit` *(optional, default 50)*: Number of records
  * `page` *(optional, default 1)*: Page number
  * `sortBy` *(optional, default timestamp)*: Field to sort by (`timestamp`, `temperature`, etc.)
  * `sortOrder` *(optional, default desc)*: `asc` or `desc`

### 4. Get Latest Reading
* **Endpoint**: `GET /api/readings/latest`
* **Query Parameters**: `deviceId` *(optional)*

### 5. Get 24-Hour Statistics
* **Endpoint**: `GET /api/readings/stats?hours=24`
* **Response**:
```json
{
  "success": true,
  "data": {
    "timeframeHours": 24,
    "totalReadings": 320,
    "temperature": { "avg": 23.4, "min": 18.2, "max": 28.5, "unit": "°C" },
    "humidity": { "avg": 64.2, "min": 52.0, "max": 78.4, "unit": "%" },
    "soilMoisture": { "avg": 42.1, "min": 31.0, "max": 65.0, "unit": "%" },
    "light": { "avg": 510.5, "min": 20, "max": 950, "unit": "Lux" }
  }
}
```

### 6. List Known Sensor Nodes
* **Endpoint**: `GET /api/devices`

---

## ⚡ Real-Time WebSocket Guide

Connect any frontend, mobile app, or client to:
```
ws://localhost:4000/ws
```

### Event: `new_reading`
Broadcast whenever a sensor posts data:
```json
{
  "event": "new_reading",
  "data": {
    "deviceId": "node-greenhouse-01",
    "temperature": 24.5,
    "humidity": 62.0,
    "soilMoisture": 45.8,
    "light": 540,
    "timestamp": "2026-10-29T11:00:00.000Z"
  },
  "timestamp": "2026-10-29T11:00:00.100Z"
}
```

---

## 🔌 Microcontroller Code Example (ESP32 / Arduino C++)

Sample sketch for an ESP32 reading a **DHT22 / BME280** (Humidity/Temp), a **Capacitive Soil Moisture Sensor**, and an **LDR / BH1750** (Light):

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* serverUrl = "http://192.168.1.100:4000/api/readings";

const char* DEVICE_ID = "node-greenhouse-01";
const char* LOCATION = "Zone 1 - Tomatoes";

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected!");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    // Replace with actual sensor readings:
    float temperature = 24.8;     // e.g. dht.readTemperature()
    float humidity = 63.5;        // e.g. dht.readHumidity()
    float soilMoisture = 48.0;    // map(analogRead(SOIL_PIN), AIR_VAL, WATER_VAL, 0, 100)
    float light = 650.0;          // e.g. lightMeter.readLightLevel()

    StaticJsonDocument<256> doc;
    doc["deviceId"] = DEVICE_ID;
    doc["location"] = LOCATION;
    doc["temperature"] = temperature;
    doc["humidity"] = humidity;
    doc["soilMoisture"] = soilMoisture;
    doc["light"] = light;
    doc["battery"] = 96;

    String requestBody;
    serializeJson(doc, requestBody);

    int httpResponseCode = http.POST(requestBody);
    Serial.printf("POST Response code: %d\n", httpResponseCode);
    http.end();
  }

  delay(5000); // Send reading every 5 seconds
}
```
