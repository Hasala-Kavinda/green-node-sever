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
* **Database-Tracked Locations**: Physical locations are managed in the database during device registration.
* **ESP Hardware Liveness & Health Monitoring**:
  * **Status Query (`GET /api/devices/:deviceId/health`)**: Check if an ESP is currently **ON** (online) or **OFF** (offline) based on its last activity and timeout window.
  * **Heartbeat (`POST /api/devices/:deviceId/heartbeat`)**: ESP can send lightweight keep-alive pings.
  * **Direct HTTP Probe (`POST /api/devices/:deviceId/ping`)**: The backend directly contacts the ESP's onboard `/health` HTTP endpoint with a timeout to verify physical network responsiveness.
* **Streamlined Telemetry Payload**: Microcontrollers send only: `deviceId` (UUID), `temperature`, `humidity`, `soilMoisture`, and `light`.
* **Real-time WebSockets (`/ws`)**: Instant push updates to dashboards when any sensor reading or heartbeat arrives.
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
    "name": "North Greenhouse Node",
    "location": "Greenhouse Bay 1 - Tomatoes",
    "isOnline": true,
    "status": "online",
    "secondsSinceLastSeen": 8,
    "timeoutThresholdSeconds": 60,
    "ipAddress": "192.168.1.150"
  }
}
```
* **Response when ESP is OFF**:
```json
{
  "success": true,
  "data": {
    "deviceId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    "name": "North Greenhouse Node",
    "location": "Greenhouse Bay 1 - Tomatoes",
    "isOnline": false,
    "status": "offline",
    "secondsSinceLastSeen": 342,
    "timeoutThresholdSeconds": 60,
    "ipAddress": "192.168.1.150"
  }
}
```

---

### 2. Active Direct HTTP Probe to ESP
The backend actively sends an HTTP `GET` to `http://<esp-ip>:80/health`:
* **Endpoint**: `POST /api/devices/:deviceId/ping` (or `GET /api/devices/:deviceId/ping`)
* **Response**:
```json
{
  "success": true,
  "data": {
    "found": true,
    "isReachable": true,
    "status": "online",
    "statusCode": 200,
    "targetUrl": "http://192.168.1.150:80/health",
    "latencyMs": 24,
    "espResponse": {
      "status": "ok",
      "uptime": 145020,
      "freeHeap": 184200
    }
  }
}
```

---

### 3. Heartbeat Route (ESP to Backend)
ESP can ping this route every 10–30 seconds:
* **Endpoint**: `POST /api/devices/:deviceId/heartbeat`
* **Body** *(Optional IP & WiFi signal strength)*:
```json
{
  "rssi": -58,
  "uptimeSeconds": 1450
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
  "light": 620
}
```

### Query Latest Reading
* **Endpoint**: `GET /api/readings/latest`

### 24-Hour Statistics
* **Endpoint**: `GET /api/readings/stats?hours=24`

---

## 🤖 Microcontroller Code Example (ESP32 with Health Server)

This sketch:
1. Runs an onboard **HTTP WebServer** on port 80 serving `GET /health` so the backend can probe it.
2. Periodically sends the 4 sensor readings to `POST /api/readings`.

```cpp
#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* serverUrl = "http://192.168.1.100:4000/api/readings";

const char* DEVICE_UUID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

// Onboard HTTP Server on port 80 for backend health probing
WebServer healthServer(80);

unsigned long lastSendTime = 0;
const unsigned long sendInterval = 5000; // Send telemetry every 5 seconds

// Handle GET /health when backend pings the ESP
void handleHealthRoute() {
  StaticJsonDocument<128> doc;
  doc["status"] = "ok";
  doc["uptimeMs"] = millis();
  doc["freeHeap"] = ESP.getFreeHeap();
  doc["wifiRssi"] = WiFi.RSSI();

  String response;
  serializeJson(doc, response);
  healthServer.send(200, "application/json", response);
}

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi Connected!");
  Serial.print("ESP IP Address: ");
  Serial.println(WiFi.localIP());

  // Setup /health route
  healthServer.on("/health", handleHealthRoute);
  healthServer.begin();
  Serial.println("Health HTTP server started on port 80");
}

void loop() {
  // Handle incoming HTTP health requests from backend
  healthServer.handleClient();

  // Send periodic sensor telemetry
  if (millis() - lastSendTime >= sendInterval) {
    lastSendTime = millis();

    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      http.begin(serverUrl);
      http.addHeader("Content-Type", "application/json");

      // Replace with your real analog/digital sensor readings:
      float temp = 24.5;
      float hum = 63.0;
      float soil = 46.5;
      float light = 580.0;

      StaticJsonDocument<256> doc;
      doc["deviceId"] = DEVICE_UUID;
      doc["temperature"] = temp;
      doc["humidity"] = hum;
      doc["soilMoisture"] = soil;
      doc["light"] = light;

      String jsonBody;
      serializeJson(doc, jsonBody);

      int httpResponseCode = http.POST(jsonBody);
      http.end();
    }
  }
}
```
