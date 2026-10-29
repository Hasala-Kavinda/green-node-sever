# 🌿 Green Node - IoT Sensor Backend & Database

A robust, type-safe backend and MongoDB database built for IoT environment and soil monitoring (Greenhouses, Smart Agriculture, Hydroponics, and Indoor Plants).

Monitors and processes 4 core environmental metrics:
1. 💧 **Humidity** (Relative Humidity %)
2. 🌡️ **Temperature** (Celsius °C / Fahrenheit)
3. 🌱 **Soil Moisture** (Volumetric Water Content %)
4. ☀️ **Light Sensor** (Ambient Lux / Intensity)

---

## 📌 Architecture Highlights

* **UUID Device Identification**: Sensor nodes are identified by a standard UUID (e.g. `123e4567-e89b-12d3-a456-426614174000`).
* **Database-Tracked Locations**: Sensor nodes do **not** transmit location in every reading. Instead, each node's location and friendly name are registered and maintained in the `Device` collection in the database.
* **Streamlined Telemetry Payload**: Microcontrollers send only: `deviceId` (UUID), `temperature`, `humidity`, `soilMoisture`, `light`, and optional `timestamp`.
* **Real-time WebSockets (`/ws`)**: Instant push updates to dashboards when any sensor reading arrives.
* **REST API**:
  * `POST /api/devices` - Register a node UUID and assign its physical location.
  * `PUT /api/devices/:deviceId` - Update device location, name, or status.
  * `GET /api/devices` - List all registered devices and their database-tracked locations.
  * `POST /api/readings` - Real-time telemetry ingestion from microcontrollers.
  * `POST /api/readings/batch` - Batch upload for offline nodes syncing cached readings.
  * `GET /api/readings` - Historical sensor queries with device UUID filtering, date ranges, and pagination.
  * `GET /api/readings/latest` - Fetch the most recent reading (includes database location).
  * `GET /api/readings/stats` - 24-hour min, max, and average statistical calculations.
  * `GET /api/health` - System health, MongoDB connectivity, and active WebSocket client count.
* **Interactive Live Dashboard**: Built-in web dashboard at `http://localhost:4000/`.
* **OpenAPI / Swagger UI Docs**: Interactive API documentation at `http://localhost:4000/docs`.

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
MONGODB_URI=mongodb://localhost:27017/green_node
CORS_ORIGIN=*
```
*(If a local or remote MongoDB is not detected, the backend will automatically spin up an in-memory MongoDB instance for instant zero-setup development).*

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

## 📍 1. Device Registration (Track Location by UUID)

Register the device UUID in the database with its physical location:
* **Endpoint**: `POST /api/devices`
* **Body**:
```json
{
  "deviceId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "name": "North Greenhouse Sensor",
  "location": "Greenhouse Bay 1 - Tomatoes"
}
```
* **Response (`201 Created`)**:
```json
{
  "success": true,
  "message": "Device registered successfully",
  "data": {
    "deviceId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    "name": "North Greenhouse Sensor",
    "location": "Greenhouse Bay 1 - Tomatoes",
    "status": "online"
  }
}
```

---

## 📡 2. Ingest Sensor Readings

The sensor node posts only its UUID and the 4 sensor readings:
* **Endpoint**: `POST /api/readings`
* **Body**:
```json
{
  "deviceId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "temperature": 25.2,
  "humidity": 64.5,
  "soilMoisture": 48.0,
  "light": 620
}
```
* **Response (`201 Created`)**:
```json
{
  "success": true,
  "message": "Sensor reading recorded successfully",
  "data": {
    "_id": "6ae2dc4ef72478f80c7e0ed1",
    "deviceId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    "temperature": 25.2,
    "humidity": 64.5,
    "soilMoisture": 48.0,
    "light": 620,
    "timestamp": "2026-10-29T05:40:30.772Z"
  }
}
```

---

## 🔍 3. Query Latest Reading

* **Endpoint**: `GET /api/readings/latest?deviceId=a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11`
* **Response**:
```json
{
  "success": true,
  "data": {
    "_id": "6ae2dc4ef72478f80c7e0ed1",
    "deviceId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    "temperature": 25.2,
    "humidity": 64.5,
    "soilMoisture": 48.0,
    "light": 620,
    "timestamp": "2026-10-29T05:40:30.772Z",
    "deviceLocation": "Greenhouse Bay 1 - Tomatoes",
    "deviceName": "North Greenhouse Sensor"
  }
}
```

---

## 📊 4. 24-Hour Statistical Summary

* **Endpoint**: `GET /api/readings/stats?hours=24`
* **Response**:
```json
{
  "success": true,
  "data": {
    "timeframeHours": 24,
    "totalReadings": 1280,
    "temperature": { "avg": 24.1, "min": 18.5, "max": 29.2, "unit": "°C" },
    "humidity": { "avg": 63.4, "min": 52.0, "max": 76.1, "unit": "%" },
    "soilMoisture": { "avg": 45.8, "min": 32.0, "max": 60.5, "unit": "%" },
    "light": { "avg": 580.0, "min": 0, "max": 1100, "unit": "Lux" }
  }
}
```

---

## 🤖 Running the IoT Simulator

To test the backend and live WebSocket stream:
```bash
npm run simulate
```
This registers two device UUIDs in the database with their respective locations and streams fluctuating sensor readings every 3 seconds.

---

## 🔌 Microcontroller Code Example (ESP32 / Arduino C++)

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* serverUrl = "http://192.168.1.100:4000/api/readings";

// Standard UUID assigned to this physical device
const char* DEVICE_UUID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

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

    // Read your analog/digital sensors:
    float temperature = 24.8;     // e.g. dht.readTemperature()
    float humidity = 63.5;        // e.g. dht.readHumidity()
    float soilMoisture = 48.0;    // capacitive soil moisture analog reading
    float light = 650.0;          // BH1750 or LDR sensor reading

    StaticJsonDocument<256> doc;
    doc["deviceId"] = DEVICE_UUID;
    doc["temperature"] = temperature;
    doc["humidity"] = humidity;
    doc["soilMoisture"] = soilMoisture;
    doc["light"] = light;

    String requestBody;
    serializeJson(doc, requestBody);

    int httpResponseCode = http.POST(requestBody);
    Serial.printf("POST Response: %d\n", httpResponseCode);
    http.end();
  }

  delay(5000); // Sample & send every 5 seconds
}
```
