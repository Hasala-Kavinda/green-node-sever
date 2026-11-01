# 📡 ESP32-C3 SuperMini - WiFi Telemetry & HTTP Health Probe Firmware

This directory contains **`esp_code.ino`**, the full wireless IoT firmware sketch that connects the ESP32-C3 SuperMini to local WiFi, pushes periodic JSON sensor telemetry to the backend server via HTTP POST, and serves an onboard health check endpoint (`GET /health`).

---

## 🚀 Key Features

1. **WiFi Auto-Connect & Auto-Recovery**:
   * Connects to configured WiFi network (`WIFI_SSID` / `WIFI_PASSWORD`).
   * Automatically monitors connection status in `loop()` and reconnects upon signal dropouts.
2. **Onboard Health Probe (`WebServer` on Port 80)**:
   * Backend server pings `GET http://<ESP32_IP>:80/health`.
   * Responds with system health metrics: uptime, free heap memory, WiFi RSSI, and device UUID.
3. **HTTP POST Telemetry**:
   * Transmits periodic JSON payloads every 10 seconds (`SEND_INTERVAL_MS = 10000`) to `POST /api/readings`.
4. **Visual Blue LED Status Indicator**:
   * Toggles LED during WiFi connection attempts.
   * Flashes briefly on health ping responses and successful telemetry transmissions.

---

## ⚙️ Configuration Variables (in `esp_code.ino`)

```cpp
// WiFi Credentials
const char* WIFI_SSID     = "Your_WiFi_SSID";
const char* WIFI_PASSWORD = "Your_WiFi_Password";

// Backend API URL
const char* SERVER_URL    = "http://<YOUR_BACKEND_IP>:4000/api/readings";

// Device UUID
const char* DEVICE_ID     = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
```

---

## 🔌 Pin Mapping

| Function | Pin | Description |
|---|---|---|
| **Soil Moisture Analog** | **GPIO 0** | ADC1_CH0 (WiFi-safe analog input) |
| **Light Sensor Analog** | **GPIO 1** | ADC1_CH1 (WiFi-safe analog input) |
| **DHT22 Data** | **GPIO 3** | Temperature & Humidity single-wire bus |
| **Status LED** | **GPIO 8** | Onboard Blue LED (Active LOW) |

---

## ⚙️ Arduino IDE Requirements
* **Board**: `ESP32C3 Dev Module`
* **USB CDC On Boot**: **`Enabled`** ⚠️ *(Crucial for Serial Monitor)*
* **CPU Frequency**: `160MHz (WiFi)`
* **Flash Size**: `4MB`
* **Upload Speed**: `921600`
