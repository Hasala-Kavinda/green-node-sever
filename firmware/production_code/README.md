# 🌿 Green Node — Production Firmware

This directory contains the production-ready telemetry firmware for the **ESP32-C3 SuperMini**. Each sketch connects to Wi-Fi, acquires all sensor data, synchronises time from NTP (Sri Lanka Standard Time UTC+5:30), and POSTs an encrypted JSON payload to the Green Node cloud backend on Render or a local server.

Two standalone editions are provided — select the one matching the soil sensor physically wired to your node:

| Edition | Soil Sensor | Soil Pin | Sketch |
|---|---|---|---|
| **FC-28 Edition** | FC-28 Standard Probe | GPIO 1 (ADC1_CH1) | [`fc28_production/`](./fc28_production/) |
| **MD0869 Edition** | MD0869 Reference Probe | GPIO 0 (ADC1_CH0) | [`md0869_production/`](./md0869_production/) |

---

## 🚀 Dynamic Provisioning via Wi-Fi Captive Portal (No Hardcoding Required!)

You **no longer need to recompile or reflash** the firmware to configure Wi-Fi credentials or device UUIDs! 

Each node includes an **Onboard Wi-Fi Captive Portal** with flash memory persistence (`Preferences.h` / NVS):

### How to Provision a Sensor Node:
1. **Pre-Register on Web Dashboard**:
   - Open the Green Node Dashboard (`http://localhost:3000` or production web app).
   - Under your **Company** and **Greenhouse**, click **"Register Sensor Module"**.
   - Copy the generated 36-character UUID (e.g., `a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11`).
2. **Power on the ESP32 Node**:
   - If unconfigured, or if Wi-Fi cannot connect, the node automatically launches its setup hotspot.
   - Or, **press and hold the onboard BOOT button (GPIO 9) for 3 seconds** anytime to force the portal.
   - The onboard blue LED will flash rapidly (150ms).
3. **Connect to Hotspot**:
   - On your phone or laptop, join Wi-Fi network: **`GreenNode-Setup`**
   - Password: **`greenNode3223`** (WPA2-PSK secured)
   - The setup portal will pop up automatically. If not, browse to **`http://192.168.4.1`**.
4. **Save & Reboot**:
   - Select your greenhouse Wi-Fi network from the detected networks dropdown.
   - Enter your Wi-Fi password.
   - Paste the copied **Sensor Module UUID**.
   - (Optional) Set the backend host URL (defaults to `https://blue-circle.onrender.com` or set `http://192.168.x.x:4000` for local dev).
   - Click **"💾 Save & Connect"**.
   - The browser shows a 3-second countdown and a clear completion screen confirming the node has saved credentials and joined your Wi-Fi. You can then close the setup window.

> [!TIP]
> **Field Reconfiguration**: If you relocate a node or change the greenhouse router, simply hold the **BOOT button (GPIO 9) for 3 seconds** to re-open the setup portal without plugging into a computer!

---

## ⚠️ Brownout Protection (Critical — Read Before Flashing)

The ESP32-C3 SuperMini's onboard LDO regulator has a limited continuous current budget (~150–300 mA). Wi-Fi RF bursts at the default TX power (+20 dBm) can draw 350–500 mA spikes, dropping the 3.3 V rail below the brownout threshold and causing **random hardware resets**.

Both sketches enforce two hardware-level protections:

1. **Wi-Fi TX power is capped at 11 dBm** via `WiFi.setTxPower(WIFI_POWER_11dBm)` applied safely after `WiFi.begin()`. This keeps peak RF current below 180 mA while maintaining full greenhouse/room coverage.
2. **The soil probe is fully de-energised and discharged before any HTTP transmission.** ADC sampling and Wi-Fi TX are strictly separated in time — they never run concurrently.

> [!CAUTION]
> Never set `WIFI_TX_POWER` higher than `WIFI_POWER_11dBm` on an ESP32-C3 SuperMini powered by USB or a small LDO. Doing so will cause intermittent brownout resets.

---

## 🗂️ Code Architecture & Production Hardening

Each sketch is structured into modular sections with production-grade embedded safeguards for 24/7 unattended operation:

* **Zero-RAM On-Demand Captive Portal**: `WebServer` and `DNSServer` instances are allocated locally on the stack inside `startCaptivePortal()`, and HTML templates are stored in `PROGMEM`. Consumes **0 bytes of SRAM** during normal 24/7 monitoring.
* **Router Outage Resilience**: Distinguishes between unconfigured chips and existing saved profiles (`hasCustomNvsConfig`). Reboots after 20 retries (~5 mins) to refresh the RF stack without trapping the node in AP mode, and enforces a **5-minute Portal Inactivity Timeout** (`PORTAL_TIMEOUT_MS = 300000`).
* **Hardware Watchdog Timer (`esp_task_wdt`)**: 45-second hardware watchdog timer guarantees autonomous MCU reboot if any task, sensor driver, or network socket locks up.
* **Heap Health Guard**: Pre-flight heap check (`MIN_SAFE_FREE_HEAP = 40960`) cleanly restarts the MCU if free contiguous heap ever drops below safe TLS thresholds.
* **I2C Bus Lockup Protection**: Configures `Wire.setTimeOut(1000)` to prevent infinite bus stalls if sensor wiring suffers physical vibration or interference.
* **Instantaneous Portal Load (<15ms)**: Scans Wi-Fi networks once in `WIFI_AP_STA` mode before starting SoftAP, caches the `<option>` list, and frees RAM immediately via `WiFi.scanDelete()`.
* **Zero-Heap Telemetry**: Uses static fixed buffers (`char wifiSsid[33]`, `char timestamp[25]`) instead of heap-allocated `String` objects in the telemetry loop.
* **Pure Math Rounding**: Uses `roundToDp(float, int)` to output clean numbers into JSON without string conversions.
* **Dual HTTP / HTTPS Support**: Persistent static `WiFiClientSecure` and `WiFiClient` instances avoid repeated mbedTLS heap allocations.
* **Epoch Sanity Guard**: Verifies NTP clock sync against a timestamp threshold (`MIN_VALID_EPOCH = 1700000000`) before emitting the ISO-8601 UTC timestamp.
* **USB-CDC Handshake**: Built-in 3-second handshake so opening the Serial Monitor immediately displays the boot diagnostics.

---

## ⚙️ Configuration Reference & NVS Keys

When booted, the firmware reads its configuration from the `"greennode"` NVS namespace:

| Preference Key | Type | Description | Default Fallback |
|---|---|---|---|
| `ssid` | String | Wi-Fi network name | Compile-time fallback |
| `pass` | String | Wi-Fi network password | Compile-time fallback |
| `dev_id` | String | Sensor Module UUID | Compile-time fallback |
| `backend` | String | Backend host URL | `https://blue-circle.onrender.com` |

> [!NOTE]
> **Dedicated Device Endpoint**: The ESP dynamically constructs its dedicated REST route:
> `POST <backend>/api/devices/<DEVICE_ID>/readings`
> This keeps the JSON payload lean (no deviceId required in body) and guarantees isolated telemetry per device.

> [!IMPORTANT]
> **Mandatory Pre-Registration Gatekeeper**: The cloud backend rejects any sensor transmission whose `DEVICE_ID` has not been pre-registered on the Web Dashboard with a `403 Forbidden` response. Always register the Sensor Module in the Dashboard before provisioning the ESP.

---

## 📡 JSON Telemetry Payload

Sent via `POST /api/devices/:deviceId/readings`:

```json
{
  "temperature": 24.50,
  "humidity": 62.30,
  "soilMoisture": 48.7,
  "light": 420.5,
  "espTemperature": 39.25,
  "wifiSsid": "Greenhouse_IoT_2.4G",
  "timestamp": "2026-11-03T01:50:43Z",
  "metadata": {
    "chip": "esp32-c3-supermini",
    "rssi": -62,
    "soilRaw": 2180
  }
}
```

---

## 🔌 Hardware Wiring Guide

```
                   ┌───────────────────────┐
                   │   ESP32-C3 SuperMini  │
                   │                       │
            [5V] --│ 5V                 21 │-- GPIO 21
    [Common GND] --│ GND                20 │-- GPIO 20
      [3.3V Rail]--│ 3V3                 9 │-- GPIO 9 [BOOT button - Setup Portal]
 MD0869 AO (Ref) --│ GPIO 0              8 │-- GPIO 8 [Onboard Blue LED]
   FC-28 AO (Sec)--│ GPIO 1              7 │-- GPIO 7
Soil Power-Gate ---│ GPIO 2              6 │-- GPIO 6 ──► BH1750 SCL (I2C Clock)
   DHT22 Data (D)--│ GPIO 3              5 │-- GPIO 5 ──► BH1750 SDA (I2C Data)
                   │ GPIO 4             10 │-- GPIO 10
                   │       [USB-C]         │
                   └───────────────────────┘
```

### Pin Connection Summary

| Component | Sensor Pin | ESP32-C3 Pin | Notes |
|---|---|---|---|
| **Soil AO** | AO | **GPIO 1** (FC-28) or **GPIO 0** (MD0869) | ADC1 channel — safe during active Wi-Fi |
| **Soil Power** | VCC | **GPIO 2** | Power-gated (active HIGH during reading only) |
| **DHT22** | DATA | **GPIO 3** | Single-wire digital data |
| **BH1750** | SDA | **GPIO 5** | Hardware I2C SDA |
| **BH1750** | SCL | **GPIO 6** | Hardware I2C SCL |
| **BH1750** | ADDR | **GND** (or float) | Sets default address `0x23` |
| **Status LED** | Onboard | **GPIO 8** | Active LOW (blink = portal, pulse = reading) |
| **BOOT Button** | Onboard | **GPIO 9** | Active LOW (hold 3s to trigger Captive Portal) |
| **Power** | VCC | **3V3** | Shared 3.3V rail |
| **Ground** | GND | **GND** | Shared common ground rail |

---

## 📦 Required Libraries

Install via Arduino IDE Library Manager (`Ctrl+Shift+I`):
1. **`ArduinoJson`** by *Benoît Blanchon*
2. **`DHT sensor library`** by *Adafruit*
3. **`Adafruit Unified Sensor`** by *Adafruit*
4. **`BH1750`** by *Christopher Laws*

*(WiFi, WiFiClientSecure, WebServer, DNSServer, Preferences, Wire, and time are built into the official ESP32 Arduino Core).*

---

## 🛠️ Arduino IDE Board Settings

| Setting | Value |
|---|---|
| **Board** | `ESP32C3 Dev Module` |
| **USB CDC On Boot** | `Enabled` ⚠️ *(Crucial for Serial Monitor)* |
| **CPU Frequency** | `160 MHz (WiFi)` |
| **Flash Size** | `4MB (32Mb)` |
| **Partition Scheme** | `Default 4MB with spiffs` |
| **Baud Rate** | `115200` |
