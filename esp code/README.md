# 🌿 ESP32 Sensor & Health Probe Firmware

This folder contains the complete, updated Arduino sketch for the ESP32 node.

## 📌 What Was Updated & Fixed

1. **Backend Integration**:
   * Changed port to **4000** (`http://<YOUR_PC_IP>:4000/api/readings`).
   * Updated `DEVICE_ID` to a standard UUID (`a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11`).
   * Matched backend payload keys: `deviceId`, `temperature`, `humidity`, `soilMoisture`, `light`, and extra `metadata`.
2. **Onboard Health Probe (`GET /health`)**:
   * Added an embedded `WebServer` running on port 80.
   * Responds to backend liveness queries with uptime, free RAM, and WiFi RSSI so the backend can verify whether the ESP is powered ON.
3. **Non-Blocking Execution (Eliminated `delay(10000)`)**:
   * The previous code used a blocking `delay(10000)`, which froze the ESP and prevented it from answering health checks during the 10-second wait.
   * Replaced with non-blocking `millis()` timing so the ESP can immediately answer health checks at any moment.
4. **4th Sensor Support (Light / LDR)**:
   * Added `#define LDR_PIN 35` for reading light intensity. (If not wired yet, it safely defaults to 0).

---

## 🔌 Hardware Pin Connections (ESP32)

| Sensor | Sensor Pin | ESP32 GPIO Pin | Type |
|---|---|---|---|
| **DHT22 / AM2302** (Temp & Hum) | VCC | 3.3V / 5V | Power |
| | GND | GND | Ground |
| | DATA | **GPIO 4** | Digital I/O |
| **FC-28 / Capacitive Soil** | VCC | 3.3V | Power |
| | GND | GND | Ground |
| | A0 (Analog Out) | **GPIO 34** | ADC1 Analog In |
| **LDR (Light Sensor)** *(Optional)* | VCC | 3.3V | Power |
| | Signal (voltage divider) | **GPIO 35** | ADC1 Analog In |

---

## 📦 Required Arduino Libraries

In the Arduino IDE (`Sketch -> Include Library -> Manage Libraries...`):
* **DHT sensor library** by *Adafruit*
* **Adafruit Unified Sensor** by *Adafruit*
*(WiFi, WebServer, and HTTPClient are built into the official ESP32 Arduino Core)*

---

## ⚙️ Configuration Before Flashing

Open `esp_code.ino` and update:
1. `WIFI_SSID` and `WIFI_PASSWORD` with your local WiFi network details.
2. `SERVER_URL` with your computer's local LAN IP address (e.g. `http://192.168.1.50:4000/api/readings`). Run `ip a` or `hostname -I` on your computer to find your IP.
